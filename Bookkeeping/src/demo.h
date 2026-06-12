#pragma once
#include "src/core/arena.h"
#include "src/core/parser/csv.h"
#include "src/app/table_view.h"
#include "src/app/table_editor.h"
#include "src/graphics/ui.h"
#include "src/graphics/layout/functional_layout.h"
#include "src/graphics/layout/virtual_layout.h"
#include "src/graphics/backend/backend.h"
#include "src/graphics/backend/software_backend.h"
#include "src/core/parser/rich/rich_render.h"
#include "src/platform/platform.h"
#include <cstdio>
#include <cstring>

// ── VirtualLayout: reactive counter ──────────────────────────────────────────

struct CounterState { int count; };

static LayoutNode* counter_render(void* state, Arena* a) {
    CounterState* cs = (CounterState*)state;
    char* txt = (char*)arena_alloc(a, 48, 1);
    snprintf(txt, 48, "Clicks: %d", cs->count);

    auto row = HStack(a, 3).size(370, 40).id("counter")
        .bg(color_rgba(50, 30, 80), color_rgba(180, 100, 255), 1);

    // Visual bars
    for (int i = 0; i < cs->count % 18; i++)
        row.child(ColorBox(a, 12, 28, color_rgba(100+i*8, 240-i*12, 60)));

    // Label
    row.child(Label(a, txt, 12));
    return build(row);
}

static bool counter_event(void* state, const UIEvent* ev) {
    if (ev->type == EVENT_CLICK) { ((CounterState*)state)->count++; return true; }
    return false;
}

// ── Main demo ────────────────────────────────────────────────────────────────

inline int run_demo() {
    Arena arena = arena_create(256 * 1024);

    // ── Scroll items ─────────────────────────────────────────────────────────
    UI scroll_items[20];
    for (int i = 0; i < 20; i++) {
        char* lbl = (char*)arena_alloc(&arena, 16, 1);
        snprintf(lbl, 16, "Item %d", i + 1);
        scroll_items[i] = Box(&arena, 350, 34).id(lbl)
            .bg(color_rgba(40+i*10, 80+i*5, 200-i*8), color_rgba(100,100,100), 1)
            .text(lbl, 13);
    }

    auto scroll = Scroll(&arena, 370, 130, 2).id("scroll")
        .children(scroll_items, 20);

    // ── Horizontal row ───────────────────────────────────────────────────────
    auto hrow = HStack(&arena, 8).id("hstack");
    for (int i = 0; i < 5; i++)
        hrow.child(ColorBox(&arena, 58, 36, color_rgba(200-i*40, 50+i*40, 100), COLOR_WHITE));

    // ── Grid ─────────────────────────────────────────────────────────────────
    UI gcells[6];
    for (int i = 0; i < 6; i++) {
        char* gl = (char*)arena_alloc(&arena, 16, 1);
        snprintf(gl, 16, "Cell %d", i+1);
        gcells[i] = Box(&arena, 0, 30).id(gl)
            .bg(color_rgba(60, 60, 80+i*25), COLOR_WHITE, 1)
            .text(gl, 11);
    }
    auto grid = Grid(&arena, 3, 4).width(370).id("grid")
        .children(gcells, 6);

    // ── Coordinate layout ────────────────────────────────────────────────────
    auto ellipse_node = Box(&arena, 80, 55).pos(15, 5).id("ellipse")
        .ellipse(35, 25, COLOR_BLUE, COLOR_WHITE);
    auto rect_node = Box(&arena, 180, 55).pos(130, 5).id("rect+line")
        .bg(color_rgba(40, 80, 40), COLOR_GREEN, 1)
        .line(0, 27, 180, 27, COLOR_GREEN);

    auto coord = Absolute(&arena).size(370, 60).id("coordinate")
        .child(ellipse_node).child(rect_node);

    // ── FunctionalLayout (static cached sprite) ──────────────────────────────
    auto sprite = HStack(&arena, 2).size(104, 40).id("sprite");
    for (int i = 0; i < 5; i++)
        sprite.child(ColorBox(&arena, 18, 36,
            (i%2==0) ? color_rgba(255,200,0) : color_rgba(80,0,120)));

    LayoutNode* sprite_node = build(sprite);
    FunctionalLayout fl = {};
    functional_init(&fl, sprite_node, 104, 40);
    {
        SoftwareBackend sw(fl.cache_w, fl.cache_h);
        sw.begin_frame(fl.cache_w, fl.cache_h);
        layout_compute(fl.source, fl.cache_w, fl.cache_h);
        render_tree(&sw, fl.source);
        sw.end_frame();
        memcpy(fl.cache, sw.pixels, fl.cache_w * fl.cache_h * 4);
        fl.dirty = false;
    }

    // ── VirtualLayout (reactive counter) ─────────────────────────────────────
    CounterState counter = {0};
    VirtualLayout vl = {};
    virtual_init(&vl, counter_render, counter_event, &counter, 16384);

    // ── Table view ───────────────────────────────────────────────────────────
    const char* csv_data = "Name,Age,City,Skill\ntext,text,text,text\nAlice,30,London,C++\nBob,25,Paris,Rust\nCharlie,35,Berlin,Go\nDiana,28,Tokyo,Java\nEve,32,NYC,Python";
    Table* demo_table = csv_parse(&arena, arena_str_cstr(&arena, "Demo"), csv_data, strlen(csv_data));
    TableViewConfig tvcfg;
    tvcfg.viewport_width = 500;
    tvcfg.viewport_height = 80;

    // ── Rich text with embeddings ────────────────────────────────────────────
    const char* rich_src = "Pythagorean: $math{a^2 + b^2 = c^2}\nWater: $chem{2H2 + O2 -> 2H2O}\nEnergy: $phys{E = m*c^2}";
    LayoutNode* rich_node = rich_render(&arena, rich_src, strlen(rich_src), 13, COLOR_WHITE);
    LayoutNode* table_view = table_view_build(&arena, demo_table, tvcfg);

    // ── Root layout ──────────────────────────────────────────────────────────
    auto root_ui = VStack(&arena, 6).padding(10).id("root")
        .child(Label(&arena, "Phase 3: Table | HStack | Grid | Scroll | Coord | Virtual (click purple=+1, wheel=scroll)", 10))
        .child(hrow)
        .child(grid);

    // Manually add table_view, rich, scroll, coord, virtual, sprite
    LayoutNode* vl_tree = virtual_render(&vl);
    {
        uint16_t n = root_ui.node.child_count;
        auto** new_kids = (LayoutNode**)arena_alloc(&arena, sizeof(LayoutNode*) * (n + 6), 8);
        for (uint16_t i = 0; i < n; i++) new_kids[i] = root_ui.node.children[i];
        new_kids[n] = table_view;
        new_kids[n+1] = rich_node;
        new_kids[n+2] = build(scroll);
        new_kids[n+3] = build(coord);
        new_kids[n+4] = vl_tree;
        new_kids[n+5] = sprite_node;
        root_ui.node.children = new_kids;
        root_ui.node.child_count = n + 6;
    }

    LayoutNode* root = build(root_ui);
    layout_compute(root, 800, 600);

    // ── Table editor ───────────────────────────────────────────────────────────
    TableEditor editor;
    editor.init(&arena, demo_table);
    bool table_dirty = false;

    auto rebuild_table = [&]() {
        table_view = table_view_build(&arena, demo_table, tvcfg);
        root->children[3] = table_view; // table_view is child index 3
        root->compute(800, 600);
        table_dirty = false;
    };

    // ── Event loop ───────────────────────────────────────────────────────────
    PlatformWindow* win = create_window("Bookkeeping — Phase 5: Click cells to edit, type, Ctrl+Z/Y undo/redo", 800, 600);
    bool running = true;
    InputEvent ev;

    while (running) {
        while (win->poll_event(ev)) {
            if (ev.type == InputEvent::QUIT) { running = false; break; }
            if (ev.type == InputEvent::KEY_DOWN && ev.key == 27) {
                if (editor.editing) { editor.cancel_edit(); }
                else { running = false; }
                break;
            }

            // ── Keyboard: text editing + undo/redo ───────────────────────────
            if (ev.type == InputEvent::KEY_DOWN && editor.editing) {
                if (ev.key == 13) { // Enter: commit
                    editor.commit_edit();
                    table_dirty = true;
                } else if (ev.key == 8) { // Backspace
                    editor.delete_back();
                } else if (ev.key == 127) { // Delete
                    editor.delete_forward();
                } else if (ev.key == 1073741904) { // Left arrow (SDL)
                    editor.move_cursor_left();
                } else if (ev.key == 1073741903) { // Right arrow
                    editor.move_cursor_right();
                }
            } else if (ev.type == InputEvent::KEY_DOWN) {
                // Ctrl+Z = undo, Ctrl+Y = redo (SDL keycodes)
                // z=122, y=121, with KMOD_CTRL check via key value
                if (ev.key == 26) { // Ctrl+Z
                    editor.undo(); table_dirty = true;
                } else if (ev.key == 25) { // Ctrl+Y
                    editor.redo(); table_dirty = true;
                }
            }

            // Printable character input (SDL sends text as key events 32-126)
            if (ev.type == InputEvent::KEY_DOWN && editor.editing && ev.key >= 32 && ev.key < 127) {
                editor.insert_char((char)ev.key);
            }

            // ── Mouse wheel ──────────────────────────────────────────────────
            if (ev.type == InputEvent::MOUSE_WHEEL) {
                HitResult deep[16];
                int n = root->hit_deep(ev.x, ev.y, deep, 16);
                for (int i = n - 1; i >= 0; i--) {
                    if (deep[i].node->type == LAYOUT_SCROLL) {
                        LayoutNode* sn = deep[i].node;
                        sn->scroll_y -= ev.scroll_y * 20;
                        if (sn->scroll_y < 0) sn->scroll_y = 0;
                        float max_s = sn->content_height - sn->height;
                        if (max_s > 0 && sn->scroll_y > max_s) sn->scroll_y = max_s;
                        break;
                    }
                }
            }

            // ── Mouse click ──────────────────────────────────────────────────
            if (ev.type == InputEvent::MOUSE_DOWN && ev.button == 1) {
                HitResult deep[16];
                int n = hit_test_deep(root, ev.x, ev.y, deep, 16);

                // Check if clicked a table row cell → begin edit
                bool clicked_cell = false;
                for (int i = n - 1; i >= 0; i--) {
                    if (deep[i].node->id && strncmp(deep[i].node->id, "row-", 4) == 0) {
                        uint32_t row = (uint32_t)atoi(deep[i].node->id + 4);
                        // Determine column from local_x position
                        uint16_t col = 0;
                        float lx = deep[i].local_x;
                        float accum = 0;
                        for (uint16_t c = 0; c < demo_table->col_count; c++) {
                            accum += tvcfg.col_min_width + tvcfg.gap;
                            if (lx < accum) { col = c; break; }
                            col = c;
                        }
                        editor.commit_edit();
                        if (table_dirty) rebuild_table();
                        editor.begin_edit(row, col);
                        editor.selection.select_single(row, col);
                        printf("Edit cell [%u,%u] = \"%s\"\n", row, col, editor.edit_buffer);
                        clicked_cell = true;
                        break;
                    }
                }

                if (!clicked_cell) {
                    // Commit any active edit
                    if (editor.editing) { editor.commit_edit(); table_dirty = true; }

                    // Counter check
                    bool on_counter = false;
                    for (int i = 0; i < n; i++)
                        if (deep[i].node->id && strstr(deep[i].node->id, "counter"))
                            { on_counter = true; break; }
                    if (on_counter) {
                        UIEvent ui = {EVENT_CLICK, ev.x, ev.y, 0, 0, nullptr};
                        virtual_dispatch(&vl, &ui);
                        root->children[root->child_count - 2] = virtual_render(&vl);
                        root->compute(800, 600);
                    }

                    // Print hit
                    HitResult hit = hit_test_surface(root, ev.x, ev.y);
                    printf("Hit: %s\n", hit.node && hit.node->id ? hit.node->id : "?");
                }
            }
        }

        // Rebuild table if edited
        if (table_dirty) rebuild_table();

        win->begin_frame();
        render_tree(win->backend(), root);

        // Show edit indicator in title area if editing
        if (editor.editing) {
            printf("\r  Editing [%u,%u]: \"%s\" cursor=%u   ", editor.active_cell.row, editor.active_cell.col, editor.edit_buffer, editor.cursor_pos);
            fflush(stdout);
        }

        win->end_frame();
    }

    printf("\n");
    destroy_window(win);
    virtual_destroy(&vl);
    functional_destroy(&fl);
    arena_destroy(&arena);
    return 0;
}
