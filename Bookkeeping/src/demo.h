#pragma once
#include "src/core/arena.h"
#include "src/graphics/elements/element.h"
#include "src/graphics/layout/layout.h"
#include "src/graphics/backend/backend.h"
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

    // Scroll viewport (300px tall, content is 20*42 = 840px)
    LayoutNode scroll = {};
    scroll.type = LAYOUT_SCROLL;
    scroll.req_width = 370;
    scroll.req_height = 300;
    scroll.gap = 2;
    scroll.scroll_x = 0;
    scroll.scroll_y = 0;
    scroll.children = items;
    scroll.child_count = ITEM_COUNT;
    scroll.id = "scroll-viewport";

    // Title area
    LayoutNode title_node = {};
    title_node.req_width = 370;
    title_node.req_height = 30;
    title_node.elements = arena_array<Element>(&arena, 1);
    title_node.element_count = 1;
    title_node.elements[0] = elem_text({5, 5, "Scroll Demo (wheel=scroll, click=hit test)", "sans", 14, COLOR_WHITE, TEXT_BOLD, ALIGN_LEFT, 0});
    title_node.id = "title";

    // An ellipse to show shapes work
    LayoutNode shape_node = {};
    shape_node.req_width = 370;
    shape_node.req_height = 100;
    shape_node.elements = arena_array<Element>(&arena, 2);
    shape_node.element_count = 2;
    shape_node.elements[0] = elem_ellipse({80, 50, 60, 35, COLOR_BLUE, COLOR_WHITE, 1});
    shape_node.elements[1] = elem_line({160, 10, 350, 90, COLOR_GREEN, 2});
    shape_node.id = "shapes";

    // Root vertical layout
    LayoutNode* root_children[] = {&title_node, &scroll, &shape_node};
    LayoutNode root = {};
    root.type = LAYOUT_LINEAR_V;
    root.gap = 10;
    root.padding = 20;
    root.children = root_children;
    root.child_count = 3;
    root.id = "root";

    layout_compute(&root, 800, 600);

    // Text measurement demo
    TextMeasure tm = measure_text("Hello World", 11, "sans", 16, TEXT_NORMAL);
    printf("Text measure 'Hello World' @ 16px: %.1f x %.1f\n", tm.width, tm.height);

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

            // Click → hit test
            if (event.type == SDL_MOUSEBUTTONDOWN && event.button.button == SDL_BUTTON_LEFT) {
                float mx = (float)event.button.x;
                float my = (float)event.button.y;

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
    return 0;
}
