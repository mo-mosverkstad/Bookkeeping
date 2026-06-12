#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/str.h"
#include "src/core/model/table.h"
#include "src/core/parser/csv.h"

// ═══════════════════════════════════════════════════════════════════════════════
// STRING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(str_empty_is_empty) {
    Str s = str_empty();
    ASSERT_EQ(s.len, (uint32_t)0);
}

TEST(str_eq_same) {
    Arena a = arena_create(1024);
    Str s1 = arena_str_cstr(&a, "hello");
    Str s2 = arena_str_cstr(&a, "hello");
    ASSERT_TRUE(str_eq(s1, s2));
    arena_destroy(&a);
}

TEST(str_eq_different) {
    Arena a = arena_create(1024);
    Str s1 = arena_str_cstr(&a, "hello");
    Str s2 = arena_str_cstr(&a, "world");
    ASSERT_TRUE(!str_eq(s1, s2));
    arena_destroy(&a);
}

TEST(str_eq_cstr) {
    Arena a = arena_create(1024);
    Str s = arena_str_cstr(&a, "test");
    ASSERT_TRUE(str_eq_cstr(s, "test"));
    ASSERT_TRUE(!str_eq_cstr(s, "tes"));
    ASSERT_TRUE(!str_eq_cstr(s, "tests"));
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE MODEL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(table_create_empty) {
    Arena a = arena_create(4096);
    Column cols[2] = {{arena_str_cstr(&a, "Name"), arena_str_cstr(&a, "text")},
                      {arena_str_cstr(&a, "Age"), arena_str_cstr(&a, "math")}};
    Table* t = table_create(&a, arena_str_cstr(&a, "People"), cols, 2, 16);
    ASSERT_TRUE(t != nullptr);
    ASSERT_EQ(t->col_count, (uint16_t)2);
    ASSERT_EQ(t->row_count, (uint32_t)0);
    ASSERT_TRUE(str_eq_cstr(t->name, "People"));
    arena_destroy(&a);
}

TEST(table_append_and_get) {
    Arena a = arena_create(4096);
    Column cols[2] = {{arena_str_cstr(&a, "A"), arena_str_cstr(&a, "text")},
                      {arena_str_cstr(&a, "B"), arena_str_cstr(&a, "text")}};
    Table* t = table_create(&a, arena_str_cstr(&a, "T"), cols, 2, 16);
    uint32_t r = table_append_row(&a, t);
    ASSERT_EQ(r, (uint32_t)0);
    ASSERT_EQ(t->row_count, (uint32_t)1);
    table_set_cell(&a, t, 0, 0, arena_str_cstr(&a, "hello"));
    Str v = table_get_cell(t, 0, 0);
    ASSERT_TRUE(str_eq_cstr(v, "hello"));
    arena_destroy(&a);
}

TEST(table_get_out_of_bounds) {
    Arena a = arena_create(4096);
    Column cols[1] = {{arena_str_cstr(&a, "X"), arena_str_cstr(&a, "text")}};
    Table* t = table_create(&a, arena_str_cstr(&a, "T"), cols, 1, 4);
    table_append_row(&a, t);
    Str v = table_get_cell(t, 5, 0); // row OOB
    ASSERT_EQ(v.len, (uint32_t)0);
    v = table_get_cell(t, 0, 5); // col OOB
    ASSERT_EQ(v.len, (uint32_t)0);
    arena_destroy(&a);
}

TEST(table_insert_row) {
    Arena a = arena_create(8192);
    Column cols[1] = {{arena_str_cstr(&a, "V"), arena_str_cstr(&a, "text")}};
    Table* t = table_create(&a, arena_str_cstr(&a, "T"), cols, 1, 16);
    table_append_row(&a, t); table_set_cell(&a, t, 0, 0, arena_str_cstr(&a, "A"));
    table_append_row(&a, t); table_set_cell(&a, t, 1, 0, arena_str_cstr(&a, "B"));
    table_insert_row(&a, t, 1);
    table_set_cell(&a, t, 1, 0, arena_str_cstr(&a, "X"));
    ASSERT_EQ(t->row_count, (uint32_t)3);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "A"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "X"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 2, 0), "B"));
    arena_destroy(&a);
}

TEST(table_remove_row) {
    Arena a = arena_create(8192);
    Column cols[1] = {{arena_str_cstr(&a, "V"), arena_str_cstr(&a, "text")}};
    Table* t = table_create(&a, arena_str_cstr(&a, "T"), cols, 1, 16);
    table_append_row(&a, t); table_set_cell(&a, t, 0, 0, arena_str_cstr(&a, "A"));
    table_append_row(&a, t); table_set_cell(&a, t, 1, 0, arena_str_cstr(&a, "B"));
    table_append_row(&a, t); table_set_cell(&a, t, 2, 0, arena_str_cstr(&a, "C"));
    table_remove_row(t, 1);
    ASSERT_EQ(t->row_count, (uint32_t)2);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "A"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "C"));
    arena_destroy(&a);
}

TEST(table_move_row_forward) {
    Arena a = arena_create(8192);
    Column cols[1] = {{arena_str_cstr(&a, "V"), arena_str_cstr(&a, "text")}};
    Table* t = table_create(&a, arena_str_cstr(&a, "T"), cols, 1, 16);
    table_append_row(&a, t); table_set_cell(&a, t, 0, 0, arena_str_cstr(&a, "A"));
    table_append_row(&a, t); table_set_cell(&a, t, 1, 0, arena_str_cstr(&a, "B"));
    table_append_row(&a, t); table_set_cell(&a, t, 2, 0, arena_str_cstr(&a, "C"));
    table_move_row(t, 0, 2); // A moves to position 2
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "B"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "C"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 2, 0), "A"));
    arena_destroy(&a);
}

TEST(table_move_row_backward) {
    Arena a = arena_create(8192);
    Column cols[1] = {{arena_str_cstr(&a, "V"), arena_str_cstr(&a, "text")}};
    Table* t = table_create(&a, arena_str_cstr(&a, "T"), cols, 1, 16);
    table_append_row(&a, t); table_set_cell(&a, t, 0, 0, arena_str_cstr(&a, "A"));
    table_append_row(&a, t); table_set_cell(&a, t, 1, 0, arena_str_cstr(&a, "B"));
    table_append_row(&a, t); table_set_cell(&a, t, 2, 0, arena_str_cstr(&a, "C"));
    table_move_row(t, 2, 0); // C moves to position 0
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "C"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "A"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 2, 0), "B"));
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSV PARSER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(csv_parse_simple) {
    Arena a = arena_create(8192);
    const char* csv = "Name,Age\ntext,math\nAlice,30\nBob,25";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "Test"), csv, strlen(csv));
    ASSERT_TRUE(t != nullptr);
    ASSERT_EQ(t->col_count, (uint16_t)2);
    ASSERT_EQ(t->row_count, (uint32_t)2);
    ASSERT_TRUE(str_eq_cstr(t->columns[0].name, "Name"));
    ASSERT_TRUE(str_eq_cstr(t->columns[1].name, "Age"));
    ASSERT_TRUE(str_eq_cstr(t->columns[0].type_id, "text"));
    ASSERT_TRUE(str_eq_cstr(t->columns[1].type_id, "math"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "Alice"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 1), "30"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "Bob"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 1), "25"));
    arena_destroy(&a);
}

TEST(csv_parse_quoted_fields) {
    Arena a = arena_create(8192);
    const char* csv = "A,B\ntext,text\n\"hello, world\",simple\n\"has \"\"quotes\"\"\",end";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "Q"), csv, strlen(csv));
    ASSERT_TRUE(t != nullptr);
    ASSERT_EQ(t->row_count, (uint32_t)2);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "hello, world"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 1), "simple"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "has \"quotes\""));
    arena_destroy(&a);
}

TEST(csv_parse_multiline_field) {
    Arena a = arena_create(8192);
    const char* csv = "A\ntext\n\"line1\nline2\"";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "M"), csv, strlen(csv));
    ASSERT_TRUE(t != nullptr);
    ASSERT_EQ(t->row_count, (uint32_t)1);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "line1\nline2"));
    arena_destroy(&a);
}

TEST(csv_parse_crlf) {
    Arena a = arena_create(8192);
    const char* csv = "A\r\ntext\r\nvalue1\r\nvalue2";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "CR"), csv, strlen(csv));
    ASSERT_TRUE(t != nullptr);
    ASSERT_EQ(t->row_count, (uint32_t)2);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "value1"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "value2"));
    arena_destroy(&a);
}

TEST(csv_parse_crlf_in_quoted) {
    Arena a = arena_create(8192);
    const char* csv = "A\ntext\n\"has\r\nnewline\"";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "CRQ"), csv, strlen(csv));
    ASSERT_TRUE(t != nullptr);
    ASSERT_EQ(t->row_count, (uint32_t)1);
    // \r\n in quoted field normalized to \n
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "has\nnewline"));
    arena_destroy(&a);
}

TEST(csv_parse_empty_fields) {
    Arena a = arena_create(8192);
    const char* csv = "A,B,C\ntext,text,text\n,hello,\nworld,,";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "E"), csv, strlen(csv));
    ASSERT_TRUE(t != nullptr);
    ASSERT_EQ(t->row_count, (uint32_t)2);
    ASSERT_EQ(table_get_cell(t, 0, 0).len, (uint32_t)0);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 1), "hello"));
    ASSERT_EQ(table_get_cell(t, 0, 2).len, (uint32_t)0);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "world"));
    ASSERT_EQ(table_get_cell(t, 1, 1).len, (uint32_t)0);
    arena_destroy(&a);
}

TEST(csv_parse_trailing_newline) {
    Arena a = arena_create(8192);
    const char* csv = "A\ntext\nvalue\n";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "TN"), csv, strlen(csv));
    ASSERT_TRUE(t != nullptr);
    ASSERT_EQ(t->row_count, (uint32_t)1);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "value"));
    arena_destroy(&a);
}

TEST(csv_parse_single_column) {
    Arena a = arena_create(8192);
    const char* csv = "ID\ntext\nalpha\nbeta\ngamma";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "S"), csv, strlen(csv));
    ASSERT_TRUE(t != nullptr);
    ASSERT_EQ(t->col_count, (uint16_t)1);
    ASSERT_EQ(t->row_count, (uint32_t)3);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 2, 0), "gamma"));
    arena_destroy(&a);
}

TEST(csv_parse_empty_input) {
    Arena a = arena_create(1024);
    Table* t = csv_parse(&a, arena_str_cstr(&a, "E"), "", 0);
    ASSERT_EQ(t, (Table*)nullptr);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSV SERIALIZE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(csv_roundtrip_simple) {
    Arena a = arena_create(16384);
    const char* csv = "Name,Age\ntext,math\nAlice,30\nBob,25";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "RT"), csv, strlen(csv));
    ASSERT_TRUE(t != nullptr);
    Str out = csv_serialize(&a, t);
    ASSERT_TRUE(str_eq_cstr(out, csv));
    arena_destroy(&a);
}

TEST(csv_roundtrip_quoted) {
    Arena a = arena_create(16384);
    const char* csv = "A\ntext\n\"hello, world\"";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "RQ"), csv, strlen(csv));
    ASSERT_TRUE(t != nullptr);
    Str out = csv_serialize(&a, t);
    ASSERT_TRUE(str_eq_cstr(out, csv));
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARKS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(bench_csv_parse_large) {
    // Generate a 1000-row CSV
    Arena gen = arena_create(512 * 1024);
    char* big_csv = (char*)arena_alloc(&gen, 256 * 1024, 1);
    int pos = 0;
    pos += sprintf(big_csv + pos, "A,B,C,D,E\ntext,text,text,text,text\n");
    for (int r = 0; r < 1000; r++) {
        pos += sprintf(big_csv + pos, "val%d,data%d,item%d,thing%d,stuff%d\n", r, r, r, r, r);
    }

    Arena a = arena_create(2 * 1024 * 1024);
    BENCH("csv_parse_1000_rows", 1000) {
        arena_reset(&a);
        csv_parse(&a, arena_str_cstr(&a, "B"), big_csv, pos);
    } BENCH_END("csv_parse_1000_rows", 1000)

    Table* t = csv_parse(&a, arena_str_cstr(&a, "B"), big_csv, pos);
    ASSERT_EQ(t->row_count, (uint32_t)1000);
    ASSERT_EQ(t->col_count, (uint16_t)5);

    arena_destroy(&a);
    arena_destroy(&gen);
    ASSERT_TRUE(true);
}

// ═══════════════════════════════════════════════════════════════════════════════

int main() {
    return run_all_tests();
}
