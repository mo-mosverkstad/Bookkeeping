#pragma once
#include "src/graphics/backend/backend.h"
#include "src/core/color.h"
#include <cstdint>
#include <cstring>
#include <cmath>

struct SoftwareBackend : RenderBackend {
    uint8_t* pixels;
    int buf_w, buf_h;
    int clip_x0, clip_y0, clip_x1, clip_y1; // active scissor rect
    bool clipping;

    SoftwareBackend(int w, int h) : buf_w(w), buf_h(h), clip_x0(0), clip_y0(0), clip_x1(w), clip_y1(h), clipping(false) {
        pixels = new uint8_t[w * h * 4];
    }
    ~SoftwareBackend() override { delete[] pixels; }

    void begin_frame(float, float) override {
        memset(pixels, 0, buf_w * buf_h * 4);
        clipping = false;
        clip_x0 = 0; clip_y0 = 0; clip_x1 = buf_w; clip_y1 = buf_h;
    }
    void end_frame() override {}

    void set_clip(ClipRect r) override {
        clipping = true;
        clip_x0 = (int)r.x < 0 ? 0 : (int)r.x;
        clip_y0 = (int)r.y < 0 ? 0 : (int)r.y;
        clip_x1 = (int)(r.x + r.w) > buf_w ? buf_w : (int)(r.x + r.w);
        clip_y1 = (int)(r.y + r.h) > buf_h ? buf_h : (int)(r.y + r.h);
    }
    void reset_clip() override {
        clipping = false;
        clip_x0 = 0; clip_y0 = 0; clip_x1 = buf_w; clip_y1 = buf_h;
    }

    void set_pixel(int x, int y, Color c) {
        if (x < clip_x0 || x >= clip_x1 || y < clip_y0 || y >= clip_y1) return;
        int idx = (y * buf_w + x) * 4;
        if (c.a == 255) {
            pixels[idx] = c.r; pixels[idx+1] = c.g; pixels[idx+2] = c.b; pixels[idx+3] = 255;
        } else if (c.a > 0) {
            uint8_t inv = 255 - c.a;
            pixels[idx]   = (c.r * c.a + pixels[idx] * inv) / 255;
            pixels[idx+1] = (c.g * c.a + pixels[idx+1] * inv) / 255;
            pixels[idx+2] = (c.b * c.a + pixels[idx+2] * inv) / 255;
            pixels[idx+3] = c.a + (pixels[idx+3] * inv) / 255;
        }
    }

    Color get_pixel(int x, int y) const {
        if (x < 0 || x >= buf_w || y < 0 || y >= buf_h) return {0,0,0,0};
        int idx = (y * buf_w + x) * 4;
        return {pixels[idx], pixels[idx+1], pixels[idx+2], pixels[idx+3]};
    }

    void fill_rect(int x, int y, int w, int h, Color c) {
        for (int py = y; py < y + h; py++)
            for (int px = x; px < x + w; px++)
                set_pixel(px, py, c);
    }

    void stroke_rect(int x, int y, int w, int h, Color c, int thickness) {
        for (int t = 0; t < thickness; t++) {
            for (int px = x-t; px < x+w+t; px++) { set_pixel(px, y-t, c); set_pixel(px, y+h-1+t, c); }
            for (int py = y-t; py < y+h+t; py++) { set_pixel(x-t, py, c); set_pixel(x+w-1+t, py, c); }
        }
    }

    void draw_line(int x0, int y0, int x1, int y1, Color c) {
        int dx = x1 - x0, dy = y1 - y0;
        int sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
        dx = dx < 0 ? -dx : dx; dy = dy < 0 ? -dy : dy;
        int err = dx - dy;
        while (true) {
            set_pixel(x0, y0, c);
            if (x0 == x1 && y0 == y1) break;
            int e2 = err * 2;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    void render_rect(float abs_x, float abs_y, const Rect& r) override {
        int px = (int)(abs_x + r.x), py = (int)(abs_y + r.y), pw = (int)r.w, ph = (int)r.h;
        if (r.fill.a > 0) fill_rect(px, py, pw, ph, r.fill);
        if (r.stroke.a > 0 && r.stroke_width > 0) stroke_rect(px, py, pw, ph, r.stroke, (int)r.stroke_width);
    }

    void render_ellipse(float abs_x, float abs_y, const Ellipse& e) override {
        int cx = (int)(abs_x + e.cx), cy = (int)(abs_y + e.cy);
        int rx = (int)e.rx, ry = (int)e.ry;
        for (int y = -ry; y <= ry; y++) {
            int half_w = (int)(rx * sqrt(1.0 - (double)(y*y) / (ry*ry)));
            for (int x = -half_w; x <= half_w; x++)
                set_pixel(cx + x, cy + y, e.fill);
        }
    }

    void render_line(float abs_x, float abs_y, const Line& l) override {
        draw_line((int)(abs_x + l.x1), (int)(abs_y + l.y1), (int)(abs_x + l.x2), (int)(abs_y + l.y2), l.color);
    }

    void render_polyline(float abs_x, float abs_y, const Polyline& p) override {
        for (uint16_t i = 0; i + 1 < p.count; i++)
            draw_line((int)(abs_x + p.points[i].x), (int)(abs_y + p.points[i].y),
                      (int)(abs_x + p.points[i+1].x), (int)(abs_y + p.points[i+1].y), p.color);
    }

    void render_polygon(float abs_x, float abs_y, const Polygon& p) override {
        for (uint16_t i = 0; i < p.count; i++) {
            uint16_t j = (i + 1) % p.count;
            draw_line((int)(abs_x + p.points[i].x), (int)(abs_y + p.points[i].y),
                      (int)(abs_x + p.points[j].x), (int)(abs_y + p.points[j].y), p.stroke);
        }
    }

    void render_text(float abs_x, float abs_y, const Text& t) override {
        int px = (int)(abs_x + t.x), py = (int)(abs_y + t.y);
        TextMeasure m = measure_text(t.content, t.content ? (uint32_t)strlen(t.content) : 0, t.font, t.size, t.style);
        int pw = (int)m.width, ph = (int)m.height;
        fill_rect(px, py, pw, ph, {t.color.r, t.color.g, t.color.b, 64});
    }
};
