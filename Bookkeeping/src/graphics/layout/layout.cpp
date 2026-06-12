#include "src/graphics/layout/layout.h"
#include <algorithm>

static void layout_coordinate(LayoutNode* node) {
    float max_w = 0, max_h = 0;
    for (uint16_t i = 0; i < node->child_count; i++) {
        LayoutNode* child = node->children[i];
        layout_compute(child, child->req_width, child->req_height);
        float r = child->x + child->width;
        float b = child->y + child->height;
        if (r > max_w) max_w = r;
        if (b > max_h) max_h = b;
    }
    if (node->req_width <= 0) node->width = max_w + node->padding * 2;
    if (node->req_height <= 0) node->height = max_h + node->padding * 2;
}

static void layout_linear_h(LayoutNode* node, float avail_width) {
    float cursor = node->padding;
    float max_h = 0;
    for (uint16_t i = 0; i < node->child_count; i++) {
        LayoutNode* child = node->children[i];
        float cw = child->req_width > 0 ? child->req_width : 0;
        float ch = child->req_height > 0 ? child->req_height : 0;
        layout_compute(child, cw, ch);
        child->x = cursor;
        child->y = node->padding;
        cursor += child->width + node->gap;
        if (child->height > max_h) max_h = child->height;
    }
    if (node->req_width <= 0) node->width = cursor - node->gap + node->padding;
    if (node->req_height <= 0) node->height = max_h + node->padding * 2;
    (void)avail_width;
}

static void layout_linear_v(LayoutNode* node, float avail_width) {
    float cursor = node->padding;
    float max_w = 0;
    for (uint16_t i = 0; i < node->child_count; i++) {
        LayoutNode* child = node->children[i];
        float cw = child->req_width > 0 ? child->req_width : avail_width - node->padding * 2;
        float ch = child->req_height > 0 ? child->req_height : 0;
        layout_compute(child, cw, ch);
        child->x = node->padding;
        child->y = cursor;
        cursor += child->height + node->gap;
        if (child->width > max_w) max_w = child->width;
    }
    if (node->req_width <= 0) node->width = max_w + node->padding * 2;
    if (node->req_height <= 0) node->height = cursor - node->gap + node->padding;
}

static void layout_grid(LayoutNode* node, float avail_width) {
    if (node->grid_cols == 0) return;
    uint16_t cols = node->grid_cols;
    uint16_t rows = (node->child_count + cols - 1) / cols;

    float col_w = (avail_width - node->padding * 2 - node->gap * (cols - 1)) / cols;

    float cursor_y = node->padding;
    for (uint16_t r = 0; r < rows; r++) {
        float row_h = 0;
        // First pass: compute children sizes for this row
        for (uint16_t c = 0; c < cols; c++) {
            uint16_t idx = r * cols + c;
            if (idx >= node->child_count) break;
            LayoutNode* child = node->children[idx];
            float cw = (node->col_widths && node->col_widths[c] > 0) ? node->col_widths[c] : col_w;
            layout_compute(child, cw, child->req_height);
            if (child->height > row_h) row_h = child->height;
        }
        // Second pass: position children
        float cursor_x = node->padding;
        for (uint16_t c = 0; c < cols; c++) {
            uint16_t idx = r * cols + c;
            if (idx >= node->child_count) break;
            LayoutNode* child = node->children[idx];
            float cw = (node->col_widths && node->col_widths[c] > 0) ? node->col_widths[c] : col_w;
            child->x = cursor_x;
            child->y = cursor_y;
            child->width = cw;
            cursor_x += cw + node->gap;
        }
        cursor_y += row_h + node->gap;
    }
    if (node->req_width <= 0) node->width = avail_width;
    if (node->req_height <= 0) node->height = cursor_y - node->gap + node->padding;
}

void layout_compute(LayoutNode* root, float avail_width, float avail_height) {
    if (root->req_width > 0) root->width = root->req_width;
    else root->width = avail_width;
    if (root->req_height > 0) root->height = root->req_height;
    else root->height = avail_height;

    switch (root->type) {
        case LAYOUT_COORDINATE: layout_coordinate(root); break;
        case LAYOUT_LINEAR_H:   layout_linear_h(root, avail_width); break;
        case LAYOUT_LINEAR_V:   layout_linear_v(root, avail_width); break;
        case LAYOUT_GRID:       layout_grid(root, avail_width); break;
    }
}
