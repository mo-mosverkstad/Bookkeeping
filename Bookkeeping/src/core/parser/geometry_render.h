#pragma once
#include "src/core/arena.h"
#include "src/core/parser/math/math_parser.h"
#include "src/core/parser/math/math_render.h"

// Geometry renderer: wraps math rendering with geometry symbol awareness.
// Supports expressions like "AB = 5", "angle ABC = 90", "triangle ABC"
// Renders using the math renderer (geometry uses the same notation).
inline LayoutNode* geometry_render(Arena* a, const char* text, uint32_t len, float font_size = 14, Color color = COLOR_WHITE) {
    return math_render(a, text, len, font_size, color);
}
