#pragma once

#include <vector>
#include "graphics/graphics_elements/Shapes.h"

struct World {
    std::vector<Circle> circles;
    std::vector<Rect> rects;
};