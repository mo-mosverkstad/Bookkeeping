#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/color.h"
#include "src/graphics/elements/shapes.h"
#include "src/graphics/elements/element.h"
#include "src/graphics/layout/layout.h"
#include "src/graphics/backend/backend.h"
#include "src/graphics/backend/software_backend.h"

// ═══════════════════════════════════════════════════════════════════════════════
// ARENA TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(arena_create_and_alloc) {
    Arena a = arena_create(4096);
    ASSERT_TRUE(a.base != nullptr);
    ASSERT_EQ(a.offset, (size_t)0);
    int* p = (int*)arena_alloc(&a, sizeof(int));
    ASSERT_TRUE(p != nullptr);
    *p = 42;
    ASSERT_EQ(*p, 42);
    ASSERT_TRUE(a.offset >= sizeof(int));
    arena_destroy(&a);
}

TEST(arena_reset) {
    Arena a = arena_create(1024);
    arena_alloc(&a, 512);
    ASSERT_TRUE(a.offset >= 512);
    arena_reset(&a);
    ASSERT_EQ(a.offset, (size_t)0);
    arena_destroy(&a);
}

TEST(arena_oom_returns_null) {
    Arena a = arena_create(32);
    void* p = arena_alloc(&a, 64);
    ASSERT_EQ(p, (void*)nullptr);
    arena_destroy(&a);
}

TEST(arena_typed_new) {
    Arena a = arena_create(4096);
    Rect* r = arena_new<Rect>(&a);
    ASSERT_TRUE(r != nullptr);
    ASSERT_NEAR(r->x, 0.0f, 0.001f);
    arena_destroy(&a);
}

TEST(arena_multiple_allocs_no_overlap) {
    Arena a = arena_create(4096);
    uint8_t* p1 = (uint8_t*)arena_alloc(&a, 100);
    uint8_t* p2 = (uint8_t*)arena_alloc(&a, 100);
    ASSERT_TRUE(p1 != nullptr);
    ASSERT_TRUE(p2 != nullptr);
    ASSERT_TRUE(p2 >= p1 + 100); // no overlap
    arena_destroy(&a);
}

TEST(arena_alignment) {
    Arena a = arena_create(4096);
    arena_alloc(&a, 1); // misalign
    void* p = arena_alloc(&a, 16, 16);
    ASSERT_EQ((uintptr_t)p % 16, (uintptr_t)0);
    arena_destroy(&a);
}

TEST(arena_array_zeroed) {
    Arena a = arena_create(4096);
    int* arr = arena_array<int>(&a, 10);
    for (int i = 0; i < 10; i++) ASSERT_EQ(arr[i], 0);
    arena_destroy(&a);
}

TEST(arena_fill_to_capacity) {
    Arena a = arena_create(128);
    // Fill exactly
    void* p1 = arena_alloc(&a, 64, 1);
    void* p2 = arena_alloc(&a, 64, 1);
    ASSERT_TRUE(p1 != nullptr);
    ASSERT_TRUE(p2 != nullptr);
    // Now full
    void* p3 = arena_alloc(&a, 1, 1);
    ASSERT_EQ(p3, (void*)nullptr);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(layout_linear_h_positions) {
    LayoutNode c1 = {}; c1.req_width = 50; c1.req_height = 30;
    LayoutNode c2 = {}; c2.req_width = 80; c2.req_height = 30;
    LayoutNode* children[] = {&c1, &c2};

    LayoutNode root = {};
    root.type = LAYOUT_LINEAR_H;
    root.gap = 10;
    root.children = children;
    root.child_count = 2;

    layout_compute(&root, 400, 100);
    ASSERT_NEAR(c1.x, 0.0f, 0.01f);
    ASSERT_NEAR(c2.x, 60.0f, 0.01f);
    ASSERT_NEAR(c1.width, 50.0f, 0.01f);
    ASSERT_NEAR(c2.width, 80.0f, 0.01f);
}

TEST(layout_linear_h_auto_height) {
    LayoutNode c1 = {}; c1.req_width = 50; c1.req_height = 20;
    LayoutNode c2 = {}; c2.req_width = 50; c2.req_height = 40;
    LayoutNode* children[] = {&c1, &c2};

    LayoutNode root = {};
    root.type = LAYOUT_LINEAR_H;
    root.gap = 0;
    root.children = children;
    root.child_count = 2;

    layout_compute(&root, 200, 0);
    ASSERT_NEAR(root.height, 40.0f, 0.01f); // tallest child
}

TEST(layout_linear_h_with_padding) {
    LayoutNode c1 = {}; c1.req_width = 50; c1.req_height = 30;
    LayoutNode* children[] = {&c1};

    LayoutNode root = {};
    root.type = LAYOUT_LINEAR_H;
    root.padding = 10;
    root.children = children;
    root.child_count = 1;

    layout_compute(&root, 400, 100);
    ASSERT_NEAR(c1.x, 10.0f, 0.01f);
    ASSERT_NEAR(c1.y, 10.0f, 0.01f);
}

TEST(layout_linear_v_positions) {
    LayoutNode c1 = {}; c1.req_width = 100; c1.req_height = 20;
    LayoutNode c2 = {}; c2.req_width = 100; c2.req_height = 40;
    LayoutNode* children[] = {&c1, &c2};

    LayoutNode root = {};
    root.type = LAYOUT_LINEAR_V;
    root.gap = 5;
    root.children = children;
    root.child_count = 2;

    layout_compute(&root, 200, 400);
    ASSERT_NEAR(c1.y, 0.0f, 0.01f);
    ASSERT_NEAR(c2.y, 25.0f, 0.01f);
    ASSERT_NEAR(root.height, 65.0f, 0.01f);
}

TEST(layout_linear_v_auto_width) {
    LayoutNode c1 = {}; c1.req_width = 80; c1.req_height = 20;
    LayoutNode c2 = {}; c2.req_width = 120; c2.req_height = 20;
    LayoutNode* children[] = {&c1, &c2};

    LayoutNode root = {};
    root.type = LAYOUT_LINEAR_V;
    root.children = children;
    root.child_count = 2;

    layout_compute(&root, 0, 400);
    ASSERT_NEAR(root.width, 120.0f, 0.01f); // widest child
}

TEST(layout_linear_v_with_padding) {
    LayoutNode c1 = {}; c1.req_width = 50; c1.req_height = 30;
    LayoutNode* children[] = {&c1};

    LayoutNode root = {};
    root.type = LAYOUT_LINEAR_V;
    root.padding = 15;
    root.children = children;
    root.child_count = 1;

    layout_compute(&root, 200, 400);
    ASSERT_NEAR(c1.x, 15.0f, 0.01f);
    ASSERT_NEAR(c1.y, 15.0f, 0.01f);
    ASSERT_NEAR(root.height, 60.0f, 0.01f); // 15 + 30 + 15
}

TEST(layout_grid_2x2) {
    LayoutNode c[4] = {};
    for (int i = 0; i < 4; i++) c[i].req_height = 30;
    LayoutNode* children[] = {&c[0], &c[1], &c[2], &c[3]};

    LayoutNode root = {};
    root.type = LAYOUT_GRID;
    root.grid_cols = 2;
    root.gap = 10;
    root.children = children;
    root.child_count = 4;

    layout_compute(&root, 200, 400);
    ASSERT_NEAR(c[0].x, 0.0f, 0.01f);
    ASSERT_NEAR(c[1].x, 105.0f, 0.01f);
    ASSERT_NEAR(c[2].y, 40.0f, 0.01f);
}

TEST(layout_grid_3x1_single_row) {
    LayoutNode c[3] = {};
    for (int i = 0; i < 3; i++) c[i].req_height = 25;
    LayoutNode* children[] = {&c[0], &c[1], &c[2]};

    LayoutNode root = {};
    root.type = LAYOUT_GRID;
    root.grid_cols = 3;
    root.gap = 5;
    root.children = children;
    root.child_count = 3;

    layout_compute(&root, 300, 100);
    // col width = (300 - 2*5) / 3 ≈ 96.67
    ASSERT_NEAR(c[0].x, 0.0f, 0.01f);
    ASSERT_TRUE(c[1].x > 95.0f && c[1].x < 105.0f);
    ASSERT_TRUE(c[2].x > 195.0f && c[2].x < 210.0f);
    // All on same row
    ASSERT_NEAR(c[0].y, 0.0f, 0.01f);
    ASSERT_NEAR(c[1].y, 0.0f, 0.01f);
    ASSERT_NEAR(c[2].y, 0.0f, 0.01f);
}

TEST(layout_grid_custom_col_widths) {
    LayoutNode c[4] = {};
    for (int i = 0; i < 4; i++) c[i].req_height = 30;
    LayoutNode* children[] = {&c[0], &c[1], &c[2], &c[3]};
    float widths[] = {60, 140};

    LayoutNode root = {};
    root.type = LAYOUT_GRID;
    root.grid_cols = 2;
    root.gap = 10;
    root.col_widths = widths;
    root.children = children;
    root.child_count = 4;

    layout_compute(&root, 210, 400);
    ASSERT_NEAR(c[0].width, 60.0f, 0.01f);
    ASSERT_NEAR(c[1].width, 140.0f, 0.01f);
    ASSERT_NEAR(c[1].x, 70.0f, 0.01f); // 60 + 10 gap
}

TEST(layout_coordinate_children_at_set_positions) {
    LayoutNode c1 = {}; c1.x = 50; c1.y = 30; c1.req_width = 20; c1.req_height = 20;
    LayoutNode c2 = {}; c2.x = 100; c2.y = 80; c2.req_width = 30; c2.req_height = 30;
    LayoutNode* children[] = {&c1, &c2};

    LayoutNode root = {};
    root.type = LAYOUT_COORDINATE;
    root.children = children;
    root.child_count = 2;

    layout_compute(&root, 400, 300);
    ASSERT_NEAR(c1.x, 50.0f, 0.01f);
    ASSERT_NEAR(c1.y, 30.0f, 0.01f);
    ASSERT_NEAR(c2.x, 100.0f, 0.01f);
    ASSERT_NEAR(c2.y, 80.0f, 0.01f);
}

TEST(layout_no_children) {
    LayoutNode root = {};
    root.type = LAYOUT_LINEAR_V;
    root.children = nullptr;
    root.child_count = 0;
    root.req_width = 100;
    root.req_height = 50;

    layout_compute(&root, 400, 300);
    ASSERT_NEAR(root.width, 100.0f, 0.01f);
    ASSERT_NEAR(root.height, 50.0f, 0.01f);
}

TEST(layout_nested) {
    // Inner: horizontal row of 2 boxes
    LayoutNode ic1 = {}; ic1.req_width = 40; ic1.req_height = 20;
    LayoutNode ic2 = {}; ic2.req_width = 40; ic2.req_height = 20;
    LayoutNode* inner_children[] = {&ic1, &ic2};

    LayoutNode inner = {};
    inner.type = LAYOUT_LINEAR_H;
    inner.gap = 5;
    inner.children = inner_children;
    inner.child_count = 2;

    // Outer: vertical stack containing inner + one more
    LayoutNode c2 = {}; c2.req_width = 100; c2.req_height = 30;
    LayoutNode* outer_children[] = {&inner, &c2};

    LayoutNode root = {};
    root.type = LAYOUT_LINEAR_V;
    root.gap = 10;
    root.children = outer_children;
    root.child_count = 2;

    layout_compute(&root, 400, 400);
    ASSERT_NEAR(inner.y, 0.0f, 0.01f);
    ASSERT_NEAR(inner.width, 85.0f, 0.01f); // 40 + 5 + 40
    ASSERT_NEAR(c2.y, 30.0f, 0.01f); // inner.height(20) + gap(10)
    ASSERT_NEAR(ic1.x, 0.0f, 0.01f);
    ASSERT_NEAR(ic2.x, 45.0f, 0.01f); // 40 + 5
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOFTWARE BACKEND RENDERING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(sw_clear_to_transparent) {
    SoftwareBackend sw(50, 50);
    sw.begin_frame(50, 50);
    sw.end_frame();
    Color c = sw.get_pixel(25, 25);
    ASSERT_EQ(c.r, (uint8_t)0);
    ASSERT_EQ(c.g, (uint8_t)0);
    ASSERT_EQ(c.b, (uint8_t)0);
    ASSERT_EQ(c.a, (uint8_t)0);
}

TEST(sw_rect_fill_inside) {
    SoftwareBackend sw(100, 100);
    sw.begin_frame(100, 100);
    Rect r = {10, 10, 20, 20, COLOR_RED, COLOR_TRANSPARENT, 0, 0};
    sw.render_rect(0, 0, r);
    sw.end_frame();
    ASSERT_PIXEL(sw, 15, 15, COLOR_RED);
    ASSERT_PIXEL(sw, 20, 20, COLOR_RED);
    ASSERT_PIXEL(sw, 10, 10, COLOR_RED);
    ASSERT_PIXEL(sw, 29, 29, COLOR_RED);
}

TEST(sw_rect_fill_outside) {
    SoftwareBackend sw(100, 100);
    sw.begin_frame(100, 100);
    Rect r = {10, 10, 20, 20, COLOR_RED, COLOR_TRANSPARENT, 0, 0};
    sw.render_rect(0, 0, r);
    sw.end_frame();
    Color c = sw.get_pixel(5, 5);
    ASSERT_EQ(c.a, (uint8_t)0);
    c = sw.get_pixel(31, 31);
    ASSERT_EQ(c.a, (uint8_t)0);
}

TEST(sw_rect_at_origin) {
    SoftwareBackend sw(50, 50);
    sw.begin_frame(50, 50);
    Rect r = {0, 0, 50, 50, COLOR_GREEN, COLOR_TRANSPARENT, 0, 0};
    sw.render_rect(0, 0, r);
    sw.end_frame();
    ASSERT_PIXEL(sw, 0, 0, COLOR_GREEN);
    ASSERT_PIXEL(sw, 49, 49, COLOR_GREEN);
}

TEST(sw_rect_with_offset) {
    SoftwareBackend sw(100, 100);
    sw.begin_frame(100, 100);
    Rect r = {0, 0, 10, 10, COLOR_BLUE, COLOR_TRANSPARENT, 0, 0};
    sw.render_rect(50, 50, r); // abs offset
    sw.end_frame();
    ASSERT_PIXEL(sw, 55, 55, COLOR_BLUE);
    Color c = sw.get_pixel(5, 5);
    ASSERT_EQ(c.a, (uint8_t)0);
}

TEST(sw_rect_clipped_at_boundary) {
    SoftwareBackend sw(50, 50);
    sw.begin_frame(50, 50);
    Rect r = {40, 40, 20, 20, COLOR_RED, COLOR_TRANSPARENT, 0, 0};
    sw.render_rect(0, 0, r);
    sw.end_frame();
    // Inside buffer portion
    ASSERT_PIXEL(sw, 45, 45, COLOR_RED);
    // Out of bounds should not crash (get_pixel returns transparent)
    Color c = sw.get_pixel(55, 55);
    ASSERT_EQ(c.a, (uint8_t)0);
}

TEST(sw_multiple_rects_no_overlap) {
    SoftwareBackend sw(100, 100);
    sw.begin_frame(100, 100);
    Rect r1 = {0, 0, 30, 30, COLOR_RED, COLOR_TRANSPARENT, 0, 0};
    Rect r2 = {50, 50, 30, 30, COLOR_BLUE, COLOR_TRANSPARENT, 0, 0};
    sw.render_rect(0, 0, r1);
    sw.render_rect(0, 0, r2);
    sw.end_frame();
    ASSERT_PIXEL(sw, 15, 15, COLOR_RED);
    ASSERT_PIXEL(sw, 65, 65, COLOR_BLUE);
}

TEST(sw_line_horizontal) {
    SoftwareBackend sw(100, 100);
    sw.begin_frame(100, 100);
    Line l = {10, 50, 90, 50, COLOR_GREEN, 1};
    sw.render_line(0, 0, l);
    sw.end_frame();
    ASSERT_PIXEL(sw, 10, 50, COLOR_GREEN);
    ASSERT_PIXEL(sw, 50, 50, COLOR_GREEN);
    ASSERT_PIXEL(sw, 90, 50, COLOR_GREEN);
}

TEST(sw_line_vertical) {
    SoftwareBackend sw(100, 100);
    sw.begin_frame(100, 100);
    Line l = {25, 10, 25, 90, COLOR_RED, 1};
    sw.render_line(0, 0, l);
    sw.end_frame();
    ASSERT_PIXEL(sw, 25, 10, COLOR_RED);
    ASSERT_PIXEL(sw, 25, 50, COLOR_RED);
    ASSERT_PIXEL(sw, 25, 90, COLOR_RED);
}

TEST(sw_line_diagonal) {
    SoftwareBackend sw(50, 50);
    sw.begin_frame(50, 50);
    Line l = {0, 0, 49, 49, COLOR_GREEN, 1};
    sw.render_line(0, 0, l);
    sw.end_frame();
    ASSERT_PIXEL(sw, 0, 0, COLOR_GREEN);
    ASSERT_PIXEL(sw, 25, 25, COLOR_GREEN);
    ASSERT_PIXEL(sw, 49, 49, COLOR_GREEN);
}

TEST(sw_ellipse_center) {
    SoftwareBackend sw(100, 100);
    sw.begin_frame(100, 100);
    Ellipse e = {50, 50, 20, 20, COLOR_BLUE, COLOR_TRANSPARENT, 0};
    sw.render_ellipse(0, 0, e);
    sw.end_frame();
    // Center should be filled
    ASSERT_PIXEL(sw, 50, 50, COLOR_BLUE);
    // Far outside should not
    Color c = sw.get_pixel(0, 0);
    ASSERT_EQ(c.a, (uint8_t)0);
}

TEST(sw_ellipse_edge) {
    SoftwareBackend sw(100, 100);
    sw.begin_frame(100, 100);
    Ellipse e = {50, 50, 30, 15, COLOR_RED, COLOR_TRANSPARENT, 0};
    sw.render_ellipse(0, 0, e);
    sw.end_frame();
    // On horizontal axis within rx
    ASSERT_PIXEL(sw, 60, 50, COLOR_RED);
    // Well outside
    Color c = sw.get_pixel(90, 90);
    ASSERT_EQ(c.a, (uint8_t)0);
}

TEST(sw_polyline) {
    SoftwareBackend sw(100, 100);
    sw.begin_frame(100, 100);
    PolyPoint pts[] = {{10, 10}, {50, 10}, {50, 50}};
    Polyline p = {pts, 3, COLOR_WHITE, 1};
    sw.render_polyline(0, 0, p);
    sw.end_frame();
    // Horizontal segment
    ASSERT_PIXEL(sw, 30, 10, COLOR_WHITE);
    // Vertical segment
    ASSERT_PIXEL(sw, 50, 30, COLOR_WHITE);
}

TEST(sw_polygon_edges) {
    SoftwareBackend sw(100, 100);
    sw.begin_frame(100, 100);
    PolyPoint pts[] = {{10, 10}, {90, 10}, {90, 90}, {10, 90}};
    Polygon p = {pts, 4, COLOR_TRANSPARENT, COLOR_GREEN, 1};
    sw.render_polygon(0, 0, p);
    sw.end_frame();
    // Top edge
    ASSERT_PIXEL(sw, 50, 10, COLOR_GREEN);
    // Right edge
    ASSERT_PIXEL(sw, 90, 50, COLOR_GREEN);
}

TEST(sw_alpha_blending) {
    SoftwareBackend sw(50, 50);
    sw.begin_frame(50, 50);
    // Draw red, then semi-transparent blue on top
    Rect r1 = {0, 0, 50, 50, COLOR_RED, COLOR_TRANSPARENT, 0, 0};
    sw.render_rect(0, 0, r1);
    Color semi_blue = {0, 0, 255, 128};
    Rect r2 = {0, 0, 50, 50, semi_blue, COLOR_TRANSPARENT, 0, 0};
    sw.render_rect(0, 0, r2);
    sw.end_frame();
    Color c = sw.get_pixel(25, 25);
    // Red blended with 50% blue: r≈128, b≈128
    ASSERT_TRUE(c.r > 100 && c.r < 150);
    ASSERT_TRUE(c.b > 100 && c.b < 150);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER TREE INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(render_tree_single_element) {
    SoftwareBackend sw(200, 200);
    sw.begin_frame(200, 200);

    Element elems[1];
    elems[0] = elem_rect({0, 0, 50, 50, COLOR_BLUE, COLOR_TRANSPARENT, 0, 0});

    LayoutNode root = {};
    root.type = LAYOUT_COORDINATE;
    root.x = 10; root.y = 10;
    root.width = 200; root.height = 200;
    root.elements = elems;
    root.element_count = 1;

    render_tree(&sw, &root);
    sw.end_frame();
    ASSERT_PIXEL(sw, 20, 20, COLOR_BLUE);
    Color c = sw.get_pixel(5, 5);
    ASSERT_EQ(c.a, (uint8_t)0);
}

TEST(render_tree_nested_layout) {
    SoftwareBackend sw(200, 200);
    sw.begin_frame(200, 200);

    // Child node at position (30, 30) within root
    Element child_elems[1];
    child_elems[0] = elem_rect({0, 0, 20, 20, COLOR_RED, COLOR_TRANSPARENT, 0, 0});

    LayoutNode child = {};
    child.type = LAYOUT_COORDINATE;
    child.x = 30; child.y = 30;
    child.width = 20; child.height = 20;
    child.elements = child_elems;
    child.element_count = 1;

    LayoutNode* children[] = {&child};
    LayoutNode root = {};
    root.type = LAYOUT_COORDINATE;
    root.x = 10; root.y = 10;
    root.width = 200; root.height = 200;
    root.children = children;
    root.child_count = 1;

    render_tree(&sw, &root);
    sw.end_frame();
    // Element at abs (10+30, 10+30) = (40, 40)
    ASSERT_PIXEL(sw, 45, 45, COLOR_RED);
    Color c = sw.get_pixel(10, 10);
    ASSERT_EQ(c.a, (uint8_t)0);
}

TEST(render_tree_linear_v_layout) {
    SoftwareBackend sw(200, 200);
    sw.begin_frame(200, 200);

    Element e1[1], e2[1];
    e1[0] = elem_rect({0, 0, 100, 30, COLOR_RED, COLOR_TRANSPARENT, 0, 0});
    e2[0] = elem_rect({0, 0, 100, 30, COLOR_GREEN, COLOR_TRANSPARENT, 0, 0});

    LayoutNode c1 = {}; c1.req_width = 100; c1.req_height = 30;
    c1.elements = e1; c1.element_count = 1;
    LayoutNode c2 = {}; c2.req_width = 100; c2.req_height = 30;
    c2.elements = e2; c2.element_count = 1;
    LayoutNode* children[] = {&c1, &c2};

    LayoutNode root = {};
    root.type = LAYOUT_LINEAR_V;
    root.gap = 10;
    root.children = children;
    root.child_count = 2;

    layout_compute(&root, 200, 200);
    render_tree(&sw, &root);
    sw.end_frame();

    // First rect at y=0
    ASSERT_PIXEL(sw, 50, 15, COLOR_RED);
    // Second rect at y=40 (30 + 10 gap)
    ASSERT_PIXEL(sw, 50, 55, COLOR_GREEN);
}

TEST(render_tree_multiple_elements_per_node) {
    SoftwareBackend sw(100, 100);
    sw.begin_frame(100, 100);

    Element elems[2];
    elems[0] = elem_rect({0, 0, 100, 100, COLOR_RED, COLOR_TRANSPARENT, 0, 0});
    elems[1] = elem_rect({25, 25, 50, 50, COLOR_BLUE, COLOR_TRANSPARENT, 0, 0});

    LayoutNode root = {};
    root.type = LAYOUT_COORDINATE;
    root.width = 100; root.height = 100;
    root.elements = elems;
    root.element_count = 2;

    render_tree(&sw, &root);
    sw.end_frame();

    // Corner: red (first rect covers all)
    ASSERT_PIXEL(sw, 5, 5, COLOR_RED);
    // Center: blue (second rect overwrites)
    ASSERT_PIXEL(sw, 50, 50, COLOR_BLUE);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ELEMENT CREATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(element_tagged_union_rect) {
    Element e = elem_rect({5, 10, 100, 50, COLOR_RED, COLOR_BLUE, 2, 0});
    ASSERT_EQ(e.type, ELEM_RECT);
    ASSERT_NEAR(e.rect.x, 5.0f, 0.01f);
    ASSERT_NEAR(e.rect.w, 100.0f, 0.01f);
    ASSERT_EQ(e.rect.fill.r, (uint8_t)255);
}

TEST(element_tagged_union_line) {
    Element e = elem_line({0, 0, 100, 100, COLOR_GREEN, 2});
    ASSERT_EQ(e.type, ELEM_LINE);
    ASSERT_NEAR(e.line.x2, 100.0f, 0.01f);
    ASSERT_EQ(e.line.color.g, (uint8_t)255);
}

TEST(element_tagged_union_text) {
    Text t = {10, 20, "hello", "Arial", 14.0f, COLOR_WHITE, TEXT_BOLD | TEXT_ITALIC, ALIGN_CENTER, 0};
    Element e = elem_text(t);
    ASSERT_EQ(e.type, ELEM_TEXT);
    ASSERT_EQ(e.text.style & TEXT_BOLD, TEXT_BOLD);
    ASSERT_EQ(e.text.style & TEXT_ITALIC, TEXT_ITALIC);
    ASSERT_EQ(e.text.align, (uint8_t)ALIGN_CENTER);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARKS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(bench_layout_1000_nodes) {
    LayoutNode nodes[1000] = {};
    LayoutNode* ptrs[1000];
    for (int i = 0; i < 1000; i++) {
        nodes[i].req_width = 50;
        nodes[i].req_height = 20;
        ptrs[i] = &nodes[i];
    }

    LayoutNode root = {};
    root.type = LAYOUT_LINEAR_V;
    root.gap = 2;
    root.children = ptrs;
    root.child_count = 1000;

    BENCH("layout_1000_linear_v", 10000) {
        layout_compute(&root, 800, 600);
    } BENCH_END("layout_1000_linear_v", 10000)
    ASSERT_TRUE(true);
}

TEST(bench_render_100_rects) {
    SoftwareBackend sw(800, 600);
    Element elems[100];
    for (int i = 0; i < 100; i++) {
        elems[i] = elem_rect({(float)(i % 10) * 80, (float)(i / 10) * 60, 75, 55, COLOR_RED, COLOR_TRANSPARENT, 0, 0});
    }

    LayoutNode root = {};
    root.type = LAYOUT_COORDINATE;
    root.width = 800; root.height = 600;
    root.elements = elems;
    root.element_count = 100;

    BENCH("render_100_rects", 1000) {
        sw.begin_frame(800, 600);
        render_tree(&sw, &root);
        sw.end_frame();
    } BENCH_END("render_100_rects", 1000)
    ASSERT_TRUE(true);
}

TEST(bench_arena_alloc_10000) {
    Arena a = arena_create(1024 * 1024);
    BENCH("arena_10000_allocs", 1000) {
        arena_reset(&a);
        for (int i = 0; i < 10000; i++) {
            arena_alloc(&a, 64, 8);
        }
    } BENCH_END("arena_10000_allocs", 1000)
    arena_destroy(&a);
    ASSERT_TRUE(true);
}

// ═══════════════════════════════════════════════════════════════════════════════

int main() {
    return run_all_tests();
}
