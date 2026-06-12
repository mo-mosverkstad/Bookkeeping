#pragma once
#include "src/graphics/backend/backend.h"
#include "src/core/color.h"
#include <SDL2/SDL.h>
#include <cmath>
#include <cstring>

struct SDL2Backend : RenderBackend {
    SDL_Window* window;
    SDL_Renderer* renderer;

    SDL2Backend(const char* title, int w, int h) {
        SDL_Init(SDL_INIT_VIDEO);
        window = SDL_CreateWindow(title, SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                                  w, h, SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE);
        renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
    }
    ~SDL2Backend() override {
        SDL_DestroyRenderer(renderer);
        SDL_DestroyWindow(window);
        SDL_Quit();
    }

    void begin_frame(float, float) override {
        SDL_SetRenderDrawColor(renderer, 30, 30, 30, 255);
        SDL_RenderClear(renderer);
    }
    void end_frame() override { SDL_RenderPresent(renderer); }

    void set_clip(ClipRect r) override {
        SDL_Rect rect = {(int)r.x, (int)r.y, (int)r.w, (int)r.h};
        SDL_RenderSetClipRect(renderer, &rect);
    }
    void reset_clip() override { SDL_RenderSetClipRect(renderer, nullptr); }

    void render_rect(float abs_x, float abs_y, const Rect& r) override {
        SDL_Rect rect = {(int)(abs_x + r.x), (int)(abs_y + r.y), (int)r.w, (int)r.h};
        if (r.fill.a > 0) {
            SDL_SetRenderDrawColor(renderer, r.fill.r, r.fill.g, r.fill.b, r.fill.a);
            SDL_RenderFillRect(renderer, &rect);
        }
        if (r.stroke.a > 0 && r.stroke_width > 0) {
            SDL_SetRenderDrawColor(renderer, r.stroke.r, r.stroke.g, r.stroke.b, r.stroke.a);
            SDL_RenderDrawRect(renderer, &rect);
        }
    }

    void render_ellipse(float abs_x, float abs_y, const Ellipse& e) override {
        int cx = (int)(abs_x + e.cx), cy = (int)(abs_y + e.cy);
        int rx = (int)e.rx, ry = (int)e.ry;
        SDL_SetRenderDrawColor(renderer, e.fill.r, e.fill.g, e.fill.b, e.fill.a);
        for (int y = -ry; y <= ry; y++) {
            int half_w = (int)(rx * sqrt(1.0 - (double)(y*y) / (ry*ry)));
            SDL_RenderDrawLine(renderer, cx - half_w, cy + y, cx + half_w, cy + y);
        }
    }

    void render_line(float abs_x, float abs_y, const Line& l) override {
        SDL_SetRenderDrawColor(renderer, l.color.r, l.color.g, l.color.b, l.color.a);
        SDL_RenderDrawLine(renderer, (int)(abs_x + l.x1), (int)(abs_y + l.y1),
                                     (int)(abs_x + l.x2), (int)(abs_y + l.y2));
    }

    void render_polyline(float abs_x, float abs_y, const Polyline& p) override {
        SDL_SetRenderDrawColor(renderer, p.color.r, p.color.g, p.color.b, p.color.a);
        for (uint16_t i = 0; i + 1 < p.count; i++)
            SDL_RenderDrawLine(renderer, (int)(abs_x + p.points[i].x), (int)(abs_y + p.points[i].y),
                                         (int)(abs_x + p.points[i+1].x), (int)(abs_y + p.points[i+1].y));
    }

    void render_polygon(float abs_x, float abs_y, const Polygon& p) override {
        SDL_SetRenderDrawColor(renderer, p.stroke.r, p.stroke.g, p.stroke.b, p.stroke.a);
        for (uint16_t i = 0; i < p.count; i++) {
            uint16_t j = (i + 1) % p.count;
            SDL_RenderDrawLine(renderer, (int)(abs_x + p.points[i].x), (int)(abs_y + p.points[i].y),
                                         (int)(abs_x + p.points[j].x), (int)(abs_y + p.points[j].y));
        }
    }

    void render_text(float abs_x, float abs_y, const Text& t) override {
        // Placeholder: tinted rect. Full text needs SDL2_ttf.
        TextMeasure m = measure_text(t.content, t.content ? (uint32_t)strlen(t.content) : 0, t.font, t.size, t.style);
        SDL_Rect rect = {(int)(abs_x + t.x), (int)(abs_y + t.y), (int)m.width, (int)m.height};
        SDL_SetRenderDrawColor(renderer, t.color.r, t.color.g, t.color.b, 80);
        SDL_RenderFillRect(renderer, &rect);
    }
};
