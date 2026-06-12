#pragma once
#include "src/core/arena.h"
#include "src/graphics/elements/element.h"
#include "src/graphics/layout/layout.h"

// ── Zero-cost builder API for LayoutNode ─────────────────────────────────────
// Methods compile to the same code as setting fields directly.
// No vtable, no heap allocation, no runtime cost.

struct Node : LayoutNode {
    // Builder methods (return *this for chaining)
    Node& size(float w, float h) { req_width = w; req_height = h; return *this; }
    Node& pos(float px, float py) { x = px; y = py; return *this; }
    Node& set_gap(float g) { gap = g; return *this; }
    Node& set_padding(float p) { padding = p; return *this; }
    Node& set_id(const char* s) { id = s; return *this; }
    Node& set_scroll(float sx, float sy) { scroll_x = sx; scroll_y = sy; return *this; }
    Node& cols(uint16_t c) { grid_cols = c; return *this; }
    Node& col_sizes(float* w) { col_widths = w; return *this; }

    // Attach elements
    Node& attach(Element* elems, uint16_t count) { elements = elems; element_count = count; return *this; }

    // Set children
    Node& set_children(LayoutNode** ch, uint16_t count) { children = ch; child_count = count; return *this; }
};

// Factory functions — allocate from arena, return as Node* for chaining
inline Node* node_linear_h(Arena* a) {
    Node* n = (Node*)arena_new<LayoutNode>(a);
    n->type = LAYOUT_LINEAR; n->direction = LINEAR_HORIZONTAL;
    return n;
}

inline Node* node_linear_v(Arena* a) {
    Node* n = (Node*)arena_new<LayoutNode>(a);
    n->type = LAYOUT_LINEAR; n->direction = LINEAR_VERTICAL;
    return n;
}

inline Node* node_grid(Arena* a, uint16_t columns) {
    Node* n = (Node*)arena_new<LayoutNode>(a);
    n->type = LAYOUT_GRID; n->grid_cols = columns;
    return n;
}

inline Node* node_scroll(Arena* a, float w, float h) {
    Node* n = (Node*)arena_new<LayoutNode>(a);
    n->type = LAYOUT_SCROLL; n->req_width = w; n->req_height = h;
    return n;
}

inline Node* node_coord(Arena* a) {
    Node* n = (Node*)arena_new<LayoutNode>(a);
    n->type = LAYOUT_COORDINATE;
    return n;
}

inline Node* node_leaf(Arena* a, float w, float h) {
    Node* n = (Node*)arena_new<LayoutNode>(a);
    n->req_width = w; n->req_height = h;
    return n;
}

// Element helpers — allocate from arena
inline Element* make_rect(Arena* a, float w, float h, Color fill, Color stroke = COLOR_TRANSPARENT, float sw = 0) {
    Element* e = arena_new<Element>(a);
    *e = elem_rect({0, 0, w, h, fill, stroke, sw, 0});
    return e;
}

inline Element* make_text(Arena* a, const char* content, float size = 14, Color color = COLOR_WHITE, uint8_t style = TEXT_NORMAL) {
    Element* e = arena_new<Element>(a);
    *e = elem_text({4, 4, content, "sans", size, color, style, ALIGN_LEFT, 0});
    return e;
}

inline Element* make_ellipse(Arena* a, float rx, float ry, Color fill, Color stroke = COLOR_TRANSPARENT) {
    Element* e = arena_new<Element>(a);
    *e = elem_ellipse({rx, ry, rx, ry, fill, stroke, 1});
    return e;
}

inline Element* make_line(Arena* a, float x1, float y1, float x2, float y2, Color color) {
    Element* e = arena_new<Element>(a);
    *e = elem_line({x1, y1, x2, y2, color, 2});
    return e;
}

// Allocate a children array
inline LayoutNode** make_children(Arena* a, int count) {
    return (LayoutNode**)arena_alloc(a, sizeof(LayoutNode*) * count, 8);
}

// Allocate elements array
inline Element* make_elements(Arena* a, int count) {
    return arena_array<Element>(a, count);
}
