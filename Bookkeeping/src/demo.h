#pragma once
#include "src/core/arena.h"
#include "src/core/parser/csv.h"
#include "src/core/search.h"
#include "src/core/file_io.h"
#include "src/core/control.h"
#include "src/core/theme.h"
#include "src/core/utf8.h"
#include "src/app/table_view.h"
#include "src/app/table_editor.h"
#include "src/app/table_sort.h"
#include "src/app/graph_view.h"
#include "src/app/flow_diagram.h"
#include "src/app/doc_view.h"
#include "src/app/nav_tree.h"
#include "src/app/tab_strip.h"
#include "src/app/workspace.h"
#include "src/app/source_history.h"
#include "src/graphics/ui.h"
#include "src/graphics/layout/layout.h"
#include "src/graphics/backend/backend.h"
#include "src/platform/platform.h"
#include <cstdio>
#include <cstring>

// ── Main demo ────────────────────────────────────────────────────────────────

inline int run_demo() {
    Arena arena = arena_create(4 * 1024 * 1024);

    // ── Persistent save paths ────────────────────────────────────────────────
    const char* save_dir = "/tmp/bookkeeping_data/";
    const char* people_save = "/tmp/bookkeeping_data/People.csv";
    const char* cities_save = "/tmp/bookkeeping_data/Cities.csv";
    const char* graph_save  = "/tmp/bookkeeping_data/Workflow.json";

    // Ensure save directory exists
    { char cmd[256]; snprintf(cmd, 256, "mkdir -p %s", save_dir); if(system(cmd)){} }

    // ── Data: load from saved files or fall back to embedded ─────────────────
    Table* people = file_load_csv(&arena, people_save);
    if (!people) {
        const char* csv1 = "Name,Age,City,Skill\ntext,text,text,text\nAlice,30,London,C++\nBob,25,Paris,Rust\nCharlie,35,Berlin,Go\nDiana,28,Tokyo,Java\nEve,32,NYC,Python";
        people = csv_parse(&arena, arena_str_cstr(&arena, "People"), csv1, strlen(csv1));
    }
    Table* cities = file_load_csv(&arena, cities_save);
    if (!cities) {
        const char* csv2 = "City,Country,Population\ntext,text,text\nLondon,UK,9M\nParis,France,2M\nBerlin,Germany,3.6M\nTokyo,Japan,14M\nNYC,USA,8.3M";
        cities = csv_parse(&arena, arena_str_cstr(&arena, "Cities"), csv2, strlen(csv2));
    }

    Graph* demo_graph_ptr = file_load_graph(&arena, graph_save);
    Graph demo_graph;
    if (demo_graph_ptr) {
        demo_graph = *demo_graph_ptr;
    } else {
        demo_graph.init(&arena, "Workflow");
        demo_graph.add_node("Start", "Start");
        demo_graph.add_node("Process", "Process");
        demo_graph.add_node("Decision", "Decision?");
        demo_graph.add_node("End", "End");
        demo_graph.add_edge(0, 1);
        demo_graph.add_edge(1, 2);
        demo_graph.add_edge(2, 3, "yes");
        demo_graph.add_edge(2, 1, "no");
    }
    demo_graph.layout_grid(10, 5, 140, 45, 4);

    // ── Workspace setup ──────────────────────────────────────────────────────
    Workspace ws;
    ws.init(&arena, 64);
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

    // ── Diagram pan/zoom state ───────────────────────────────────────────────
    float diagram_pan_x = 0, diagram_pan_y = 0;
    float diagram_zoom = 1.0f;
    bool diagram_dragging = false;
    float drag_last_x = 0, drag_last_y = 0;

    // ── Scrollbar drag state ─────────────────────────────────────────────────
    bool scrollbar_dragging = false;
    bool scrollbar_h_dragging = false;
    float scrollbar_drag_start_y = 0, scrollbar_drag_start_scroll = 0;
    float scrollbar_drag_start_x = 0, scrollbar_drag_start_scroll_x = 0;

    // ── Table scroll state (persistent across rebuilds) ──────────────────────
    // Stored per-view in ViewSlot.scroll_x/y

    // ── Source editor state ──────────────────────────────────────────────────
    char source_buf[512] = "";
    uint16_t source_len = 0;
    uint16_t source_cursor = 0;
    const char* source_type = "text";
    bool source_focused = false;
    char source_preview[256] = "";  // parsed preview text

    // Local undo/redo for source editor (independent of table history)
    SourceHistory source_hist;

    // ── Frame arena (reset every rebuild — only holds UI layout nodes) ───────
    Arena frame = arena_create(8 * 1024 * 1024);
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

    // These get updated in rebuild_ui before build_active_view is called
    float active_view_w = 520, active_view_h = 400;

    auto build_active_view = [&](Arena* a) -> LayoutNode* {
        ViewSlot* v = ws.active_view();
        if (!v) {
            auto lbl = Box(a, active_view_w, 80).id("drop-hint")
                .bg(th.surface, th.border, 1)
                .text("Select an item from the navigation tree", th.font_base, th.text_muted);
            return build(lbl);
        }
        if (v->type == VIEW_TABLE) {
            tvcfg.viewport_width = active_view_w;
            tvcfg.viewport_height = active_view_h * zoom;
            tvcfg.scroll_x = v->scroll_x;
            tvcfg.scroll_y = v->scroll_y;
            return table_view_build(a, (Table*)v->data, tvcfg);
        } else if (v->type == VIEW_GRAPH) {
            FlowDiagramConfig fdcfg;
            fdcfg.viewport_width = active_view_w / diagram_zoom;
            fdcfg.viewport_height = active_view_h / diagram_zoom;
            LayoutNode* diagram = flow_diagram_build(a, (Graph*)v->data, fdcfg);
            if (diagram->type == LAYOUT_COORDINATE) {
                Node* scroll = node_scroll(a, active_view_w, active_view_h);
                scroll->set_id("diagram-scroll");
                scroll->scroll_x = -diagram_pan_x;
                scroll->scroll_y = -diagram_pan_y;
                auto kids = make_children(a, 1);
                kids[0] = diagram;
                scroll->set_children(kids, 1);
                return scroll;
            }
            return diagram;
        } else if (v->type == VIEW_DOCUMENT) {
            DocViewConfig dvcfg;
            dvcfg.width = active_view_w;
            dvcfg.height = active_view_h;
            return doc_view_build(a, (DocumentModel*)v->data, dvcfg);
        }
        auto lbl = Label(a, "(unknown view)", th.font_small, th.text_muted);
        return build(lbl);
    };

    auto build_search_results_view = [&](Arena* a) -> LayoutNode* {
        if (!search_active || search_results.count == 0) return nullptr;
        auto vstack = VStack(a, 1).size(340, 0).id("search-results")
            .bg(th.surface, th.border, 1);
        char* hdr = (char*)arena_alloc(a, 48, 1);
        snprintf(hdr, 48, " %u results for \"%s\"", search_results.count, search_buf);
        vstack.child(Box(a, 340, 18).bg(th.accent_light, th.border, 1).text(hdr, th.font_tiny, th.text_muted));
        uint32_t show = search_results.count > 10 ? 10 : search_results.count;
        ViewSlot* sv = ws.active_view();
        for (uint32_t i = 0; i < show; i++) {
            SearchHit& h = search_results.hits[i];
            if (!sv || sv->type != VIEW_TABLE) continue;
            Table* t = (Table*)sv->data;
            Str val = table_get_cell(t, h.row, h.col);
            const char* col_name = h.col < t->col_count ? t->columns[h.col].name.data : "?";
            char* line = (char*)arena_alloc(a, 96, 1);
            snprintf(line, 96, " %s[%u]: %.*s", col_name, h.row, val.len > 35 ? 35 : (int)val.len, val.data);
            char* sr_id = (char*)arena_alloc(a, 12, 1);
            snprintf(sr_id, 12, "sr-%u", i);
            vstack.child(Box(a, 340, 20).id(sr_id)
                .bg(th.surface, COLOR_TRANSPARENT, 0)
                .text(line, th.font_tiny, th.text_secondary));
        }
        if (search_results.count > 10) {
            char* more = (char*)arena_alloc(a, 32, 1);
            snprintf(more, 32, " ... +%u more", search_results.count - 10);
            vstack.child(Box(a, 340, 16).text(more, th.font_tiny, th.text_muted));
        }
        return build(vstack);
    };

    // ── Window dimensions (updated on resize) ─────────────────────────────────
    float win_w = 800, win_h = 600;
    bool sidebar_visible = true;
    float nav_width = 180, sidebar_width = 260;

    auto rebuild_ui = [&]() -> LayoutNode* {
        arena_reset(&frame);
        Arena* a = &frame;
        float W = win_w, H = win_h;
        float nav_w = nav_width;
        float side_w = sidebar_visible ? sidebar_width : 0;

        // ── 1. Toolbar (2.4em = ~31px) ───────────────────────────────────────
        auto toolbar = HStack(a, 4).size(W, 31).id("toolbar")
            .bg(th.toolbar_bg, th.border, 1);
        toolbar.child(Box(a, 40, 24).id("btn-open").bg(th.surface, th.toolbar_btn_border, 1).text("Open", th.font_small, th.toolbar_btn_text));
        toolbar.child(Box(a, 1, 18).bg(th.border));
        toolbar.child(Box(a, 36, 24).id("btn-save").bg(th.surface, th.toolbar_btn_border, 1).text("Save", th.font_small, th.toolbar_btn_text));
        toolbar.child(Box(a, 44, 24).id("btn-export").bg(th.surface, th.toolbar_btn_border, 1).text("Export", th.font_small, th.toolbar_btn_text));
        toolbar.child(Box(a, 1, 18).bg(th.border));
        // Dynamic: + Row button (only for table views)
        ViewSlot* toolbar_view = ws.active_view();
        if (toolbar_view && toolbar_view->type == VIEW_TABLE) {
            toolbar.child(Box(a, 44, 24).id("btn-addrow").bg(th.surface, th.toolbar_btn_border, 1).text("+ Row", th.font_small, th.toolbar_btn_text));
            toolbar.child(Box(a, 1, 18).bg(th.border));
        }
        toolbar.child(Box(a, 50, 24).id("btn-toggle-sidebar").bg(th.surface, th.toolbar_btn_border, 1)
            .text(sidebar_visible ? "\xe2\x97\x80 Editor" : "\xe2\x96\xb6 Editor", th.font_small, th.toolbar_btn_text));
        toolbar.child(Box(a, 38, 24).id("btn-toggle-nav").bg(th.surface, th.toolbar_btn_border, 1)
            .text(nav_w > 0 ? "\xe2\x98\xb0 Nav" : "\xe2\x98\xb0", th.font_small, th.toolbar_btn_text));
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

            // Show * prefix if this view is dirty
            const char* label = ws.tabs.tabs[i].label;
            char* tab_label = (char*)arena_alloc(a, strlen(label) + 3, 1);
            bool tab_dirty = (active && dirty.is_dirty());
            snprintf(tab_label, strlen(label) + 3, "%s%s", tab_dirty ? "* " : "", label);

            TextMeasure m = measure_text(tab_label, (uint32_t)strlen(tab_label), "sans", th.font_small, active ? TEXT_BOLD : TEXT_NORMAL);

            char* close_id = (char*)arena_alloc(a, strlen(ws.tabs.tabs[i].id) + 7, 1);
            snprintf(close_id, strlen(ws.tabs.tabs[i].id) + 7, "close:%s", ws.tabs.tabs[i].id);

            auto tab = HStack(a, 0).size(m.width + 36, 24).id(ws.tabs.tabs[i].id)
                .bg(bg, bdr, 1);
            tab.child(Box(a, m.width + 16, 24).text(tab_label, th.font_small, txt, active ? TEXT_BOLD : TEXT_NORMAL));
            tab.child(Box(a, 16, 24).id(close_id).text("x", th.font_tiny, th.text_muted));
            tab_bar.child(std::move(tab));
        }

        // ── 3. Content area (nav | workspace | sidebar) ──────────────────────
        float content_h = H - 31 - 26 - 21;
        float workspace_w = W - nav_w - side_w;
        active_view_w = workspace_w;
        active_view_h = content_h;
        tvcfg.active_row = editor.editing ? (int32_t)editor.active_cell.row : -1;
        tvcfg.active_col = editor.editing ? (int16_t)editor.active_cell.col : -1;

        LayoutNode* nav_node = nav_tree_build(a, &ws.nav, nav_w, content_h - 20);
        LayoutNode* view_node = build_active_view(a);

        auto content = HStack(a, 0).size(W, content_h).id("content");

        // Nav panel (left)
        auto nav_panel = VStack(a, 0).size(nav_w, content_h).id("nav-tree-panel")
            .bg(th.nav_bg, th.border, 0);
        nav_panel.child(Box(a, nav_w, 20).bg(th.nav_header_bg, th.border, 1).text("Contents", th.font_tiny, th.nav_header_text, TEXT_BOLD));
        nav_panel.child(UI{*nav_node, a});
        content.child(std::move(nav_panel));

        // Workspace (center)
        auto workspace = VStack(a, 0).size(workspace_w, content_h).id("workspace")
            .bg(th.surface);
        workspace.child(UI{*view_node, a});
        // Search results panel (shown below/over the view when active)
        LayoutNode* results_node = build_search_results_view(a);
        if (results_node) workspace.child(UI{*results_node, a});
        content.child(std::move(workspace));

        // Sidebar / Source editor (right)
        if (sidebar_visible) {
            float editor_h = content_h * 0.6f;
            float preview_h = content_h - 24 - 24 - editor_h; // header + buttons + editor

            auto sidebar = VStack(a, 0).size(side_w, content_h).id("sidebar")
                .bg(th.sidebar_bg, th.border, 0);

            // Header: "Source Editor" label
            char* se_hdr = (char*)arena_alloc(a, 64, 1);
            snprintf(se_hdr, 64, "Source Editor  [%s]", source_type);
            sidebar.child(Box(a, side_w, 24).bg(th.nav_header_bg, th.border, 1)
                .text(se_hdr, th.font_tiny, th.text_secondary, TEXT_BOLD));

            // Button row: [Parse] [Apply]
            auto btn_row = HStack(a, 4).size(side_w, 24).bg(th.accent_light, th.border, 1);
            btn_row.child(Box(a, 44, 20).id("se-parse")
                .bg(th.surface, th.toolbar_btn_border, 1)
                .text("Parse", th.font_tiny, th.toolbar_btn_text));
            btn_row.child(Box(a, 44, 20).id("se-apply")
                .bg(th.accent_light, th.cell_active_outline, 1)
                .text("Apply", th.font_tiny, th.text));
            sidebar.child(std::move(btn_row));

            // Editor area (editable text display with cursor)
            char* editor_display = (char*)arena_alloc(a, 520, 1);
            if (source_len > 0) {
                if (source_focused)
                    snprintf(editor_display, 520, "%.*s|%s", source_cursor, source_buf, source_buf + source_cursor);
                else
                    snprintf(editor_display, 520, "%s", source_buf);
            } else {
                snprintf(editor_display, 520, source_focused ? "|" : "Type source here...");
            }
            Color ed_border = source_focused ? th.cell_active_outline : th.border;
            Color ed_text = source_len > 0 ? th.text : th.text_muted;
            sidebar.child(Box(a, side_w, editor_h).id("source-editor")
                .bg(th.surface, ed_border, source_focused ? 2.0f : 1.0f)
                .text(editor_display, 12, ed_text));

            // Preview area
            Color prev_text = source_preview[0] ? th.text_secondary : th.text_muted;
            const char* prev_display = source_preview[0] ? source_preview : "(preview appears here)";
            sidebar.child(Box(a, side_w, preview_h).bg(th.surface, th.border, 1)
                .text(prev_display, th.font_small, prev_text));

            content.child(std::move(sidebar));
        }

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

        // ── Root ─────────────────────────────────────────────────────────────
        auto root_ui = VStack(a, 0).size(W, H).id("root")
            .bg(th.bg)
            .child(std::move(toolbar))
            .child(std::move(tab_bar))
            .child(std::move(content))
            .child(std::move(status_bar));

        LayoutNode* root = build(root_ui);
        root->compute(W, H);
        return root;
    };

    LayoutNode* root = rebuild_ui();

    // ── Event loop ───────────────────────────────────────────────────────────
    PlatformWindow* win = create_window("Bookkeeping", 800, 600);
    bool running = true;
    bool need_rebuild = false;
    InputEvent ev;

    while (running) {
        while (win->poll_event(ev)) {
            if (ev.type == InputEvent::QUIT) { running = false; break; }
            if (ev.type == InputEvent::WINDOW_RESIZE) {
                win_w = ev.x; win_h = ev.y;
                need_rebuild = true;
                continue;
            }
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
                    uint16_t prev = utf8_prev(search_buf, search_cursor);
                    uint16_t del = search_cursor - prev;
                    memmove(search_buf + prev, search_buf + search_cursor, search_len - search_cursor);
                    search_cursor = prev; search_len -= del;
                    search_buf[search_len] = 0;
                    goto do_search;
                } else if (ev.key == 127 && search_cursor < search_len) { // Delete
                    uint16_t next = utf8_next(search_buf, search_len, search_cursor);
                    uint16_t del = next - search_cursor;
                    memmove(search_buf + search_cursor, search_buf + next, search_len - next);
                    search_len -= del;
                    search_buf[search_len] = 0;
                    goto do_search;
                } else if (ev.key == 1073741904) { // Left arrow
                    if (search_cursor > 0) { search_cursor = utf8_prev(search_buf, search_cursor); need_rebuild = true; }
                } else if (ev.key == 1073741903) { // Right arrow
                    if (search_cursor < search_len) { search_cursor = utf8_next(search_buf, search_len, search_cursor); need_rebuild = true; }
                } else if (ev.key == 1073741898) { // Home
                    search_cursor = 0; need_rebuild = true;
                } else if (ev.key == 1073741901) { // End
                    search_cursor = search_len; need_rebuild = true;
                } else if (ev.key == 13) { // Enter → jump to first result
                    if (search_results.count > 0) {
                        SearchHit& h = search_results.hits[0];
                        printf("Jump to [%u, %u]\n", h.row, h.col);
                    }
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

            // Arrow key cell navigation (when not in source editor or search)
            if (ev.type == InputEvent::KEY_DOWN && !source_focused && !search_active && !(ev.mod & 0x00C0) && editor.editing) {
                ViewSlot* v = ws.active_view();
                if (v && v->type == VIEW_TABLE) {
                    Table* t = (Table*)v->data;
                    bool moved = false;
                    if (ev.key == 1073741906 && editor.active_cell.row > 0) { // Up
                        editor.commit_edit(); editor.begin_edit(editor.active_cell.row - 1, editor.active_cell.col); moved = true;
                    } else if (ev.key == 1073741905 && editor.active_cell.row < t->row_count - 1) { // Down
                        editor.commit_edit(); editor.begin_edit(editor.active_cell.row + 1, editor.active_cell.col); moved = true;
                    } else if (ev.key == 1073741904 && editor.active_cell.col > 0) { // Left
                        editor.commit_edit(); editor.begin_edit(editor.active_cell.row, editor.active_cell.col - 1); moved = true;
                    } else if (ev.key == 1073741903 && editor.active_cell.col < t->col_count - 1) { // Right
                        editor.commit_edit(); editor.begin_edit(editor.active_cell.row, editor.active_cell.col + 1); moved = true;
                    } else if (ev.key == 9) { // Tab → next cell
                        editor.commit_edit();
                        uint16_t nc = editor.active_cell.col + 1;
                        uint32_t nr = editor.active_cell.row;
                        if (nc >= t->col_count) { nc = 0; nr++; }
                        if (nr < t->row_count) editor.begin_edit(nr, nc);
                        moved = true;
                    }
                    if (moved) {
                        source_len = editor.edit_len > 511 ? 511 : editor.edit_len;
                        memcpy(source_buf, editor.edit_buffer, source_len);
                        source_buf[source_len] = 0;
                        source_cursor = source_len;
                        if (editor.active_cell.col < t->col_count) source_type = t->columns[editor.active_cell.col].type_id.data;
                        need_rebuild = true;
                        continue;
                    }
                }
            }

            // Source editor: Ctrl+Z/Y local undo/redo
            if (ev.type == InputEvent::KEY_DOWN && source_focused && !search_active && (ev.mod & 0x00C0)) {
                if (ev.key == 'z') { source_hist.do_undo(source_buf, source_len, source_cursor); need_rebuild = true; }
                else if (ev.key == 'y') { source_hist.do_redo(source_buf, source_len, source_cursor); need_rebuild = true; }
                continue;
            }

            // Source editor keyboard input
            if (ev.type == InputEvent::KEY_DOWN && source_focused && !search_active && !(ev.mod & 0x00C0)) {
                if (ev.key == 8 && source_cursor > 0) { // Backspace
                    source_hist.push(source_buf, source_len, source_cursor);
                    uint16_t prev = utf8_prev(source_buf, source_cursor);
                    uint16_t del = source_cursor - prev;
                    memmove(source_buf + prev, source_buf + source_cursor, source_len - source_cursor);
                    source_cursor = prev; source_len -= del;
                    source_buf[source_len] = 0;
                    need_rebuild = true;
                } else if (ev.key == 127 && source_cursor < source_len) { // Delete
                    source_hist.push(source_buf, source_len, source_cursor);
                    uint16_t next = utf8_next(source_buf, source_len, source_cursor);
                    uint16_t del = next - source_cursor;
                    memmove(source_buf + source_cursor, source_buf + next, source_len - next);
                    source_len -= del; source_buf[source_len] = 0;
                    need_rebuild = true;
                } else if (ev.key == 13 && source_len < 510) { // Enter → newline in source editor
                    source_hist.push(source_buf, source_len, source_cursor);
                    memmove(source_buf + source_cursor + 1, source_buf + source_cursor, source_len - source_cursor);
                    source_buf[source_cursor] = '\n';
                    source_cursor++; source_len++;
                    source_buf[source_len] = 0;
                    need_rebuild = true;
                } else if (ev.key == 1073741904 && source_cursor > 0) { source_cursor = utf8_prev(source_buf, source_cursor); need_rebuild = true; }
                else if (ev.key == 1073741903 && source_cursor < source_len) { source_cursor = utf8_next(source_buf, source_len, source_cursor); need_rebuild = true; }
                else if (ev.key == 1073741898) { source_cursor = 0; need_rebuild = true; } // Home
                else if (ev.key == 1073741901) { source_cursor = source_len; need_rebuild = true; } // End
                continue;
            }

            // TEXT_INPUT: actual typed characters (handles shift, caps, special chars, unicode)
            if (ev.type == InputEvent::TEXT_INPUT) {
                uint16_t tlen = (uint16_t)strlen(ev.text);
                if (tlen > 0) {
                    if (search_active && search_len + tlen <= 126) {
                        memmove(search_buf + search_cursor + tlen, search_buf + search_cursor, search_len - search_cursor);
                        memcpy(search_buf + search_cursor, ev.text, tlen);
                        search_cursor += tlen; search_len += tlen;
                        search_buf[search_len] = 0;
                        // Trigger search
                        Arena sa = arena_create(16384);
                        ViewSlot* v = ws.active_view();
                        if (v && v->type == VIEW_TABLE && search_len > 0)
                            search_results = search_table(&sa, (Table*)v->data, search_buf, search_len);
                        else search_results.count = 0;
                        if (search_results.count > 0) {
                            SearchHit* copy = (SearchHit*)arena_alloc(&arena, sizeof(SearchHit) * search_results.count, 4);
                            memcpy(copy, search_results.hits, sizeof(SearchHit) * search_results.count);
                            search_results.hits = copy;
                        }
                        arena_destroy(&sa);
                        need_rebuild = true;
                    } else if (source_focused && source_len + tlen <= 510) {
                        source_hist.push(source_buf, source_len, source_cursor);
                        memmove(source_buf + source_cursor + tlen, source_buf + source_cursor, source_len - source_cursor);
                        memcpy(source_buf + source_cursor, ev.text, tlen);
                        source_cursor += tlen; source_len += tlen;
                        source_buf[source_len] = 0;
                        need_rebuild = true;
                    }
                }
                continue;
            }

            // Ctrl+Z / Ctrl+Y for undo/redo, Ctrl+S save, Ctrl+O open, Ctrl+Up/Down reorder, Ctrl+Plus/Minus zoom
            if (ev.type == InputEvent::KEY_DOWN && !search_active && (ev.mod & 0x00C0)) {
                if (ev.key == 'z') { editor.undo(); need_rebuild = true; dirty.mark_table_dirty(); }
                else if (ev.key == 'y') { editor.redo(); need_rebuild = true; dirty.mark_table_dirty(); }
                else if (ev.key == 's') {
                    // Save active view to its persistent path
                    ViewSlot* v = ws.active_view();
                    if (v && v->type == VIEW_TABLE) {
                        editor.commit_edit();
                        Table* t = (Table*)v->data;
                        const char* path = (t == people) ? people_save : cities_save;
                        file_save_csv(&arena, t, path);
                        dirty.mark_clean(editor.history.past_count);
                        printf("Saved: %s\n", path);
                    } else if (v && v->type == VIEW_GRAPH) {
                        file_save_graph(&arena, (Graph*)v->data, graph_save);
                        dirty.graph_dirty = false;
                        printf("Saved: %s\n", graph_save);
                    }
                    need_rebuild = true;
                } else if (ev.key == 'o') {
                    // Same as Open button click
                    printf("Use the Open button to load a folder.\n");
                    need_rebuild = true;
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

            // Mouse wheel → scroll or diagram zoom
            if (ev.type == InputEvent::MOUSE_WHEEL) {
                HitResult deep[32];
                int n = root->hit_deep(ev.x, ev.y, deep, 32);
                // Check if over diagram — Ctrl+wheel = diagram zoom
                bool on_diagram = false;
                for (int i = 0; i < n; i++) {
                    if (deep[i].node->id && strcmp(deep[i].node->id, "diagram-scroll") == 0) {
                        on_diagram = true; break;
                    }
                }
                if (on_diagram && (ev.mod & 0x00C0)) {
                    // Ctrl+wheel on diagram = zoom
                    if (ev.scroll_y > 0) diagram_zoom = diagram_zoom * 1.1f;
                    else diagram_zoom = diagram_zoom / 1.1f;
                    if (diagram_zoom < 0.25f) diagram_zoom = 0.25f;
                    if (diagram_zoom > 4.0f) diagram_zoom = 4.0f;
                    need_rebuild = true;
                } else if (on_diagram) {
                    // Plain wheel on diagram = pan vertically
                    diagram_pan_y += ev.scroll_y * 30;
                    need_rebuild = true;
                } else {
                    // Regular scroll on table/nav
                    for (int i = n - 1; i >= 0; i--) {
                        if (deep[i].node->type == LAYOUT_SCROLL) {
                            LayoutNode* sn = deep[i].node;
                            if (sn->id && strcmp(sn->id, "diagram-scroll") == 0) break;
                            bool shift_held = (ev.mod & 0x0003) != 0;
                            if (shift_held || ev.scroll_x != 0) {
                                // Horizontal: Shift+wheel or native horizontal
                                float delta = ev.scroll_x != 0 ? ev.scroll_x : ev.scroll_y;
                                sn->scroll_x += delta * 12;
                                if (sn->scroll_x < 0) sn->scroll_x = 0;
                                float max_sx = sn->content_width - sn->width;
                                if (max_sx < 0) max_sx = 0;
                                if (sn->scroll_x > max_sx) sn->scroll_x = max_sx;
                                ViewSlot* av = ws.active_view();
                                if (av) av->scroll_x = sn->scroll_x;
                                // Sync header scroll
                                for (int j = 0; j < n; j++) {
                                    if (deep[j].node->id && strcmp(deep[j].node->id, "header-scroll") == 0)
                                        deep[j].node->scroll_x = sn->scroll_x;
                                }
                            } else {
                                // Vertical
                                sn->scroll_y -= ev.scroll_y * 12;
                                if (sn->scroll_y < 0) sn->scroll_y = 0;
                                float max_s = sn->content_height - sn->height;
                                if (max_s < 0) max_s = 0;
                                if (sn->scroll_y > max_s) sn->scroll_y = max_s;
                                ViewSlot* av = ws.active_view();
                                if (av) av->scroll_y = sn->scroll_y;
                            }
                            // Don't rebuild — scroll offset is applied to live tree directly
                            break;
                        }
                    }
                }
            }

            // Scrollbar drag handling
            if (ev.type == InputEvent::MOUSE_MOVE && (scrollbar_dragging || scrollbar_h_dragging)) {
                // Find table-scroll node
                struct FindCtx2 { LayoutNode* found; };
                FindCtx2 ctx2 = {nullptr};
                struct Walker2 {
                    static void walk(LayoutNode* n, FindCtx2& c) {
                        if (n->id && strcmp(n->id, "table-scroll") == 0) { c.found = n; return; }
                        for (uint16_t i = 0; i < n->child_count && !c.found; i++) walk(n->children[i], c);
                    }
                };
                Walker2::walk(root, ctx2);
                if (ctx2.found) {
                    LayoutNode* sn = ctx2.found;
                    if (scrollbar_dragging) {
                        float ct_h = sn->content_height, vp_h = sn->height;
                        if (ct_h > vp_h) {
                            float delta_y = ev.y - scrollbar_drag_start_y;
                            float ratio = (ct_h - vp_h) / (vp_h - 20);
                            sn->scroll_y = scrollbar_drag_start_scroll + delta_y * ratio;
                            if (sn->scroll_y < 0) sn->scroll_y = 0;
                            if (sn->scroll_y > ct_h - vp_h) sn->scroll_y = ct_h - vp_h;
                            ViewSlot* av = ws.active_view();
                            if (av) av->scroll_y = sn->scroll_y;
                        }
                    }
                    if (scrollbar_h_dragging) {
                        float ct_w = sn->content_width, vp_w = sn->width;
                        if (ct_w > vp_w) {
                            float delta_x = ev.x - scrollbar_drag_start_x;
                            float ratio = (ct_w - vp_w) / (vp_w - 20);
                            sn->scroll_x = scrollbar_drag_start_scroll_x + delta_x * ratio;
                            if (sn->scroll_x < 0) sn->scroll_x = 0;
                            if (sn->scroll_x > ct_w - vp_w) sn->scroll_x = ct_w - vp_w;
                            ViewSlot* av = ws.active_view();
                            if (av) av->scroll_x = sn->scroll_x;
                        }
                    }
                }
            }
            if (ev.type == InputEvent::MOUSE_UP && ev.button == 1) {
                scrollbar_dragging = false;
                scrollbar_h_dragging = false;
            }

            // Mouse drag for diagram pan
            if (ev.type == InputEvent::MOUSE_MOVE && diagram_dragging) {
                diagram_pan_x += ev.x - drag_last_x;
                diagram_pan_y += ev.y - drag_last_y;
                drag_last_x = ev.x; drag_last_y = ev.y;
                need_rebuild = true;
            }

            // Left mouse button on diagram starts pan drag
            if (ev.type == InputEvent::MOUSE_UP && ev.button == 1) {
                diagram_dragging = false;
            }

            // Mouse click
            if (ev.type == InputEvent::MOUSE_DOWN && ev.button == 1) {
                HitResult deep[32];
                int n = hit_test_deep(root, ev.x, ev.y, deep, 32);

                bool handled = false;

                // Check if click is on scrollbar area (right 10px or bottom 10px of table-scroll)
                for (int i = 0; i < n; i++) {
                    if (deep[i].node->id && strcmp(deep[i].node->id, "table-scroll") == 0) {
                        LayoutNode* sn = deep[i].node;
                        float lx = deep[i].local_x, ly = deep[i].local_y;
                        if (lx > sn->width - 12 && sn->content_height > sn->height) {
                            // Vertical scrollbar drag
                            scrollbar_dragging = true;
                            scrollbar_drag_start_y = ev.y;
                            scrollbar_drag_start_scroll = sn->scroll_y;
                            handled = true;
                        } else if (ly > sn->height - 12 && sn->content_width > sn->width) {
                            // Horizontal scrollbar drag
                            scrollbar_h_dragging = true;
                            scrollbar_drag_start_x = ev.x;
                            scrollbar_drag_start_scroll_x = sn->scroll_x;
                            handled = true;
                        }
                        break;
                    }
                }

                // Check if click is on diagram → start pan drag
                for (int i = 0; i < n; i++) {
                    if (deep[i].node->id && strcmp(deep[i].node->id, "diagram-scroll") == 0) {
                        diagram_dragging = true;
                        drag_last_x = ev.x; drag_last_y = ev.y;
                        handled = true;
                        break;
                    }
                }

                // Click on search bar → activate search
                for (int i = 0; i < n && !handled; i++) {
                    if (deep[i].node->id && strcmp(deep[i].node->id, "search-bar") == 0) {
                        search_active = true;
                        source_focused = false;
                        need_rebuild = true;
                        handled = true;
                        break;
                    }
                    if (deep[i].node->id && strcmp(deep[i].node->id, "btn-toggle-sidebar") == 0) {
                        sidebar_visible = !sidebar_visible;
                        need_rebuild = true;
                        handled = true;
                        break;
                    }
                    if (deep[i].node->id && strcmp(deep[i].node->id, "btn-toggle-nav") == 0) {
                        nav_width = (nav_width > 0) ? 0 : 180;
                        need_rebuild = true;
                        handled = true;
                        break;
                    }
                    if (deep[i].node->id && strcmp(deep[i].node->id, "btn-export") == 0) {
                        ViewSlot* v = ws.active_view();
                        if (v && v->type == VIEW_TABLE) {
                            const char* path = "/tmp/bookkeeping_export.csv";
                            file_save_csv(&arena, (Table*)v->data, path);
                            printf("Exported to: %s\n", path);
                        }
                        handled = true;
                        break;
                    }
                    if (deep[i].node->id && strcmp(deep[i].node->id, "btn-addrow") == 0) {
                        ViewSlot* v = ws.active_view();
                        if (v && v->type == VIEW_TABLE) {
                            table_append_row(&arena, (Table*)v->data);
                            dirty.mark_table_dirty();
                            need_rebuild = true;
                        }
                        handled = true;
                        break;
                    }
                    if (deep[i].node->id && strcmp(deep[i].node->id, "btn-open") == 0) {
                        const char* folder = "/mnt/c/Users/EWANBIN/OneDrive - Ericsson/misc/backup2/Sanders.Wang/github/Bookkeeping/Webapp/testresources/Mathematics reference sheet";
                        Arena load_arena = arena_create(4 * 1024 * 1024);
                        LoadedFolder lf = folder_load(&load_arena, folder);
                        if (lf.table_count > 0) {
                            // Mount individual tables + nav folder
                            NavNode* nav_folder = ws.nav.add_root(&arena, lf.name, "loaded-folder", 32);
                            for (uint16_t ti = 0; ti < lf.table_count; ti++) {
                                ws.mount(lf.table_ids[ti], lf.table_ids[ti], VIEW_TABLE, lf.tables[ti]);
                                NavTree::add_child(&arena, nav_folder, lf.table_ids[ti], lf.table_ids[ti], 0);
                            }
                            // Activate first table
                            ws.tabs.activate(ws.tabs.find(lf.table_ids[0]));
                            printf("Opened folder: %s (%u tables)\n", lf.name, lf.table_count);
                        } else {
                            printf("No tables found in: %s\n", folder);
                            arena_destroy(&load_arena);
                        }
                        need_rebuild = true;
                        handled = true;
                        break;
                    }
                    if (deep[i].node->id && strcmp(deep[i].node->id, "btn-save") == 0) {
                        ViewSlot* v = ws.active_view();
                        if (v && v->type == VIEW_TABLE) {
                            editor.commit_edit();
                            Table* t = (Table*)v->data;
                            const char* path = (t == people) ? people_save : (t == cities) ? cities_save : "/tmp/bookkeeping_data/other.csv";
                            file_save_csv(&arena, t, path);
                            dirty.mark_clean(editor.history.past_count);
                            printf("Saved: %s\n", path);
                        } else if (v && v->type == VIEW_GRAPH) {
                            file_save_graph(&arena, (Graph*)v->data, graph_save);
                            dirty.graph_dirty = false;
                            printf("Saved: %s\n", graph_save);
                        }
                        need_rebuild = true;
                        handled = true;
                        break;
                    }
                    if (deep[i].node->id && strcmp(deep[i].node->id, "source-editor") == 0) {
                        source_focused = true;
                        search_active = false;
                        need_rebuild = true;
                        handled = true;
                        break;
                    }
                    if (deep[i].node->id && strcmp(deep[i].node->id, "se-apply") == 0) {
                        // Apply: commit source_buf to the active cell
                        if (editor.editing) {
                            memcpy(editor.edit_buffer, source_buf, source_len);
                            editor.edit_len = source_len;
                            editor.cursor_pos = source_len;
                            editor.edit_buffer[source_len] = 0;
                            editor.commit_edit();
                            dirty.mark_table_dirty();
                            snprintf(source_preview, 256, "Applied to [%u,%u]", editor.active_cell.row, editor.active_cell.col);
                        } else {
                            snprintf(source_preview, 256, "No active cell");
                        }
                        need_rebuild = true;
                        handled = true;
                        break;
                    }
                    if (deep[i].node->id && strcmp(deep[i].node->id, "se-parse") == 0) {
                        // Parse: show type-aware preview
                        if (source_len > 0) {
                            if (strcmp(source_type, "math") == 0)
                                snprintf(source_preview, 256, "✓ Math: \"%.*s\"", source_len > 80 ? 80 : (int)source_len, source_buf);
                            else if (strcmp(source_type, "chem") == 0)
                                snprintf(source_preview, 256, "✓ Chem: \"%.*s\"", source_len > 80 ? 80 : (int)source_len, source_buf);
                            else
                                snprintf(source_preview, 256, "✓ Text (%u chars, %u lines)", source_len, ({uint32_t l=1; for(uint16_t k=0;k<source_len;k++) if(source_buf[k]=='\n')l++; l;}));
                        } else {
                            snprintf(source_preview, 256, "(empty)");
                        }
                        need_rebuild = true;
                        handled = true;
                        break;
                    }
                }

                // Click on search result → navigate to that cell
                if (!handled) {
                    for (int i = n - 1; i >= 0; i--) {
                        if (!deep[i].node->id) continue;
                        if (strncmp(deep[i].node->id, "sr-", 3) == 0) {
                            uint32_t idx = (uint32_t)atoi(deep[i].node->id + 3);
                            if (idx < search_results.count) {
                                SearchHit& h = search_results.hits[idx];
                                ViewSlot* v = ws.active_view();
                                if (v && v->type == VIEW_TABLE) {
                                    Table* t = (Table*)v->data;
                                    editor.commit_edit();
                                    editor.init(&arena, t);
                                    editor.begin_edit(h.row, h.col);
                                    source_len = editor.edit_len > 511 ? 511 : editor.edit_len;
                                    memcpy(source_buf, editor.edit_buffer, source_len);
                                    source_buf[source_len] = 0;
                                    source_cursor = source_len;
                                    if (h.col < t->col_count) source_type = t->columns[h.col].type_id.data;
                                    // Scroll to make the row visible
                                    v->scroll_y = h.row * 30.0f;
                                    search_active = false;
                                    need_rebuild = true;
                                    handled = true;
                                }
                            }
                            break;
                        }
                    }
                }

                // Click outside search bar → deactivate search
                if (!handled && search_active) {
                    search_active = false;
                    need_rebuild = true;
                }
                if (!handled && source_focused) {
                    source_focused = false;
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

                // Check document section header clicks (toggle collapse)
                if (!handled) {
                    ViewSlot* v = ws.active_view();
                    if (v && v->type == VIEW_DOCUMENT) {
                        DocumentModel* doc = (DocumentModel*)v->data;
                        for (int i = n - 1; i >= 0; i--) {
                            if (!deep[i].node->id) continue;
                            for (uint16_t s = 0; s < doc->section_count; s++) {
                                if (strcmp(deep[i].node->id, doc->sections[s].id) == 0) {
                                    doc->sections[s].collapsed = !doc->sections[s].collapsed;
                                    need_rebuild = true;
                                    handled = true;
                                    break;
                                }
                            }
                            if (handled) break;
                        }
                    }
                }

                // Check row action buttons (insert/delete)
                if (!handled) {
                    for (int i = n - 1; i >= 0; i--) {
                        if (!deep[i].node->id) continue;
                        if (strncmp(deep[i].node->id, "ins-", 4) == 0) {
                            ViewSlot* v = ws.active_view();
                            if (v && v->type == VIEW_TABLE) {
                                uint32_t row = (uint32_t)atoi(deep[i].node->id + 4);
                                table_insert_row(&arena, (Table*)v->data, row + 1);
                                dirty.mark_table_dirty();
                                need_rebuild = true;
                                handled = true;
                            }
                            break;
                        }
                        if (strncmp(deep[i].node->id, "del-", 4) == 0) {
                            ViewSlot* v = ws.active_view();
                            if (v && v->type == VIEW_TABLE) {
                                uint32_t row = (uint32_t)atoi(deep[i].node->id + 4);
                                table_remove_row((Table*)v->data, row);
                                dirty.mark_table_dirty();
                                need_rebuild = true;
                                handled = true;
                            }
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
                                    // Compute actual col width (same logic as table_view_build)
                                    TextMeasure hm = measure_text(t->columns[c].name.data, t->columns[c].name.len, "sans", 12, TEXT_BOLD);
                                    float cw = hm.width + 16;
                                    uint32_t scan = t->row_count < 50 ? t->row_count : 50;
                                    for (uint32_t sr = 0; sr < scan; sr++) {
                                        Str sv = table_get_cell(t, sr, c);
                                        if (sv.len > 0 && sv.data) {
                                            TextMeasure cm = measure_text(sv.data, sv.len, "sans", 12, TEXT_NORMAL);
                                            if (cm.width + 16 > cw) cw = cm.width + 16;
                                        }
                                    }
                                    if (cw < tvcfg.col_min_width) cw = tvcfg.col_min_width;
                                    accum += cw + tvcfg.gap;
                                    if (lx < accum) { col = c; break; }
                                    col = c;
                                }
                                editor.commit_edit();
                                dirty.mark_table_dirty();
                                editor.init(&arena, t);
                                editor.begin_edit(row, col);
                                // Copy to source editor
                                source_len = editor.edit_len > 511 ? 511 : editor.edit_len;
                                memcpy(source_buf, editor.edit_buffer, source_len);
                                source_buf[source_len] = 0;
                                source_cursor = source_len;
                                source_focused = true;
                                source_preview[0] = 0;
                                if (col < t->col_count) source_type = t->columns[col].type_id.data;
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

        // ── Scrollbar overlay (drawn after tree, always reflects live state) ──
        // Find table-scroll node by walking the tree
        struct { LayoutNode* node; float abs_x, abs_y; } scroll_info = {nullptr, 0, 0};
        {
            // Simple recursive search for "table-scroll"
            struct FindCtx { LayoutNode* found; float fx, fy; };
            FindCtx ctx = {nullptr, 0, 0};
            struct Walker {
                static void walk(LayoutNode* n, float ox, float oy, FindCtx& c) {
                    float ax = ox + n->x, ay = oy + n->y;
                    if (n->id && strcmp(n->id, "table-scroll") == 0) { c.found = n; c.fx = ax; c.fy = ay; return; }
                    for (uint16_t i = 0; i < n->child_count && !c.found; i++)
                        walk(n->children[i], ax, ay, c);
                }
            };
            Walker::walk(root, 0, 0, ctx);
            scroll_info = {ctx.found, ctx.fx, ctx.fy};
        }
        if (scroll_info.node) {
            LayoutNode* sn = scroll_info.node;
            float abs_x = scroll_info.abs_x, abs_y = scroll_info.abs_y;
            float vp_w = sn->width, vp_h = sn->height;
            float ct_h = sn->content_height, ct_w = sn->content_width;

            if (ct_h > vp_h) {
                float ratio = vp_h / ct_h;
                float bar_h = ratio * vp_h;
                if (bar_h < 20) bar_h = 20;
                float max_scroll = ct_h - vp_h;
                float bar_y = max_scroll > 0 ? (sn->scroll_y / max_scroll) * (vp_h - bar_h) : 0;
                Rect vbar = {abs_x + vp_w - 8, abs_y + bar_y, 6, bar_h, {100, 105, 120, 200}, COLOR_TRANSPARENT, 0, 3};
                win->backend()->render_rect(0, 0, vbar);
            }
            if (ct_w > vp_w) {
                float ratio = vp_w / ct_w;
                float bar_w = ratio * vp_w;
                if (bar_w < 20) bar_w = 20;
                float max_scroll = ct_w - vp_w;
                float bar_x = max_scroll > 0 ? (sn->scroll_x / max_scroll) * (vp_w - bar_w) : 0;
                Rect hbar = {abs_x + bar_x, abs_y + vp_h - 8, bar_w, 6, {100, 105, 120, 200}, COLOR_TRANSPARENT, 0, 3};
                win->backend()->render_rect(0, 0, hbar);
            }
        }

        win->end_frame();
    }

    // ── On exit: save session ────────────────────────────────────────────────
    const char* open_paths[16];
    uint16_t open_count = 0;
    open_paths[open_count++] = people_save;
    open_paths[open_count++] = cities_save;
    open_paths[open_count++] = graph_save;
    session_save(session_file, open_paths, open_count);

    if (dirty.is_dirty()) printf("Warning: unsaved changes were discarded.\n");

    printf("\n");
    destroy_window(win);
    arena_destroy(&frame);
    arena_destroy(&arena);
    return 0;
}
