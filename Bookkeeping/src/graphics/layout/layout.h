#pragma once
#include "src/graphics/layout/layout_base.h"
#include "src/graphics/layout/coordinate_layout.h"
#include "src/graphics/layout/linear_layout.h"
#include "src/graphics/layout/grid_layout.h"
#include "src/graphics/layout/scroll_layout.h"

// Layout type tag
enum LayoutType : uint8_t {
    LAYOUT_COORDINATE,
    LAYOUT_LINEAR,
    LAYOUT_GRID,
    LAYOUT_SCROLL,
};

// LayoutNode: unified node that holds any layout type.
// Uses a flat struct (not a union) for simplicity and because the fields
// largely overlap. Each layout type uses a subset of the fields.
struct LayoutNode {
    LayoutType type;

    // ── Common fields (all layouts) ──────────────────────────────────────────
    float req_width;
    float req_height;
    float padding;
    float gap;
    float x, y, width, height; // computed position + size

    LayoutNode** children;
    uint16_t child_count;
    Element* elements;
    uint16_t element_count;
    const char* id;

    // ── Linear-specific ──────────────────────────────────────────────────────
    LinearDirection direction; // LINEAR_HORIZONTAL or LINEAR_VERTICAL

    // ── Grid-specific ────────────────────────────────────────────────────────
    uint16_t grid_cols;
    float* col_widths;  // array of grid_cols widths (nullptr = equal)

    // ── Scroll-specific ──────────────────────────────────────────────────────
    float scroll_x;
    float scroll_y;
    float content_width;
    float content_height;
};

// ── Layout computation ───────────────────────────────────────────────────────
void layout_compute(LayoutNode* root, float avail_width, float avail_height);
