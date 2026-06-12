#pragma once
#include "src/graphics/layout/layout_base.h"

// CoordinateLayout: children positioned at absolute (x, y) offsets
// relative to this node's origin. No automatic arrangement.
struct CoordinateLayout {
    float padding;
    float req_width;   // 0 = auto (bounding box of children)
    float req_height;

    // Computed
    float x, y, width, height;

    LayoutNode** children;
    uint16_t child_count;
    Element* elements;
    uint16_t element_count;
    const char* id;
};
