#pragma once
#include "src/graphics/elements/rect.h"
#include "src/graphics/elements/ellipse.h"
#include "src/graphics/elements/line.h"
#include "src/graphics/elements/polyline.h"
#include "src/graphics/elements/polygon.h"
#include "src/graphics/elements/text.h"
#include <cstdint>

// Element type tag — 3 bits (6 types)
enum ElementType : uint8_t {
    ELEM_RECT = 0,
    ELEM_ELLIPSE,
    ELEM_LINE,
    ELEM_POLYLINE,
    ELEM_POLYGON,
    ELEM_TEXT,
};

// Tagged union — one renderable element
struct Element {
    ElementType type;
    union {
        Rect rect;
        Ellipse ellipse;
        Line line;
        Polyline polyline;
        Polygon polygon;
        Text text;
    };
};

inline Element elem_rect(Rect r) { Element e; e.type = ELEM_RECT; e.rect = r; return e; }
inline Element elem_ellipse(Ellipse el) { Element e; e.type = ELEM_ELLIPSE; e.ellipse = el; return e; }
inline Element elem_line(Line l) { Element e; e.type = ELEM_LINE; e.line = l; return e; }
inline Element elem_polyline(Polyline p) { Element e; e.type = ELEM_POLYLINE; e.polyline = p; return e; }
inline Element elem_polygon(Polygon p) { Element e; e.type = ELEM_POLYGON; e.polygon = p; return e; }
inline Element elem_text(Text t) { Element e; e.type = ELEM_TEXT; e.text = t; return e; }
