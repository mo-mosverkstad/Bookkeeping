#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/parser/math/math_ast.h"
#include "src/core/parser/math/math_parser.h"
#include "src/core/parser/math/math_render.h"
#include "src/graphics/backend/software_backend.h"
#include <cstring>

// ═══════════════════════════════════════════════════════════════════════════════
// PARSER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(math_parse_number) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "42", 2);
    ASSERT_EQ(n->type, MATH_NUMBER);
    ASSERT_NEAR(n->number, 42.0f, 0.01f);
    arena_destroy(&a);
}

TEST(math_parse_float) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "3.14", 4);
    ASSERT_EQ(n->type, MATH_NUMBER);
    ASSERT_NEAR(n->number, 3.14f, 0.01f);
    arena_destroy(&a);
}

TEST(math_parse_identifier) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "x", 1);
    ASSERT_EQ(n->type, MATH_IDENTIFIER);
    ASSERT_TRUE(strcmp(n->ident.name, "x") == 0);
    arena_destroy(&a);
}

TEST(math_parse_addition) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "x+y", 3);
    ASSERT_EQ(n->type, MATH_BINARY);
    ASSERT_TRUE(strcmp(n->binary.op, "+") == 0);
    ASSERT_EQ(n->binary.left->type, MATH_IDENTIFIER);
    ASSERT_EQ(n->binary.right->type, MATH_IDENTIFIER);
    arena_destroy(&a);
}

TEST(math_parse_subtraction) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "a-b", 3);
    ASSERT_EQ(n->type, MATH_BINARY);
    ASSERT_TRUE(strcmp(n->binary.op, "-") == 0);
    arena_destroy(&a);
}

TEST(math_parse_multiplication) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "a*b", 3);
    ASSERT_EQ(n->type, MATH_BINARY);
    ASSERT_TRUE(strcmp(n->binary.op, "*") == 0);
    arena_destroy(&a);
}

TEST(math_parse_fraction) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "a/b", 3);
    ASSERT_EQ(n->type, MATH_FRACTION);
    ASSERT_EQ(n->fraction.num->type, MATH_IDENTIFIER);
    ASSERT_EQ(n->fraction.den->type, MATH_IDENTIFIER);
    arena_destroy(&a);
}

TEST(math_parse_power) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "x^2", 3);
    ASSERT_EQ(n->type, MATH_SUPERSCRIPT);
    ASSERT_EQ(n->superscript.base->type, MATH_IDENTIFIER);
    ASSERT_EQ(n->superscript.sup->type, MATH_NUMBER);
    arena_destroy(&a);
}

TEST(math_parse_subscript) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "x_0", 3);
    ASSERT_EQ(n->type, MATH_SUBSCRIPT);
    ASSERT_EQ(n->subscript.base->type, MATH_IDENTIFIER);
    ASSERT_EQ(n->subscript.sub->type, MATH_NUMBER);
    arena_destroy(&a);
}

TEST(math_parse_unary_minus) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "-x", 2);
    ASSERT_EQ(n->type, MATH_UNARY);
    ASSERT_TRUE(strcmp(n->unary.op, "-") == 0);
    ASSERT_EQ(n->unary.operand->type, MATH_IDENTIFIER);
    arena_destroy(&a);
}

TEST(math_parse_parens) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "(x+y)", 5);
    ASSERT_EQ(n->type, MATH_PAREN);
    ASSERT_EQ(n->paren_expr->type, MATH_BINARY);
    arena_destroy(&a);
}

TEST(math_parse_equality) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "x=5", 3);
    ASSERT_EQ(n->type, MATH_BINARY);
    ASSERT_TRUE(strcmp(n->binary.op, "=") == 0);
    arena_destroy(&a);
}

TEST(math_parse_inequality) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "a!=b", 4);
    ASSERT_EQ(n->type, MATH_BINARY);
    ASSERT_TRUE(strcmp(n->binary.op, "!=") == 0);
    arena_destroy(&a);
}

TEST(math_parse_implicit_mult) {
    Arena a = arena_create(4096);
    const char* s = "2x";
    MathNode* n = math_parse(&a, s, 2);
    ASSERT_EQ(n->type, MATH_BINARY);
    ASSERT_TRUE(strcmp(n->binary.op, "*") == 0);
    ASSERT_EQ(n->binary.left->type, MATH_NUMBER);
    ASSERT_EQ(n->binary.right->type, MATH_IDENTIFIER);
    arena_destroy(&a);
}

TEST(math_parse_comma_sep) {
    Arena a = arena_create(4096);
    const char* s = "a, b, c";
    MathNode* n = math_parse(&a, s, strlen(s));
    ASSERT_EQ(n->type, MATH_BINARY);
    ASSERT_TRUE(strcmp(n->binary.op, ",") == 0);
    arena_destroy(&a);
}

TEST(math_parse_set) {
    Arena a = arena_create(4096);
    const char* s = "{1, 2, 3}";
    MathNode* n = math_parse(&a, s, strlen(s));
    ASSERT_EQ(n->type, MATH_SET);
    ASSERT_EQ(n->set.count, (uint16_t)3);
    arena_destroy(&a);
}

TEST(math_parse_text_literal) {
    Arena a = arena_create(4096);
    const char* s = "\"MTBF\"";
    MathNode* n = math_parse(&a, s, strlen(s));
    ASSERT_EQ(n->type, MATH_TEXT);
    ASSERT_TRUE(strcmp(n->text, "MTBF") == 0);
    arena_destroy(&a);
}

TEST(math_parse_sqrt) {
    Arena a = arena_create(4096);
    const char* s = "\\sqrt{x+1}";
    MathNode* n = math_parse(&a, s, strlen(s));
    ASSERT_EQ(n->type, MATH_SQRT);
    ASSERT_EQ(n->sqrt.body->type, MATH_BINARY);
    arena_destroy(&a);
}

TEST(math_parse_complex_expr) {
    Arena a = arena_create(8192);
    const char* s = "x^2 + 2x + 1 = 0";
    MathNode* n = math_parse(&a, s, strlen(s));
    ASSERT_EQ(n->type, MATH_BINARY); // =
    ASSERT_TRUE(strcmp(n->binary.op, "=") == 0);
    arena_destroy(&a);
}

TEST(math_parse_precedence) {
    Arena a = arena_create(4096);
    // a + b * c → a + (b*c)
    const char* s = "a+b*c";
    MathNode* n = math_parse(&a, s, strlen(s));
    ASSERT_EQ(n->type, MATH_BINARY);
    ASSERT_TRUE(strcmp(n->binary.op, "+") == 0);
    ASSERT_EQ(n->binary.right->type, MATH_BINARY);
    ASSERT_TRUE(strcmp(n->binary.right->binary.op, "*") == 0);
    arena_destroy(&a);
}

TEST(math_parse_ellipsis) {
    Arena a = arena_create(4096);
    MathNode* n = math_parse(&a, "...", 3);
    ASSERT_EQ(n->type, MATH_ELLIPSIS);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(math_render_number) {
    Arena a = arena_create(8192);
    LayoutNode* tree = math_render(&a, "42", 2);
    ASSERT_TRUE(tree != nullptr);
    ASSERT_TRUE(tree->element_count > 0);
    ASSERT_EQ(tree->elements[0].type, ELEM_TEXT);
    arena_destroy(&a);
}

TEST(math_render_addition) {
    Arena a = arena_create(8192);
    LayoutNode* tree = math_render(&a, "x+y", 3);
    ASSERT_TRUE(tree != nullptr);
    ASSERT_EQ(tree->type, LAYOUT_LINEAR);
    ASSERT_EQ(tree->child_count, (uint16_t)3); // left, op, right
    arena_destroy(&a);
}

TEST(math_render_fraction) {
    Arena a = arena_create(8192);
    LayoutNode* tree = math_render(&a, "a/b", 3);
    ASSERT_TRUE(tree != nullptr);
    ASSERT_EQ(tree->type, LAYOUT_LINEAR);
    ASSERT_EQ(tree->direction, LINEAR_VERTICAL); // stacked num/bar/den
    ASSERT_EQ(tree->child_count, (uint16_t)3);
    arena_destroy(&a);
}

TEST(math_render_superscript) {
    Arena a = arena_create(8192);
    LayoutNode* tree = math_render(&a, "x^2", 3);
    ASSERT_TRUE(tree != nullptr);
    ASSERT_EQ(tree->type, LAYOUT_LINEAR); // HStack of base + sup
    ASSERT_EQ(tree->child_count, (uint16_t)2);
    arena_destroy(&a);
}

TEST(math_render_sqrt) {
    Arena a = arena_create(8192);
    const char* s = "\\sqrt{9}";
    LayoutNode* tree = math_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    ASSERT_EQ(tree->child_count, (uint16_t)2); // √ + body
    arena_destroy(&a);
}

TEST(math_render_set) {
    Arena a = arena_create(8192);
    const char* s = "{a, b}";
    LayoutNode* tree = math_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    // { + a + , + b + } = 5 children
    ASSERT_EQ(tree->child_count, (uint16_t)5);
    arena_destroy(&a);
}

TEST(math_render_complex) {
    Arena a = arena_create(16384);
    const char* s = "x^2 + 2x + 1 = 0";
    LayoutNode* tree = math_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    tree->compute(400, 50);
    ASSERT_TRUE(tree->width > 0);
    arena_destroy(&a);
}

TEST(math_render_to_pixels) {
    Arena a = arena_create(16384);
    LayoutNode* tree = math_render(&a, "x+1", 3);
    tree->compute(200, 50);
    SoftwareBackend sw(200, 50);
    sw.begin_frame(200, 50);
    tree->render(&sw);
    sw.end_frame();
    // Should not crash; text renders as placeholder rects
    ASSERT_TRUE(true);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARK
// ═══════════════════════════════════════════════════════════════════════════════

TEST(bench_math_parse_1000) {
    Arena a = arena_create(512 * 1024);
    const char* expr = "x^2 + 2x*y - z/w + \\sqrt{a+b}";
    uint32_t len = strlen(expr);
    BENCH("math_parse 1000x", 1000) {
        arena_reset(&a);
        for (int i = 0; i < 100; i++)
            math_parse(&a, expr, len);
    } BENCH_END("math_parse 1000x", 1000)
    arena_destroy(&a);
    ASSERT_TRUE(true);
}

// ═══════════════════════════════════════════════════════════════════════════════

int main() {
    return run_all_tests();
}
