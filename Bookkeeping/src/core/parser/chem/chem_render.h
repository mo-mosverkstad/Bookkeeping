#pragma once
#include "src/core/arena.h"
#include "src/core/str.h"
#include "src/graphics/ui.h"
#include "src/graphics/node_builder.h"
#include <cstring>
#include <cstdio>

// Chemistry renderer: produces a single readable text label.
// Subscripts shown inline (H2O stays as "H2O" — readable without special layout).
// Reaction arrows rendered as "->".
inline LayoutNode* chem_render(Arena* a, const char* text, uint32_t len, float font_size = 14, Color color = COLOR_WHITE) {
    // Chemistry formulas are already human-readable as-is.
    // Just render the text directly.
    const char* str = arena_str(a, text, len).data;
    TextMeasure m = measure_text(str, len, "serif", font_size, TEXT_NORMAL);
    Node* n = node_leaf(a, m.width + 4, m.height + 2);
    n->attach(make_elements(a, 1), 1);
    n->elements[0] = elem_text({0, 0, str, "serif", font_size, color, TEXT_NORMAL, ALIGN_LEFT, 0});
    n->set_id("chem");
    return n;
}
