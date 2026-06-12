#pragma once
#include "src/core/arena.h"
#include "src/core/parser/math/math_parser.h"
#include "src/core/parser/math/math_render.h"

// Physics renderer: wraps math rendering with unit awareness.
// Supports expressions like "F = m*a", "v = 3.0 m/s", "E = 1/2 m v^2"
// Renders using the math renderer (physics IS math with units).
inline LayoutNode* physics_render(Arena* a, const char* text, uint32_t len, float font_size = 14, Color color = COLOR_WHITE) {
    return math_render(a, text, len, font_size, color);
}
