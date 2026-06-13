#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/str.h"
#include "src/core/model/table.h"
#include "src/core/model/graph.h"
#include "src/core/parser/csv.h"
#include "src/core/search.h"
#include "src/app/nav_tree.h"
#include "src/app/tab_strip.h"
#include "src/app/workspace.h"
#include "src/app/table_view.h"
#include "src/graphics/layout/layout.h"
#include <cstring>

// ══════════════════════════════════════════════════════════════════════════════
// Search tests
// ══════════════════════════════════════════════════════════════════════════════

TEST(search_substring_basic) {
    Arena a = arena_create(32768);
    const char* csv = "Name,City\ntext,text\nAlice,London\nBob,Berlin\nCharlie,London";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    SearchResult r = search_table(&a, t, "london", 6);
    ASSERT_EQ(r.count, (uint32_t)2);
    ASSERT_EQ(r.hits[0].row, (uint32_t)0);
    ASSERT_EQ(r.hits[0].col, (uint16_t)1);
    ASSERT_EQ(r.hits[1].row, (uint32_t)2);
    arena_destroy(&a);
}

TEST(search_substring_case_insensitive) {
    Arena a = arena_create(32768);
    const char* csv = "Name,Value\ntext,text\nFoo,HELLO\nBar,hello\nBaz,HeLLo";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    SearchResult r = search_table(&a, t, "HELLO", 5);
    ASSERT_EQ(r.count, (uint32_t)3);
    arena_destroy(&a);
}

TEST(search_substring_no_match) {
    Arena a = arena_create(32768);
    const char* csv = "Name\ntext\nAlice\nBob";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    SearchResult r = search_table(&a, t, "xyz", 3);
    ASSERT_EQ(r.count, (uint32_t)0);
    arena_destroy(&a);
}

TEST(search_substring_empty_query) {
    Arena a = arena_create(32768);
    const char* csv = "Name\ntext\nAlice";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    SearchResult r = search_table(&a, t, "", 0);
    ASSERT_EQ(r.count, (uint32_t)0);
    arena_destroy(&a);
}

TEST(search_substring_partial_match) {
    Arena a = arena_create(32768);
    const char* csv = "Word\ntext\nhello_world\nworld_peace\nunderworld";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    SearchResult r = search_table(&a, t, "world", 5);
    ASSERT_EQ(r.count, (uint32_t)3);
    ASSERT_EQ(r.hits[0].match_offset, (uint16_t)6);
    arena_destroy(&a);
}

TEST(search_identifier_basic) {
    Arena a = arena_create(32768);
    const char* csv = "Var\ntext\nfoo_bar\nfoo\nfoobar";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    SearchResult r = search_table_identifier(&a, t, "foo", 3);
    ASSERT_EQ(r.count, (uint32_t)1);
    ASSERT_EQ(r.hits[0].row, (uint32_t)1);
    arena_destroy(&a);
}

TEST(search_identifier_at_boundaries) {
    Arena a = arena_create(32768);
    const char* csv = "Expr\ntext\nx + y\n2*x+3\nx_var";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    SearchResult r = search_table_identifier(&a, t, "x", 1);
    ASSERT_EQ(r.count, (uint32_t)2);
    arena_destroy(&a);
}

TEST(search_max_hits_limit) {
    Arena a = arena_create(65536);
    const char* csv = "V\ntext\naaa\naaa\naaa\naaa\naaa\naaa\naaa\naaa\naaa\naaa";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    SearchResult r = search_table(&a, t, "aaa", 3, 3);
    ASSERT_EQ(r.count, (uint32_t)3);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Graph neighbourhood tests
// ══════════════════════════════════════════════════════════════════════════════

TEST(graph_neighbours_depth_1) {
    Arena a = arena_create(16384);
    Graph g; g.init(&a, "test");
    g.add_node("A", "A"); g.add_node("B", "B");
    g.add_node("C", "C"); g.add_node("D", "D");
    g.add_edge(0, 1); g.add_edge(1, 2); g.add_edge(2, 3);
    NeighbourResult nr = graph_neighbours(&a, &g, 0, 1);
    ASSERT_EQ(nr.count, (uint16_t)2);
    arena_destroy(&a);
}

TEST(graph_neighbours_depth_2) {
    Arena a = arena_create(16384);
    Graph g; g.init(&a, "test");
    g.add_node("A", "A"); g.add_node("B", "B");
    g.add_node("C", "C"); g.add_node("D", "D");
    g.add_edge(0, 1); g.add_edge(1, 2); g.add_edge(2, 3);
    NeighbourResult nr = graph_neighbours(&a, &g, 0, 2);
    ASSERT_EQ(nr.count, (uint16_t)3);
    arena_destroy(&a);
}

TEST(graph_neighbours_all) {
    Arena a = arena_create(16384);
    Graph g; g.init(&a, "test");
    g.add_node("A", "A"); g.add_node("B", "B"); g.add_node("C", "C");
    g.add_edge(0, 1); g.add_edge(1, 2);
    NeighbourResult nr = graph_neighbours(&a, &g, 0, 10);
    ASSERT_EQ(nr.count, (uint16_t)3);
    arena_destroy(&a);
}

TEST(graph_neighbours_disconnected) {
    Arena a = arena_create(16384);
    Graph g; g.init(&a, "test");
    g.add_node("A", "A"); g.add_node("B", "B"); g.add_node("C", "C");
    g.add_edge(0, 2); // A-C only, B disconnected
    NeighbourResult nr = graph_neighbours(&a, &g, 0, 5);
    ASSERT_EQ(nr.count, (uint16_t)2);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Cross-table join tests
// ══════════════════════════════════════════════════════════════════════════════

TEST(join_basic) {
    Arena a = arena_create(32768);
    const char* csv_a = "Name,Dept\ntext,text\nAlice,Eng\nBob,Sales";
    const char* csv_b = "Dept,Budget\ntext,text\nEng,100k\nSales,50k\nHR,30k";
    Table* ta = csv_parse(&a, arena_str_cstr(&a, "a"), csv_a, strlen(csv_a));
    Table* tb = csv_parse(&a, arena_str_cstr(&a, "b"), csv_b, strlen(csv_b));
    JoinResult jr = search_join(&a, ta, 1, tb, 0);
    ASSERT_EQ(jr.count, (uint32_t)2);
    ASSERT_EQ(jr.hits[0].row_a, (uint32_t)0);
    ASSERT_EQ(jr.hits[0].row_b, (uint32_t)0);
    ASSERT_EQ(jr.hits[1].row_a, (uint32_t)1);
    ASSERT_EQ(jr.hits[1].row_b, (uint32_t)1);
    arena_destroy(&a);
}

TEST(join_no_match) {
    Arena a = arena_create(32768);
    const char* csv_a = "Name\ntext\nAlice";
    const char* csv_b = "Name\ntext\nBob";
    Table* ta = csv_parse(&a, arena_str_cstr(&a, "a"), csv_a, strlen(csv_a));
    Table* tb = csv_parse(&a, arena_str_cstr(&a, "b"), csv_b, strlen(csv_b));
    JoinResult jr = search_join(&a, ta, 0, tb, 0);
    ASSERT_EQ(jr.count, (uint32_t)0);
    arena_destroy(&a);
}

TEST(join_multiple_matches) {
    Arena a = arena_create(32768);
    const char* csv_a = "Tag\ntext\nX\nX\nY";
    const char* csv_b = "Tag\ntext\nX\nX";
    Table* ta = csv_parse(&a, arena_str_cstr(&a, "a"), csv_a, strlen(csv_a));
    Table* tb = csv_parse(&a, arena_str_cstr(&a, "b"), csv_b, strlen(csv_b));
    JoinResult jr = search_join(&a, ta, 0, tb, 0);
    ASSERT_EQ(jr.count, (uint32_t)4);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Navigation tree tests
// ══════════════════════════════════════════════════════════════════════════════

TEST(nav_tree_basic) {
    Arena a = arena_create(16384);
    NavTree tree; tree.init(&a);
    NavNode* tables = tree.add_root(&a, "Tables", "tables");
    NavTree::add_child(&a, tables, "People.csv", "people", 0);
    NavTree::add_child(&a, tables, "Products.csv", "products", 0);
    ASSERT_EQ(tree.root_count, (uint16_t)1);
    ASSERT_EQ(tables->child_count, (uint16_t)2);
    ASSERT_TRUE(strcmp(tables->children[0].label, "People.csv") == 0);
    arena_destroy(&a);
}

TEST(nav_tree_toggle) {
    Arena a = arena_create(16384);
    NavTree tree; tree.init(&a);
    NavNode* root = tree.add_root(&a, "Root", "root");
    NavTree::add_child(&a, root, "Child", "child", 0);
    ASSERT_TRUE(root->expanded == true);
    tree.toggle("root");
    ASSERT_TRUE(root->expanded == false);
    tree.toggle("root");
    ASSERT_TRUE(root->expanded == true);
    arena_destroy(&a);
}

TEST(nav_tree_deep_find) {
    Arena a = arena_create(16384);
    NavTree tree; tree.init(&a);
    NavNode* r = tree.add_root(&a, "R", "r");
    NavNode* c = NavTree::add_child(&a, r, "C", "c");
    NavTree::add_child(&a, c, "D", "deep", 0);
    NavNode* found = tree.toggle("deep");
    ASSERT_TRUE(found != nullptr);
    ASSERT_TRUE(strcmp(found->label, "D") == 0);
    arena_destroy(&a);
}

TEST(nav_tree_render) {
    Arena a = arena_create(65536);
    NavTree tree; tree.init(&a);
    NavNode* r = tree.add_root(&a, "Tables", "tables");
    NavTree::add_child(&a, r, "Data.csv", "data", 0);
    LayoutNode* node = nav_tree_build(&a, &tree, 200, 100);
    ASSERT_TRUE(node != nullptr);
    ASSERT_EQ(node->type, LAYOUT_SCROLL);
    node->compute(200, 100);
    ASSERT_NEAR(node->width, 200.0f, 0.1f);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab strip tests
// ══════════════════════════════════════════════════════════════════════════════

TEST(tab_open_activate) {
    Arena a = arena_create(8192);
    TabStrip ts; ts.init(&a);
    ts.open("Table A", "tab-a");
    ts.open("Graph B", "tab-b");
    ASSERT_EQ(ts.count, (uint16_t)2);
    ASSERT_EQ(ts.active_index, (uint16_t)1);
    ASSERT_TRUE(ts.tabs[1].active);
    ASSERT_TRUE(!ts.tabs[0].active);
    arena_destroy(&a);
}

TEST(tab_switch) {
    Arena a = arena_create(8192);
    TabStrip ts; ts.init(&a);
    ts.open("A", "a"); ts.open("B", "b");
    ts.activate(0);
    ASSERT_EQ(ts.active_index, (uint16_t)0);
    ASSERT_TRUE(ts.tabs[0].active);
    ASSERT_TRUE(!ts.tabs[1].active);
    arena_destroy(&a);
}

TEST(tab_close_active) {
    Arena a = arena_create(8192);
    TabStrip ts; ts.init(&a);
    ts.open("A", "a"); ts.open("B", "b"); ts.open("C", "c");
    ts.close(2);
    ASSERT_EQ(ts.count, (uint16_t)2);
    ASSERT_EQ(ts.active_index, (uint16_t)1);
    ASSERT_TRUE(ts.tabs[1].active);
    arena_destroy(&a);
}

TEST(tab_close_inactive) {
    Arena a = arena_create(8192);
    TabStrip ts; ts.init(&a);
    ts.open("A", "a"); ts.open("B", "b"); ts.open("C", "c");
    ts.close(0);
    ASSERT_EQ(ts.count, (uint16_t)2);
    ASSERT_EQ(ts.active_index, (uint16_t)1);
    ASSERT_TRUE(strcmp(ts.tabs[1].id, "c") == 0);
    arena_destroy(&a);
}

TEST(tab_reopen_existing) {
    Arena a = arena_create(8192);
    TabStrip ts; ts.init(&a);
    ts.open("A", "a"); ts.open("B", "b");
    int idx = ts.open("A", "a");
    ASSERT_EQ(ts.count, (uint16_t)2);
    ASSERT_EQ(idx, 0);
    ASSERT_EQ(ts.active_index, (uint16_t)0);
    arena_destroy(&a);
}

TEST(tab_close_last) {
    Arena a = arena_create(8192);
    TabStrip ts; ts.init(&a);
    ts.open("A", "a");
    ts.close(0);
    ASSERT_EQ(ts.count, (uint16_t)0);
    ASSERT_EQ(ts.active_index, UINT16_MAX);
    arena_destroy(&a);
}

TEST(tab_strip_render) {
    Arena a = arena_create(32768);
    TabStrip ts; ts.init(&a);
    ts.open("Table", "t1"); ts.open("Graph", "t2");
    LayoutNode* node = tab_strip_build(&a, &ts, 400);
    ASSERT_TRUE(node != nullptr);
    node->compute(400, 26);
    ASSERT_EQ(node->child_count, (uint16_t)2);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Workspace tests
// ══════════════════════════════════════════════════════════════════════════════

TEST(workspace_mount_unmount) {
    Arena a = arena_create(32768);
    Workspace ws; ws.init(&a);
    int dummy_table = 42;
    ws.mount("People", "people", VIEW_TABLE, &dummy_table);
    ASSERT_EQ(ws.view_count, (uint16_t)1);
    ASSERT_EQ(ws.tabs.count, (uint16_t)1);
    ASSERT_TRUE(ws.active_view() != nullptr);
    ASSERT_EQ(ws.active_view()->type, VIEW_TABLE);
    ws.unmount("people");
    ASSERT_EQ(ws.view_count, (uint16_t)0);
    ASSERT_EQ(ws.tabs.count, (uint16_t)0);
    arena_destroy(&a);
}

TEST(workspace_multiple_views) {
    Arena a = arena_create(32768);
    Workspace ws; ws.init(&a);
    int d1 = 1, d2 = 2;
    ws.mount("Table", "t", VIEW_TABLE, &d1);
    ws.mount("Graph", "g", VIEW_GRAPH, &d2);
    ASSERT_EQ(ws.view_count, (uint16_t)2);
    ASSERT_EQ(ws.tabs.active_index, (uint16_t)1);
    ASSERT_EQ(ws.active_view()->type, VIEW_GRAPH);
    ws.tabs.activate(0);
    ASSERT_EQ(ws.active_view()->type, VIEW_TABLE);
    arena_destroy(&a);
}

TEST(workspace_invalidate) {
    Arena a = arena_create(32768);
    Workspace ws; ws.init(&a);
    int d = 0;
    ws.mount("X", "x", VIEW_TABLE, &d);
    ws.active_view()->cached_tree = (LayoutNode*)0x1234;
    ws.invalidate("x");
    ASSERT_TRUE(ws.active_view()->cached_tree == nullptr);
    arena_destroy(&a);
}

TEST(workspace_remount_updates_data) {
    Arena a = arena_create(32768);
    Workspace ws; ws.init(&a);
    int d1 = 1, d2 = 2;
    ws.mount("X", "x", VIEW_TABLE, &d1);
    ws.mount("X", "x", VIEW_TABLE, &d2);
    ASSERT_EQ(ws.view_count, (uint16_t)1);
    ASSERT_TRUE(ws.active_view()->data == &d2);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Benchmark: search across large table
// ══════════════════════════════════════════════════════════════════════════════

TEST(bench_search_large_table) {
    Arena a = arena_create(4 * 1024 * 1024);
    Column cols[10];
    for (int i = 0; i < 10; i++) {
        char* name = (char*)arena_alloc(&a, 8, 1);
        snprintf(name, 8, "c%d", i);
        cols[i] = {arena_str_cstr(&a, name), arena_str_cstr(&a, "text")};
    }
    Table* t = table_create(&a, arena_str_cstr(&a, "big"), cols, 10, 1024);
    for (int r = 0; r < 1000; r++) {
        table_append_row(&a, t);
        for (int c = 0; c < 10; c++) {
            char buf[32];
            snprintf(buf, 32, "val_%d_%d", r, c);
            table_set_cell(&a, t, r, c, arena_str_cstr(&a, buf));
        }
    }

    Arena ba = arena_create(65536);
    BENCH("search 10k cells (exact match)", 100) {
        arena_reset(&ba);
        SearchResult res = search_table(&ba, t, "val_500_5", 9, 1024);
        (void)res;
    } BENCH_END("search 10k cells (exact match)", 100);

    BENCH("search 10k cells (many matches)", 100) {
        arena_reset(&ba);
        SearchResult res = search_table(&ba, t, "val_5", 5, 2048);
        (void)res;
    } BENCH_END("search 10k cells (many matches)", 100);

    arena_destroy(&ba);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════

int main() {
    return run_all_tests();
}
