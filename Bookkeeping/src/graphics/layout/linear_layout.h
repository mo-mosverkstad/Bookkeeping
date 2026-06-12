#pragma once
#include "src/graphics/layout/layout.h"

// Direction for LinearLayout
enum LinearDirection : uint8_t {
    LINEAR_HORIZONTAL = 0,
    LINEAR_VERTICAL = 1,
};

// LinearLayout: children stacked either horizontally or vertically
// with configurable gap between items.
struct LinearLayout {
    LinearDirection direction;
    float gap;
    float padding;
    float req_width;   // 0 = auto
    float req_height;

    // Computed
    float x, y, width, height;

    LayoutNode** children;
    uint16_t child_count;
    Element* elements;
    uint16_t element_count;
    const char* id;
};
