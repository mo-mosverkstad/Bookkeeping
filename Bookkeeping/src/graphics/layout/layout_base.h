#pragma once
#include <cstdint>
#include "src/graphics/elements/element.h"

// Forward declarations
struct LayoutNode;

// ── Text measurement hook ────────────────────────────────────────────────────

struct TextMeasure { float width; float height; };
typedef TextMeasure (*TextMeasureFn)(const char* text, uint32_t len, const char* font, float size, uint8_t style);
void set_text_measure_hook(TextMeasureFn fn);
TextMeasure measure_text(const char* text, uint32_t len, const char* font, float size, uint8_t style);

// ── Hit testing ──────────────────────────────────────────────────────────────

struct HitResult {
    LayoutNode* node;
    float local_x, local_y;
};

HitResult hit_test_surface(LayoutNode* root, float x, float y, float offset_x = 0, float offset_y = 0);
int hit_test_deep(LayoutNode* root, float x, float y, HitResult* results, int capacity, float offset_x = 0, float offset_y = 0);
