#pragma once
#include "src/graphics/layout/layout.h"

// GridCol: defines a column's width (0 = auto/equal share)
struct GridCol {
    float width; // fixed width, or 0 for auto
};

// GridRow: defines a row's height (0 = auto from content)
struct GridRow {
    float height; // fixed height, or 0 for auto
};

// GridCell: wraps a LayoutNode with optional col/row span
struct GridCell {
    LayoutNode* node;
    uint16_t col_span; // 1 = normal, >1 = spans multiple columns
    uint16_t row_span; // 1 = normal, >1 = spans multiple rows
};

// GridLayout: table-like arrangement with explicit columns and rows.
struct GridLayout {
    GridCol* cols;
    uint16_t col_count;
    GridRow* rows_def;     // optional explicit row heights (nullptr = all auto)
    uint16_t row_def_count;

    float gap;             // gap between cells (both horizontal and vertical)
    float padding;
    float req_width;       // 0 = auto
    float req_height;

    // Computed
    float x, y, width, height;

    // Cells laid out row-major: cells[row * col_count + col]
    GridCell* cells;
    uint16_t cell_count;

    Element* elements;
    uint16_t element_count;
    const char* id;
};
