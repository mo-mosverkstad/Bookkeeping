#pragma once

#include "graphics/graphics_elements/Transform.h"
#include "graphics/graphics_elements/Color.h"

struct Circle {
    Transform transform;
    Color color;
    float radius = 1.0f;
};

struct Rect {
    Transform transform;
    Color color;
    float width = 1.0f;
    float height = 1.0f;
};