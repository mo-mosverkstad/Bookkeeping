#pragma once
#include "src/graphics/backend/backend.h"
#include "src/core/color.h"
#include <SDL2/SDL.h>
#include <SDL2/SDL_ttf.h>
#include <cmath>
#include <cstring>

struct SDL2Backend : RenderBackend {
    SDL_Window* window;
    SDL_Renderer* renderer;
    TTF_Font* font;
    TTF_Font* font_bold;
    TTF_Font* font_math;

    SDL2Backend(const char* title, int w, int h) {
        SDL_Init(SDL_INIT_VIDEO);
        TTF_Init();
        window = SDL_CreateWindow(title, SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                                  w, h, SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE);
        renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
        font = TTF_OpenFont("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13);
        if (!font) font = TTF_OpenFont("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", 13);
        font_bold = TTF_OpenFont("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 13);
        if (!font_bold) font_bold = font;
        // Math font: prefer DejaVu Math TeX Gyre (has √, Greek, etc.)
        font_math = TTF_OpenFont("/usr/share/fonts/truetype/dejavu/DejaVuMathTeXGyre.ttf", 16);
        if (!font_math) font_math = TTF_OpenFont("/usr/share/fonts/opentype/stix/STIXGeneral-Regular.otf", 16);
        if (!font_math) font_math = font; // fallback
    }
    ~SDL2Backend() override {
        if (font_math && font_math != font) TTF_CloseFont(font_math);
        if (font_bold && font_bold != font) TTF_CloseFont(font_bold);
        if (font) TTF_CloseFont(font);
        SDL_DestroyRenderer(renderer);
        SDL_DestroyWindow(window);
        TTF_Quit();
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
        if (!t.content || !t.content[0] || !font) return;
        TTF_Font* f;
        if (t.font && strcmp(t.font, "math") == 0) f = font_math;
        else if (t.style & TEXT_BOLD) f = font_bold;
        else f = font;
        TTF_SetFontSize(f, (int)t.size > 0 ? (int)t.size : 12);
        if (t.style & TEXT_ITALIC) TTF_SetFontStyle(f, TTF_STYLE_ITALIC);
        else TTF_SetFontStyle(f, TTF_STYLE_NORMAL);
        SDL_Color col = {t.color.r, t.color.g, t.color.b, t.color.a};
        // Render line by line (TTF_RenderUTF8 doesn't handle \n)
        const char* str = t.content;
        int py = (int)(abs_y + t.y);
        while (*str) {
            const char* nl = strchr(str, '\n');
            int seg_len = nl ? (int)(nl - str) : (int)strlen(str);
            if (seg_len > 0) {
                char buf[256];
                int l = seg_len > 255 ? 255 : seg_len;
                memcpy(buf, str, l); buf[l] = 0;
                SDL_Surface* surf = TTF_RenderUTF8_Blended(f, buf, col);
                if (surf) {
                    SDL_Texture* tex = SDL_CreateTextureFromSurface(renderer, surf);
                    SDL_Rect dst = {(int)(abs_x + t.x), py, surf->w, surf->h};
                    SDL_RenderCopy(renderer, tex, nullptr, &dst);
                    SDL_DestroyTexture(tex);
                    py += surf->h;
                    SDL_FreeSurface(surf);
                }
            } else {
                py += (int)t.size;
            }
            if (nl) str = nl + 1; else break;
        }
    }
};
