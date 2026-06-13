#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/str.h"
#include "src/core/model/table.h"
#include "src/core/model/graph.h"
#include "src/core/parser/csv.h"
#include "src/core/file_io.h"
#include <cstdio>
#include <cstring>
#include <unistd.h>

// Helper: create a temp file with given content
static const char* write_temp(const char* name, const char* content) {
    static char path[256];
    snprintf(path, 256, "/tmp/bk_test_%s", name);
    FILE* f = fopen(path, "w");
    if (f) { fwrite(content, 1, strlen(content), f); fclose(f); }
    return path;
}

static void remove_temp(const char* path) { unlink(path); }

// ══════════════════════════════════════════════════════════════════════════════
// File read/write
// ══════════════════════════════════════════════════════════════════════════════

TEST(file_read_basic) {
    const char* path = write_temp("read.txt", "hello world");
    Arena a = arena_create(4096);
    Str s = file_read(&a, path);
    ASSERT_EQ(s.len, (uint32_t)11);
    ASSERT_TRUE(memcmp(s.data, "hello world", 11) == 0);
    arena_destroy(&a);
    remove_temp(path);
}

TEST(file_read_nonexistent) {
    Arena a = arena_create(4096);
    Str s = file_read(&a, "/tmp/bk_test_nonexistent_xyz.txt");
    ASSERT_EQ(s.len, (uint32_t)0);
    arena_destroy(&a);
}

TEST(file_write_basic) {
    const char* path = "/tmp/bk_test_write.txt";
    bool ok = file_write(path, "test data", 9);
    ASSERT_TRUE(ok);
    Arena a = arena_create(4096);
    Str s = file_read(&a, path);
    ASSERT_EQ(s.len, (uint32_t)9);
    ASSERT_TRUE(memcmp(s.data, "test data", 9) == 0);
    arena_destroy(&a);
    remove_temp(path);
}

// ══════════════════════════════════════════════════════════════════════════════
// CSV file load/save round-trip
// ══════════════════════════════════════════════════════════════════════════════

TEST(csv_load_file) {
    const char* csv = "Name,Age\ntext,text\nAlice,30\nBob,25";
    const char* path = write_temp("load.csv", csv);
    Arena a = arena_create(32768);
    Table* t = file_load_csv(&a, path);
    ASSERT_TRUE(t != nullptr);
    ASSERT_EQ(t->col_count, (uint16_t)2);
    ASSERT_EQ(t->row_count, (uint32_t)2);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "Alice"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 1), "25"));
    arena_destroy(&a);
    remove_temp(path);
}

TEST(csv_save_file) {
    Arena a = arena_create(32768);
    const char* csv = "Name,City\ntext,text\nAlice,London\nBob,Paris";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "test"), csv, strlen(csv));
    const char* path = "/tmp/bk_test_save.csv";
    bool ok = file_save_csv(&a, t, path);
    ASSERT_TRUE(ok);
    // Reload and verify
    Table* t2 = file_load_csv(&a, path);
    ASSERT_TRUE(t2 != nullptr);
    ASSERT_EQ(t2->col_count, (uint16_t)2);
    ASSERT_EQ(t2->row_count, (uint32_t)2);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t2, 0, 0), "Alice"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t2, 1, 1), "Paris"));
    arena_destroy(&a);
    remove_temp(path);
}

TEST(csv_roundtrip_edit_save_reload) {
    Arena a = arena_create(65536);
    const char* csv = "X,Y\ntext,text\nA,B\nC,D";
    const char* path = write_temp("rt.csv", csv);

    // Load
    Table* t = file_load_csv(&a, path);
    ASSERT_TRUE(t != nullptr);
    // Edit
    table_set_cell(&a, t, 0, 0, arena_str_cstr(&a, "MODIFIED"));
    // Save
    bool ok = file_save_csv(&a, t, path);
    ASSERT_TRUE(ok);
    // Reload
    Table* t2 = file_load_csv(&a, path);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t2, 0, 0), "MODIFIED"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t2, 0, 1), "B")); // unchanged
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t2, 1, 0), "C")); // unchanged
    arena_destroy(&a);
    remove_temp(path);
}

// ══════════════════════════════════════════════════════════════════════════════
// Graph JSON load/save
// ══════════════════════════════════════════════════════════════════════════════

TEST(graph_load_json) {
    const char* json = "{\n  \"nodes\": [\n    {\"id\": \"A\", \"label\": \"Alpha\"},\n    {\"id\": \"B\", \"label\": \"Beta\"}\n  ],\n  \"edges\": [\n    {\"from\": \"A\", \"to\": \"B\", \"label\": \"link\"}\n  ]\n}";
    const char* path = write_temp("graph.json", json);
    Arena a = arena_create(32768);
    Graph* g = file_load_graph(&a, path);
    ASSERT_TRUE(g != nullptr);
    ASSERT_EQ(g->node_count, (uint16_t)2);
    ASSERT_EQ(g->edge_count, (uint16_t)1);
    ASSERT_TRUE(strcmp(g->nodes[0].id, "A") == 0);
    ASSERT_TRUE(strcmp(g->nodes[0].label, "Alpha") == 0);
    ASSERT_TRUE(strcmp(g->nodes[1].id, "B") == 0);
    ASSERT_EQ(g->edges[0].from, (uint16_t)0);
    ASSERT_EQ(g->edges[0].to, (uint16_t)1);
    ASSERT_TRUE(strcmp(g->edges[0].label, "link") == 0);
    arena_destroy(&a);
    remove_temp(path);
}

TEST(graph_save_json) {
    Arena a = arena_create(32768);
    Graph g; g.init(&a, "test");
    g.add_node("X", "NodeX");
    g.add_node("Y", "NodeY");
    g.add_edge(0, 1, "conn");
    const char* path = "/tmp/bk_test_graph_save.json";
    bool ok = file_save_graph(&a, &g, path);
    ASSERT_TRUE(ok);
    // Reload
    Graph* g2 = file_load_graph(&a, path);
    ASSERT_EQ(g2->node_count, (uint16_t)2);
    ASSERT_EQ(g2->edge_count, (uint16_t)1);
    ASSERT_TRUE(strcmp(g2->nodes[0].id, "X") == 0);
    ASSERT_TRUE(strcmp(g2->nodes[1].label, "NodeY") == 0);
    ASSERT_TRUE(strcmp(g2->edges[0].label, "conn") == 0);
    arena_destroy(&a);
    remove_temp(path);
}

TEST(graph_load_no_edges) {
    const char* json = "{\"nodes\": [{\"id\": \"solo\", \"label\": \"Solo Node\"}], \"edges\": []}";
    const char* path = write_temp("solo.json", json);
    Arena a = arena_create(16384);
    Graph* g = file_load_graph(&a, path);
    ASSERT_EQ(g->node_count, (uint16_t)1);
    ASSERT_EQ(g->edge_count, (uint16_t)0);
    arena_destroy(&a);
    remove_temp(path);
}

TEST(graph_load_empty) {
    const char* json = "{\"nodes\": [], \"edges\": []}";
    const char* path = write_temp("empty.json", json);
    Arena a = arena_create(16384);
    Graph* g = file_load_graph(&a, path);
    ASSERT_EQ(g->node_count, (uint16_t)0);
    ASSERT_EQ(g->edge_count, (uint16_t)0);
    arena_destroy(&a);
    remove_temp(path);
}

TEST(graph_roundtrip_many_nodes) {
    Arena a = arena_create(65536);
    Graph g; g.init(&a, "big");
    for (int i = 0; i < 20; i++) {
        char* id = (char*)arena_alloc(&a, 8, 1);
        snprintf(id, 8, "n%d", i);
        g.add_node(id, id);
    }
    for (int i = 0; i < 19; i++) g.add_edge(i, i + 1);
    const char* path = "/tmp/bk_test_graph_big.json";
    file_save_graph(&a, &g, path);
    Graph* g2 = file_load_graph(&a, path);
    ASSERT_EQ(g2->node_count, (uint16_t)20);
    ASSERT_EQ(g2->edge_count, (uint16_t)19);
    arena_destroy(&a);
    remove_temp(path);
}

// ══════════════════════════════════════════════════════════════════════════════
// Dirty tracking
// ══════════════════════════════════════════════════════════════════════════════

TEST(dirty_state_basic) {
    DirtyState ds = {false, false, 0};
    ASSERT_TRUE(!ds.is_dirty());
    ds.mark_table_dirty();
    ASSERT_TRUE(ds.is_dirty());
    ds.mark_clean(5);
    ASSERT_TRUE(!ds.table_dirty);
    ASSERT_EQ(ds.last_save_history_pos, (uint32_t)5);
}

// ══════════════════════════════════════════════════════════════════════════════
// Session persistence
// ══════════════════════════════════════════════════════════════════════════════

TEST(session_save_load) {
    const char* path = "/tmp/bk_test_session.txt";
    const char* paths[] = {"/home/user/data.csv", "/home/user/graph.json", "/home/user/other.csv"};
    bool ok = session_save(path, paths, 3);
    ASSERT_TRUE(ok);

    Arena a = arena_create(8192);
    SessionData sd = session_load(&a, path);
    ASSERT_EQ(sd.count, (uint16_t)3);
    ASSERT_TRUE(strcmp(sd.paths[0], "/home/user/data.csv") == 0);
    ASSERT_TRUE(strcmp(sd.paths[1], "/home/user/graph.json") == 0);
    ASSERT_TRUE(strcmp(sd.paths[2], "/home/user/other.csv") == 0);
    arena_destroy(&a);
    remove_temp(path);
}

TEST(session_load_empty) {
    const char* path = "/tmp/bk_test_session_empty.txt";
    file_write(path, "", 0);
    Arena a = arena_create(4096);
    SessionData sd = session_load(&a, path);
    ASSERT_EQ(sd.count, (uint16_t)0);
    arena_destroy(&a);
    remove_temp(path);
}

TEST(session_load_nonexistent) {
    Arena a = arena_create(4096);
    SessionData sd = session_load(&a, "/tmp/bk_test_no_such_session.txt");
    ASSERT_EQ(sd.count, (uint16_t)0);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Benchmark
// ══════════════════════════════════════════════════════════════════════════════

TEST(bench_csv_file_roundtrip) {
    Arena a = arena_create(2 * 1024 * 1024);
    // Build a 500-row table
    Column cols[5];
    for (int i = 0; i < 5; i++) {
        char* n = (char*)arena_alloc(&a, 8, 1);
        snprintf(n, 8, "col%d", i);
        cols[i] = {arena_str_cstr(&a, n), arena_str_cstr(&a, "text")};
    }
    Table* t = table_create(&a, arena_str_cstr(&a, "bench"), cols, 5, 512);
    for (int r = 0; r < 500; r++) {
        table_append_row(&a, t);
        for (int c = 0; c < 5; c++) {
            char buf[32]; snprintf(buf, 32, "data_%d_%d", r, c);
            table_set_cell(&a, t, r, c, arena_str_cstr(&a, buf));
        }
    }
    const char* path = "/tmp/bk_bench_csv.csv";

    BENCH("save 500-row CSV", 50) {
        file_save_csv(&a, t, path);
    } BENCH_END("save 500-row CSV", 50);

    BENCH("load 500-row CSV", 50) {
        file_load_csv(&a, path);
    } BENCH_END("load 500-row CSV", 50);

    arena_destroy(&a);
    remove_temp(path);
}

// ══════════════════════════════════════════════════════════════════════════════

int main() {
    return run_all_tests();
}
