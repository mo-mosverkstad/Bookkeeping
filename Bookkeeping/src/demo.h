#pragma once
#include "src/core/arena.h"
#include "src/core/parser/csv.h"
#include "src/core/search.h"
#include "src/core/file_io.h"
#include "src/core/theme.h"
#include "src/app/table_view.h"
#include "src/app/table_editor.h"
#include "src/app/table_sort.h"
#include "src/app/graph_view.h"
#include "src/app/nav_tree.h"
#include "src/app/tab_strip.h"
#include "src/app/workspace.h"
#include "src/graphics/ui.h"
#include "src/graphics/layout/layout.h"
#include "src/graphics/backend/backend.h"
#include "src/platform/platform.h"
#include <cstdio>
#include <cstring>

// ── Main demo: Phase 9 — File I/O + Workspace ───────────────────────────────

inline int run_demo() {
    Arena arena = arena_create(512 * 1024);

    // ── Data: two tables + a graph ───────────────────────────────────────────
    const char* csv1 = "Name,Age,City,Skill\ntext,text,text,text\nAlice,30,London,C++\nBob,25,Paris,Rust\nCharlie,35,Berlin,Go\nDiana,28,Tokyo,Java\nEve,32,NYC,Python";
    const char* csv2 = "City,Country,Population\ntext,text,text\nLondon,UK,9M\nParis,France,2M\nBerlin,Germany,3.6M\nTokyo,Japan,14M\nNYC,USA,8.3M";
    Table* people = csv_parse(&arena, arena_str_cstr(&arena, "People"), csv1, strlen(csv1));
    Table* cities = csv_parse(&arena, arena_str_cstr(&arena, "Cities"), csv2, strlen(csv2));

    Graph demo_graph; demo_graph.init(&arena, "Workflow");
    demo_graph.add_node("Start", "Start");
    demo_graph.add_node("Process", "Process");
    demo_graph.add_node("Decision", "Decision?");
    demo_graph.add_node("End", "End");
    demo_graph.add_edge(0, 1);
    demo_graph.add_edge(1, 2);
    demo_graph.add_edge(2, 3, "yes");
    demo_graph.add_edge(2, 1, "no");
    demo_graph.layout_grid(10, 5, 140, 45, 4);

    // ── Workspace setup ──────────────────────────────────────────────────────
    Workspace ws;
    ws.init(&arena);
    ws.mount("People", "people", VIEW_TABLE, people);
    ws.mount("Cities", "cities", VIEW_TABLE, cities);
    ws.mount("Workflow", "workflow", VIEW_GRAPH, &demo_graph);
    ws.tabs.activate(0); // start on People

    // ── Navigation tree ──────────────────────────────────────────────────────
    NavNode* nav_tables = ws.nav.add_root(&arena, "Tables", "nav-tables");
    NavTree::add_child(&arena, nav_tables, "People", "people", 0);
    NavTree::add_child(&arena, nav_tables, "Cities", "cities", 0);
    NavNode* nav_graphs = ws.nav.add_root(&arena, "Graphs", "nav-graphs");
    NavTree::add_child(&arena, nav_graphs, "Workflow", "workflow", 0);

    // ── Table editor ─────────────────────────────────────────────────────────
    TableEditor editor;
    editor.init(&arena, people);

    // ── Dirty tracking + file paths ──────────────────────────────────────────
    DirtyState dirty = {false, false, 0};
    const char* people_path = nullptr;  // no file path yet (in-memory demo data)
    const char* cities_path = nullptr;
    const char* graph_path = nullptr;

    // ── Session: try to load last session ────────────────────────────────────
    const char* session_file = "/tmp/bookkeeping_session.txt";
    SessionData session = session_load(&arena, session_file);
    if (session.count > 0) {
        printf("Session restored: %u files\n", session.count);
        for (uint16_t i = 0; i < session.count; i++)
            printf("  %s\n", session.paths[i]);
    }

    // ── Search state ─────────────────────────────────────────────────────────
    char search_buf[128] = "";
    uint16_t search_len = 0;
    uint16_t search_cursor = 0;
    SearchResult search_results = {};
    bool search_active = false;

    // ── Zoom state ───────────────────────────────────────────────────────────
    float zoom = 1.0f;

    // ── Frame arena (reset every rebuild — only holds UI layout nodes) ───────
    Arena frame = arena_create(256 * 1024);
    Theme th = theme_light();

    // ── Build functions ──────────────────────────────────────────────────────
    TableViewConfig tvcfg;
    tvcfg.viewport_width = 520;
    tvcfg.viewport_height = 200;
    tvcfg.header_bg = th.table_header_bg;
    tvcfg.header_text = th.table_header_text;
    tvcfg.cell_bg_even = th.surface;
    tvcfg.cell_bg_odd = th.surface;
    tvcfg.cell_text = th.text_secondary;
    tvcfg.border = th.table_cell_border;

    GraphViewConfig gvcfg;
    gvcfg.viewport_width = 520;
    gvcfg.viewport_height = 90;

    auto build_active_view = [&](Arena* a) -> LayoutNode* {
        ViewSlot* v = ws.active_view();
        if (!v) {
            auto lbl = Box(a, 400, 80).id("drop-hint")
                .bg(th.surface, th.border, 1)
                .text("Select an item from the navigation tree", th.font_base, th.text_muted);
            return build(lbl);
        }
        if (v->type == VIEW_TABLE) {
            tvcfg.viewport_width = 520; tvcfg.viewport_height = (float)(int)(200 * zoom);
            return table_view_build(a, (Table*)v->data, tvcfg);
        } else if (v->type == VIEW_GRAPH) {
            gvcfg.viewport_width = 520; gvcfg.viewport_height = (float)(int)(90 * zoom);
            return graph_view_build(a, (Graph*)v->data, gvcfg);
        }
        auto lbl = Label(a, "(unknown view)", th.font_small, th.text_muted);
        return build(lbl);
    };

    auto build_search_results_view = [&](Arena* a) -> LayoutNode* {
        if (!search_active || search_results.count == 0) return nullptr;
        auto vstack = VStack(a, 0).size(320, 0).id("search-results")
            .bg(th.surface, th.border, 1);
        char* hdr = (char*)arena_alloc(a, 32, 1);
        snprintf(hdr, 32, " %u results", search_results.count);
        vstack.child(Box(a, 320, 16).text(hdr, th.font_tiny, th.text_muted));
        uint32_t show = search_results.count > 8 ? 8 : search_results.count;
        for (uint32_t i = 0; i < show; i++) {
            SearchHit& h = search_results.hits[i];
            Table* t = (Table*)ws.active_view()->data;
            Str val = table_get_cell(t, h.row, h.col);
            char* line = (char*)arena_alloc(a, 80, 1);
            snprintf(line, 80, " [%u,%u] %.*s", h.row, h.col, val.len > 40 ? 40 : (int)val.len, val.data);
            vstack.child(Box(a, 320, 18).text(line, th.font_tiny, th.text_secondary));
        }
        return build(vstack);
    };

    auto rebuild_ui = [&]() -> LayoutNode* {
        arena_reset(&frame);
        Arena* a = &frame;
        float W = 600, H = 500;

        // ── 1. Toolbar (2.4em = ~31px) ───────────────────────────────────────
        auto toolbar = HStack(a, 4).size(W, 31).id("toolbar")
            .bg(th.toolbar_bg, th.border, 1);
        toolbar.child(Box(a, 40, 24).bg(th.surface, th.toolbar_btn_border, 1).text("Open", th.font_small, th.toolbar_btn_text));
        toolbar.child(Box(a, 1, 18).bg(th.border));
        toolbar.child(Box(a, 36, 24).bg(th.surface, th.toolbar_btn_border, 1).text("Save", th.font_small, th.toolbar_btn_text));
        toolbar.child(Box(a, 1, 18).bg(th.border));
        // Search in toolbar
        char* search_label = (char*)arena_alloc(a, 160, 1);
        snprintf(search_label, 160, "%s%s", search_buf, search_active ? "|" : "");
        auto search_input = Box(a, 140, 22).id("search-bar")
            .bg(th.surface, search_active ? th.cell_active_outline : th.border, 1)
            .text(search_label[0] ? search_label : "Search...", th.font_small, search_label[0] ? th.text : th.text_muted);
        toolbar.child(std::move(search_input));

        // ── 2. Tab bar (2em = ~26px) ─────────────────────────────────────────
        auto tab_bar = HStack(a, 2).size(W, 26).id("tab-bar")
            .bg(th.tab_bar_bg, th.border_heavy, 1);
        for (uint16_t i = 0; i < ws.tabs.count; i++) {
            bool active = ws.tabs.tabs[i].active;
            Color bg = active ? th.tab_active_bg : th.tab_inactive_bg;
            Color txt = active ? th.tab_active_text : th.tab_inactive_text;
            Color bdr = active ? th.border_heavy : th.tab_inactive_border;

            TextMeasure m = measure_text(ws.tabs.tabs[i].label, (uint32_t)strlen(ws.tabs.tabs[i].label), "sans", th.font_small, active ? TEXT_BOLD : TEXT_NORMAL);

            // Close button child
            char* close_id = (char*)arena_alloc(a, strlen(ws.tabs.tabs[i].id) + 7, 1);
            snprintf(close_id, strlen(ws.tabs.tabs[i].id) + 7, "close:%s", ws.tabs.tabs[i].id);

            auto tab = HStack(a, 0).size(m.width + 36, 24).id(ws.tabs.tabs[i].id)
                .bg(bg, bdr, 1);
            tab.child(Box(a, m.width + 16, 24).text(ws.tabs.tabs[i].label, th.font_small, txt, active ? TEXT_BOLD : TEXT_NORMAL));
            tab.child(Box(a, 16, 24).id(close_id).text("x", th.font_tiny, th.text_muted));
            tab_bar.child(std::move(tab));
        }

        // ── 3. Content area (flex row: nav | workspace) ──────────────────────
        float content_h = H - 31 - 26 - 21; // toolbar + tabs + status
        LayoutNode* nav_node = nav_tree_build(a, &ws.nav, 180, content_h);
        LayoutNode* view_node = build_active_view(a);

        // Nav tree panel with themed colors
        // (nav_tree_build already builds a scroll; wrap it with bg)

        auto content = HStack(a, 0).size(W, content_h).id("content");
        // Nav panel (left, 180px)
        auto nav_panel = VStack(a, 0).size(180, content_h).id("nav-tree-panel")
            .bg(th.nav_bg, th.border, 0);
        nav_panel.child(Box(a, 180, 20).bg(th.nav_header_bg, th.border, 1).text("Contents", th.font_tiny, th.nav_header_text, TEXT_BOLD));
        nav_panel.child(UI{*nav_node, a});
        content.child(std::move(nav_panel));
        // Workspace (right, flex)
        auto workspace = VStack(a, 0).size(W - 180, content_h).id("workspace")
            .bg(th.surface);
        workspace.child(UI{*view_node, a});
        content.child(std::move(workspace));

        // ── 4. Status bar (1.6em = ~21px) ────────────────────────────────────
        char* status_text = (char*)arena_alloc(a, 128, 1);
        const Tab* at = ws.tabs.active_tab();
        snprintf(status_text, 128, " %s%s   Zoom: %d%%",
            at ? at->label : "",
            dirty.is_dirty() ? " [modified]" : "",
            (int)(zoom * 100));
        auto status_bar = HStack(a, 0).size(W, 21).id("status-bar")
            .bg(th.status_bg, th.border, 1)
            .text(status_text, th.font_tiny, th.status_text);

        // ── Root (vertical stack, no padding — fills window) ─────────────────
        auto root_ui = VStack(a, 0).size(W, H).id("root")
            .bg(th.bg)
            .child(std::move(toolbar))
            .child(std::move(tab_bar))
            .child(std::move(content))
            .child(std::move(status_bar));

        // Overlay: search results
        LayoutNode* results_node = build_search_results_view(a);
        (void)results_node; // TODO: overlay positioning

        LayoutNode* root = build(root_ui);
        root->compute(W, H);
        return root;
    };

    LayoutNode* root = rebuild_ui();

    // ── Event loop ───────────────────────────────────────────────────────────
    PlatformWindow* win = create_window("Bookkeeping", 600, 500);
    bool running = true;
    bool need_rebuild = false;
    InputEvent ev;

    while (running) {
        while (win->poll_event(ev)) {
            if (ev.type == InputEvent::QUIT) { running = false; break; }
            if (ev.type == InputEvent::KEY_DOWN && ev.key == 27) { // ESC
                if (search_active) { search_active = false; need_rebuild = true; }
                else if (editor.editing) { editor.cancel_edit(); need_rebuild = true; }
                else running = false;
                break;
            }

            // Ctrl+F → toggle search
            if (ev.type == InputEvent::KEY_DOWN && ev.key == 'f' && (ev.mod & 0x00C0)) { // KMOD_CTRL
                search_active = !search_active;
                if (!search_active) { search_len = 0; search_cursor = 0; search_buf[0] = 0; search_results.count = 0; }
                need_rebuild = true;
                continue;
            }

            // Search input
            if (ev.type == InputEvent::KEY_DOWN && search_active) {
                if (ev.key == 8 && search_cursor > 0) { // Backspace
                    memmove(search_buf + search_cursor - 1, search_buf + search_cursor, search_len - search_cursor);
                    search_cursor--; search_len--;
                    search_buf[search_len] = 0;
                    goto do_search;
                } else if (ev.key == 127 && search_cursor < search_len) { // Delete
                    memmove(search_buf + search_cursor, search_buf + search_cursor + 1, search_len - search_cursor - 1);
                    search_len--;
                    search_buf[search_len] = 0;
                    goto do_search;
                } else if (ev.key == 1073741904) { // Left arrow
                    if (search_cursor > 0) { search_cursor--; need_rebuild = true; }
                } else if (ev.key == 1073741903) { // Right arrow
                    if (search_cursor < search_len) { search_cursor++; need_rebuild = true; }
                } else if (ev.key == 1073741898) { // Home
                    search_cursor = 0; need_rebuild = true;
                } else if (ev.key == 1073741901) { // End
                    search_cursor = search_len; need_rebuild = true;
                } else if (ev.key == 13) { // Enter → jump to first result
                    if (search_results.count > 0) {
                        SearchHit& h = search_results.hits[0];
                        printf("Jump to [%u, %u]\n", h.row, h.col);
                    }
                } else if (ev.key >= 32 && ev.key < 127 && search_len < 126 && !(ev.mod & 0x00C0)) {
                    memmove(search_buf + search_cursor + 1, search_buf + search_cursor, search_len - search_cursor);
                    search_buf[search_cursor] = (char)ev.key;
                    search_cursor++; search_len++;
                    search_buf[search_len] = 0;
                    goto do_search;
                }
                if (false) { do_search:
                    Arena sa = arena_create(16384);
                    ViewSlot* v = ws.active_view();
                    if (v && v->type == VIEW_TABLE && search_len > 0)
                        search_results = search_table(&sa, (Table*)v->data, search_buf, search_len);
                    else
                        search_results.count = 0;
                    if (search_results.count > 0) {
                        SearchHit* copy = (SearchHit*)arena_alloc(&arena, sizeof(SearchHit) * search_results.count, 4);
                        memcpy(copy, search_results.hits, sizeof(SearchHit) * search_results.count);
                        search_results.hits = copy;
                    }
                    arena_destroy(&sa);
                    need_rebuild = true;
                }
                continue; // consume key when search is active
            }

            // Ctrl+Z / Ctrl+Y for undo/redo, Ctrl+S save, Ctrl+O open, Ctrl+Up/Down reorder, Ctrl+Plus/Minus zoom
            if (ev.type == InputEvent::KEY_DOWN && !search_active && (ev.mod & 0x00C0)) {
                if (ev.key == 'z') { editor.undo(); need_rebuild = true; dirty.mark_table_dirty(); }
                else if (ev.key == 'y') { editor.redo(); need_rebuild = true; dirty.mark_table_dirty(); }
                else if (ev.key == 's') {
                    // Save active view
                    ViewSlot* v = ws.active_view();
                    if (v && v->type == VIEW_TABLE && people_path) {
                        editor.commit_edit();
                        file_save_csv(&arena, (Table*)v->data, people_path);
                        dirty.mark_clean(editor.history.past_count);
                        printf("Saved: %s\n", people_path);
                    } else if (v && v->type == VIEW_TABLE) {
                        const char* default_path = "/tmp/bookkeeping_table.csv";
                        editor.commit_edit();
                        file_save_csv(&arena, (Table*)v->data, default_path);
                        dirty.mark_clean(editor.history.past_count);
                        printf("Saved: %s\n", default_path);
                    } else if (v && v->type == VIEW_GRAPH && graph_path) {
                        file_save_graph(&arena, (Graph*)v->data, graph_path);
                        dirty.graph_dirty = false;
                        printf("Saved: %s\n", graph_path);
                    }
                } else if (ev.key == 'o') {
                    printf("Open file: provide path via command line args (not implemented in demo)\n");
                } else if (ev.key == 1073741906) { // Ctrl+Up arrow — move row up
                    ViewSlot* v = ws.active_view();
                    if (v && v->type == VIEW_TABLE && editor.active_cell.row > 0) {
                        table_move_row((Table*)v->data, editor.active_cell.row, editor.active_cell.row - 1);
                        editor.active_cell.row--;
                        dirty.mark_table_dirty();
                        need_rebuild = true;
                    }
                } else if (ev.key == 1073741905) { // Ctrl+Down arrow — move row down
                    ViewSlot* v = ws.active_view();
                    if (v && v->type == VIEW_TABLE) {
                        Table* t = (Table*)v->data;
                        if (editor.active_cell.row < t->row_count - 1) {
                            table_move_row(t, editor.active_cell.row, editor.active_cell.row + 1);
                            editor.active_cell.row++;
                            dirty.mark_table_dirty();
                            need_rebuild = true;
                        }
                    }
                } else if (ev.key == '=' || ev.key == '+' || ev.key == 1073741911) { // Ctrl+Plus — zoom in
                    if (zoom < 2.0f) { zoom += 0.1f; need_rebuild = true; }
                } else if (ev.key == '-' || ev.key == 1073741910) { // Ctrl+Minus — zoom out
                    if (zoom > 0.5f) { zoom -= 0.1f; need_rebuild = true; }
                } else if (ev.key == '0') { // Ctrl+0 — reset zoom
                    zoom = 1.0f; need_rebuild = true;
                }
            }

            // Mouse wheel → scroll
            if (ev.type == InputEvent::MOUSE_WHEEL) {
                HitResult deep[16];
                int n = root->hit_deep(ev.x, ev.y, deep, 16);
                for (int i = n - 1; i >= 0; i--) {
                    if (deep[i].node->type == LAYOUT_SCROLL) {
                        LayoutNode* sn = deep[i].node;
                        sn->scroll_y -= ev.scroll_y * 20;
                        if (sn->scroll_y < 0) sn->scroll_y = 0;
                        float max_s = sn->content_height - sn->height;
                        if (max_s < 0) max_s = 0;
                        if (sn->scroll_y > max_s) sn->scroll_y = max_s;
                        break;
                    }
                }
            }

            // Mouse click
            if (ev.type == InputEvent::MOUSE_DOWN && ev.button == 1) {
                HitResult deep[16];
                int n = hit_test_deep(root, ev.x, ev.y, deep, 16);

                bool handled = false;

                // Click on search bar → activate search
                for (int i = 0; i < n; i++) {
                    if (deep[i].node->id && strcmp(deep[i].node->id, "search-bar") == 0) {
                        search_active = true;
                        need_rebuild = true;
                        handled = true;
                        break;
                    }
                }

                // Click outside search bar → deactivate search
                if (!handled && search_active) {
                    search_active = false;
                    need_rebuild = true;
                }

                // Check tab clicks (only if click is inside tab-strip)
                bool in_tab_strip = false;
                if (!handled) {
                    for (int i = 0; i < n; i++) {
                        if (deep[i].node->id && strcmp(deep[i].node->id, "tab-strip") == 0) {
                            in_tab_strip = true; break;
                        }
                    }
                }
                if (in_tab_strip) {
                    for (int i = n - 1; i >= 0; i--) {
                        if (!deep[i].node->id) continue;
                        if (strncmp(deep[i].node->id, "close:", 6) == 0) {
                            const char* tab_id = deep[i].node->id + 6;
                            ws.unmount(tab_id);
                            printf("Close tab: %s\n", tab_id);
                            ViewSlot* v = ws.active_view();
                            if (v && v->type == VIEW_TABLE)
                                editor.init(&arena, (Table*)v->data);
                            need_rebuild = true;
                            handled = true;
                            break;
                        }
                        int tidx = ws.tabs.find(deep[i].node->id);
                        if (tidx >= 0) {
                            ws.tabs.activate(tidx);
                            ViewSlot* v = ws.active_view();
                            if (v && v->type == VIEW_TABLE) {
                                editor.commit_edit();
                                editor.init(&arena, (Table*)v->data);
                            }
                            printf("Tab: %s\n", ws.tabs.tabs[tidx].label);
                            need_rebuild = true;
                            handled = true;
                            break;
                        }
                    }
                }

                // Check nav tree clicks
                if (!handled) {
                    for (int i = n - 1; i >= 0; i--) {
                        if (!deep[i].node->id) continue;
                        NavNode* nav = ws.nav.toggle(deep[i].node->id);
                        if (nav) {
                            // If it's a leaf (no children), open/activate its view
                            if (nav->child_count == 0) {
                                int tidx = ws.tabs.find(nav->id);
                                if (tidx >= 0) {
                                    ws.tabs.activate(tidx);
                                } else {
                                    // Re-mount the view
                                    if (strcmp(nav->id, "people") == 0)
                                        ws.mount("People", "people", VIEW_TABLE, people);
                                    else if (strcmp(nav->id, "cities") == 0)
                                        ws.mount("Cities", "cities", VIEW_TABLE, cities);
                                    else if (strcmp(nav->id, "workflow") == 0)
                                        ws.mount("Workflow", "workflow", VIEW_GRAPH, &demo_graph);
                                }
                                ViewSlot* v = ws.active_view();
                                if (v && v->type == VIEW_TABLE) {
                                    editor.commit_edit();
                                    editor.init(&arena, (Table*)v->data);
                                }
                            }
                            printf("Nav: %s (%s)\n", nav->label, nav->expanded ? "expanded" : "collapsed");
                            need_rebuild = true;
                            handled = true;
                            break;
                        }
                    }
                }

                // Check table row clicks (cell editing)
                if (!handled) {
                    for (int i = n - 1; i >= 0; i--) {
                        if (deep[i].node->id && strncmp(deep[i].node->id, "row-", 4) == 0) {
                            ViewSlot* v = ws.active_view();
                            if (v && v->type == VIEW_TABLE) {
                                uint32_t row = (uint32_t)atoi(deep[i].node->id + 4);
                                uint16_t col = 0;
                                float lx = deep[i].local_x, accum = 0;
                                Table* t = (Table*)v->data;
                                for (uint16_t c = 0; c < t->col_count; c++) {
                                    accum += tvcfg.col_min_width + tvcfg.gap;
                                    if (lx < accum) { col = c; break; }
                                    col = c;
                                }
                                editor.commit_edit();
                                dirty.mark_table_dirty();
                                editor.init(&arena, t);
                                editor.begin_edit(row, col);
                                printf("Edit [%u,%u] = \"%s\"\n", row, col, editor.edit_buffer);
                                need_rebuild = true;
                            }
                            handled = true;
                            break;
                        }
                    }
                }

                if (!handled) {
                    HitResult hit = hit_test_surface(root, ev.x, ev.y);
                    printf("Hit: %s\n", hit.node && hit.node->id ? hit.node->id : "?");
                }
            }
        }

        if (need_rebuild) {
            root = rebuild_ui();
            need_rebuild = false;
        }

        win->begin_frame();
        render_tree(win->backend(), root);
        win->end_frame();
    }

    // ── On exit: save session ────────────────────────────────────────────────
    const char* open_paths[16];
    uint16_t open_count = 0;
    if (people_path) open_paths[open_count++] = people_path;
    if (cities_path) open_paths[open_count++] = cities_path;
    if (graph_path) open_paths[open_count++] = graph_path;
    if (open_count > 0) session_save(session_file, open_paths, open_count);

    if (dirty.is_dirty()) printf("Warning: unsaved changes were discarded.\n");

    printf("\n");
    destroy_window(win);
    arena_destroy(&frame);
    arena_destroy(&arena);
    return 0;
}
