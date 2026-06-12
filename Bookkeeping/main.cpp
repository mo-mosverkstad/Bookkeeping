#include "src/core/arena.h"
#include "src/graphics/elements/element.h"
#include "src/graphics/layout/layout.h"
#include "src/graphics/backend/backend.h"
#include "src/graphics/backend/sdl2_backend.h"
#include <cstdio>

int main() {
    Arena arena = arena_create(64 * 1024);

    // Create a layout: vertical stack of colored rects + a line + an ellipse
    LayoutNode* children[5];
    for (int i = 0; i < 3; i++) {
        children[i] = arena_new<LayoutNode>(&arena);
        children[i]->req_width = 200;
        children[i]->req_height = 50;
        children[i]->elements = arena_array<Element>(&arena, 1);
        children[i]->element_count = 1;
        children[i]->elements[0] = elem_rect({0, 0, 200, 50,
            color_rgba(80 * i, 100, 255 - 80 * i), color_rgba(200, 200, 200), 1, 0});
    }

    // A line element
    children[3] = arena_new<LayoutNode>(&arena);
    children[3]->req_width = 200;
    children[3]->req_height = 10;
    children[3]->elements = arena_array<Element>(&arena, 1);
    children[3]->element_count = 1;
    children[3]->elements[0] = elem_line({0, 5, 200, 5, COLOR_GREEN, 2});

    // An ellipse
    children[4] = arena_new<LayoutNode>(&arena);
    children[4]->req_width = 200;
    children[4]->req_height = 100;
    children[4]->elements = arena_array<Element>(&arena, 1);
    children[4]->element_count = 1;
    children[4]->elements[0] = elem_ellipse({100, 50, 80, 40, COLOR_BLUE, COLOR_WHITE, 1});

    LayoutNode root = {};
    root.type = LAYOUT_LINEAR_V;
    root.gap = 10;
    root.padding = 20;
    root.children = children;
    root.child_count = 5;

    layout_compute(&root, 800, 600);

    // Open SDL2 window
    SDL2Backend gfx("Bookkeeping — Phase 1", 800, 600);

    bool running = true;
    SDL_Event event;
    while (running) {
        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_QUIT) running = false;
            if (event.type == SDL_KEYDOWN && event.key.keysym.sym == SDLK_ESCAPE) running = false;
        }

        gfx.begin_frame(800, 600);
        render_tree(&gfx, &root);
        gfx.end_frame();
    }

    arena_destroy(&arena);
    return 0;
}
