#pragma once
#include "src/core/arena.h"
#include "src/core/str.h"
#include "src/graphics/ui.h"
#include "src/graphics/node_builder.h"
#include <cstring>
#include <cstdio>

// Chemistry renderer: parses chemical formulas and reaction equations.
// Supports: elements (H, He), subscripts (H2O), superscripts (charge: Na+),
// reaction arrows (->), coefficients (2H2 + O2 -> 2H2O).
// Renders inline using HStack with subscript/superscript sizing.

inline LayoutNode* chem_render(Arena* a, const char* text, uint32_t len, float font_size = 14, Color color = COLOR_WHITE) {
    Node* row = node_linear_h(a);
    row->set_gap(2).set_id("chem");

    uint32_t pos = 0;
    uint16_t child_count = 0;
    LayoutNode* kids[128];

    auto add_label = [&](const char* s, float sz, uint8_t style = TEXT_NORMAL) {
        TextMeasure m = measure_text(s, (uint32_t)strlen(s), "serif", sz, style);
        Node* n = node_leaf(a, m.width + 1, m.height);
        n->attach(make_elements(a, 1), 1);
        n->elements[0] = elem_text({0, 0, s, "serif", sz, color, style, ALIGN_LEFT, 0});
        if (child_count < 128) kids[child_count++] = n;
    };

    while (pos < len) {
        // Skip spaces
        while (pos < len && text[pos] == ' ') pos++;
        if (pos >= len) break;

        // Reaction arrow ->
        if (pos + 1 < len && text[pos] == '-' && text[pos+1] == '>') {
            add_label("\xE2\x86\x92", font_size); // →
            pos += 2;
        }
        // Plus sign
        else if (text[pos] == '+') {
            add_label("+", font_size);
            pos++;
        }
        // Number (coefficient)
        else if (text[pos] >= '0' && text[pos] <= '9' && (pos == 0 || text[pos-1] == ' ' || text[pos-1] == '+')) {
            uint32_t start = pos;
            while (pos < len && text[pos] >= '0' && text[pos] <= '9') pos++;
            char buf[8]; uint32_t l = pos - start; if (l > 7) l = 7;
            memcpy(buf, text + start, l); buf[l] = 0;
            add_label(arena_str(a, buf, l).data, font_size);
        }
        // Element (uppercase + optional lowercase) + optional subscript number + optional charge
        else if (text[pos] >= 'A' && text[pos] <= 'Z') {
            uint32_t start = pos; pos++;
            while (pos < len && text[pos] >= 'a' && text[pos] <= 'z') pos++;
            char elem[4]; uint32_t el = pos - start; if (el > 3) el = 3;
            memcpy(elem, text + start, el); elem[el] = 0;
            add_label(arena_str(a, elem, el).data, font_size);

            // Subscript number
            if (pos < len && text[pos] >= '0' && text[pos] <= '9') {
                uint32_t ns = pos;
                while (pos < len && text[pos] >= '0' && text[pos] <= '9') pos++;
                char sub[8]; uint32_t sl = pos - ns; if (sl > 7) sl = 7;
                memcpy(sub, text + ns, sl); sub[sl] = 0;
                add_label(arena_str(a, sub, sl).data, font_size * 0.7f);
            }
            // Superscript charge (+/-)
            if (pos < len && (text[pos] == '+' || text[pos] == '-') &&
                (pos+1 >= len || text[pos+1] == ' ' || text[pos+1] == '+')) {
                char ch[2] = {text[pos], 0}; pos++;
                add_label(arena_str(a, ch, 1).data, font_size * 0.7f);
            }
        }
        // Parentheses
        else if (text[pos] == '(' || text[pos] == ')') {
            char p[2] = {text[pos], 0}; pos++;
            add_label(p, font_size);
            // subscript after )
            if (text[pos-1] == ')' && pos < len && text[pos] >= '0' && text[pos] <= '9') {
                uint32_t ns = pos;
                while (pos < len && text[pos] >= '0' && text[pos] <= '9') pos++;
                char sub[8]; uint32_t sl = pos - ns; if (sl > 7) sl = 7;
                memcpy(sub, text + ns, sl); sub[sl] = 0;
                add_label(arena_str(a, sub, sl).data, font_size * 0.7f);
            }
        }
        else { pos++; } // skip unknown
    }

    auto* ch = (LayoutNode**)arena_alloc(a, sizeof(LayoutNode*) * child_count, 8);
    memcpy(ch, kids, sizeof(LayoutNode*) * child_count);
    row->set_children(ch, child_count);
    return row;
}
