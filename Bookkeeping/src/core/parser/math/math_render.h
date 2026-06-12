#pragma once
#include "src/core/parser/math/math_ast.h"
#include "src/core/arena.h"
#include "src/graphics/ui.h"
#include "src/graphics/node_builder.h"
#include <cstdio>

// Render a MathNode AST into a LayoutNode tree for display.
// Uses HStack for horizontal flow, subscript/superscript offsets, fraction stacking.

struct MathRenderer {
    Arena* arena;
    float font_size;
    Color color;

    LayoutNode* render(MathNode* node) {
        if (!node) return node_leaf(arena, 0, 0);
        switch (node->type) {
        case MATH_NUMBER: {
            char buf[32]; snprintf(buf, 32, "%g", node->number);
            return make_label(buf, font_size);
        }
        case MATH_IDENTIFIER:
            return make_label(node->ident.name, font_size, node->ident.style == 1 ? TEXT_ITALIC : TEXT_NORMAL);
        case MATH_TEXT:
            return make_label(node->text, font_size, TEXT_NORMAL);
        case MATH_ELLIPSIS:
            return make_label("...", font_size);
        case MATH_BINARY: {
            Node* row = node_linear_h(arena);
            row->set_gap(3);
            auto kids = make_children(arena, 3);
            kids[0] = render(node->binary.left);
            kids[1] = make_label(node->binary.op, font_size);
            kids[2] = render(node->binary.right);
            row->set_children(kids, 3);
            return row;
        }
        case MATH_UNARY: {
            Node* row = node_linear_h(arena);
            row->set_gap(0);
            auto kids = make_children(arena, 2);
            kids[0] = make_label(node->unary.op, font_size);
            kids[1] = render(node->unary.operand);
            row->set_children(kids, 2);
            return row;
        }
        case MATH_FRACTION: {
            Node* col = node_linear_v(arena);
            col->set_gap(1);
            auto kids = make_children(arena, 3);
            kids[0] = render(node->fraction.num);
            // Fraction bar
            Node* bar = node_leaf(arena, 0, 2);
            bar->attach(make_elements(arena, 1), 1);
            bar->elements[0] = elem_rect({0, 0, 60, 1, color, COLOR_TRANSPARENT, 0, 0});
            kids[1] = bar;
            kids[2] = render(node->fraction.den);
            col->set_children(kids, 3);
            return col;
        }
        case MATH_SUPERSCRIPT: {
            Node* row = node_linear_h(arena);
            row->set_gap(1);
            float small = font_size * 0.7f;
            MathRenderer sub_r = {arena, small, color};
            auto kids = make_children(arena, 2);
            kids[0] = render(node->superscript.base);
            kids[1] = sub_r.render(node->superscript.sup);
            row->set_children(kids, 2);
            return row;
        }
        case MATH_SUBSCRIPT: {
            Node* row = node_linear_h(arena);
            row->set_gap(1);
            float small = font_size * 0.7f;
            MathRenderer sub_r = {arena, small, color};
            auto kids = make_children(arena, 2);
            kids[0] = render(node->subscript.base);
            kids[1] = sub_r.render(node->subscript.sub);
            row->set_children(kids, 2);
            return row;
        }
        case MATH_SQRT: {
            Node* row = node_linear_h(arena);
            row->set_gap(2);
            auto kids = make_children(arena, 2);
            kids[0] = make_label("\xE2\x88\x9A", font_size); // √ UTF-8
            kids[1] = render(node->sqrt.body);
            row->set_children(kids, 2);
            return row;
        }
        case MATH_CALL: {
            Node* row = node_linear_h(arena);
            row->set_gap(0);
            uint16_t n = node->call.arg_count;
            uint16_t total = 1 + 1 + (n > 0 ? n * 2 - 1 : 0) + 1; // callee ( arg,arg... )
            auto kids = make_children(arena, total);
            uint16_t k = 0;
            kids[k++] = render(node->call.callee);
            kids[k++] = make_label("(", font_size);
            for (uint16_t i = 0; i < n; i++) {
                if (i > 0) kids[k++] = make_label(",", font_size);
                kids[k++] = render(node->call.args[i]);
            }
            kids[k++] = make_label(")", font_size);
            row->set_children(kids, k);
            return row;
        }
        case MATH_PAREN: {
            Node* row = node_linear_h(arena);
            row->set_gap(0);
            auto kids = make_children(arena, 3);
            kids[0] = make_label("(", font_size);
            kids[1] = render(node->paren_expr);
            kids[2] = make_label(")", font_size);
            row->set_children(kids, 3);
            return row;
        }
        case MATH_SET: {
            Node* row = node_linear_h(arena);
            row->set_gap(1);
            uint16_t n = node->set.count;
            uint16_t total = 2 + (n > 0 ? n * 2 - 1 : 0);
            auto kids = make_children(arena, total);
            uint16_t k = 0;
            kids[k++] = make_label("{", font_size);
            for (uint16_t i = 0; i < n; i++) {
                if (i > 0) kids[k++] = make_label(",", font_size);
                kids[k++] = render(node->set.elements[i]);
            }
            kids[k++] = make_label("}", font_size);
            row->set_children(kids, k);
            return row;
        }
        case MATH_MATRIX:
            return make_label("[matrix]", font_size);
        }
        return node_leaf(arena, 0, 0);
    }

private:
    LayoutNode* make_label(const char* text, float sz, uint8_t style = TEXT_NORMAL) {
        TextMeasure m = measure_text(text, text ? (uint32_t)strlen(text) : 0, "serif", sz, style);
        Node* n = node_leaf(arena, m.width + 2, m.height);
        n->attach(make_elements(arena, 1), 1);
        n->elements[0] = elem_text({0, 0, text, "serif", sz, color, style, ALIGN_LEFT, 0});
        return n;
    }
};

// Convenience: parse + render in one call
inline LayoutNode* math_render(Arena* a, const char* expr, uint32_t len, float font_size = 16, Color color = COLOR_WHITE) {
    MathNode* ast = math_parse(a, expr, len);
    MathRenderer r = {a, font_size, color};
    return r.render(ast);
}
