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
    LAYOUT_SCROLL,     // Scrollable viewport: children positioned relative to content, clipped to viewport
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

    // Scroll-specific
    float scroll_x;     // horizontal scroll offset (content shifts left by this amount)
    float scroll_y;     // vertical scroll offset (content shifts up by this amount)
    float content_width; // computed total content width (for scroll bounds)
    float content_height;// computed total content height (for scroll bounds)

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
    struct Element* elements;
    uint16_t element_count;

    // Optional ID for hit testing identification
    const char* id;
};

// Layout computation — call on root, fills x/y/width/height recursively.
void layout_compute(LayoutNode* root, float avail_width, float avail_height);

// ── Hit testing ──────────────────────────────────────────────────────────────

struct HitResult {
    LayoutNode* node;
    float local_x, local_y; // coordinates relative to the hit node
};

// Surface hit: returns the topmost (last-rendered) node at (x, y), or nullptr.
HitResult hit_test_surface(LayoutNode* root, float x, float y, float offset_x = 0, float offset_y = 0);

// Deep hit: returns all nodes containing (x, y). Caller provides array + capacity.
// Returns number of hits written.
int hit_test_deep(LayoutNode* root, float x, float y, HitResult* results, int capacity, float offset_x = 0, float offset_y = 0);

// ── Text measurement ─────────────────────────────────────────────────────────

// Hook for text measurement. Set a custom implementation for real font metrics.
// Default: mock measurement (char_width = size * 0.6, height = size).
struct TextMeasure {
    float width;
    float height;
};

// Function pointer type for text measurement hook
typedef TextMeasure (*TextMeasureFn)(const char* text, uint32_t len, const char* font, float size, uint8_t style);

// Set custom text measurement function (e.g., backed by stb_truetype/FreeType/SDL2_ttf)
void set_text_measure_hook(TextMeasureFn fn);

// Measure text using the current hook (or default mock)
TextMeasure measure_text(const char* text, uint32_t len, const char* font, float size, uint8_t style);
