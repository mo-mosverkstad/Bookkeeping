#pragma once
#include "src/core/str.h"
#include "src/core/arena.h"
#include <cstdint>

// Column: name + type identifier
struct Column {
    Str name;
    Str type_id;
};

// Cell: value string + type reference
struct Cell {
    Str value;
    Str type_id;
};

// Row: array of cells
struct Row {
    Cell* cells;
    uint16_t cell_count;
};

// Table: columns + rows, all arena-allocated
struct Table {
    Str name;
    Column* columns;
    uint16_t col_count;
    Row* rows;
    uint32_t row_count;
    uint32_t row_capacity; // for dynamic growth
};

// ── Table API ────────────────────────────────────────────────────────────────

// Create an empty table with given columns (arena-allocated)
Table* table_create(Arena* a, Str name, Column* cols, uint16_t col_count, uint32_t initial_capacity);

// Get cell value (returns empty Str if out of bounds)
Str table_get_cell(const Table* t, uint32_t row, uint16_t col);

// Set cell value (arena-allocates the new string)
void table_set_cell(Arena* a, Table* t, uint32_t row, uint16_t col, Str value);

// Append an empty row, returns its index
uint32_t table_append_row(Arena* a, Table* t);

// Insert an empty row at index, shifting subsequent rows
void table_insert_row(Arena* a, Table* t, uint32_t at);

// Remove row at index, shifting subsequent rows down
void table_remove_row(Table* t, uint32_t at);

// Move row from one index to another
void table_move_row(Table* t, uint32_t from, uint32_t to);
