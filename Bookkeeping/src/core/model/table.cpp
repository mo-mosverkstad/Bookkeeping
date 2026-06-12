#include "src/core/model/table.h"
#include <cstring>

Table* table_create(Arena* a, Str name, Column* cols, uint16_t col_count, uint32_t initial_capacity) {
    Table* t = arena_new<Table>(a);
    if (!t) return nullptr;
    t->name = name;
    t->columns = cols;
    t->col_count = col_count;
    t->row_count = 0;
    t->row_capacity = initial_capacity;
    t->rows = arena_array<Row>(a, initial_capacity);
    return t;
}

Str table_get_cell(const Table* t, uint32_t row, uint16_t col) {
    if (row >= t->row_count || col >= t->col_count) return str_empty();
    return t->rows[row].cells[col].value;
}

void table_set_cell(Arena* a, Table* t, uint32_t row, uint16_t col, Str value) {
    if (row >= t->row_count || col >= t->col_count) return;
    t->rows[row].cells[col].value = arena_str(a, value.data, value.len);
}

static void init_row(Arena* a, Table* t, uint32_t idx) {
    Row* r = &t->rows[idx];
    r->cells = arena_array<Cell>(a, t->col_count);
    r->cell_count = t->col_count;
    for (uint16_t c = 0; c < t->col_count; c++) {
        r->cells[c].value = str_empty();
        r->cells[c].type_id = t->columns[c].type_id;
    }
}

uint32_t table_append_row(Arena* a, Table* t) {
    if (t->row_count >= t->row_capacity) return t->row_count; // full
    uint32_t idx = t->row_count++;
    init_row(a, t, idx);
    return idx;
}

void table_insert_row(Arena* a, Table* t, uint32_t at) {
    if (t->row_count >= t->row_capacity || at > t->row_count) return;
    // Shift rows down
    memmove(&t->rows[at + 1], &t->rows[at], (t->row_count - at) * sizeof(Row));
    t->row_count++;
    init_row(a, t, at);
}

void table_remove_row(Table* t, uint32_t at) {
    if (at >= t->row_count) return;
    memmove(&t->rows[at], &t->rows[at + 1], (t->row_count - at - 1) * sizeof(Row));
    t->row_count--;
}

void table_move_row(Table* t, uint32_t from, uint32_t to) {
    if (from >= t->row_count || to >= t->row_count || from == to) return;
    Row tmp = t->rows[from];
    if (from < to) {
        memmove(&t->rows[from], &t->rows[from + 1], (to - from) * sizeof(Row));
    } else {
        memmove(&t->rows[to + 1], &t->rows[to], (from - to) * sizeof(Row));
    }
    t->rows[to] = tmp;
}
