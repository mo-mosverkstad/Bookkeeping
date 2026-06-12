#pragma once
#include "src/graphics/layout/layout_base.h"

// ScrollLayout: a fixed-size viewport that clips children.
// Children are positioned relative to the content, not the viewport.
// scroll_x/scroll_y shift which portion of content is visible.
struct ScrollLayout {
    float scroll_x;         // content shifts left by this amount
    float scroll_y;         // content shifts up by this amount
    float gap;              // gap between children (laid out vertically)
    float req_width;        // viewport width
    float req_height;       // viewport height

    // Computed
    float x, y, width, height;
    float content_width;    // total content extent (for scroll bounds)
    float content_height;

    LayoutNode** children;
    uint16_t child_count;
    Element* elements;
    uint16_t element_count;
    const char* id;
};
