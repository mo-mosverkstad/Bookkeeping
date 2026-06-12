#pragma once
#include <cstdint>
#include "src/graphics/elements/element.h"

// Forward declarations
struct RenderBackend;

// ── Text measurement ─────────────────────────────────────────────────────────

struct TextMeasure { float width; float height; };
typedef TextMeasure (*TextMeasureFn)(const char* text, uint32_t len, const char* font, float size, uint8_t style);
void set_text_measure_hook(TextMeasureFn fn);
TextMeasure measure_text(const char* text, uint32_t len, const char* font, float size, uint8_t style);

// ── Layout types ─────────────────────────────────────────────────────────────

enum LayoutType : uint8_t {
    LAYOUT_COORDINATE,
    LAYOUT_LINEAR,
    LAYOUT_GRID,
    LAYOUT_SCROLL,
};

enum LinearDirection : uint8_t {
    LINEAR_HORIZONTAL = 0,
    LINEAR_VERTICAL = 1,
};

// ── Hit result ───────────────────────────────────────────────────────────────

struct LayoutNode; // forward

struct HitResult {
    LayoutNode* node;
    float local_x, local_y;
};

// ── LayoutNode ───────────────────────────────────────────────────────────────

struct LayoutNode {
    // Configuration
    LayoutType type = LAYOUT_COORDINATE;
    LinearDirection direction = LINEAR_HORIZONTAL;
    float req_width = 0;
    float req_height = 0;
    float padding = 0;
    float gap = 0;

    // Grid
    uint16_t grid_cols = 0;
    float* col_widths = nullptr;

    // Scroll
    float scroll_x = 0;
    float scroll_y = 0;
    float content_width = 0;
    float content_height = 0;

    // Baseline offset: shifts this node vertically relative to its computed y.
    // Positive = down, negative = up. Used for superscripts/subscripts.
    float y_offset = 0;

    // Computed
    float x = 0, y = 0;
    float width = 0, height = 0;

    // Tree
    LayoutNode** children = nullptr;
    uint16_t child_count = 0;
    Element* elements = nullptr;
    uint16_t element_count = 0;
    const char* id = nullptr;

    // ── Methods ──────────────────────────────────────────────────────────────

    // Compute layout: fills x, y, width, height for this node and all children.
    void compute(float avail_width, float avail_height);

    // Render this node and its children using the given backend.
    void render(RenderBackend* backend, float offset_x = 0, float offset_y = 0);

    // Surface hit test: returns the topmost (last-drawn) node at (x, y).
    HitResult hit_surface(float px, float py, float offset_x = 0, float offset_y = 0);

    // Deep hit test: returns all nodes containing (x, y). Returns count written.
    int hit_deep(float px, float py, HitResult* results, int capacity, float offset_x = 0, float offset_y = 0);
};

// ── Legacy free-function API (backward compat) ───────────────────────────────
void layout_compute(LayoutNode* root, float avail_width, float avail_height);
HitResult hit_test_surface(LayoutNode* root, float x, float y, float offset_x = 0, float offset_y = 0);
int hit_test_deep(LayoutNode* root, float x, float y, HitResult* results, int capacity, float offset_x = 0, float offset_y = 0);
