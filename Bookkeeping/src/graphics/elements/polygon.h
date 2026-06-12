#pragma once
#include "src/graphics/elements/polyline.h" // reuses PolyPoint

struct Polygon {
    PolyPoint* points;
    uint16_t count;
    Color fill;
    Color stroke;
    float stroke_width;
};
