#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/model/table.h"
#include "src/core/parser/csv.h"
#include "src/app/table_view.h"
#include "src/graphics/backend/software_backend.h"
#include <cstring>

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE VIEW RENDERING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

static Table* make_test_table(Arena* a) {
    const char* csv = "Name,Age,City\ntext,text,text\nAlice,30,London\nBob,25,Paris\nCharlie,35,Berlin";
    return csv_parse(a, arena_str_cstr(a, "Test"), csv, strlen(csv));
}

TEST(tableview_builds_tree) {
    Arena a = arena_create(64 * 1024);
    Table* t = make_test_table(&a);
    ASSERT_TRUE(t != nullptr);

    TableViewConfig cfg;
    LayoutNode* view = table_view_build(&a, t, cfg);
    ASSERT_TRUE(view != nullptr);
    ASSERT_TRUE(view->id != nullptr);
    ASSERT_TRUE(strcmp(view->id, "table-view") == 0);
    // Root has 2 children: header + scroll
    ASSERT_EQ(view->child_count, (uint16_t)2);
    arena_destroy(&a);
}

TEST(tableview_header_has_columns) {
    Arena a = arena_create(64 * 1024);
    Table* t = make_test_table(&a);
    TableViewConfig cfg;
    LayoutNode* view = table_view_build(&a, t, cfg);

    LayoutNode* header = view->children[0];
    ASSERT_TRUE(strcmp(header->id, "table-header") == 0);
    ASSERT_EQ(header->child_count, (uint16_t)3); // Name, Age, City
    arena_destroy(&a);
}

TEST(tableview_scroll_has_rows) {
    Arena a = arena_create(64 * 1024);
    Table* t = make_test_table(&a);
    TableViewConfig cfg;
    LayoutNode* view = table_view_build(&a, t, cfg);

    LayoutNode* scroll = view->children[1];
    ASSERT_TRUE(strcmp(scroll->id, "table-scroll") == 0);
    ASSERT_EQ(scroll->child_count, (uint16_t)3); // 3 data rows
    ASSERT_EQ(scroll->type, LAYOUT_SCROLL);
    arena_destroy(&a);
}

TEST(tableview_row_has_cells) {
    Arena a = arena_create(64 * 1024);
    Table* t = make_test_table(&a);
    TableViewConfig cfg;
    LayoutNode* view = table_view_build(&a, t, cfg);

    LayoutNode* scroll = view->children[1];
    LayoutNode* row0 = scroll->children[0];
    ASSERT_EQ(row0->child_count, (uint16_t)3); // 3 cells per row
    ASSERT_TRUE(strcmp(row0->id, "row-0") == 0);
    arena_destroy(&a);
}

TEST(tableview_computes_layout) {
    Arena a = arena_create(64 * 1024);
    Table* t = make_test_table(&a);
    TableViewConfig cfg;
    cfg.viewport_width = 400;
    cfg.viewport_height = 200;
    LayoutNode* view = table_view_build(&a, t, cfg);
    view->compute(400, 300);

    ASSERT_TRUE(view->width > 0);
    ASSERT_TRUE(view->height > 0);
    // Scroll viewport should match config
    LayoutNode* scroll = view->children[1];
    ASSERT_NEAR(scroll->width, 400.0f, 0.01f);
    ASSERT_NEAR(scroll->height, 200.0f, 0.01f);
    arena_destroy(&a);
}

TEST(tableview_renders_without_crash) {
    Arena a = arena_create(64 * 1024);
    Table* t = make_test_table(&a);
    TableViewConfig cfg;
    cfg.viewport_width = 300;
    cfg.viewport_height = 150;
    LayoutNode* view = table_view_build(&a, t, cfg);
    view->compute(300, 200);

    SoftwareBackend sw(300, 200);
    sw.begin_frame(300, 200);
    view->render(&sw);
    sw.end_frame();

    // Header area should have header_bg color
    Color hdr = sw.get_pixel(50, 15);
    ASSERT_EQ(hdr.r, cfg.header_bg.r);
    ASSERT_EQ(hdr.g, cfg.header_bg.g);
    arena_destroy(&a);
}

TEST(tableview_cells_have_content) {
    Arena a = arena_create(64 * 1024);
    Table* t = make_test_table(&a);
    TableViewConfig cfg;
    LayoutNode* view = table_view_build(&a, t, cfg);

    // Check that cells have text elements
    LayoutNode* scroll = view->children[1];
    LayoutNode* row0 = scroll->children[0];
    LayoutNode* cell0 = row0->children[0];
    ASSERT_TRUE(cell0->element_count >= 2); // bg + text
    ASSERT_EQ(cell0->elements[1].type, ELEM_TEXT);
    ASSERT_TRUE(cell0->elements[1].text.content != nullptr);
    // First cell of first row should be "Alice"
    ASSERT_TRUE(strcmp(cell0->elements[1].text.content, "Alice") == 0);
    arena_destroy(&a);
}

TEST(tableview_scroll_clips_rows) {
    Arena a = arena_create(64 * 1024);
    Table* t = make_test_table(&a);
    TableViewConfig cfg;
    cfg.viewport_width = 300;
    cfg.viewport_height = 40; // only ~1 row visible
    cfg.cell_height = 28;
    LayoutNode* view = table_view_build(&a, t, cfg);
    view->compute(300, 100);

    SoftwareBackend sw(300, 100);
    sw.begin_frame(300, 100);
    view->render(&sw);
    sw.end_frame();

    // Below scroll viewport should be clipped (transparent)
    // Header is ~30px, scroll viewport is 40px, so y=75 should be empty
    Color c = sw.get_pixel(50, 75);
    ASSERT_EQ(c.a, (uint8_t)0);
    arena_destroy(&a);
}

TEST(tableview_hit_test_finds_row) {
    Arena a = arena_create(64 * 1024);
    Table* t = make_test_table(&a);
    TableViewConfig cfg;
    cfg.viewport_width = 400;
    cfg.viewport_height = 200;
    cfg.header_height = 30;
    cfg.cell_height = 28;
    LayoutNode* view = table_view_build(&a, t, cfg);
    view->compute(400, 300);

    // Click on first data row (y = header_height + a bit)
    HitResult deep[16];
    int n = view->hit_deep(50, 40, deep, 16);
    ASSERT_TRUE(n >= 2);
    // Should find "table-scroll" and "row-0" in the hierarchy
    bool found_row = false;
    for (int i = 0; i < n; i++)
        if (deep[i].node->id && strcmp(deep[i].node->id, "row-0") == 0)
            found_row = true;
    ASSERT_TRUE(found_row);
    arena_destroy(&a);
}

TEST(tableview_empty_table) {
    Arena a = arena_create(16 * 1024);
    const char* csv = "Col1,Col2\ntext,text";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "Empty"), csv, strlen(csv));
    ASSERT_TRUE(t != nullptr);
    ASSERT_EQ(t->row_count, (uint32_t)0);

    TableViewConfig cfg;
    LayoutNode* view = table_view_build(&a, t, cfg);
    view->compute(300, 200);

    // Should not crash, scroll has 0 children
    LayoutNode* scroll = view->children[1];
    ASSERT_EQ(scroll->child_count, (uint16_t)0);

    SoftwareBackend sw(300, 200);
    sw.begin_frame(300, 200);
    view->render(&sw);
    sw.end_frame();
    ASSERT_TRUE(true); // no crash
    arena_destroy(&a);
}

TEST(tableview_single_cell) {
    Arena a = arena_create(16 * 1024);
    const char* csv = "Val\ntext\n42";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "Single"), csv, strlen(csv));
    TableViewConfig cfg;
    LayoutNode* view = table_view_build(&a, t, cfg);
    view->compute(200, 200);

    LayoutNode* scroll = view->children[1];
    ASSERT_EQ(scroll->child_count, (uint16_t)1);
    LayoutNode* row = scroll->children[0];
    ASSERT_EQ(row->child_count, (uint16_t)1);
    arena_destroy(&a);
}

TEST(tableview_many_rows) {
    Arena a = arena_create(512 * 1024);
    // Build CSV with 100 rows
    char csv_buf[8192];
    int pos = snprintf(csv_buf, sizeof(csv_buf), "A,B\ntext,text\n");
    for (int i = 0; i < 100; i++)
        pos += snprintf(csv_buf + pos, sizeof(csv_buf) - pos, "val%d,data%d\n", i, i);
    Table* t = csv_parse(&a, arena_str_cstr(&a, "Big"), csv_buf, pos);
    ASSERT_EQ(t->row_count, (uint32_t)100);

    TableViewConfig cfg;
    cfg.viewport_height = 200;
    LayoutNode* view = table_view_build(&a, t, cfg);
    view->compute(400, 300);

    LayoutNode* scroll = view->children[1];
    ASSERT_EQ(scroll->child_count, (uint16_t)100);
    ASSERT_TRUE(scroll->content_height > 200); // content exceeds viewport
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCROLL ISOLATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(tableview_two_scrolls_independent) {
    Arena a = arena_create(64 * 1024);
    LayoutNode ca[3] = {}; LayoutNode* ca_p[3];
    for (int i = 0; i < 3; i++) { ca[i].req_width = 80; ca[i].req_height = 30; ca_p[i] = &ca[i]; }
    LayoutNode scrollA = {}; scrollA.type = LAYOUT_SCROLL; scrollA.req_width = 100; scrollA.req_height = 50;
    scrollA.children = ca_p; scrollA.child_count = 3; scrollA.id = "scrollA";

    LayoutNode cb[3] = {}; LayoutNode* cb_p[3];
    for (int i = 0; i < 3; i++) { cb[i].req_width = 80; cb[i].req_height = 30; cb_p[i] = &cb[i]; }
    LayoutNode scrollB = {}; scrollB.type = LAYOUT_SCROLL; scrollB.req_width = 100; scrollB.req_height = 50;
    scrollB.children = cb_p; scrollB.child_count = 3; scrollB.id = "scrollB";

    LayoutNode* rk[] = {&scrollA, &scrollB};
    LayoutNode root = {}; root.type = LAYOUT_LINEAR; root.direction = LINEAR_VERTICAL; root.gap = 10;
    root.children = rk; root.child_count = 2;
    root.compute(200, 200);

    HitResult d[8]; int n;
    n = root.hit_deep(50, 25, d, 8);
    LayoutNode* hs = nullptr;
    for (int i = n-1; i >= 0; i--) if (d[i].node->type == LAYOUT_SCROLL) { hs = d[i].node; break; }
    ASSERT_TRUE(hs == &scrollA);

    n = root.hit_deep(50, 75, d, 8);
    hs = nullptr;
    for (int i = n-1; i >= 0; i--) if (d[i].node->type == LAYOUT_SCROLL) { hs = d[i].node; break; }
    ASSERT_TRUE(hs == &scrollB);

    scrollA.scroll_y = 15;
    ASSERT_NEAR(scrollB.scroll_y, 0.0f, 0.01f);
    arena_destroy(&a);
}

TEST(tableview_scroll_not_hit_when_outside) {
    Arena a = arena_create(32 * 1024);
    LayoutNode c = {}; c.req_width = 80; c.req_height = 200; LayoutNode* cp[] = {&c};
    LayoutNode scroll = {}; scroll.type = LAYOUT_SCROLL; scroll.req_width = 100; scroll.req_height = 50;
    scroll.children = cp; scroll.child_count = 1; scroll.id = "scroll";
    LayoutNode other = {}; other.req_width = 100; other.req_height = 50; other.id = "other";
    LayoutNode* rk[] = {&scroll, &other};
    LayoutNode root = {}; root.type = LAYOUT_LINEAR; root.direction = LINEAR_VERTICAL; root.gap = 10;
    root.children = rk; root.child_count = 2;
    root.compute(200, 200);

    HitResult d[8]; int n = root.hit_deep(50, 80, d, 8);
    LayoutNode* hs = nullptr;
    for (int i = n-1; i >= 0; i--) if (d[i].node->type == LAYOUT_SCROLL) { hs = d[i].node; break; }
    ASSERT_EQ(hs, (LayoutNode*)nullptr);
    arena_destroy(&a);
}

TEST(tableview_nested_scroll_innermost_hit) {
    Arena a = arena_create(64 * 1024);
    LayoutNode leaf = {}; leaf.req_width = 80; leaf.req_height = 200; LayoutNode* lp[] = {&leaf};
    LayoutNode inner = {}; inner.type = LAYOUT_SCROLL; inner.req_width = 100; inner.req_height = 40;
    inner.children = lp; inner.child_count = 1; inner.id = "inner";
    LayoutNode* ip[] = {&inner};
    LayoutNode outer = {}; outer.type = LAYOUT_SCROLL; outer.req_width = 120; outer.req_height = 80;
    outer.children = ip; outer.child_count = 1; outer.id = "outer";
    outer.compute(200, 200);

    HitResult d[8]; int n = outer.hit_deep(50, 20, d, 8);
    LayoutNode* hs = nullptr;
    for (int i = n-1; i >= 0; i--) if (d[i].node->type == LAYOUT_SCROLL) { hs = d[i].node; break; }
    ASSERT_TRUE(hs == &inner);
    arena_destroy(&a);
}

TEST(tableview_scroll_clamp_bounds) {
    Arena a = arena_create(16 * 1024);
    LayoutNode c = {}; c.req_width = 80; c.req_height = 100; LayoutNode* cp[] = {&c};
    LayoutNode scroll = {}; scroll.type = LAYOUT_SCROLL; scroll.req_width = 100; scroll.req_height = 50;
    scroll.children = cp; scroll.child_count = 1;
    scroll.compute(200, 200);

    float max_s = scroll.content_height - scroll.height;
    ASSERT_NEAR(max_s, 50.0f, 0.01f);
    scroll.scroll_y = 999; if (scroll.scroll_y > max_s) scroll.scroll_y = max_s;
    ASSERT_NEAR(scroll.scroll_y, 50.0f, 0.01f);
    scroll.scroll_y = -100; if (scroll.scroll_y < 0) scroll.scroll_y = 0;
    ASSERT_NEAR(scroll.scroll_y, 0.0f, 0.01f);
    arena_destroy(&a);
}

TEST(tableview_scroll_hit_with_offset) {
    Arena a = arena_create(32 * 1024);
    LayoutNode c1 = {}; c1.req_width = 80; c1.req_height = 50; c1.id = "c1";
    LayoutNode c2 = {}; c2.req_width = 80; c2.req_height = 50; c2.id = "c2";
    LayoutNode* kids[] = {&c1, &c2};
    LayoutNode scroll = {}; scroll.type = LAYOUT_SCROLL; scroll.req_width = 100; scroll.req_height = 50;
    scroll.children = kids; scroll.child_count = 2;
    scroll.compute(200, 200);

    HitResult r = scroll.hit_surface(50, 25);
    ASSERT_TRUE(r.node == &c1);
    scroll.scroll_y = 50;
    r = scroll.hit_surface(50, 25);
    ASSERT_TRUE(r.node == &c2);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARK
// ═══════════════════════════════════════════════════════════════════════════════

TEST(bench_tableview_100_rows) {
    Arena a = arena_create(1024 * 1024);
    char csv_buf[16384];
    int pos = snprintf(csv_buf, sizeof(csv_buf), "A,B,C,D\ntext,text,text,text\n");
    for (int i = 0; i < 100; i++)
        pos += snprintf(csv_buf + pos, sizeof(csv_buf) - pos, "v%d,d%d,x%d,y%d\n", i, i, i, i);
    Table* t = csv_parse(&a, arena_str_cstr(&a, "B"), csv_buf, pos);

    TableViewConfig cfg;
    BENCH("table_view_build+compute 100 rows", 1000) {
        arena_reset(&a);
        t = csv_parse(&a, arena_str_cstr(&a, "B"), csv_buf, pos);
        LayoutNode* view = table_view_build(&a, t, cfg);
        view->compute(600, 400);
    } BENCH_END("table_view_build+compute 100 rows", 1000)
    arena_destroy(&a);
    ASSERT_TRUE(true);
}

// ═══════════════════════════════════════════════════════════════════════════════

int main() {
    return run_all_tests();
}
