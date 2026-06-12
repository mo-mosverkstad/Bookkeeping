#pragma once
#include <cstdint>
#include <cstddef>

// Layout node — a box with computed position/size and children.
// Each node has a layout type that determines how children are arranged.

enum LayoutType : uint8_t {
    LAYOUT_COORDINATE, // Children positioned at absolute (x,y) offsets
    LAYOUT_LINEAR_H,   // Children stacked horizontally with gap
    LAYOUT_LINEAR_V,   // Children stacked vertically with gap
    LAYOUT_GRID,       // Children in rows × cols grid
};

// Alignment within the cross-axis
enum Align : uint8_t {
    ALIGN_START = 0,
    ALIGN_MIDDLE = 1,
    ALIGN_END = 2,
    ALIGN_STRETCH = 3,
};

struct LayoutNode {
    // Input constraints (set by creator)
    float req_width;    // requested width (0 = auto/shrink)
    float req_height;   // requested height (0 = auto/shrink)
    float padding;      // uniform padding inside this node
    float gap;          // gap between children (Linear/Grid)

    // Grid-specific
    uint16_t grid_cols; // number of columns (Grid only)
    float* col_widths;  // array of grid_cols widths (nullptr = equal)

    // Layout type + alignment
    LayoutType type;
    Align cross_align;  // alignment on cross-axis

    // Computed output (filled by layout pass)
    float x, y;         // position relative to parent
    float width, height;// computed size

    // Children (arena-allocated array)
    LayoutNode** children;
    uint16_t child_count;

    // Associated elements to render at this node's position
    // (arena-allocated array of Element indices or pointers)
    struct Element* elements;
    uint16_t element_count;
};

// Layout computation — call on root, fills x/y/width/height recursively.
void layout_compute(LayoutNode* root, float avail_width, float avail_height);
