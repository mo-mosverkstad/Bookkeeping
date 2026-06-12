#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/model/table.h"
#include "src/core/parser/csv.h"
#include "src/app/edit_history.h"
#include "src/app/table_editor.h"
#include <cstring>

static Table* make_table(Arena* a) {
    const char* csv = "A,B,C\ntext,text,text\nfoo,bar,baz\nhello,world,test\nalpha,beta,gamma";
    return csv_parse(a, arena_str_cstr(a, "T"), csv, strlen(csv));
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT HISTORY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(history_push_and_undo) {
    Arena a = arena_create(32768);
    EditHistory h; h.init(&a, 64);
    h.push({EDIT_CELL, 0, 0, {}, {}, 0});
    ASSERT_TRUE(h.can_undo());
    ASSERT_TRUE(!h.can_redo());
    h.undo();
    ASSERT_TRUE(!h.can_undo());
    ASSERT_TRUE(h.can_redo());
    arena_destroy(&a);
}

TEST(history_redo) {
    Arena a = arena_create(32768);
    EditHistory h; h.init(&a, 64);
    h.push({EDIT_CELL, 0, 0, {}, {}, 0});
    h.undo();
    EditAction* act = h.redo();
    ASSERT_TRUE(act != nullptr);
    ASSERT_TRUE(h.can_undo());
    ASSERT_TRUE(!h.can_redo());
    arena_destroy(&a);
}

TEST(history_push_clears_redo) {
    Arena a = arena_create(32768);
    EditHistory h; h.init(&a, 64);
    h.push({EDIT_CELL, 0, 0, {}, {}, 0});
    h.push({EDIT_CELL, 1, 0, {}, {}, 0});
    h.undo();
    ASSERT_TRUE(h.can_redo());
    h.push({EDIT_CELL, 2, 0, {}, {}, 0}); // should clear redo
    ASSERT_TRUE(!h.can_redo());
    arena_destroy(&a);
}

TEST(history_multiple_undo) {
    Arena a = arena_create(32768);
    EditHistory h; h.init(&a, 64);
    h.push({EDIT_CELL, 0, 0, {}, {}, 0});
    h.push({EDIT_CELL, 1, 0, {}, {}, 0});
    h.push({EDIT_CELL, 2, 0, {}, {}, 0});
    ASSERT_EQ(h.past_count, (uint16_t)3);
    h.undo(); h.undo(); h.undo();
    ASSERT_EQ(h.past_count, (uint16_t)0);
    ASSERT_EQ(h.future_count, (uint16_t)3);
    arena_destroy(&a);
}

TEST(history_empty_undo_returns_null) {
    Arena a = arena_create(32768);
    EditHistory h; h.init(&a, 64);
    ASSERT_EQ(h.undo(), (EditAction*)nullptr);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CELL SELECTION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(selection_single) {
    Arena a = arena_create(32768);
    CellSelection sel; sel.init(&a, 64);
    sel.select_single(2, 1);
    ASSERT_EQ(sel.count, (uint16_t)1);
    ASSERT_TRUE(sel.contains(2, 1));
    ASSERT_TRUE(!sel.contains(0, 0));
    arena_destroy(&a);
}

TEST(selection_toggle) {
    Arena a = arena_create(32768);
    CellSelection sel; sel.init(&a, 64);
    sel.select_single(0, 0);
    sel.toggle(1, 1);
    ASSERT_EQ(sel.count, (uint16_t)2);
    sel.toggle(0, 0); // remove
    ASSERT_EQ(sel.count, (uint16_t)1);
    ASSERT_TRUE(!sel.contains(0, 0));
    ASSERT_TRUE(sel.contains(1, 1));
    arena_destroy(&a);
}

TEST(selection_range) {
    Arena a = arena_create(32768);
    CellSelection sel; sel.init(&a, 64);
    sel.select_range({0, 0}, {2, 2});
    // 3 rows × 3 cols = 9 cells
    ASSERT_EQ(sel.count, (uint16_t)9);
    ASSERT_TRUE(sel.contains(0, 0));
    ASSERT_TRUE(sel.contains(2, 2));
    ASSERT_TRUE(sel.contains(1, 1));
    arena_destroy(&a);
}

TEST(selection_clear) {
    Arena a = arena_create(32768);
    CellSelection sel; sel.init(&a, 64);
    sel.select_single(0, 0);
    sel.toggle(1, 1);
    sel.clear();
    ASSERT_EQ(sel.count, (uint16_t)0);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE EDITOR TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(editor_begin_edit_loads_value) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.begin_edit(0, 0);
    ASSERT_TRUE(ed.editing);
    ASSERT_TRUE(strcmp(ed.edit_buffer, "foo") == 0);
    ASSERT_EQ(ed.edit_len, (uint16_t)3);
    ASSERT_EQ(ed.cursor_pos, (uint16_t)3);
    arena_destroy(&a);
}

TEST(editor_commit_changes_cell) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.begin_edit(0, 0);
    ed.edit_buffer[0] = 'X'; ed.edit_buffer[1] = 0; ed.edit_len = 1;
    ed.commit_edit();
    ASSERT_TRUE(!ed.editing);
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "X"));
    arena_destroy(&a);
}

TEST(editor_commit_no_change_no_history) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.begin_edit(0, 0); // "foo"
    ed.commit_edit(); // no change
    ASSERT_TRUE(!ed.history.can_undo());
    arena_destroy(&a);
}

TEST(editor_undo_restores_value) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.begin_edit(0, 0);
    strcpy(ed.edit_buffer, "NEW"); ed.edit_len = 3;
    ed.commit_edit();
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "NEW"));
    ed.undo();
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "foo"));
    arena_destroy(&a);
}

TEST(editor_redo_reapplies) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.begin_edit(0, 0);
    strcpy(ed.edit_buffer, "Z"); ed.edit_len = 1;
    ed.commit_edit();
    ed.undo();
    ed.redo();
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "Z"));
    arena_destroy(&a);
}

TEST(editor_insert_char) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.begin_edit(0, 0); // "foo", cursor at 3
    ed.insert_char('d');
    ASSERT_TRUE(strcmp(ed.edit_buffer, "food") == 0);
    ASSERT_EQ(ed.cursor_pos, (uint16_t)4);
    arena_destroy(&a);
}

TEST(editor_insert_char_mid) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.begin_edit(0, 0); // "foo"
    ed.cursor_pos = 1;
    ed.insert_char('X');
    ASSERT_TRUE(strcmp(ed.edit_buffer, "fXoo") == 0);
    arena_destroy(&a);
}

TEST(editor_delete_back) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.begin_edit(0, 0); // "foo", cursor at 3
    ed.delete_back();
    ASSERT_TRUE(strcmp(ed.edit_buffer, "fo") == 0);
    ASSERT_EQ(ed.cursor_pos, (uint16_t)2);
    arena_destroy(&a);
}

TEST(editor_delete_forward) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.begin_edit(0, 0); // "foo"
    ed.cursor_pos = 0;
    ed.delete_forward();
    ASSERT_TRUE(strcmp(ed.edit_buffer, "oo") == 0);
    arena_destroy(&a);
}

TEST(editor_cursor_movement) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.begin_edit(0, 0); // "foo", cursor at 3
    ed.move_cursor_home();
    ASSERT_EQ(ed.cursor_pos, (uint16_t)0);
    ed.move_cursor_end();
    ASSERT_EQ(ed.cursor_pos, (uint16_t)3);
    ed.move_cursor_left();
    ASSERT_EQ(ed.cursor_pos, (uint16_t)2);
    ed.move_cursor_right();
    ASSERT_EQ(ed.cursor_pos, (uint16_t)3);
    arena_destroy(&a);
}

TEST(editor_clear_selected_cells) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.selection.select_range({0, 0}, {0, 2}); // first row, all 3 cols
    ed.clear_selected_cells();
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), ""));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 1), ""));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 2), ""));
    // Second row untouched
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "hello"));
    arena_destroy(&a);
}

TEST(editor_move_selection) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.selection.select_single(0, 0); // "foo"
    ed.move_selection(1, 0); // move to row 1
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "")); // source cleared
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 1, 0), "foo")); // dest has value
    arena_destroy(&a);
}

TEST(editor_multiple_edits_undo_all) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);

    ed.begin_edit(0, 0); strcpy(ed.edit_buffer, "A"); ed.edit_len = 1; ed.commit_edit();
    ed.begin_edit(0, 1); strcpy(ed.edit_buffer, "B"); ed.edit_len = 1; ed.commit_edit();
    ed.begin_edit(0, 2); strcpy(ed.edit_buffer, "C"); ed.edit_len = 1; ed.commit_edit();

    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "A"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 1), "B"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 2), "C"));

    ed.undo(); ed.undo(); ed.undo();
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "foo"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 1), "bar"));
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 2), "baz"));
    arena_destroy(&a);
}

TEST(editor_cancel_edit_no_change) {
    Arena a = arena_create(32768);
    Table* t = make_table(&a);
    TableEditor ed; ed.init(&a, t);
    ed.begin_edit(0, 0);
    strcpy(ed.edit_buffer, "CHANGED"); ed.edit_len = 7;
    ed.cancel_edit();
    ASSERT_TRUE(str_eq_cstr(table_get_cell(t, 0, 0), "foo")); // unchanged
    ASSERT_TRUE(!ed.editing);
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════

int main() {
    return run_all_tests();
}
