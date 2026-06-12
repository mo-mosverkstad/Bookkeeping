#pragma once
#include <cstdint>
#include "src/core/color.h"

// Axis-aligned rectangle (position + size + style)
struct Rect {
    float x, y, w, h;
    Color fill;
    Color stroke;
    float stroke_width; // 0 = no stroke
    float radius;       // corner radius, 0 = sharp
};

// Ellipse (center + radii + style)
struct Ellipse {
    float cx, cy, rx, ry;
    Color fill;
    Color stroke;
    float stroke_width;
};

// Line segment
struct Line {
    float x1, y1, x2, y2;
    Color color;
    float width;
};

// Polyline (open path)
struct PolyPoint { float x, y; };

struct Polyline {
    PolyPoint* points;
    uint16_t count;
    Color color;
    float width;
};

// Polygon (closed path, filled)
struct Polygon {
    PolyPoint* points;
    uint16_t count;
    Color fill;
    Color stroke;
    float stroke_width;
};

// Text decoration flags — bit-packed into uint8_t
// bit 0: bold
// bit 1: italic
// bit 2: underline
// bit 3: strikethrough
// bit 4: subscript
// bit 5: superscript
enum TextStyle : uint8_t {
    TEXT_NORMAL       = 0,
    TEXT_BOLD         = 1 << 0,
    TEXT_ITALIC       = 1 << 1,
    TEXT_UNDERLINE    = 1 << 2,
    TEXT_STRIKETHROUGH= 1 << 3,
    TEXT_SUBSCRIPT    = 1 << 4,
    TEXT_SUPERSCRIPT  = 1 << 5,
};

// Horizontal alignment — 2 bits
enum TextAlign : uint8_t {
    ALIGN_LEFT   = 0,
    ALIGN_CENTER = 1,
    ALIGN_RIGHT  = 2,
};

// Text element (multiline supported via embedded '\n')
struct Text {
    float x, y;
    const char* content;  // arena-allocated string, may contain '\n'
    const char* font;     // font family name (e.g., "Cambria Math")
    float size;           // font size in pixels
    Color color;
    uint8_t style;        // TextStyle flags OR'd together
    uint8_t align;        // TextAlign
    float max_width;      // 0 = no wrapping, >0 = wrap boundary
};
