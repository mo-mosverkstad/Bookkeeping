#pragma once
#include "src/core/arena.h"
#include "src/core/model/table.h"
#include "src/app/edit_history.h"
#include <cstdint>

// Cell selection — tracks which cells are selected for multi-cell operations.
struct CellCoord { uint32_t row; uint16_t col; };

struct CellSelection {
    CellCoord* cells;
    uint16_t count;
    uint16_t capacity;
    CellCoord anchor; // for shift-click range selection

    void init(Arena* a, uint16_t cap) {
        cells = (CellCoord*)arena_alloc(a, sizeof(CellCoord) * cap, 4);
        capacity = cap;
        count = 0;
        anchor = {0, 0};
    }

    void clear() { count = 0; }

    void select_single(uint32_t row, uint16_t col) {
        clear();
        cells[0] = {row, col};
        count = 1;
        anchor = {row, col};
    }

    void toggle(uint32_t row, uint16_t col) {
        for (uint16_t i = 0; i < count; i++) {
            if (cells[i].row == row && cells[i].col == col) {
                cells[i] = cells[--count]; // remove
                return;
            }
        }
        if (count < capacity) { cells[count++] = {row, col}; anchor = {row, col}; }
    }

    void select_range(CellCoord from, CellCoord to) {
        clear();
        uint32_t r0 = from.row < to.row ? from.row : to.row;
        uint32_t r1 = from.row > to.row ? from.row : to.row;
        uint16_t c0 = from.col < to.col ? from.col : to.col;
        uint16_t c1 = from.col > to.col ? from.col : to.col;
        for (uint32_t r = r0; r <= r1; r++)
            for (uint16_t c = c0; c <= c1; c++)
                if (count < capacity) cells[count++] = {r, c};
    }

    bool contains(uint32_t row, uint16_t col) const {
        for (uint16_t i = 0; i < count; i++)
            if (cells[i].row == row && cells[i].col == col) return true;
        return false;
    }
};

// Table editor — coordinates editing operations with undo/redo.
struct TableEditor {
    Table* table;
    Arena* arena;
    EditHistory history;
    CellSelection selection;
    CellCoord active_cell; // currently editing cell
    bool editing;          // true if cell is active for text input
    char edit_buffer[512]; // current edit text
    uint16_t edit_len;
    uint16_t cursor_pos;   // cursor position in edit_buffer

    void init(Arena* a, Table* t, uint16_t history_cap = 256, uint16_t selection_cap = 512) {
        table = t;
        arena = a;
        history.init(a, history_cap);
        selection.init(a, selection_cap);
        editing = false;
        edit_len = 0;
        cursor_pos = 0;
        active_cell = {0, 0};
    }

    // ── Cell editing ─────────────────────────────────────────────────────────

    void begin_edit(uint32_t row, uint16_t col) {
        commit_edit(); // commit previous
        active_cell = {row, col};
        Str val = table_get_cell(table, row, col);
        edit_len = val.len > 511 ? 511 : val.len;
        memcpy(edit_buffer, val.data, edit_len);
        edit_buffer[edit_len] = 0;
        cursor_pos = edit_len;
        editing = true;
    }

    void commit_edit() {
        if (!editing) return;
        editing = false;
        Str old_val = table_get_cell(table, active_cell.row, active_cell.col);
        Str new_val = arena_str(arena, edit_buffer, edit_len);
        if (str_eq(old_val, new_val)) return; // no change
        history.push({EDIT_CELL, active_cell.row, active_cell.col, old_val, new_val, 0});
        table_set_cell(arena, table, active_cell.row, active_cell.col, new_val);
    }

    void cancel_edit() { editing = false; }

    // ── Text input ───────────────────────────────────────────────────────────

    void insert_char(char c) {
        if (!editing || edit_len >= 511) return;
        memmove(edit_buffer + cursor_pos + 1, edit_buffer + cursor_pos, edit_len - cursor_pos);
        edit_buffer[cursor_pos] = c;
        edit_len++;
        cursor_pos++;
        edit_buffer[edit_len] = 0;
    }

    void delete_back() {
        if (!editing || cursor_pos == 0) return;
        memmove(edit_buffer + cursor_pos - 1, edit_buffer + cursor_pos, edit_len - cursor_pos);
        cursor_pos--;
        edit_len--;
        edit_buffer[edit_len] = 0;
    }

    void delete_forward() {
        if (!editing || cursor_pos >= edit_len) return;
        memmove(edit_buffer + cursor_pos, edit_buffer + cursor_pos + 1, edit_len - cursor_pos - 1);
        edit_len--;
        edit_buffer[edit_len] = 0;
    }

    void move_cursor_left() { if (cursor_pos > 0) cursor_pos--; }
    void move_cursor_right() { if (cursor_pos < edit_len) cursor_pos++; }
    void move_cursor_home() { cursor_pos = 0; }
    void move_cursor_end() { cursor_pos = edit_len; }

    // ── Undo / Redo ──────────────────────────────────────────────────────────

    void undo() {
        EditAction* a = history.undo();
        if (!a) return;
        if (a->type == EDIT_CELL) {
            table_set_cell(arena, table, a->row, a->col, a->old_value);
        }
    }

    void redo() {
        EditAction* a = history.redo();
        if (!a) return;
        if (a->type == EDIT_CELL) {
            table_set_cell(arena, table, a->row, a->col, a->new_value);
        }
    }

    // ── Multi-cell operations ────────────────────────────────────────────────

    void clear_selected_cells() {
        Str empty = str_empty();
        for (uint16_t i = 0; i < selection.count; i++) {
            CellCoord c = selection.cells[i];
            Str old_val = table_get_cell(table, c.row, c.col);
            if (old_val.len > 0) {
                history.push({EDIT_CELL, c.row, c.col, old_val, empty, 0});
                table_set_cell(arena, table, c.row, c.col, empty);
            }
        }
    }

    void move_selection(uint32_t dest_row, uint16_t dest_col) {
        if (selection.count == 0) return;
        // Find bounding box
        uint32_t min_r = selection.cells[0].row, min_c = selection.cells[0].col;
        for (uint16_t i = 1; i < selection.count; i++) {
            if (selection.cells[i].row < min_r) min_r = selection.cells[i].row;
            if (selection.cells[i].col < min_c) min_c = selection.cells[i].col;
        }
        // Clear source, write to dest
        for (uint16_t i = 0; i < selection.count; i++) {
            CellCoord src = selection.cells[i];
            uint32_t dr = dest_row + (src.row - min_r);
            uint16_t dc = dest_col + (src.col - min_c);
            Str val = table_get_cell(table, src.row, src.col);
            Str empty = str_empty();
            history.push({EDIT_CELL, src.row, src.col, val, empty, 0});
            table_set_cell(arena, table, src.row, src.col, empty);
            if (dr < table->row_count && dc < table->col_count) {
                Str old_dest = table_get_cell(table, dr, dc);
                history.push({EDIT_CELL, dr, dc, old_dest, val, 0});
                table_set_cell(arena, table, dr, dc, val);
            }
        }
    }
};
