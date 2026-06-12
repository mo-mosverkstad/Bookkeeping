#pragma once
#include "src/core/color.h"

struct Ellipse {
    float cx, cy, rx, ry;
    Color fill;
    Color stroke;
    float stroke_width;
};
