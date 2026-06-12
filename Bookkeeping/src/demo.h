#pragma once
#include "src/core/arena.h"
#include "src/graphics/elements/element.h"
#include "src/graphics/layout/layout.h"
#include "src/graphics/layout/functional_layout.h"
#include "src/graphics/layout/virtual_layout.h"
#include "src/graphics/backend/backend.h"
#include "src/graphics/backend/software_backend.h"
#include "src/graphics/backend/sdl2_backend.h"
#include <cstdio>
#include <SDL2/SDL.h>

// Demo: ScrollLayout with clipping, hit testing, text measurement, shapes.
// Shows a scrollable list of colored items. Scroll with mouse wheel.
// Click to hit-test and print which item was clicked.
inline int run_demo() {
    Arena arena = arena_create(128 * 1024);

    // Create 20 items inside a scroll viewport
    const int ITEM_COUNT = 20;
    LayoutNode* items[ITEM_COUNT];
    for (int i = 0; i < ITEM_COUNT; i++) {
        items[i] = arena_new<LayoutNode>(&arena);
        items[i]->req_width = 350;
        items[i]->req_height = 40;
        items[i]->elements = arena_array<Element>(&arena, 2);
        items[i]->element_count = 2;
        // Background rect
        uint8_t r = 40 + i * 10, g = 80 + i * 5, b = 200 - i * 8;
        items[i]->elements[0] = elem_rect({0, 0, 350, 38, color_rgba(r, g, b), color_rgba(100, 100, 100), 1, 0});
        // Text label
        char* label = (char*)arena_alloc(&arena, 32, 1);
        snprintf(label, 32, "Item %d", i + 1);
        items[i]->elements[1] = elem_text({5, 10, label, "sans", 16, COLOR_WHITE, TEXT_NORMAL, ALIGN_LEFT, 0});
        items[i]->id = label;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 1: ScrollLayout — scrollable list of items
    // ══════════════════════════════════════════════════════════════════════════
    LayoutNode scroll = {};
    scroll.type = LAYOUT_SCROLL;
    scroll.req_width = 370;
    scroll.req_height = 150;
    scroll.gap = 2;
    scroll.scroll_x = 0;
    scroll.scroll_y = 0;
    scroll.children = items;
    scroll.child_count = ITEM_COUNT;
    scroll.id = "scroll-viewport";

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 2: LinearLayout (Horizontal) — row of colored boxes
    // ══════════════════════════════════════════════════════════════════════════
    const int HBOX_COUNT = 5;
    LayoutNode* hboxes[HBOX_COUNT];
    for (int i = 0; i < HBOX_COUNT; i++) {
        hboxes[i] = arena_new<LayoutNode>(&arena);
        hboxes[i]->req_width = 60;
        hboxes[i]->req_height = 40;
        hboxes[i]->elements = arena_array<Element>(&arena, 1);
        hboxes[i]->element_count = 1;
        hboxes[i]->elements[0] = elem_rect({0, 0, 60, 40,
            color_rgba(200 - i*40, 50 + i*40, 100), COLOR_WHITE, 1, 0});
        char* hlabel = (char*)arena_alloc(&arena, 16, 1);
        snprintf(hlabel, 16, "H%d", i+1);
        hboxes[i]->id = hlabel;
    }
    LayoutNode hrow = {};
    hrow.type = LAYOUT_LINEAR;
    hrow.direction = LINEAR_HORIZONTAL;
    hrow.gap = 8;
    hrow.children = hboxes;
    hrow.child_count = HBOX_COUNT;
    hrow.id = "linear-h-row";

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3: GridLayout — 3×2 grid of cells
    // ══════════════════════════════════════════════════════════════════════════
    const int GRID_CELLS = 6;
    LayoutNode* gcells[GRID_CELLS];
    for (int i = 0; i < GRID_CELLS; i++) {
        gcells[i] = arena_new<LayoutNode>(&arena);
        gcells[i]->req_height = 35;
        gcells[i]->elements = arena_array<Element>(&arena, 2);
        gcells[i]->element_count = 2;
        gcells[i]->elements[0] = elem_rect({0, 0, 100, 33, color_rgba(60, 60, 80 + i*25), COLOR_WHITE, 1, 0});
        char* glabel = (char*)arena_alloc(&arena, 16, 1);
        snprintf(glabel, 16, "Cell %d", i+1);
        gcells[i]->elements[1] = elem_text({4, 8, glabel, "sans", 13, COLOR_WHITE, TEXT_NORMAL, ALIGN_LEFT, 0});
        gcells[i]->id = glabel;
    }
    LayoutNode grid = {};
    grid.type = LAYOUT_GRID;
    grid.grid_cols = 3;
    grid.gap = 4;
    grid.req_width = 370;
    grid.children = gcells;
    grid.child_count = GRID_CELLS;
    grid.id = "grid-3x2";

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 4: CoordinateLayout — shapes at absolute positions
    // ══════════════════════════════════════════════════════════════════════════
    LayoutNode coord_child1 = {};
    coord_child1.x = 20; coord_child1.y = 10;
    coord_child1.req_width = 80; coord_child1.req_height = 60;
    coord_child1.elements = arena_array<Element>(&arena, 1);
    coord_child1.element_count = 1;
    coord_child1.elements[0] = elem_ellipse({40, 30, 35, 25, COLOR_BLUE, COLOR_WHITE, 1});
    coord_child1.id = "coord-ellipse";

    LayoutNode coord_child2 = {};
    coord_child2.x = 150; coord_child2.y = 5;
    coord_child2.req_width = 180; coord_child2.req_height = 60;
    coord_child2.elements = arena_array<Element>(&arena, 2);
    coord_child2.element_count = 2;
    coord_child2.elements[0] = elem_rect({0, 0, 180, 60, color_rgba(40, 80, 40), COLOR_GREEN, 1, 0});
    coord_child2.elements[1] = elem_line({0, 30, 180, 30, COLOR_GREEN, 2});
    coord_child2.id = "coord-rect-line";

    LayoutNode* coord_kids[] = {&coord_child1, &coord_child2};
    LayoutNode coord = {};
    coord.type = LAYOUT_COORDINATE;
    coord.req_width = 370;
    coord.req_height = 70;
    coord.children = coord_kids;
    coord.child_count = 2;
    coord.id = "coordinate-layout";

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 5: Title
    // ══════════════════════════════════════════════════════════════════════════
    LayoutNode title_node = {};
    title_node.req_width = 760;
    title_node.req_height = 22;
    title_node.elements = arena_array<Element>(&arena, 1);
    title_node.element_count = 1;
    title_node.elements[0] = elem_text({5, 3, "Demo: All Layouts + FunctionalLayout(cached) + VirtualLayout(reactive)", "sans", 11, COLOR_WHITE, TEXT_BOLD, ALIGN_LEFT, 0});
    title_node.id = "title";

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 6: VirtualLayout — reactive counter (click to increment)
    // ══════════════════════════════════════════════════════════════════════════
    struct CounterState { int count; Arena* a; };
    CounterState counter_state = {0, &arena};

    auto counter_render = [](void* state, Arena* a) -> LayoutNode* {
        CounterState* cs = (CounterState*)state;
        LayoutNode* box = arena_new<LayoutNode>(a);
        box->type = LAYOUT_LINEAR; box->direction = LINEAR_VERTICAL;
        box->req_width = 370; box->req_height = 50; box->gap = 4;
        box->elements = arena_array<Element>(a, 1);
        box->element_count = 1;
        box->elements[0] = elem_rect({0, 0, 370, 48, color_rgba(50, 30, 80), color_rgba(180, 100, 255), 1, 0});
        box->id = "virtual-counter";

        LayoutNode* label = arena_new<LayoutNode>(a);
        label->req_width = 370; label->req_height = 44;
        label->elements = arena_array<Element>(a, 1);
        label->element_count = 1;
        char* txt = (char*)arena_alloc(a, 64, 1);
        snprintf(txt, 64, "VirtualLayout counter: %d (click anywhere to +1)", cs->count);
        label->elements[0] = elem_text({8, 14, txt, "sans", 14, COLOR_WHITE, TEXT_NORMAL, ALIGN_LEFT, 0});
        label->id = "counter-label";

        box->children = (LayoutNode**)arena_alloc(a, sizeof(LayoutNode*), 8);
        box->children[0] = label;
        box->child_count = 1;
        return box;
    };

    auto counter_event = [](void* state, const UIEvent* ev) -> bool {
        if (ev->type == EVENT_CLICK) { ((CounterState*)state)->count++; return true; }
        return false;
    };

    VirtualLayout vl = {};
    virtual_init(&vl, counter_render, counter_event, &counter_state, 8192);

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 7: FunctionalLayout — cached static sprite
    // ══════════════════════════════════════════════════════════════════════════
    // Create a static pattern (checkerboard) rendered once into cache
    LayoutNode sprite_source = {};
    sprite_source.type = LAYOUT_COORDINATE;
    sprite_source.req_width = 100; sprite_source.req_height = 50;
    sprite_source.elements = arena_array<Element>(&arena, 5);
    sprite_source.element_count = 5;
    for (int i = 0; i < 5; i++) {
        sprite_source.elements[i] = elem_rect({(float)(i * 20), 0, 18, 48,
            (i % 2 == 0) ? color_rgba(255, 200, 0) : color_rgba(80, 0, 120),
            COLOR_TRANSPARENT, 0, 0});
    }
    FunctionalLayout fl = {};
    functional_init(&fl, &sprite_source, 100, 50);

    // Pre-render the sprite into its cache
    {
        SoftwareBackend cache_sw(fl.cache_w, fl.cache_h);
        cache_sw.begin_frame(fl.cache_w, fl.cache_h);
        layout_compute(fl.source, fl.cache_w, fl.cache_h);
        render_tree(&cache_sw, fl.source);
        cache_sw.end_frame();
        memcpy(fl.cache, cache_sw.pixels, fl.cache_w * fl.cache_h * 4);
        fl.dirty = false;
    }
    printf("FunctionalLayout: cached %dx%d sprite (dirty=%d)\n", fl.cache_w, fl.cache_h, fl.dirty);

    // Wrap functional layout source as a regular node for display
    LayoutNode fl_node = {};
    fl_node.type = LAYOUT_COORDINATE;
    fl_node.req_width = 100; fl_node.req_height = 50;
    fl_node.elements = sprite_source.elements;
    fl_node.element_count = sprite_source.element_count;
    fl_node.id = "functional-sprite";

    // ══════════════════════════════════════════════════════════════════════════
    // ROOT: Vertical LinearLayout stacking all sections
    // ══════════════════════════════════════════════════════════════════════════
    LayoutNode* root_children[7];
    root_children[0] = &title_node;
    root_children[1] = &hrow;
    root_children[2] = &grid;
    root_children[3] = &scroll;
    root_children[4] = &coord;
    // VirtualLayout's tree will go in slot 5
    // FunctionalLayout sprite in slot 6
    root_children[5] = virtual_render(&vl);
    root_children[6] = &fl_node;

    LayoutNode root = {};
    root.type = LAYOUT_LINEAR; root.direction = LINEAR_VERTICAL;
    root.gap = 8;
    root.padding = 15;
    root.children = root_children;
    root.child_count = 7;
    root.id = "root";

    layout_compute(&root, 800, 600);

    // Text measurement demo
    TextMeasure tm = measure_text("Hello World", 11, "sans", 16, TEXT_NORMAL);
    printf("Text measure 'Hello World' @ 16px: %.1f x %.1f\n", tm.width, tm.height);
    printf("Layout: LinearH row width=%.0f | Grid height=%.0f | Scroll content=%.0f\n",
        hrow.width, grid.height, scroll.content_height);

    // Open window
    SDL2Backend gfx("Bookkeeping Demo — Phase 1 Extension", 800, 600);

    bool running = true;
    SDL_Event event;
    while (running) {
        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_QUIT) running = false;
            if (event.type == SDL_KEYDOWN && event.key.keysym.sym == SDLK_ESCAPE) running = false;

            // Mouse wheel → scroll
            if (event.type == SDL_MOUSEWHEEL) {
                scroll.scroll_y -= event.wheel.y * 20;
                if (scroll.scroll_y < 0) scroll.scroll_y = 0;
                float max_scroll = scroll.content_height - scroll.height;
                if (max_scroll < 0) max_scroll = 0;
                if (scroll.scroll_y > max_scroll) scroll.scroll_y = max_scroll;
            }

            // Click → hit test + VirtualLayout event dispatch
            if (event.type == SDL_MOUSEBUTTONDOWN && event.button.button == SDL_BUTTON_LEFT) {
                float mx = (float)event.button.x;
                float my = (float)event.button.y;

                // Dispatch to VirtualLayout counter
                UIEvent ui_click = {EVENT_CLICK, mx, my, 0, 0, nullptr};
                if (virtual_dispatch(&vl, &ui_click)) {
                    // Re-render the virtual tree and update root
                    root_children[5] = virtual_render(&vl);
                    layout_compute(&root, 800, 600);
                }

                // Surface hit
                HitResult surface = hit_test_surface(&root, mx, my);
                if (surface.node && surface.node->id) {
                    printf("Surface hit: \"%s\" (local: %.0f, %.0f)\n",
                        surface.node->id, surface.local_x, surface.local_y);
                } else if (surface.node) {
                    printf("Surface hit: (no id) (local: %.0f, %.0f)\n", surface.local_x, surface.local_y);
                }

                // Deep hit — print all elements
                HitResult deep[16];
                int n = hit_test_deep(&root, mx, my, deep, 16);
                printf("Deep hit: %d node(s) at (%.0f, %.0f):\n", n, mx, my);
                for (int i = 0; i < n; i++) {
                    const char* name = deep[i].node->id ? deep[i].node->id : "(no id)";
                    printf("  [%d] \"%s\" (local: %.0f, %.0f) — %d element(s)",
                        i, name, deep[i].local_x, deep[i].local_y, deep[i].node->element_count);
                    for (uint16_t e = 0; e < deep[i].node->element_count; e++) {
                        Element& el = deep[i].node->elements[e];
                        switch (el.type) {
                            case ELEM_RECT: printf(" [Rect %.0fx%.0f]", el.rect.w, el.rect.h); break;
                            case ELEM_ELLIPSE: printf(" [Ellipse rx=%.0f ry=%.0f]", el.ellipse.rx, el.ellipse.ry); break;
                            case ELEM_LINE: printf(" [Line]"); break;
                            case ELEM_TEXT: printf(" [Text \"%s\"]", el.text.content ? el.text.content : ""); break;
                            case ELEM_POLYLINE: printf(" [Polyline]"); break;
                            case ELEM_POLYGON: printf(" [Polygon]"); break;
                        }
                    }
                    printf("\n");
                }
            }
        }

        gfx.begin_frame(800, 600);
        render_tree(&gfx, &root);
        gfx.end_frame();
    }

    arena_destroy(&arena);
    virtual_destroy(&vl);
    functional_destroy(&fl);
    return 0;
}
