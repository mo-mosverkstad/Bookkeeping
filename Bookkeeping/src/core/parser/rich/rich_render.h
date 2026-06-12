#pragma once
#include "src/core/arena.h"
#include "src/core/parser/math/math_render.h"
#include "src/core/parser/chem/chem_render.h"
#include "src/core/parser/physics_render.h"
#include "src/core/parser/geometry_render.h"
#include "src/graphics/ui.h"
#include <cstring>

// Rich text parser: renders plain text with embedded $math{...}, $chem{...},
// $phys{...}, $geom{...} blocks. Newlines in text produce line breaks.
// Newlines inside $tag{...} produce separate rendered expressions stacked vertically.

inline LayoutNode* rich_render(Arena* a, const char* text, uint32_t len, float font_size = 14, Color color = COLOR_WHITE) {
    Node* col = node_linear_v(a);
    col->set_gap(2).set_id("rich");

    LayoutNode* lines[256];
    uint16_t line_count = 0;
    Node* cur_line = node_linear_h(a);
    cur_line->set_gap(2);
    LayoutNode* cur_kids[128];
    uint16_t cur_kid_count = 0;

    auto flush_line = [&]() {
        auto* ch = (LayoutNode**)arena_alloc(a, sizeof(LayoutNode*) * cur_kid_count, 8);
        memcpy(ch, cur_kids, sizeof(LayoutNode*) * cur_kid_count);
        cur_line->set_children(ch, cur_kid_count);
        if (line_count < 256) lines[line_count++] = cur_line;
        cur_line = node_linear_h(a);
        cur_line->set_gap(2);
        cur_kid_count = 0;
    };

    auto add_text = [&](const char* s, uint32_t l) {
        if (l == 0) return;
        TextMeasure m = measure_text(s, l, "sans", font_size, TEXT_NORMAL);
        Node* n = node_leaf(a, m.width + 1, m.height);
        n->attach(make_elements(a, 1), 1);
        n->elements[0] = elem_text({0, 0, arena_str(a, s, l).data, "sans", font_size, color, TEXT_NORMAL, ALIGN_LEFT, 0});
        if (cur_kid_count < 128) cur_kids[cur_kid_count++] = n;
    };

    uint32_t pos = 0;
    while (pos < len) {
        // Check for $tag{ embedding
        if (pos + 5 < len && text[pos] == '$') {
            const char* tags[] = {"math", "chem", "phys", "geom"};
            int tag_idx = -1;
            for (int t = 0; t < 4; t++) {
                uint32_t tl = strlen(tags[t]);
                if (pos + 1 + tl + 1 <= len && memcmp(text + pos + 1, tags[t], tl) == 0 && text[pos + 1 + tl] == '{') {
                    tag_idx = t;
                    break;
                }
            }
            if (tag_idx >= 0) {
                uint32_t tl = strlen(tags[tag_idx]);
                uint32_t brace_start = pos + 1 + tl + 1;
                // Find matching }
                int depth = 1; uint32_t bp = brace_start;
                while (bp < len && depth > 0) {
                    if (text[bp] == '{') depth++;
                    else if (text[bp] == '}') depth--;
                    if (depth > 0) bp++;
                }
                if (depth == 0) {
                    uint32_t content_len = bp - brace_start;
                    const char* content = text + brace_start;

                    // Split content on newlines, render each line
                    uint32_t lp = 0;
                    while (lp < content_len) {
                        uint32_t ls = lp;
                        while (lp < content_len && content[lp] != '\n') lp++;
                        uint32_t ll = lp - ls;
                        if (lp < content_len) lp++; // skip \n

                        if (ll == 0) continue;
                        const char* line_str = arena_str(a, content + ls, ll).data;
                        LayoutNode* rendered = nullptr;
                        switch (tag_idx) {
                            case 0: rendered = math_render(a, line_str, ll, font_size, color); break;
                            case 1: rendered = chem_render(a, line_str, ll, font_size, color); break;
                            case 2: rendered = physics_render(a, line_str, ll, font_size, color); break;
                            case 3: rendered = geometry_render(a, line_str, ll, font_size, color); break;
                        }
                        if (rendered && cur_kid_count < 128) cur_kids[cur_kid_count++] = rendered;
                        if (lp < content_len && ll > 0) flush_line(); // newline inside block
                    }
                    pos = bp + 1;
                    continue;
                }
            }
        }

        // Newline in plain text
        if (text[pos] == '\n') {
            flush_line();
            pos++;
            continue;
        }

        // Plain text segment
        uint32_t start = pos;
        while (pos < len && text[pos] != '\n' && text[pos] != '$') pos++;
        if (pos > start) add_text(text + start, pos - start);
    }

    // Flush last line
    if (cur_kid_count > 0) flush_line();

    auto* ch = (LayoutNode**)arena_alloc(a, sizeof(LayoutNode*) * line_count, 8);
    memcpy(ch, lines, sizeof(LayoutNode*) * line_count);
    col->set_children(ch, line_count);
    return col;
}
