#pragma once
#include "src/core/arena.h"
#include "src/core/parser/csv.h"
#include "src/core/search.h"
#include "src/app/table_view.h"
#include "src/app/table_editor.h"
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

// ── Main demo: Phase 8 — Search + Navigation + Workspace ─────────────────────

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

    // ── Search state ─────────────────────────────────────────────────────────
    char search_buf[128] = "";
    uint16_t search_len = 0;
    SearchResult search_results = {};
    bool search_active = false;

    // ── Frame arena (reset every rebuild — only holds UI layout nodes) ───────
    Arena frame = arena_create(256 * 1024);

    // ── Build functions ──────────────────────────────────────────────────────
    TableViewConfig tvcfg;
    tvcfg.viewport_width = 520;
    tvcfg.viewport_height = 200;

    GraphViewConfig gvcfg;
    gvcfg.viewport_width = 520;
    gvcfg.viewport_height = 90;

    auto build_active_view = [&](Arena* a) -> LayoutNode* {
        ViewSlot* v = ws.active_view();
        if (!v) { auto lbl = Label(a, "(no view)", 12); return build(lbl); }
        if (v->type == VIEW_TABLE) {
            return table_view_build(a, (Table*)v->data, tvcfg);
        } else if (v->type == VIEW_GRAPH) {
            return graph_view_build(a, (Graph*)v->data, gvcfg);
        }
        auto lbl = Label(a, "(unknown view)", 12);
        return build(lbl);
    };

    auto build_search_results_view = [&](Arena* a) -> LayoutNode* {
        if (!search_active || search_results.count == 0) {
            auto lbl = Label(a, "No results", 11, {120,120,120,255});
            return build(lbl);
        }
        auto vstack = VStack(a, 1).size(520, 0).id("search-results");
        uint32_t show = search_results.count > 10 ? 10 : search_results.count;
        for (uint32_t i = 0; i < show; i++) {
            SearchHit& h = search_results.hits[i];
            // Determine which table
            Table* t = (Table*)ws.active_view()->data;
            Str val = table_get_cell(t, h.row, h.col);
            char* line = (char*)arena_alloc(a, 80, 1);
            snprintf(line, 80, "  [%u,%u] \"%.*s\"", h.row, h.col, val.len > 40 ? 40 : (int)val.len, val.data);
            vstack.child(Label(a, line, 10, {200,200,200,255}));
        }
        if (search_results.count > 10) {
            char* more = (char*)arena_alloc(a, 32, 1);
            snprintf(more, 32, "  ... +%u more", search_results.count - 10);
            vstack.child(Label(a, more, 10, {140,140,140,255}));
        }
        return build(vstack);
    };

    auto rebuild_ui = [&]() -> LayoutNode* {
        arena_reset(&frame);
        Arena* a = &frame;

        // Tab strip
        LayoutNode* tabs_node = tab_strip_build(a, &ws.tabs, 560);

        // Nav tree (left panel)
        LayoutNode* nav_node = nav_tree_build(a, &ws.nav, 150, 280);

        // Active view (right panel)
        LayoutNode* view_node = build_active_view(a);

        // Search bar
        char* search_label = (char*)arena_alloc(a, 160, 1);
        snprintf(search_label, 160, "Search: %s%s", search_buf, search_active ? "_" : "");
        auto search_bar = HStack(a, 4).size(560, 22).id("search-bar")
            .bg({45, 45, 55, 255}, {80, 80, 100, 255}, 1)
            .text(search_label, 11, {200, 220, 255, 255});

        // Search results (shown below content when active)
        LayoutNode* results_node = build_search_results_view(a);

        // Content area: nav (left) + view (right)
        auto content = HStack(a, 4).size(560, 0).id("content")
            .child(UI{*nav_node, a})
            .child(UI{*view_node, a});

        // Root
        auto root_ui = VStack(a, 4).padding(8).size(580, 0).id("root")
            .child(Label(a, "Phase 8: Workspace | Tabs | Nav | Search (Ctrl+F=search, Tab/click=switch)", 9))
            .child(std::move(search_bar))
            .child(UI{*tabs_node, a})
            .child(std::move(content));

        if (search_active && search_results.count > 0) {
            root_ui.child(UI{*results_node, a});
        }

        LayoutNode* root = build(root_ui);
        root->compute(600, 500);
        return root;
    };

    LayoutNode* root = rebuild_ui();

    // ── Event loop ───────────────────────────────────────────────────────────
    PlatformWindow* win = create_window("Bookkeeping — Phase 8: Workspace + Search + Tabs + NavTree", 600, 500);
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
            if (ev.type == InputEvent::KEY_DOWN && ev.key == 6) { // Ctrl+F
                search_active = !search_active;
                if (!search_active) { search_len = 0; search_buf[0] = 0; search_results.count = 0; }
                need_rebuild = true;
            }

            // Search input
            if (ev.type == InputEvent::KEY_DOWN && search_active) {
                if (ev.key == 8 && search_len > 0) { // Backspace
                    search_buf[--search_len] = 0;
                    // Re-search
                    Arena sa = arena_create(16384);
                    ViewSlot* v = ws.active_view();
                    if (v && v->type == VIEW_TABLE && search_len > 0)
                        search_results = search_table(&sa, (Table*)v->data, search_buf, search_len);
                    else
                        search_results.count = 0;
                    // Copy results to main arena
                    if (search_results.count > 0) {
                        SearchHit* copy = (SearchHit*)arena_alloc(&arena, sizeof(SearchHit) * search_results.count, 4);
                        memcpy(copy, search_results.hits, sizeof(SearchHit) * search_results.count);
                        search_results.hits = copy;
                    }
                    arena_destroy(&sa);
                    need_rebuild = true;
                } else if (ev.key == 13) { // Enter → jump to first result
                    if (search_results.count > 0) {
                        SearchHit& h = search_results.hits[0];
                        printf("Jump to [%u, %u]\n", h.row, h.col);
                    }
                } else if (ev.key >= 32 && ev.key < 127 && search_len < 126) {
                    search_buf[search_len++] = (char)ev.key;
                    search_buf[search_len] = 0;
                    // Search
                    Arena sa = arena_create(16384);
                    ViewSlot* v = ws.active_view();
                    if (v && v->type == VIEW_TABLE)
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

            // Ctrl+Z / Ctrl+Y for undo/redo
            if (ev.type == InputEvent::KEY_DOWN && !search_active) {
                if (ev.key == 26) { editor.undo(); need_rebuild = true; }
                else if (ev.key == 25) { editor.redo(); need_rebuild = true; }
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

                // Check tab clicks (only if click is inside tab-strip)
                bool in_tab_strip = false;
                for (int i = 0; i < n; i++) {
                    if (deep[i].node->id && strcmp(deep[i].node->id, "tab-strip") == 0) {
                        in_tab_strip = true; break;
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

    printf("\n");
    destroy_window(win);
    arena_destroy(&frame);
    arena_destroy(&arena);
    return 0;
}
