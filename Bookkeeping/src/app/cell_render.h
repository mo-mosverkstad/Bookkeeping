#pragma once
#include "src/core/arena.h"
#include "src/core/str.h"
#include "src/core/parser/rich/rich_render.h"
#include "src/graphics/ui.h"
#include "src/graphics/node_builder.h"
#include <cstring>

// ══════════════════════════════════════════════════════════════════════════════
// Cell Renderer — dispatches cell rendering based on type_id
// ══════════════════════════════════════════════════════════════════════════════

// Render a cell value as a LayoutNode based on its type.
// Returns nullptr if the value is empty or type is unknown (caller should show raw text).
inline LayoutNode* cell_render(Arena* a, const char* value, uint32_t len, const char* type_id, float font_size, Color color) {
    if (!value || len == 0) return nullptr;

    if (strcmp(type_id, "math") == 0) {
        return math_render(a, value, len, font_size, color);
    }
    if (strcmp(type_id, "chem") == 0) {
        return chem_render(a, value, len, font_size, color);
    }
    if (strcmp(type_id, "phys") == 0 || strcmp(type_id, "physics") == 0) {
        return math_render(a, value, len, font_size, color); // physics delegates to math
    }
    if (strcmp(type_id, "geom") == 0 || strcmp(type_id, "geometry") == 0) {
        return math_render(a, value, len, font_size, color); // geometry delegates to math
    }
    if (strcmp(type_id, "rich") == 0) {
        return rich_render(a, value, len, font_size, color);
    }
    // "text" or unknown — return nullptr (caller renders as plain text)
    return nullptr;
}
