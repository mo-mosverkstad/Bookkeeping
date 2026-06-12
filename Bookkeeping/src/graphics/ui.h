#pragma once
#include "src/core/arena.h"
#include "src/graphics/elements/element.h"
#include "src/graphics/layout/layout.h"

// ══════════════════════════════════════════════════════════════════════════════
// React-like fluent API for building layout trees.
// All methods return *this for chaining. Zero-cost: compiles to field assignment.
// ══════════════════════════════════════════════════════════════════════════════

struct UI {
    LayoutNode node;
    Arena* arena;

    // ── Modifiers (chainable) ────────────────────────────────────────────────
    UI& id(const char* s) { node.id = s; return *this; }
    UI& padding(float p) { node.padding = p; return *this; }
    UI& gap(float g) { node.gap = g; return *this; }
    UI& size(float w, float h) { node.req_width = w; node.req_height = h; return *this; }
    UI& width(float w) { node.req_width = w; return *this; }
    UI& height(float h) { node.req_height = h; return *this; }
    UI& pos(float x, float y) { node.x = x; node.y = y; return *this; }
    UI& scroll(float sx, float sy) { node.scroll_x = sx; node.scroll_y = sy; return *this; }

    // ── Add a single child ───────────────────────────────────────────────────
    UI& child(UI&& c) { return add_child(c); }
    UI& child(UI& c) { return add_child(c); }

private:
    UI& add_child(UI& c) {
        uint16_t n = node.child_count;
        auto** new_kids = (LayoutNode**)arena_alloc(arena, sizeof(LayoutNode*) * (n + 1), 8);
        for (uint16_t i = 0; i < n; i++) new_kids[i] = node.children[i];
        LayoutNode* child_node = arena_new<LayoutNode>(arena);
        *child_node = c.node;
        new_kids[n] = child_node;
        node.children = new_kids;
        node.child_count = n + 1;
        return *this;
    }

public:

    // ── Add multiple children from array ─────────────────────────────────────
    UI& children(UI* items, int count) {
        auto** kids = (LayoutNode**)arena_alloc(arena, sizeof(LayoutNode*) * count, 8);
        for (int i = 0; i < count; i++) {
            LayoutNode* cn = arena_new<LayoutNode>(arena);
            *cn = items[i].node;
            kids[i] = cn;
        }
        node.children = kids;
        node.child_count = count;
        return *this;
    }

    // ── Add element decorations ──────────────────────────────────────────────
    UI& bg(Color fill, Color stroke = COLOR_TRANSPARENT, float sw = 0) {
        Element* e = grow_element();
        *e = elem_rect({0, 0, node.req_width, node.req_height, fill, stroke, sw, 0});
        return *this;
    }

    UI& text(const char* content, float sz = 14, Color color = COLOR_WHITE, uint8_t style = TEXT_NORMAL) {
        Element* e = grow_element();
        *e = elem_text({4, 4, content, "sans", sz, color, style, ALIGN_LEFT, 0});
        return *this;
    }

    UI& ellipse(float rx, float ry, Color fill, Color stroke = COLOR_TRANSPARENT) {
        Element* e = grow_element();
        *e = elem_ellipse({rx, ry, rx, ry, fill, stroke, 1});
        return *this;
    }

    UI& line(float x1, float y1, float x2, float y2, Color color) {
        Element* e = grow_element();
        *e = elem_line({x1, y1, x2, y2, color, 2});
        return *this;
    }

    // ── Internals ────────────────────────────────────────────────────────────
private:
    Element* grow_element() {
        uint16_t n = node.element_count;
        Element* new_elems = (Element*)arena_alloc(arena, sizeof(Element) * (n + 1), 8);
        for (uint16_t i = 0; i < n; i++) new_elems[i] = node.elements[i];
        node.elements = new_elems;
        node.element_count = n + 1;
        return &new_elems[n];
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// Factory functions — like React components
// ══════════════════════════════════════════════════════════════════════════════

// Vertical stack (like <div style="flex-direction: column">)
inline UI VStack(Arena* a, float g = 0) {
    UI ui = {}; ui.arena = a;
    ui.node.type = LAYOUT_LINEAR; ui.node.direction = LINEAR_VERTICAL; ui.node.gap = g;
    return ui;
}

// Horizontal stack (like <div style="flex-direction: row">)
inline UI HStack(Arena* a, float g = 0) {
    UI ui = {}; ui.arena = a;
    ui.node.type = LAYOUT_LINEAR; ui.node.direction = LINEAR_HORIZONTAL; ui.node.gap = g;
    return ui;
}

// Grid layout
inline UI Grid(Arena* a, uint16_t cols, float g = 0) {
    UI ui = {}; ui.arena = a;
    ui.node.type = LAYOUT_GRID; ui.node.grid_cols = cols; ui.node.gap = g;
    return ui;
}

// Scroll container
inline UI Scroll(Arena* a, float w, float h, float g = 0) {
    UI ui = {}; ui.arena = a;
    ui.node.type = LAYOUT_SCROLL; ui.node.req_width = w; ui.node.req_height = h; ui.node.gap = g;
    return ui;
}

// Absolute positioning container
inline UI Absolute(Arena* a) {
    UI ui = {}; ui.arena = a;
    ui.node.type = LAYOUT_COORDINATE;
    return ui;
}

// Leaf box (fixed size, typically with bg/text)
inline UI Box(Arena* a, float w, float h) {
    UI ui = {}; ui.arena = a;
    ui.node.req_width = w; ui.node.req_height = h;
    return ui;
}

// Convenience: colored box
inline UI ColorBox(Arena* a, float w, float h, Color fill, Color stroke = COLOR_TRANSPARENT) {
    return Box(a, w, h).bg(fill, stroke, stroke.a > 0 ? 1.0f : 0.0f);
}

// Convenience: text label
inline UI Label(Arena* a, const char* content, float sz = 14, Color color = COLOR_WHITE) {
    TextMeasure m = measure_text(content, content ? (uint32_t)__builtin_strlen(content) : 0, "sans", sz, TEXT_NORMAL);
    return Box(a, m.width + 8, m.height + 8).text(content, sz, color);
}

// Build: finalize into a LayoutNode* (arena-allocated)
inline LayoutNode* build(UI& ui) {
    LayoutNode* n = arena_new<LayoutNode>(ui.arena);
    *n = ui.node;
    return n;
}
