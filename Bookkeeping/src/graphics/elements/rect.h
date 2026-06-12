#pragma once
#include "src/core/color.h"

struct Rect {
    float x, y, w, h;
    Color fill;
    Color stroke;
    float stroke_width;
    float radius; // corner radius
};
