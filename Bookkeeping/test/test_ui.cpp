#include "test/test.h"
#include "src/core/arena.h"
#include "src/graphics/ui.h"
#include "src/graphics/layout/functional_layout.h"
#include "src/graphics/layout/virtual_layout.h"
#include "src/graphics/backend/software_backend.h"

// ═══════════════════════════════════════════════════════════════════════════════
// UI FLUENT BUILDER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(ui_box_creates_node) {
    Arena a = arena_create(4096);
    auto box = Box(&a, 100, 50);
    ASSERT_NEAR(box.node.req_width, 100.0f, 0.01f);
    ASSERT_NEAR(box.node.req_height, 50.0f, 0.01f);
    arena_destroy(&a);
}

TEST(ui_vstack_type) {
    Arena a = arena_create(4096);
    auto vs = VStack(&a, 5);
    ASSERT_EQ(vs.node.type, LAYOUT_LINEAR);
    ASSERT_EQ(vs.node.direction, LINEAR_VERTICAL);
    ASSERT_NEAR(vs.node.gap, 5.0f, 0.01f);
    arena_destroy(&a);
}

TEST(ui_hstack_type) {
    Arena a = arena_create(4096);
    auto hs = HStack(&a, 10);
    ASSERT_EQ(hs.node.type, LAYOUT_LINEAR);
    ASSERT_EQ(hs.node.direction, LINEAR_HORIZONTAL);
    ASSERT_NEAR(hs.node.gap, 10.0f, 0.01f);
    arena_destroy(&a);
}

TEST(ui_grid_type) {
    Arena a = arena_create(4096);
    auto g = Grid(&a, 4, 2);
    ASSERT_EQ(g.node.type, LAYOUT_GRID);
    ASSERT_EQ(g.node.grid_cols, (uint16_t)4);
    ASSERT_NEAR(g.node.gap, 2.0f, 0.01f);
    arena_destroy(&a);
}

TEST(ui_scroll_type) {
    Arena a = arena_create(4096);
    auto s = Scroll(&a, 200, 100, 3);
    ASSERT_EQ(s.node.type, LAYOUT_SCROLL);
    ASSERT_NEAR(s.node.req_width, 200.0f, 0.01f);
    ASSERT_NEAR(s.node.req_height, 100.0f, 0.01f);
    arena_destroy(&a);
}

TEST(ui_absolute_type) {
    Arena a = arena_create(4096);
    auto ab = Absolute(&a);
    ASSERT_EQ(ab.node.type, LAYOUT_COORDINATE);
    arena_destroy(&a);
}

TEST(ui_child_adds_to_tree) {
    Arena a = arena_create(4096);
    auto parent = VStack(&a, 0)
        .child(Box(&a, 50, 20))
        .child(Box(&a, 50, 30));
    ASSERT_EQ(parent.node.child_count, (uint16_t)2);
    ASSERT_NEAR(parent.node.children[0]->req_width, 50.0f, 0.01f);
    ASSERT_NEAR(parent.node.children[1]->req_height, 30.0f, 0.01f);
    arena_destroy(&a);
}

TEST(ui_children_bulk) {
    Arena a = arena_create(4096);
    UI items[3];
    items[0] = Box(&a, 40, 20);
    items[1] = Box(&a, 40, 25);
    items[2] = Box(&a, 40, 30);
    auto parent = VStack(&a, 5).children(items, 3);
    ASSERT_EQ(parent.node.child_count, (uint16_t)3);
    ASSERT_NEAR(parent.node.children[2]->req_height, 30.0f, 0.01f);
    arena_destroy(&a);
}

TEST(ui_bg_adds_element) {
    Arena a = arena_create(4096);
    auto box = Box(&a, 80, 40).bg(COLOR_RED, COLOR_BLUE, 2);
    ASSERT_EQ(box.node.element_count, (uint16_t)1);
    ASSERT_EQ(box.node.elements[0].type, ELEM_RECT);
    ASSERT_EQ(box.node.elements[0].rect.fill.r, (uint8_t)255);
    arena_destroy(&a);
}

TEST(ui_text_adds_element) {
    Arena a = arena_create(4096);
    auto box = Box(&a, 100, 20).text("hello", 16, COLOR_GREEN);
    ASSERT_EQ(box.node.element_count, (uint16_t)1);
    ASSERT_EQ(box.node.elements[0].type, ELEM_TEXT);
    ASSERT_NEAR(box.node.elements[0].text.size, 16.0f, 0.01f);
    arena_destroy(&a);
}

TEST(ui_multiple_elements) {
    Arena a = arena_create(4096);
    auto box = Box(&a, 100, 60)
        .bg(COLOR_RED)
        .text("over", 12)
        .line(0, 30, 100, 30, COLOR_GREEN);
    ASSERT_EQ(box.node.element_count, (uint16_t)3);
    ASSERT_EQ(box.node.elements[0].type, ELEM_RECT);
    ASSERT_EQ(box.node.elements[1].type, ELEM_TEXT);
    ASSERT_EQ(box.node.elements[2].type, ELEM_LINE);
    arena_destroy(&a);
}

TEST(ui_chaining_modifiers) {
    Arena a = arena_create(4096);
    auto box = Box(&a, 0, 0).size(120, 80).padding(5).gap(3).id("test");
    ASSERT_NEAR(box.node.req_width, 120.0f, 0.01f);
    ASSERT_NEAR(box.node.padding, 5.0f, 0.01f);
    ASSERT_NEAR(box.node.gap, 3.0f, 0.01f);
    ASSERT_TRUE(strcmp(box.node.id, "test") == 0);
    arena_destroy(&a);
}

TEST(ui_colorbox_convenience) {
    Arena a = arena_create(4096);
    auto cb = ColorBox(&a, 50, 30, COLOR_BLUE, COLOR_WHITE);
    ASSERT_NEAR(cb.node.req_width, 50.0f, 0.01f);
    ASSERT_EQ(cb.node.element_count, (uint16_t)1);
    ASSERT_EQ(cb.node.elements[0].rect.fill.b, (uint8_t)255);
    arena_destroy(&a);
}

TEST(ui_label_measures_text) {
    Arena a = arena_create(4096);
    auto lbl = Label(&a, "AB", 20);
    // "AB" = 2 chars * 20 * 0.6 = 24 width + 8 padding = 32
    ASSERT_NEAR(lbl.node.req_width, 32.0f, 0.01f);
    ASSERT_NEAR(lbl.node.req_height, 28.0f, 0.01f); // 20 + 8
    arena_destroy(&a);
}

TEST(ui_build_returns_arena_node) {
    Arena a = arena_create(4096);
    auto ui = Box(&a, 60, 40).id("built");
    LayoutNode* node = build(ui);
    ASSERT_TRUE(node != nullptr);
    ASSERT_NEAR(node->req_width, 60.0f, 0.01f);
    ASSERT_TRUE(strcmp(node->id, "built") == 0);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// METHOD-BASED API TESTS (LayoutNode::compute, render, hit_surface, hit_deep)
// ═══════════════════════════════════════════════════════════════════════════════

TEST(method_compute_sets_dimensions) {
    Arena a = arena_create(4096);
    auto ui = VStack(&a, 5)
        .child(Box(&a, 80, 20))
        .child(Box(&a, 80, 30));
    LayoutNode* root = build(ui);
    root->compute(400, 300);
    ASSERT_NEAR(root->height, 55.0f, 0.01f); // 20 + 5 + 30
    ASSERT_NEAR(root->children[1]->y, 25.0f, 0.01f);
    arena_destroy(&a);
}

TEST(method_render_draws) {
    Arena a = arena_create(4096);
    auto ui = Box(&a, 50, 50).bg(COLOR_RED);
    LayoutNode* root = build(ui);
    root->compute(100, 100);

    SoftwareBackend sw(100, 100);
    sw.begin_frame(100, 100);
    root->render(&sw);
    sw.end_frame();
    ASSERT_PIXEL(sw, 25, 25, COLOR_RED);
    arena_destroy(&a);
}

TEST(method_hit_surface_finds_node) {
    Arena a = arena_create(4096);
    auto ui = VStack(&a, 0)
        .child(Box(&a, 100, 50).id("top"))
        .child(Box(&a, 100, 50).id("bottom"));
    LayoutNode* root = build(ui);
    root->compute(200, 200);

    HitResult r = root->hit_surface(50, 25);
    ASSERT_TRUE(r.node != nullptr);
    ASSERT_TRUE(strcmp(r.node->id, "top") == 0);

    r = root->hit_surface(50, 60);
    ASSERT_TRUE(r.node != nullptr);
    ASSERT_TRUE(strcmp(r.node->id, "bottom") == 0);
    arena_destroy(&a);
}

TEST(method_hit_deep_returns_hierarchy) {
    Arena a = arena_create(4096);
    auto ui = VStack(&a, 0).id("root")
        .child(Box(&a, 100, 100).id("child"));
    LayoutNode* root = build(ui);
    root->compute(200, 200);

    HitResult results[8];
    int n = root->hit_deep(50, 50, results, 8);
    ASSERT_EQ(n, 2);
    ASSERT_TRUE(strcmp(results[0].node->id, "root") == 0);
    ASSERT_TRUE(strcmp(results[1].node->id, "child") == 0);
    arena_destroy(&a);
}

TEST(method_render_nested) {
    Arena a = arena_create(8192);
    auto ui = VStack(&a, 5).padding(10)
        .child(Box(&a, 80, 30).bg(COLOR_RED))
        .child(Box(&a, 80, 30).bg(COLOR_BLUE));
    LayoutNode* root = build(ui);
    root->compute(200, 200);

    SoftwareBackend sw(200, 200);
    sw.begin_frame(200, 200);
    root->render(&sw);
    sw.end_frame();

    // First child at (10, 10), red
    ASSERT_PIXEL(sw, 30, 20, COLOR_RED);
    // Second child at (10, 45), blue
    ASSERT_PIXEL(sw, 30, 55, COLOR_BLUE);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI + SCROLL INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

TEST(ui_scroll_clips_children) {
    Arena a = arena_create(8192);
    UI items[5];
    for (int i = 0; i < 5; i++)
        items[i] = Box(&a, 100, 40).bg(COLOR_RED);

    auto ui = Scroll(&a, 100, 60, 0).children(items, 5);
    LayoutNode* root = build(ui);
    root->compute(200, 200);

    SoftwareBackend sw(200, 200);
    sw.begin_frame(200, 200);
    root->render(&sw);
    sw.end_frame();

    // Inside viewport: visible
    ASSERT_PIXEL(sw, 50, 20, COLOR_RED);
    // Below viewport (y=70 > height=60): clipped
    Color c = sw.get_pixel(50, 70);
    ASSERT_EQ(c.a, (uint8_t)0);
    arena_destroy(&a);
}

TEST(ui_scroll_with_offset) {
    Arena a = arena_create(8192);
    UI items[3];
    items[0] = Box(&a, 100, 50).bg(COLOR_RED);
    items[1] = Box(&a, 100, 50).bg(COLOR_GREEN);
    items[2] = Box(&a, 100, 50).bg(COLOR_BLUE);

    auto ui = Scroll(&a, 100, 50, 0).scroll(0, 50).children(items, 3);
    LayoutNode* root = build(ui);
    root->compute(200, 200);

    SoftwareBackend sw(200, 200);
    sw.begin_frame(200, 200);
    root->render(&sw);
    sw.end_frame();

    // After scrolling 50px, green (second item) visible
    ASSERT_PIXEL(sw, 50, 25, COLOR_GREEN);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIRTUAL LAYOUT TESTS (reactive cycle)
// ═══════════════════════════════════════════════════════════════════════════════

TEST(ui_virtual_render_cycle) {
    struct S { int val; };
    S state = {7};

    auto rfn = [](void* s, Arena* a) -> LayoutNode* {
        S* st = (S*)s;
        auto ui = Box(a, 100, (float)(st->val * 10)).id("dynamic");
        return build(ui);
    };

    VirtualLayout vl = {};
    virtual_init(&vl, rfn, nullptr, &state, 4096);

    LayoutNode* tree = virtual_render(&vl);
    ASSERT_TRUE(tree != nullptr);
    ASSERT_NEAR(tree->req_height, 70.0f, 0.01f);
    ASSERT_TRUE(strcmp(tree->id, "dynamic") == 0);

    state.val = 3;
    virtual_set_dirty(&vl);
    tree = virtual_render(&vl);
    ASSERT_NEAR(tree->req_height, 30.0f, 0.01f);

    virtual_destroy(&vl);
}

TEST(ui_virtual_event_updates_state) {
    struct S { int clicks; };
    S state = {0};

    auto efn = [](void* s, const UIEvent* ev) -> bool {
        if (ev->type == EVENT_CLICK) { ((S*)s)->clicks++; return true; }
        return false;
    };

    VirtualLayout vl = {};
    virtual_init(&vl, nullptr, efn, &state, 1024);
    vl.dirty = false;

    UIEvent click = {EVENT_CLICK, 0, 0, 0, 0, nullptr};
    virtual_dispatch(&vl, &click);
    ASSERT_EQ(state.clicks, 1);
    ASSERT_TRUE(vl.dirty);

    virtual_dispatch(&vl, &click);
    ASSERT_EQ(state.clicks, 2);

    virtual_destroy(&vl);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTIONAL LAYOUT TESTS (cache)
// ═══════════════════════════════════════════════════════════════════════════════

TEST(ui_functional_cache_content) {
    Arena a = arena_create(4096);
    auto ui = Box(&a, 30, 30).bg(COLOR_GREEN);
    LayoutNode* src = build(ui);

    FunctionalLayout fl = {};
    functional_init(&fl, src, 30, 30);
    ASSERT_TRUE(fl.dirty);

    // Render to cache
    SoftwareBackend sw(30, 30);
    sw.begin_frame(30, 30);
    src->compute(30, 30);
    src->render(&sw);
    sw.end_frame();
    memcpy(fl.cache, sw.pixels, 30 * 30 * 4);
    fl.dirty = false;

    // Verify cache
    int idx = (15 * 30 + 15) * 4;
    ASSERT_EQ(fl.cache[idx + 1], (uint8_t)255); // green channel
    ASSERT_TRUE(!fl.dirty);

    functional_invalidate(&fl);
    ASSERT_TRUE(fl.dirty);

    functional_destroy(&fl);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED: UI BUILDER + RENDER + HIT TEST
// ═══════════════════════════════════════════════════════════════════════════════

TEST(ui_full_tree_render_and_hit) {
    Arena a = arena_create(16384);
    auto ui = VStack(&a, 10).padding(5).id("root")
        .child(HStack(&a, 5).id("row")
            .child(ColorBox(&a, 40, 30, COLOR_RED).id("r"))
            .child(ColorBox(&a, 40, 30, COLOR_BLUE).id("b")))
        .child(Box(&a, 100, 40).bg(COLOR_GREEN).id("footer"));

    LayoutNode* root = build(ui);
    root->compute(300, 200);

    SoftwareBackend sw(300, 200);
    sw.begin_frame(300, 200);
    root->render(&sw);
    sw.end_frame();

    // Red box at (5, 5) + (0, 0) = (5, 5)
    ASSERT_PIXEL(sw, 20, 15, COLOR_RED);
    // Blue box at (5+40+5, 5) = (50, 5)
    ASSERT_PIXEL(sw, 60, 15, COLOR_BLUE);
    // Footer at y = 5 + 30 + 10 = 45
    ASSERT_PIXEL(sw, 50, 55, COLOR_GREEN);

    // Hit test
    HitResult r = root->hit_surface(20, 15);
    ASSERT_TRUE(r.node != nullptr && r.node->id != nullptr);
    ASSERT_TRUE(strcmp(r.node->id, "r") == 0);

    r = root->hit_surface(60, 15);
    ASSERT_TRUE(strcmp(r.node->id, "b") == 0);

    r = root->hit_surface(50, 55);
    ASSERT_TRUE(strcmp(r.node->id, "footer") == 0);

    arena_destroy(&a);
}

TEST(ui_grid_render_and_hit) {
    Arena a = arena_create(8192);
    UI cells[4];
    cells[0] = Box(&a, 90, 25).bg(COLOR_RED).id("c0");
    cells[1] = Box(&a, 90, 25).bg(COLOR_GREEN).id("c1");
    cells[2] = Box(&a, 90, 25).bg(COLOR_BLUE).id("c2");
    cells[3] = Box(&a, 90, 25).bg(COLOR_WHITE).id("c3");

    auto ui = Grid(&a, 2, 5).width(200).id("grid").children(cells, 4);
    LayoutNode* root = build(ui);
    root->compute(200, 200);

    SoftwareBackend sw(200, 200);
    sw.begin_frame(200, 200);
    root->render(&sw);
    sw.end_frame();

    // Cell 0 (red) at top-left
    ASSERT_PIXEL(sw, 30, 12, COLOR_RED);
    // Cell 1 (green) at top-right
    ASSERT_PIXEL(sw, 130, 12, COLOR_GREEN);

    HitResult r = root->hit_surface(30, 12);
    ASSERT_TRUE(strcmp(r.node->id, "c0") == 0);
    r = root->hit_surface(130, 12);
    ASSERT_TRUE(strcmp(r.node->id, "c1") == 0);

    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════

int main() {
    return run_all_tests();
}
