#pragma once
#include "src/core/color.h"
#include <cstdint>

struct PolyPoint { float x, y; };

struct Polyline {
    PolyPoint* points;
    uint16_t count;
    Color color;
    float width;
};
