#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/str.h"
#include "src/core/utf8.h"
#include "src/core/model/table.h"
#include "src/core/parser/csv.h"
#include "src/core/search.h"
#include "src/core/file_io.h"
#include "src/core/theme.h"
#include "src/app/table_view.h"
#include "src/app/table_editor.h"
#include "src/app/table_sort.h"
#include "src/app/tab_strip.h"
#include "src/app/workspace.h"
#include "src/app/nav_tree.h"
#include "src/app/source_history.h"
#include "src/app/cell_render.h"
#include "src/graphics/layout/layout.h"
#include "src/graphics/backend/software_backend.h"
#include <cstring>
#include <cstdio>
#include <unistd.h>

// ══════════════════════════════════════════════════════════════════════════════
// UTF-8 handling
// ══════════════════════════════════════════════════════════════════════════════

TEST(utf8_prev_ascii) {
    const char* buf = "hello";
    ASSERT_EQ(utf8_prev(buf, 3), (uint16_t)2);
    ASSERT_EQ(utf8_prev(buf, 0), (uint16_t)0);
}

TEST(utf8_prev_multibyte) {
    // "aé" = 'a' (1 byte) + 'é' (2 bytes: 0xC3 0xA9)
    const char* buf = "a\xC3\xA9";
    ASSERT_EQ(utf8_prev(buf, 3), (uint16_t)1); // back over 2-byte char → pos 1
    ASSERT_EQ(utf8_prev(buf, 1), (uint16_t)0); // back over 'a' → pos 0
}

TEST(utf8_next_ascii) {
    const char* buf = "hello";
    ASSERT_EQ(utf8_next(buf, 5, 0), (uint16_t)1);
    ASSERT_EQ(utf8_next(buf, 5, 4), (uint16_t)5);
}

TEST(utf8_next_multibyte) {
    // "aé" = 'a' + 2-byte é
    const char* buf = "a\xC3\xA9";
    ASSERT_EQ(utf8_next(buf, 3, 1), (uint16_t)3); // skip 2-byte char
    ASSERT_EQ(utf8_next(buf, 3, 0), (uint16_t)1); // skip 'a'
}

TEST(utf8_3byte_char) {
    // "中" = 3 bytes: 0xE4 0xB8 0xAD
    const char* buf = "x\xE4\xB8\xAD" "y";
    ASSERT_EQ(utf8_next(buf, 5, 1), (uint16_t)4); // skip 3-byte char
    ASSERT_EQ(utf8_prev(buf, 4), (uint16_t)1);    // back over 3-byte char
}

// ══════════════════════════════════════════════════════════════════════════════
// Source editor local undo/redo
// ══════════════════════════════════════════════════════════════════════════════

TEST(source_history_push_undo) {
    SourceHistory sh;
    char buf[512] = "hello";
    uint16_t len = 5, cursor = 5;
    sh.push(buf, len, cursor);
    // Modify buffer
    strcpy(buf, "world"); len = 5; cursor = 5;
    // Undo
    ASSERT_TRUE(sh.do_undo(buf, len, cursor));
    ASSERT_TRUE(strcmp(buf, "hello") == 0);
    ASSERT_EQ(len, (uint16_t)5);
}

TEST(source_history_redo) {
    SourceHistory sh;
    char buf[512] = "AAA";
    uint16_t len = 3, cursor = 3;
    sh.push(buf, len, cursor);
    strcpy(buf, "BBB"); len = 3; cursor = 3;
    sh.do_undo(buf, len, cursor);
    ASSERT_TRUE(strcmp(buf, "AAA") == 0);
    sh.do_redo(buf, len, cursor);
    ASSERT_TRUE(strcmp(buf, "BBB") == 0);
}

TEST(source_history_push_clears_redo) {
    SourceHistory sh;
    char buf[512] = "A";
    uint16_t len = 1, cursor = 1;
    sh.push(buf, len, cursor);
    strcpy(buf, "B"); len = 1;
    sh.push(buf, len, cursor);
    strcpy(buf, "C"); len = 1;
    // Undo to B
    sh.do_undo(buf, len, cursor);
    ASSERT_TRUE(strcmp(buf, "B") == 0);
    // Push new → clears redo
    sh.push(buf, len, cursor);
    strcpy(buf, "D"); len = 1;
    // Redo should fail (cleared)
    ASSERT_TRUE(!sh.do_redo(buf, len, cursor));
}

TEST(source_history_empty_undo) {
    SourceHistory sh;
    char buf[512] = "x";
    uint16_t len = 1, cursor = 1;
    ASSERT_TRUE(!sh.do_undo(buf, len, cursor));
    ASSERT_TRUE(!sh.do_redo(buf, len, cursor));
}

// ══════════════════════════════════════════════════════════════════════════════
// Table view: cell sizing + column auto-width
// ══════════════════════════════════════════════════════════════════════════════

TEST(table_view_column_autowidth) {
    Arena a = arena_create(65536);
    const char* csv = "ShortCol,A very long column header name\ntext,text\nA,B";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    TableViewConfig cfg;
    cfg.viewport_width = 400; cfg.viewport_height = 200;
    LayoutNode* view = table_view_build(&a, t, cfg);
    view->compute(400, 200);
    // Header scroll → header → cells; second column should be wider than first
    LayoutNode* hdr = view->children[0]->children[0]; // header_scroll → header
    ASSERT_TRUE(hdr->children[1]->width > hdr->children[0]->width);
    arena_destroy(&a);
}

TEST(table_view_row_expands_for_multiline) {
    Arena a = arena_create(65536);
    const char* csv = "X\ntext\n\"line1\nline2\nline3\"";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    TableViewConfig cfg;
    cfg.viewport_width = 200; cfg.viewport_height = 200;
    LayoutNode* view = table_view_build(&a, t, cfg);
    view->compute(200, 200);
    LayoutNode* scroll = view->children[1]; // data scroll
    LayoutNode* row0 = scroll->children[0];
    // Row with 3 lines should be taller than default cell_height (28)
    ASSERT_TRUE(row0->height > 28);
    arena_destroy(&a);
}

TEST(table_view_active_cell_highlight) {
    Arena a = arena_create(65536);
    const char* csv = "A,B\ntext,text\n1,2\n3,4";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    TableViewConfig cfg;
    cfg.viewport_width = 200; cfg.viewport_height = 200;
    cfg.active_row = 0; cfg.active_col = 1;
    LayoutNode* view = table_view_build(&a, t, cfg);
    view->compute(200, 200);
    LayoutNode* scroll = view->children[1];
    LayoutNode* row0 = scroll->children[0];
    // Active cell (col 1) should have different bg color (blue highlight)
    // Check element rect fill color differs from non-active
    LayoutNode* cell0 = row0->children[0]; // not active
    LayoutNode* cell1 = row0->children[1]; // active
    // Active cell is a COORDINATE node (wrapped rendered or box)
    ASSERT_TRUE(cell1->elements[0].rect.fill.r != cell0->elements[0].rect.fill.r ||
                cell1->elements[0].rect.fill.b != cell0->elements[0].rect.fill.b);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Tab close
// ══════════════════════════════════════════════════════════════════════════════

TEST(tab_close_by_id) {
    Arena a = arena_create(8192);
    TabStrip ts; ts.init(&a, 16);
    ts.open("A", "a"); ts.open("B", "b"); ts.open("C", "c");
    ASSERT_EQ(ts.count, (uint16_t)3);
    ts.close_by_id("b");
    ASSERT_EQ(ts.count, (uint16_t)2);
    ASSERT_EQ(ts.find("b"), -1);
    ASSERT_TRUE(ts.find("a") >= 0);
    ASSERT_TRUE(ts.find("c") >= 0);
    arena_destroy(&a);
}

TEST(workspace_unmount_closes_tab) {
    Arena a = arena_create(16384);
    Workspace ws; ws.init(&a, 16);
    int d1 = 1, d2 = 2;
    ws.mount("X", "x", VIEW_TABLE, &d1);
    ws.mount("Y", "y", VIEW_TABLE, &d2);
    ASSERT_EQ(ws.tabs.count, (uint16_t)2);
    ws.unmount("x");
    ASSERT_EQ(ws.tabs.count, (uint16_t)1);
    ASSERT_EQ(ws.view_count, (uint16_t)2); // views kept after tab close
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Scroll state per view
// ══════════════════════════════════════════════════════════════════════════════

TEST(per_view_scroll_state) {
    Arena a = arena_create(16384);
    Workspace ws; ws.init(&a, 16);
    int d1 = 1, d2 = 2;
    ws.mount("A", "a", VIEW_TABLE, &d1);
    ws.mount("B", "b", VIEW_TABLE, &d2);
    // Set scroll on view A
    ws.tabs.activate(0);
    ViewSlot* va = ws.active_view();
    va->scroll_y = 100;
    // Switch to B
    ws.tabs.activate(1);
    ViewSlot* vb = ws.active_view();
    vb->scroll_y = 200;
    // Switch back to A
    ws.tabs.activate(0);
    ASSERT_NEAR(ws.active_view()->scroll_y, 100.0f, 0.1f);
    // Check B preserved
    ws.tabs.activate(1);
    ASSERT_NEAR(ws.active_view()->scroll_y, 200.0f, 0.1f);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Theme
// ══════════════════════════════════════════════════════════════════════════════

TEST(theme_light_colors) {
    Theme th = theme_light();
    // Background should be light
    ASSERT_TRUE(th.bg.r > 200);
    ASSERT_TRUE(th.surface.r == 255 && th.surface.g == 255);
    // Text should be dark
    ASSERT_TRUE(th.text.r < 50 && th.text.g < 50);
    // Font sizes
    ASSERT_NEAR(th.font_base, 14.0f, 0.1f);
    ASSERT_NEAR(th.font_small, 12.5f, 0.1f);
}

// ══════════════════════════════════════════════════════════════════════════════
// Cell renderer dispatch
// ══════════════════════════════════════════════════════════════════════════════

TEST(cell_render_text_returns_null) {
    Arena a = arena_create(8192);
    LayoutNode* r = cell_render(&a, "hello", 5, "text", 12, {0,0,0,255});
    ASSERT_TRUE(r == nullptr); // text type → no special rendering
    arena_destroy(&a);
}

TEST(cell_render_math_returns_node) {
    Arena a = arena_create(32768);
    LayoutNode* r = cell_render(&a, "x^2", 3, "math", 12, {0,0,0,255});
    ASSERT_TRUE(r != nullptr);
    arena_destroy(&a);
}

TEST(cell_render_rich_with_embed) {
    Arena a = arena_create(32768);
    LayoutNode* r = cell_render(&a, "text $math{x+1} more", 20, "rich", 12, {0,0,0,255});
    ASSERT_TRUE(r != nullptr);
    arena_destroy(&a);
}

TEST(cell_render_rich_dollar_no_hang) {
    // This previously caused infinite loop
    Arena a = arena_create(32768);
    LayoutNode* r = cell_render(&a, "$t_a={a=2n}: a^2", 16, "rich", 12, {0,0,0,255});
    ASSERT_TRUE(r != nullptr); // should not hang
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Arrow key navigation (table editor)
// ══════════════════════════════════════════════════════════════════════════════

TEST(editor_arrow_navigation) {
    Arena a = arena_create(32768);
    const char* csv = "A,B\ntext,text\n1,2\n3,4\n5,6";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    TableEditor ed; ed.init(&a, t);
    ed.begin_edit(0, 0);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "1"));
    // Simulate down
    ed.commit_edit(); ed.begin_edit(1, 0);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "3"));
    // Simulate right
    ed.commit_edit(); ed.begin_edit(1, 1);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 1), "4"));
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Row insert / delete
// ══════════════════════════════════════════════════════════════════════════════

TEST(row_insert_button) {
    Arena a = arena_create(32768);
    const char* csv = "X\ntext\nA\nB";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    ASSERT_EQ(t->row_count, (uint32_t)2);
    table_insert_row(&a, t, 1); // insert after row 0
    ASSERT_EQ(t->row_count, (uint32_t)3);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "A"));
    ASSERT_EQ(table_get_cell(t, 1, 0).len, (uint32_t)0); // empty new row
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 2, 0), "B"));
    arena_destroy(&a);
}

TEST(row_delete_button) {
    Arena a = arena_create(32768);
    const char* csv = "X\ntext\nA\nB\nC";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    ASSERT_EQ(t->row_count, (uint32_t)3);
    table_remove_row(t, 1); // delete "B"
    ASSERT_EQ(t->row_count, (uint32_t)2);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "A"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "C"));
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════
// Save persistence
// ══════════════════════════════════════════════════════════════════════════════

TEST(save_and_reload_persists) {
    Arena a = arena_create(32768);
    const char* csv = "Name\ntext\nAlice\nBob";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    // Edit a cell
    table_set_cell(&a, t, 0, 0, arena_str_cstr(&a, "CHANGED"));
    // Save
    const char* path = "/tmp/bk_persist_test.csv";
    file_save_csv(&a, t, path);
    // Reload
    Table* t2 = file_load_csv(&a, path);
    ASSERT_TRUE(t2 != nullptr);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t2, 0, 0), "CHANGED"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t2, 1, 0), "Bob"));
    unlink(path);
    arena_destroy(&a);
}

// ══════════════════════════════════════════════════════════════════════════════

int main() { return run_all_tests(); }
