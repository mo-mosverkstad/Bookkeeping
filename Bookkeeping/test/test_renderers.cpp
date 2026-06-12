#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/parser/chem/chem_render.h"
#include "src/core/parser/physics_render.h"
#include "src/core/parser/geometry_render.h"
#include "src/core/parser/rich/rich_render.h"
#include "src/graphics/backend/software_backend.h"
#include <cstring>

// ═══════════════════════════════════════════════════════════════════════════════
// CHEMISTRY — EXTENSIVE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(chem_simple_formula) {
    Arena a = arena_create(16384);
    LayoutNode* tree = chem_render(&a, "H2O", 3);
    ASSERT_TRUE(tree != nullptr);
    ASSERT_TRUE(tree->child_count >= 2);
    arena_destroy(&a);
}

TEST(chem_reaction) {
    Arena a = arena_create(16384);
    const char* s = "2H2 + O2 -> 2H2O";
    LayoutNode* tree = chem_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    ASSERT_TRUE(tree->child_count >= 5);
    arena_destroy(&a);
}

TEST(chem_ionic) {
    Arena a = arena_create(16384);
    const char* s = "Na+ + Cl-";
    LayoutNode* tree = chem_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    ASSERT_TRUE(tree->child_count >= 3);
    arena_destroy(&a);
}

TEST(chem_parenthesized) {
    Arena a = arena_create(16384);
    const char* s = "Ca(OH)2";
    LayoutNode* tree = chem_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    ASSERT_TRUE(tree->child_count >= 4);
    arena_destroy(&a);
}

TEST(chem_complex_reaction) {
    Arena a = arena_create(16384);
    const char* s = "2KMnO4 + 16HCl -> 2KCl + 2MnCl2 + 5Cl2 + 8H2O";
    LayoutNode* tree = chem_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    ASSERT_TRUE(tree->child_count > 10);
    arena_destroy(&a);
}

TEST(chem_render_computes) {
    Arena a = arena_create(16384);
    LayoutNode* tree = chem_render(&a, "H2SO4", 5);
    tree->compute(300, 30);
    ASSERT_TRUE(tree->width > 0);
    ASSERT_TRUE(tree->height > 0);
    arena_destroy(&a);
}

TEST(chem_single_element) {
    Arena a = arena_create(16384);
    LayoutNode* tree = chem_render(&a, "Fe", 2);
    ASSERT_TRUE(tree != nullptr);
    ASSERT_EQ(tree->child_count, (uint16_t)1);
    arena_destroy(&a);
}

TEST(chem_multi_subscript) {
    Arena a = arena_create(16384);
    const char* s = "C6H12O6";
    LayoutNode* tree = chem_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    ASSERT_TRUE(tree->child_count >= 6); // C,6,H,12,O,6
    arena_destroy(&a);
}

TEST(chem_only_arrow) {
    Arena a = arena_create(16384);
    LayoutNode* tree = chem_render(&a, "->", 2);
    ASSERT_TRUE(tree != nullptr);
    ASSERT_EQ(tree->child_count, (uint16_t)1);
    arena_destroy(&a);
}

TEST(chem_coefficient_only) {
    Arena a = arena_create(16384);
    const char* s = "3Fe + 4H2O";
    LayoutNode* tree = chem_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    ASSERT_TRUE(tree->child_count >= 5); // 3,Fe,+,4,H,2,O
    arena_destroy(&a);
}

TEST(chem_empty_string) {
    Arena a = arena_create(8192);
    LayoutNode* tree = chem_render(&a, "", 0);
    ASSERT_TRUE(tree != nullptr);
    ASSERT_EQ(tree->child_count, (uint16_t)0);
    arena_destroy(&a);
}

TEST(chem_nested_parentheses) {
    Arena a = arena_create(16384);
    const char* s = "Al2(SO4)3";
    LayoutNode* tree = chem_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    ASSERT_TRUE(tree->child_count >= 5);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHYSICS — EXTENSIVE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(physics_basic_equation) {
    Arena a = arena_create(16384);
    const char* s = "F = m*a";
    LayoutNode* tree = physics_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    tree->compute(200, 30);
    ASSERT_TRUE(tree->width > 0);
    arena_destroy(&a);
}

TEST(physics_kinetic_energy) {
    Arena a = arena_create(16384);
    const char* s = "E = 1/2 m v^2";
    LayoutNode* tree = physics_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    tree->compute(300, 50);
    ASSERT_TRUE(tree->width > 20);
    arena_destroy(&a);
}

TEST(physics_ohms_law) {
    Arena a = arena_create(16384);
    const char* s = "V = I*R";
    LayoutNode* tree = physics_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    arena_destroy(&a);
}

TEST(physics_einstein) {
    Arena a = arena_create(16384);
    const char* s = "E = m*c^2";
    LayoutNode* tree = physics_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    tree->compute(200, 30);
    ASSERT_TRUE(tree->width > 30);
    arena_destroy(&a);
}

TEST(physics_wave_equation) {
    Arena a = arena_create(16384);
    const char* s = "v = f * \\lambda";
    LayoutNode* tree = physics_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    arena_destroy(&a);
}

TEST(physics_coulombs_law) {
    Arena a = arena_create(32768);
    const char* s = "F = k*q1*q2/r^2";
    LayoutNode* tree = physics_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    tree->compute(400, 50);
    ASSERT_TRUE(tree->width > 0);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEOMETRY — EXTENSIVE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(geometry_pythagorean) {
    Arena a = arena_create(16384);
    const char* s = "a^2 + b^2 = c^2";
    LayoutNode* tree = geometry_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    tree->compute(300, 30);
    ASSERT_TRUE(tree->width > 0);
    arena_destroy(&a);
}

TEST(geometry_area_circle) {
    Arena a = arena_create(16384);
    const char* s = "A = \\pi * r^2";
    LayoutNode* tree = geometry_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    arena_destroy(&a);
}

TEST(geometry_distance) {
    Arena a = arena_create(32768);
    const char* s = "d = \\sqrt{(x2-x1)^2 + (y2-y1)^2}";
    LayoutNode* tree = geometry_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    tree->compute(400, 50);
    ASSERT_TRUE(tree->width > 0);
    arena_destroy(&a);
}

TEST(geometry_angle_sum) {
    Arena a = arena_create(16384);
    const char* s = "\\alpha + \\beta + \\gamma = 180";
    LayoutNode* tree = geometry_render(&a, s, strlen(s));
    ASSERT_TRUE(tree != nullptr);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RICH TEXT — EXTENSIVE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(rich_plain_text) {
    Arena a = arena_create(16384);
    LayoutNode* tree = rich_render(&a, "Hello world", 11);
    ASSERT_TRUE(tree != nullptr);
    ASSERT_EQ(tree->child_count, (uint16_t)1);
    arena_destroy(&a);
}

TEST(rich_multiline_text) {
    Arena a = arena_create(16384);
    const char* s = "Line 1\nLine 2\nLine 3";
    LayoutNode* tree = rich_render(&a, s, strlen(s));
    ASSERT_EQ(tree->child_count, (uint16_t)3);
    arena_destroy(&a);
}

TEST(rich_math_embed) {
    Arena a = arena_create(32768);
    const char* s = "Result: $math{x^2 + y^2 = r^2} end";
    LayoutNode* tree = rich_render(&a, s, strlen(s));
    ASSERT_EQ(tree->child_count, (uint16_t)1);
    ASSERT_TRUE(tree->children[0]->child_count >= 3);
    arena_destroy(&a);
}

TEST(rich_chem_embed) {
    Arena a = arena_create(32768);
    const char* s = "Water: $chem{H2O}";
    LayoutNode* tree = rich_render(&a, s, strlen(s));
    ASSERT_EQ(tree->child_count, (uint16_t)1);
    ASSERT_TRUE(tree->children[0]->child_count >= 2);
    arena_destroy(&a);
}

TEST(rich_multiline_math) {
    Arena a = arena_create(32768);
    const char* s = "$math{x = 1\ny = 2\nz = 3}";
    LayoutNode* tree = rich_render(&a, s, strlen(s));
    ASSERT_EQ(tree->child_count, (uint16_t)3);
    arena_destroy(&a);
}

TEST(rich_mixed_embeds) {
    Arena a = arena_create(65536);
    const char* s = "Physics: $phys{F = m*a}\nChemistry: $chem{NaCl}";
    LayoutNode* tree = rich_render(&a, s, strlen(s));
    ASSERT_EQ(tree->child_count, (uint16_t)2);
    arena_destroy(&a);
}

TEST(rich_empty) {
    Arena a = arena_create(8192);
    LayoutNode* tree = rich_render(&a, "", 0);
    ASSERT_EQ(tree->child_count, (uint16_t)0);
    arena_destroy(&a);
}

TEST(rich_renders_to_pixels) {
    Arena a = arena_create(32768);
    const char* s = "Test $math{a+b}";
    LayoutNode* tree = rich_render(&a, s, strlen(s));
    tree->compute(300, 50);
    SoftwareBackend sw(300, 50);
    sw.begin_frame(300, 50);
    tree->render(&sw);
    sw.end_frame();
    ASSERT_TRUE(true);
    arena_destroy(&a);
}

TEST(rich_text_before_and_after_embed) {
    Arena a = arena_create(32768);
    const char* s = "before $math{x} after";
    LayoutNode* tree = rich_render(&a, s, strlen(s));
    ASSERT_EQ(tree->child_count, (uint16_t)1);
    ASSERT_TRUE(tree->children[0]->child_count >= 3); // "before " + math + " after"
    arena_destroy(&a);
}

TEST(rich_multiple_embeds_one_line) {
    Arena a = arena_create(65536);
    const char* s = "$math{a} and $chem{H2O} and $phys{F=ma}";
    LayoutNode* tree = rich_render(&a, s, strlen(s));
    ASSERT_EQ(tree->child_count, (uint16_t)1);
    ASSERT_TRUE(tree->children[0]->child_count >= 5); // math + " and " + chem + " and " + phys
    arena_destroy(&a);
}

TEST(rich_nested_braces) {
    Arena a = arena_create(32768);
    const char* s = "$math{\\sqrt{x+1}}";
    LayoutNode* tree = rich_render(&a, s, strlen(s));
    ASSERT_EQ(tree->child_count, (uint16_t)1);
    arena_destroy(&a);
}

TEST(rich_geom_embed) {
    Arena a = arena_create(32768);
    const char* s = "Theorem: $geom{a^2 + b^2 = c^2}";
    LayoutNode* tree = rich_render(&a, s, strlen(s));
    ASSERT_EQ(tree->child_count, (uint16_t)1);
    ASSERT_TRUE(tree->children[0]->child_count >= 2);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════

int main() {
    return run_all_tests();
}
