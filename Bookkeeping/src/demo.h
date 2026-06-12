#pragma once
#include "src/core/arena.h"
#include "src/core/parser/csv.h"
#include "src/app/table_view.h"
#include "src/graphics/ui.h"
#include "src/graphics/layout/functional_layout.h"
#include "src/graphics/layout/virtual_layout.h"
#include "src/graphics/backend/backend.h"
#include "src/graphics/backend/software_backend.h"
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
    tvcfg.viewport_height = 100;
    LayoutNode* table_view = table_view_build(&arena, demo_table, tvcfg);

    // ── Root layout ──────────────────────────────────────────────────────────
    auto root_ui = VStack(&arena, 6).padding(10).id("root")
        .child(Label(&arena, "Phase 3: Table | HStack | Grid | Scroll | Coord | Virtual (click purple=+1, wheel=scroll)", 10))
        .child(hrow)
        .child(grid);

    // Manually add table_view, scroll, coord, virtual, sprite
    LayoutNode* vl_tree = virtual_render(&vl);
    {
        uint16_t n = root_ui.node.child_count;
        auto** new_kids = (LayoutNode**)arena_alloc(&arena, sizeof(LayoutNode*) * (n + 5), 8);
        for (uint16_t i = 0; i < n; i++) new_kids[i] = root_ui.node.children[i];
        new_kids[n] = table_view;
        new_kids[n+1] = build(scroll);
        new_kids[n+2] = build(coord);
        new_kids[n+3] = vl_tree;
        new_kids[n+4] = sprite_node;
        root_ui.node.children = new_kids;
        root_ui.node.child_count = n + 5;
    }

    LayoutNode* root = build(root_ui);
    layout_compute(root, 800, 600);

    // ── Event loop ───────────────────────────────────────────────────────────
    PlatformWindow* win = create_window("Bookkeeping — React-style Demo", 800, 600);
    bool running = true;
    InputEvent ev;

    while (running) {
        while (win->poll_event(ev)) {
            if (ev.type == InputEvent::QUIT) { running = false; break; }
            if (ev.type == InputEvent::KEY_DOWN && ev.key == 27) { running = false; break; }

            if (ev.type == InputEvent::MOUSE_WHEEL) {
                // Find scroll node under cursor via hit test
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

            if (ev.type == InputEvent::MOUSE_DOWN && ev.button == 1) {
                HitResult hit = hit_test_surface(root, ev.x, ev.y);
                HitResult deep[16];
                int n = hit_test_deep(root, ev.x, ev.y, deep, 16);

                // Print results BEFORE any dispatch (pointers are still valid)
                printf("Hit: %s", hit.node && hit.node->id ? hit.node->id : "?");
                for (int i = 0; i < n; i++)
                    if (deep[i].node->id) printf(" > %s", deep[i].node->id);
                printf(" (on_counter check: ");
                for (int i = 0; i < n; i++)
                    if (deep[i].node->id) printf("[%s] ", deep[i].node->id);
                printf(")\n");

                // Check if click is on the counter, dispatch if so
                bool on_counter = false;
                for (int i = 0; i < n; i++)
                    if (deep[i].node->id && strstr(deep[i].node->id, "counter") != nullptr)
                        { on_counter = true; break; }

                if (on_counter) {
                    UIEvent ui = {EVENT_CLICK, ev.x, ev.y, 0, 0, nullptr};
                    virtual_dispatch(&vl, &ui);
                    LayoutNode* new_vl = virtual_render(&vl);
                    if (new_vl) {
                        root->children[root->child_count - 2] = new_vl;
                        root->compute(800, 600);
                    }
                }
            }
        }

        win->begin_frame();
        render_tree(win->backend(), root);
        win->end_frame();
    }

    destroy_window(win);
    virtual_destroy(&vl);
    functional_destroy(&fl);
    arena_destroy(&arena);
    return 0;
}
