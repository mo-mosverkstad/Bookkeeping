#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/str.h"
#include "src/core/model/table.h"
#include "src/core/model/graph.h"
#include "src/core/parser/csv.h"
#include "src/core/search.h"
#include "src/core/file_io.h"
#include "src/app/table_view.h"
#include "src/app/table_editor.h"
#include "src/app/table_sort.h"
#include "src/app/nav_tree.h"
#include "src/app/tab_strip.h"
#include "src/app/workspace.h"
#include "src/app/graph_view.h"
#include "src/graphics/layout/layout.h"
#include "src/graphics/backend/software_backend.h"
#include <cstring>
#include <cstdio>
#include <chrono>
#include <unistd.h>

// ══════════════════════════════════════════════════════════════════════════════
// Column sorting tests
// ══════════════════════════════════════════════════════════════════════════════

TEST(sort_ascending) {
    Arena a = arena_create(32768);
    const char* csv = "Name,Age\ntext,text\nCharlie,35\nAlice,30\nBob,25";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    table_sort(t, 0, 0); // sort by Name ascending
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "Alice"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "Bob"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 2, 0), "Charlie"));
    arena_destroy(&a);
}

TEST(sort_descending) {
    Arena a = arena_create(32768);
    const char* csv = "Name,Age\ntext,text\nAlice,30\nBob,25\nCharlie,35";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    table_sort(t, 0, 1); // sort by Name descending
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "Charlie"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "Bob"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 2, 0), "Alice"));
    arena_destroy(&a);
}

TEST(sort_numeric_as_string) {
    Arena a = arena_create(32768);
    const char* csv = "Val\ntext\n9\n10\n2\n100";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    table_sort(t, 0, 0); // lexicographic
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "10"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "100"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 2, 0), "2"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 3, 0), "9"));
    arena_destroy(&a);
}

TEST(sort_preserves_other_columns) {
    Arena a = arena_create(32768);
    const char* csv = "Name,City\ntext,text\nBob,Paris\nAlice,London";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    table_sort(t, 0, 0);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 1), "London")); // Alice's city
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 1), "Paris"));  // Bob's city
    arena_destroy(&a);
}

TEST(sort_single_row) {
    Arena a = arena_create(16384);
    const char* csv = "X\ntext\nonly";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    table_sort(t, 0, 0); // should not crash
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "only"));
    arena_destroy(&a);
}

TEST(sort_empty_values) {
    Arena a = arena_create(32768);
    const char* csv = "X\ntext\nB\n\nA";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    table_sort(t, 0, 0);
    // Empty strings sort before non-empty
    ASSERT_EQ(t->row_count, (uint32_t)3);
    ASSERT_EQ(table_get_cell(t, 0, 0).len, (uint32_t)0);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "A"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 2, 0), "B"));
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Row reorder tests (using table_move_row)
// ══════════════════════════════════════════════════════════════════════════════

TEST(row_reorder_down) {
    Arena a = arena_create(32768);
    const char* csv = "Name\ntext\nA\nB\nC\nD";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    table_move_row(t, 0, 2); // move A from pos 0 to pos 2
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "B"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "C"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 2, 0), "A"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 3, 0), "D"));
    arena_destroy(&a);
}

TEST(row_reorder_up) {
    Arena a = arena_create(32768);
    const char* csv = "Name\ntext\nA\nB\nC\nD";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    table_move_row(t, 3, 1); // move D from pos 3 to pos 1
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "A"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "D"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 2, 0), "B"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 3, 0), "C"));
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// End-to-end integration tests
// ══════════════════════════════════════════════════════════════════════════════

TEST(e2e_load_edit_sort_save) {
    Arena a = arena_create(65536);
    // Simulate: load CSV → edit cell → sort → save → reload → verify
    const char* csv = "Name,Score\ntext,text\nCharlie,80\nAlice,95\nBob,70";
    const char* path = "/tmp/bk_e2e_test.csv";
    file_write(path, csv, strlen(csv));

    Table* t = file_load_csv(&a, path);
    ASSERT_TRUE(t != nullptr);

    // Edit Alice's score
    table_set_cell(&a, t, 1, 1, arena_str_cstr(&a, "99"));

    // Sort by Name ascending
    table_sort(t, 0, 0);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "Alice"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 1), "99")); // edited value follows

    // Save
    file_save_csv(&a, t, path);

    // Reload and verify
    Table* t2 = file_load_csv(&a, path);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t2, 0, 0), "Alice"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t2, 0, 1), "99"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t2, 1, 0), "Bob"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t2, 2, 0), "Charlie"));
    arena_destroy(&a);
    unlink(path);
}

TEST(e2e_edit_undo_redo) {
    Arena a = arena_create(65536);
    const char* csv = "X\ntext\nA\nB\nC";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));

    TableEditor ed;
    ed.init(&a, t);

    // Edit cell [0,0] from "A" to "Z"
    ed.begin_edit(0, 0);
    ed.edit_buffer[0] = 'Z'; ed.edit_len = 1; ed.cursor_pos = 1;
    ed.commit_edit();
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "Z"));

    // Undo
    ed.undo();
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "A"));

    // Redo
    ed.redo();
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "Z"));
    arena_destroy(&a);
}

TEST(e2e_search_then_edit) {
    Arena a = arena_create(65536);
    const char* csv = "Name,City\ntext,text\nAlice,London\nBob,Paris\nCharlie,London";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));

    // Search for "London"
    SearchResult r = search_table(&a, t, "London", 6);
    ASSERT_EQ(r.count, (uint32_t)2);

    // Edit first result
    table_set_cell(&a, t, r.hits[0].row, r.hits[0].col, arena_str_cstr(&a, "Berlin"));

    // Re-search: only 1 result now
    SearchResult r2 = search_table(&a, t, "London", 6);
    ASSERT_EQ(r2.count, (uint32_t)1);
    arena_destroy(&a);
}

TEST(e2e_workspace_multi_table) {
    Arena a = arena_create(65536);
    const char* csv1 = "A\ntext\n1\n2";
    const char* csv2 = "B\ntext\n3\n4";
    Table* t1 = csv_parse(&a, arena_str_cstr(&a, "t1"), csv1, strlen(csv1));
    Table* t2 = csv_parse(&a, arena_str_cstr(&a, "t2"), csv2, strlen(csv2));

    Workspace ws; ws.init(&a);
    ws.mount("T1", "t1", VIEW_TABLE, t1);
    ws.mount("T2", "t2", VIEW_TABLE, t2);

    // Active is T2
    ASSERT_EQ(ws.active_view()->type, VIEW_TABLE);
    ASSERT_TRUE(str_eq_cstr(table_get_cell((Table*)ws.active_view()->data, 0, 0), "3"));

    // Switch to T1
    ws.tabs.activate(0);
    ASSERT_TRUE(str_eq_cstr(table_get_cell((Table*)ws.active_view()->data, 0, 0), "1"));

    // Close T1
    ws.unmount("t1");
    ASSERT_EQ(ws.view_count, (uint16_t)2); // views kept
    ASSERT_TRUE(str_eq_cstr(table_get_cell((Table*)ws.active_view()->data, 0, 0), "3"));
    arena_destroy(&a);
}

TEST(e2e_graph_neighbourhood_search) {
    Arena a = arena_create(32768);
    Graph g; g.init(&a, "test");
    g.add_node("A", "A"); g.add_node("B", "B"); g.add_node("C", "C");
    g.add_node("D", "D"); g.add_node("E", "E");
    g.add_edge(0, 1); g.add_edge(1, 2); g.add_edge(2, 3); g.add_edge(3, 4);

    // From A, depth 2: {A, B, C}
    NeighbourResult nr = graph_neighbours(&a, &g, 0, 2);
    ASSERT_EQ(nr.count, (uint16_t)3);

    // From C, depth 1: {C, B, D}
    NeighbourResult nr2 = graph_neighbours(&a, &g, 2, 1);
    ASSERT_EQ(nr2.count, (uint16_t)3);
    arena_destroy(&a);
}

TEST(e2e_render_full_ui) {
    Arena a = arena_create(128 * 1024);
    // Build a full workspace UI and render to software backend
    const char* csv = "Name,Age\ntext,text\nAlice,30\nBob,25";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));

    TableViewConfig cfg;
    cfg.viewport_width = 400; cfg.viewport_height = 100;
    LayoutNode* tv = table_view_build(&a, t, cfg);
    tv->compute(400, 200);

    SoftwareBackend sw(400, 200);
    sw.begin_frame(400, 200);
    render_tree(&sw, tv);
    sw.end_frame();

    // Verify some pixels are non-transparent (something rendered)
    bool has_content = false;
    for (int y = 0; y < 200 && !has_content; y++)
        for (int x = 0; x < 400 && !has_content; x++)
            if (sw.get_pixel(x, y).a > 0) has_content = true;
    ASSERT_TRUE(has_content);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Performance: startup benchmark
// ══════════════════════════════════════════════════════════════════════════════

TEST(bench_startup_to_first_frame) {
    BENCH("full startup (arena+parse+layout+render)", 100) {
        Arena a = arena_create(128 * 1024);
        const char* csv = "Name,Age,City,Skill\ntext,text,text,text\nAlice,30,London,C++\nBob,25,Paris,Rust\nCharlie,35,Berlin,Go\nDiana,28,Tokyo,Java\nEve,32,NYC,Python";
        Table* t = csv_parse(&a, arena_str_cstr(&a, "demo"), csv, strlen(csv));
        TableViewConfig cfg; cfg.viewport_width = 600; cfg.viewport_height = 400;
        LayoutNode* root = table_view_build(&a, t, cfg);
        root->compute(600, 400);
        SoftwareBackend sw(600, 400);
        sw.begin_frame(600, 400);
        render_tree(&sw, root);
        sw.end_frame();
        arena_destroy(&a);
    } BENCH_END("full startup (arena+parse+layout+render)", 100);
}

TEST(bench_sort_1000_rows) {
    Arena a = arena_create(2 * 1024 * 1024);
    Column cols[3];
    for (int i = 0; i < 3; i++) {
        char* n = (char*)arena_alloc(&a, 8, 1); snprintf(n, 8, "c%d", i);
        cols[i] = {arena_str_cstr(&a, n), arena_str_cstr(&a, "text")};
    }
    Table* t = table_create(&a, arena_str_cstr(&a, "big"), cols, 3, 1024);
    for (int r = 0; r < 1000; r++) {
        table_append_row(&a, t);
        char buf[16]; snprintf(buf, 16, "%04d", 999 - r); // reverse order
        table_set_cell(&a, t, r, 0, arena_str_cstr(&a, buf));
    }
    BENCH("sort 1000 rows", 50) {
        table_sort(t, 0, 0);
    } BENCH_END("sort 1000 rows", 50);
    // Verify sorted
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "0000"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 999, 0), "0999"));
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════

int main() {
    return run_all_tests();
}
