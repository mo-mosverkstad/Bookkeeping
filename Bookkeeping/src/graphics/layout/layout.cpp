#include "src/graphics/layout/layout.h"
#include <cstring>

// ── Text measurement hook ────────────────────────────────────────────────────

static TextMeasure default_measure(const char* text, uint32_t len, const char*, float size, uint8_t) {
    // Mock: count characters (handle newlines for multiline)
    uint32_t max_line = 0, cur_line = 0, lines = 1;
    for (uint32_t i = 0; i < len; i++) {
        if (text[i] == '\n') { if (cur_line > max_line) max_line = cur_line; cur_line = 0; lines++; }
        else cur_line++;
    }
    if (cur_line > max_line) max_line = cur_line;
    return { max_line * size * 0.6f, lines * size };
}

static TextMeasureFn g_measure_fn = default_measure;

void set_text_measure_hook(TextMeasureFn fn) { g_measure_fn = fn ? fn : default_measure; }

TextMeasure measure_text(const char* text, uint32_t len, const char* font, float size, uint8_t style) {
    return g_measure_fn(text, len, font, size, style);
}

// ── Layout algorithms ────────────────────────────────────────────────────────

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
        for (uint16_t c = 0; c < cols; c++) {
            uint16_t idx = r * cols + c;
            if (idx >= node->child_count) break;
            LayoutNode* child = node->children[idx];
            float cw = (node->col_widths && node->col_widths[c] > 0) ? node->col_widths[c] : col_w;
            layout_compute(child, cw, child->req_height);
            if (child->height > row_h) row_h = child->height;
        }
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

static void layout_scroll(LayoutNode* node, float avail_width, float avail_height) {
    // Viewport size is fixed (req_width/req_height or available)
    if (node->req_width > 0) node->width = node->req_width;
    else node->width = avail_width;
    if (node->req_height > 0) node->height = node->req_height;
    else node->height = avail_height;

    // Layout children as if in a vertical stack (content can be larger than viewport)
    float cursor = 0;
    float max_w = 0;
    for (uint16_t i = 0; i < node->child_count; i++) {
        LayoutNode* child = node->children[i];
        float cw = child->req_width > 0 ? child->req_width : node->width;
        float ch = child->req_height > 0 ? child->req_height : 0;
        layout_compute(child, cw, ch);
        child->x = 0;
        child->y = cursor;
        cursor += child->height + node->gap;
        if (child->width > max_w) max_w = child->width;
    }
    node->content_width = max_w;
    node->content_height = cursor > 0 ? cursor - node->gap : 0;
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
        case LAYOUT_SCROLL:     layout_scroll(root, avail_width, avail_height); break;
    }
}

// ── Hit testing ──────────────────────────────────────────────────────────────

HitResult hit_test_surface(LayoutNode* root, float x, float y, float offset_x, float offset_y) {
    HitResult best = {nullptr, 0, 0};
    float abs_x = offset_x + root->x;
    float abs_y = offset_y + root->y;

    if (x < abs_x || x >= abs_x + root->width || y < abs_y || y >= abs_y + root->height)
        return best;

    // For scroll nodes, adjust coordinates by scroll offset
    float child_ox = abs_x;
    float child_oy = abs_y;
    if (root->type == LAYOUT_SCROLL) {
        child_ox -= root->scroll_x;
        child_oy -= root->scroll_y;
    }

    // Check children in reverse order (last rendered = topmost)
    for (int i = root->child_count - 1; i >= 0; i--) {
        HitResult child_hit = hit_test_surface(root->children[i], x, y, child_ox, child_oy);
        if (child_hit.node) return child_hit;
    }

    // No child hit — this node itself is the hit
    best.node = root;
    best.local_x = x - abs_x;
    best.local_y = y - abs_y;
    return best;
}

int hit_test_deep(LayoutNode* root, float x, float y, HitResult* results, int capacity, float offset_x, float offset_y) {
    float abs_x = offset_x + root->x;
    float abs_y = offset_y + root->y;

    if (x < abs_x || x >= abs_x + root->width || y < abs_y || y >= abs_y + root->height)
        return 0;

    int count = 0;

    // Add this node
    if (count < capacity) {
        results[count].node = root;
        results[count].local_x = x - abs_x;
        results[count].local_y = y - abs_y;
        count++;
    }

    // For scroll nodes, adjust coordinates by scroll offset
    float child_ox = abs_x;
    float child_oy = abs_y;
    if (root->type == LAYOUT_SCROLL) {
        child_ox -= root->scroll_x;
        child_oy -= root->scroll_y;
    }

    // Recurse into children
    for (uint16_t i = 0; i < root->child_count; i++) {
        int n = hit_test_deep(root->children[i], x, y, results + count, capacity - count, child_ox, child_oy);
        count += n;
        if (count >= capacity) break;
    }

    return count;
}
