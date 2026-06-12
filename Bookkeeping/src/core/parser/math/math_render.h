#pragma once
#include "src/core/parser/math/math_ast.h"
#include "src/core/parser/math/math_parser.h"
#include "src/core/arena.h"
#include "src/graphics/ui.h"
#include "src/graphics/node_builder.h"
#include <cstdio>
#include <cstring>

// ══════════════════════════════════════════════════════════════════════════════
// Proper math renderer with:
// - Stacked fractions (numerator / bar / denominator)
// - Superscripts (70% size, shifted up by 40% of parent height)
// - Subscripts (70% size, shifted down by 30% of parent height)
// - √ with overbar
// - Parentheses/braces/set notation
// - Uses math font (DejaVu Math TeX Gyre or STIXGeneral)
// ══════════════════════════════════════════════════════════════════════════════

static const char* MATH_FONT = "math"; // mapped to actual font in SDL backend

struct MathRenderer {
    Arena* arena;
    float size;
    Color color;

    LayoutNode* render(MathNode* node) {
        if (!node) return leaf("", size);
        switch (node->type) {
        case MATH_NUMBER: { char buf[32]; snprintf(buf, 32, "%g", node->number); return leaf(buf, size); }
        case MATH_IDENTIFIER: return leaf(node->ident.name, size, node->ident.style == 1 ? TEXT_ITALIC : TEXT_NORMAL);
        case MATH_TEXT: return leaf(node->text, size, TEXT_NORMAL);
        case MATH_ELLIPSIS: return leaf("...", size);

        case MATH_BINARY: {
            // Inline: left OP right
            Node* row = node_linear_h(arena);
            row->set_gap(3);
            auto kids = make_children(arena, 3);
            kids[0] = render(node->binary.left);
            // For implicit multiply (*), show no operator if left=number, right=ident
            if (strcmp(node->binary.op, "*") == 0) {
                bool implicit = (node->binary.left->type == MATH_NUMBER && node->binary.right->type == MATH_IDENTIFIER)
                    || node->binary.left->type == MATH_IDENTIFIER || node->binary.left->type == MATH_PAREN;
                if (implicit) {
                    auto k2 = make_children(arena, 2);
                    k2[0] = kids[0]; k2[1] = render(node->binary.right);
                    row->set_gap(1).set_children(k2, 2);
                    return row;
                }
            }
            kids[1] = leaf(node->binary.op, size);
            kids[2] = render(node->binary.right);
            row->set_children(kids, 3);
            return row;
        }

        case MATH_UNARY: {
            Node* row = node_linear_h(arena);
            row->set_gap(0);
            auto kids = make_children(arena, 2);
            kids[0] = leaf(node->unary.op, size);
            kids[1] = render(node->unary.operand);
            row->set_children(kids, 2);
            return row;
        }

        case MATH_FRACTION: {
            // Stacked: numerator / bar / denominator
            Node* col = node_linear_v(arena);
            col->set_gap(2);
            LayoutNode* num = render(node->fraction.num);
            LayoutNode* den = render(node->fraction.den);

            // Bar: width will be determined after compute, use a fixed width for now
            Node* bar = node_leaf(arena, 0, 2);
            bar->attach(make_elements(arena, 1), 1);
            bar->elements[0] = elem_rect({0, 0, 200, 1, color, COLOR_TRANSPARENT, 0, 0});
            bar->set_id("frac-bar");

            auto kids = make_children(arena, 3);
            kids[0] = num; kids[1] = bar; kids[2] = den;
            col->set_children(kids, 3);
            col->set_id("fraction");
            return col;
        }

        case MATH_SUPERSCRIPT: {
            // Base + small exponent shifted up
            Node* row = node_linear_h(arena);
            row->set_gap(1);
            float small = size * 0.7f;
            float shift = -(size * 0.4f); // negative = up

            MathRenderer sub_r = {arena, small, color};
            LayoutNode* sup_node = sub_r.render(node->superscript.sup);
            sup_node->y_offset = shift;

            auto kids = make_children(arena, 2);
            kids[0] = render(node->superscript.base);
            kids[1] = sup_node;
            row->set_children(kids, 2);
            return row;
        }

        case MATH_SUBSCRIPT: {
            // Base + small subscript shifted down
            Node* row = node_linear_h(arena);
            row->set_gap(1);
            float small = size * 0.7f;
            float shift = size * 0.3f; // positive = down

            MathRenderer sub_r = {arena, small, color};
            LayoutNode* sub_node = sub_r.render(node->subscript.sub);
            sub_node->y_offset = shift;

            auto kids = make_children(arena, 2);
            kids[0] = render(node->subscript.base);
            kids[1] = sub_node;
            row->set_children(kids, 2);
            return row;
        }

        case MATH_SQRT: {
            // √ symbol + overlined body
            Node* row = node_linear_h(arena);
            row->set_gap(1);
            auto kids = make_children(arena, 2);
            kids[0] = leaf("\xE2\x88\x9A", size); // √ in UTF-8
            // Body with top border (overline effect via rect element on top)
            LayoutNode* body = render(node->sqrt.body);
            Node* wrapper = node_coord(arena);
            wrapper->set_id("sqrt-body");
            // Add overline element
            wrapper->attach(make_elements(arena, 1), 1);
            wrapper->elements[0] = elem_rect({0, 0, 100, 1, color, COLOR_TRANSPARENT, 0, 0});
            auto wkids = make_children(arena, 1);
            wkids[0] = body;
            body->y_offset = 3; // shift body down to make room for overline
            wrapper->set_children(wkids, 1);
            kids[1] = wrapper;
            row->set_children(kids, 2);
            return row;
        }

        case MATH_PAREN: {
            Node* row = node_linear_h(arena);
            row->set_gap(1);
            auto kids = make_children(arena, 3);
            kids[0] = leaf("(", size);
            kids[1] = render(node->paren_expr);
            kids[2] = leaf(")", size);
            row->set_children(kids, 3);
            return row;
        }

        case MATH_SET: {
            Node* row = node_linear_h(arena);
            row->set_gap(2);
            uint16_t n = node->set.count;
            uint16_t total = 2 + (n > 0 ? n * 2 - 1 : 0);
            auto kids = make_children(arena, total);
            uint16_t k = 0;
            kids[k++] = leaf("{", size);
            for (uint16_t i = 0; i < n; i++) {
                if (i > 0) kids[k++] = leaf(",", size);
                kids[k++] = render(node->set.elements[i]);
            }
            kids[k++] = leaf("}", size);
            row->set_children(kids, k);
            return row;
        }

        case MATH_CALL: {
            Node* row = node_linear_h(arena);
            row->set_gap(1);
            uint16_t n = node->call.arg_count;
            uint16_t total = 1 + 1 + (n > 0 ? n*2-1 : 0) + 1;
            auto kids = make_children(arena, total);
            uint16_t k = 0;
            kids[k++] = render(node->call.callee);
            kids[k++] = leaf("(", size);
            for (uint16_t i = 0; i < n; i++) {
                if (i > 0) kids[k++] = leaf(",", size);
                kids[k++] = render(node->call.args[i]);
            }
            kids[k++] = leaf(")", size);
            row->set_children(kids, k);
            return row;
        }

        case MATH_MATRIX: return leaf("[matrix]", size);
        }
        return leaf("?", size);
    }

private:
    LayoutNode* leaf(const char* text, float sz, uint8_t style = TEXT_ITALIC) {
        const char* s = arena_str(arena, text, strlen(text)).data;
        TextMeasure m = measure_text(s, strlen(s), MATH_FONT, sz, style);
        Node* n = node_leaf(arena, m.width + 2, m.height);
        n->attach(make_elements(arena, 1), 1);
        n->elements[0] = elem_text({0, 0, s, MATH_FONT, sz, color, style, ALIGN_LEFT, 0});
        return n;
    }
};

// Convenience: parse + render
inline LayoutNode* math_render(Arena* a, const char* expr, uint32_t len, float font_size = 16, Color color = COLOR_WHITE) {
    MathNode* ast = math_parse(a, expr, len);
    MathRenderer r = {a, font_size, color};
    return r.render(ast);
}
