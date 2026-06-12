#pragma once
#include "src/core/arena.h"
#include "src/graphics/node_builder.h"
#include "src/graphics/layout/functional_layout.h"
#include "src/graphics/layout/virtual_layout.h"
#include "src/graphics/backend/backend.h"
#include "src/graphics/backend/software_backend.h"
#include "src/platform/platform.h"
#include <cstdio>

// ── VirtualLayout state ──────────────────────────────────────────────────────
struct CounterState { int count; };

static LayoutNode* counter_render(void* state, Arena* a) {
    CounterState* cs = (CounterState*)state;
    char* txt = (char*)arena_alloc(a, 64, 1);
    snprintf(txt, 64, "Counter: %d", cs->count);

    Node* box = node_linear_h(a);
    box->size(370, 44).set_gap(2).set_id("virtual-counter");
    box->attach(make_elements(a, 1), 1);
    box->elements[0] = elem_rect({0, 0, 370, 42, color_rgba(50, 30, 80), color_rgba(180, 100, 255), 1, 0});

    int bars = cs->count % 20;
    int child_count = bars + 1;
    auto kids = make_children(a, child_count);
    for (int i = 0; i < bars; i++) {
        Node* bar = node_leaf(a, 14, 30);
        bar->attach(make_elements(a, 1), 1);
        bar->elements[0] = elem_rect({0, 0, 12, 28, color_rgba(100+i*7, 255-i*10, 50), COLOR_TRANSPARENT, 0, 0});
        kids[i] = bar;
    }
    Node* label = node_leaf(a, 120, 30);
    label->attach(make_elements(a, 1), 1);
    label->elements[0] = elem_text({4, 8, txt, "sans", 13, COLOR_WHITE, TEXT_NORMAL, ALIGN_LEFT, 0});
    label->set_id("counter-label");
    kids[bars] = label;

    box->set_children(kids, child_count);
    return box;
}

static bool counter_event(void* state, const UIEvent* ev) {
    if (ev->type == EVENT_CLICK) { ((CounterState*)state)->count++; return true; }
    return false;
}

// ── Main demo ────────────────────────────────────────────────────────────────
inline int run_demo() {
    Arena arena = arena_create(128 * 1024);

    // ── Scroll items ─────────────────────────────────────────────────────────
    const int N = 20;
    auto scroll_kids = make_children(&arena, N);
    for (int i = 0; i < N; i++) {
        char* lbl = (char*)arena_alloc(&arena, 16, 1);
        snprintf(lbl, 16, "Item %d", i + 1);
        Node* item = node_leaf(&arena, 350, 38);
        item->set_id(lbl);
        item->attach(make_elements(&arena, 2), 2);
        item->elements[0] = elem_rect({0, 0, 350, 36,
            color_rgba(40 + i*10, 80 + i*5, 200 - i*8), color_rgba(100,100,100), 1, 0});
        item->elements[1] = elem_text({5, 9, lbl, "sans", 14, COLOR_WHITE, TEXT_NORMAL, ALIGN_LEFT, 0});
        scroll_kids[i] = item;
    }
    Node* scroll = node_scroll(&arena, 370, 130);
    scroll->set_gap(2).set_id("scroll");
    scroll->set_children(scroll_kids, N);

    // ── Horizontal row ───────────────────────────────────────────────────────
    auto hkids = make_children(&arena, 5);
    for (int i = 0; i < 5; i++) {
        Node* box = node_leaf(&arena, 60, 38);
        box->attach(make_elements(&arena, 1), 1);
        box->elements[0] = elem_rect({0, 0, 60, 38, color_rgba(200-i*40, 50+i*40, 100), COLOR_WHITE, 1, 0});
        hkids[i] = box;
    }
    Node* hrow = node_linear_h(&arena);
    hrow->set_gap(8).set_id("linear-h");
    hrow->set_children(hkids, 5);

    // ── Grid ─────────────────────────────────────────────────────────────────
    auto gkids = make_children(&arena, 6);
    for (int i = 0; i < 6; i++) {
        char* gl = (char*)arena_alloc(&arena, 16, 1);
        snprintf(gl, 16, "Cell %d", i+1);
        Node* cell = node_leaf(&arena, 0, 33);
        cell->set_id(gl);
        cell->attach(make_elements(&arena, 2), 2);
        cell->elements[0] = elem_rect({0, 0, 100, 31, color_rgba(60, 60, 80+i*25), COLOR_WHITE, 1, 0});
        cell->elements[1] = elem_text({4, 7, gl, "sans", 12, COLOR_WHITE, TEXT_NORMAL, ALIGN_LEFT, 0});
        gkids[i] = cell;
    }
    Node* grid = node_grid(&arena, 3);
    grid->size(370, 0).set_gap(4).set_id("grid");
    grid->set_children(gkids, 6);

    // ── Coordinate layout ────────────────────────────────────────────────────
    Node* ce = node_leaf(&arena, 80, 60);
    ce->pos(20, 5).set_id("ellipse");
    ce->attach(make_elements(&arena, 1), 1);
    ce->elements[0] = elem_ellipse({40, 30, 35, 25, COLOR_BLUE, COLOR_WHITE, 1});

    Node* cr = node_leaf(&arena, 180, 55);
    cr->pos(140, 5).set_id("rect+line");
    cr->attach(make_elements(&arena, 2), 2);
    cr->elements[0] = elem_rect({0, 0, 180, 55, color_rgba(40,80,40), COLOR_GREEN, 1, 0});
    cr->elements[1] = elem_line({0, 27, 180, 27, COLOR_GREEN, 2});

    auto ckids = make_children(&arena, 2);
    ckids[0] = ce; ckids[1] = cr;
    Node* coord = node_coord(&arena);
    coord->size(370, 65).set_id("coordinate");
    coord->set_children(ckids, 2);

    // ── Functional layout (cached sprite) ────────────────────────────────────
    Node* sprite = node_leaf(&arena, 100, 46);
    sprite->set_id("functional-sprite");
    sprite->attach(make_elements(&arena, 5), 5);
    for (int i = 0; i < 5; i++)
        sprite->elements[i] = elem_rect({(float)(i*20), 0, 18, 44,
            (i%2==0) ? color_rgba(255,200,0) : color_rgba(80,0,120), COLOR_TRANSPARENT, 0, 0});

    FunctionalLayout fl = {};
    functional_init(&fl, sprite, 100, 46);
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
    virtual_init(&vl, counter_render, counter_event, &counter, 8192);

    // ── Title ────────────────────────────────────────────────────────────────
    Node* title = node_leaf(&arena, 760, 20);
    title->set_id("title");
    title->attach(make_elements(&arena, 1), 1);
    title->elements[0] = elem_text({4, 3,
        "All layouts: LinearH | Grid | Scroll | Coordinate | Functional | Virtual (click=+1, wheel=scroll)", "sans", 11, COLOR_WHITE, TEXT_BOLD, ALIGN_LEFT, 0});

    // ── Root ─────────────────────────────────────────────────────────────────
    auto root_kids = make_children(&arena, 7);
    root_kids[0] = title;
    root_kids[1] = hrow;
    root_kids[2] = grid;
    root_kids[3] = scroll;
    root_kids[4] = coord;
    root_kids[5] = virtual_render(&vl);
    root_kids[6] = sprite;

    Node* root = node_linear_v(&arena);
    root->set_gap(8).set_padding(12).set_id("root");
    root->set_children(root_kids, 7);
    layout_compute(root, 800, 600);

    // ── Event loop (platform-agnostic) ───────────────────────────────────────
    PlatformWindow* win = create_window("Bookkeeping — All Layouts Demo", 800, 600);
    bool running = true;
    InputEvent ev;

    while (running) {
        while (win->poll_event(ev)) {
            if (ev.type == InputEvent::QUIT) { running = false; break; }
            if (ev.type == InputEvent::KEY_DOWN && ev.key == 27) { running = false; break; } // ESC

            if (ev.type == InputEvent::MOUSE_WHEEL) {
                scroll->scroll_y -= ev.scroll_y * 20;
                if (scroll->scroll_y < 0) scroll->scroll_y = 0;
                float max_s = scroll->content_height - scroll->height;
                if (scroll->scroll_y > max_s) scroll->scroll_y = max_s;
            }

            if (ev.type == InputEvent::MOUSE_DOWN && ev.button == 1) {
                // VirtualLayout dispatch
                UIEvent ui = {EVENT_CLICK, ev.x, ev.y, 0, 0, nullptr};
                if (virtual_dispatch(&vl, &ui)) {
                    root_kids[5] = virtual_render(&vl);
                    layout_compute(root, 800, 600);
                }

                // Hit test
                HitResult hit = hit_test_surface(root, ev.x, ev.y);
                printf("Hit: \"%s\"", hit.node && hit.node->id ? hit.node->id : "?");
                HitResult deep[16];
                int n = hit_test_deep(root, ev.x, ev.y, deep, 16);
                printf(" | Deep(%d):", n);
                for (int i = 0; i < n; i++)
                    printf(" %s", deep[i].node->id ? deep[i].node->id : "?");
                printf("\n");
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
