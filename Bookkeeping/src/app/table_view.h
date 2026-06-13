#pragma once
#include "src/core/arena.h"
#include "src/core/model/table.h"
#include "src/graphics/ui.h"
#include "src/graphics/node_builder.h"
#include <cstdio>

// Table renderer: builds a LayoutNode tree from a Table model.
// Uses GridLayout for the table body, with sticky-style header row.
// Returns a root node ready for compute() + render().

struct TableViewConfig {
    float cell_height = 28;
    float header_height = 30;
    float col_min_width = 80;
    float gap = 1;
    float viewport_width = 600;
    float viewport_height = 400;
    Color header_bg = {40, 40, 50, 255};
    Color header_text = {220, 220, 220, 255};
    Color cell_bg_even = {30, 30, 35, 255};
    Color cell_bg_odd = {38, 38, 44, 255};
    Color cell_text = {200, 200, 200, 255};
    Color border = {60, 60, 70, 255};
    // Active cell highlight
    Color active_cell_bg = {219, 234, 254, 255};  // #dbeafe
    Color active_cell_border = {71, 85, 105, 255}; // #475569
    int32_t active_row = -1;  // -1 = no active cell
    int16_t active_col = -1;
};

// Build the table view tree. All allocations from the provided arena.
inline LayoutNode* table_view_build(Arena* a, const Table* table, const TableViewConfig& cfg) {
    uint16_t cols = table->col_count;
    uint32_t rows = table->row_count;

    // Compute column widths (based on header text measurement, min cfg.col_min_width)
    float* col_widths = (float*)arena_alloc(a, sizeof(float) * cols, 4);
    for (uint16_t c = 0; c < cols; c++) {
        TextMeasure m = measure_text(table->columns[c].name.data, table->columns[c].name.len,
                                     "sans", 12, TEXT_BOLD);
        col_widths[c] = m.width + 16;
        if (col_widths[c] < cfg.col_min_width) col_widths[c] = cfg.col_min_width;
    }

    // ── Header row ───────────────────────────────────────────────────────────
    auto header_kids = (LayoutNode**)arena_alloc(a, sizeof(LayoutNode*) * cols, 8);
    for (uint16_t c = 0; c < cols; c++) {
        auto cell = Box(a, col_widths[c], cfg.header_height)
            .bg(cfg.header_bg, cfg.border, 1)
            .text(table->columns[c].name.data, 12, cfg.header_text, TEXT_BOLD);
        header_kids[c] = build(cell);
    }
    Node* header = node_linear_h(a);
    header->set_gap(cfg.gap).size(0, cfg.header_height).set_id("table-header");
    header->set_children(header_kids, cols);

    // ── Data rows ────────────────────────────────────────────────────────────
    auto row_nodes = (LayoutNode**)arena_alloc(a, sizeof(LayoutNode*) * rows, 8);
    for (uint32_t r = 0; r < rows; r++) {
        auto cell_kids = (LayoutNode**)arena_alloc(a, sizeof(LayoutNode*) * cols, 8);
        Color bg = (r % 2 == 0) ? cfg.cell_bg_even : cfg.cell_bg_odd;
        for (uint16_t c = 0; c < cols; c++) {
            Str val = table_get_cell(table, r, c);
            bool is_active = ((int32_t)r == cfg.active_row && (int16_t)c == cfg.active_col);
            Color cell_bg = is_active ? cfg.active_cell_bg : bg;
            Color cell_border = is_active ? cfg.active_cell_border : cfg.border;
            float sw = is_active ? 2.0f : 1.0f;
            auto cell = Box(a, col_widths[c], cfg.cell_height)
                .bg(cell_bg, cell_border, sw)
                .text(val.data, 12, cfg.cell_text);
            cell_kids[c] = build(cell);
        }
        Node* row = node_linear_h(a);
        row->set_gap(cfg.gap).size(0, cfg.cell_height);
        row->set_children(cell_kids, cols);
        // Set row id
        char* rid = (char*)arena_alloc(a, 16, 1);
        snprintf(rid, 16, "row-%u", r);
        row->set_id(rid);
        row_nodes[r] = row;
    }

    // ── Scroll viewport for data rows ────────────────────────────────────────
    Node* scroll = node_scroll(a, cfg.viewport_width, cfg.viewport_height);
    scroll->set_gap(0).set_id("table-scroll");
    scroll->set_children(row_nodes, rows);

    // ── Root: header + scroll ────────────────────────────────────────────────
    auto root_kids = (LayoutNode**)arena_alloc(a, sizeof(LayoutNode*) * 2, 8);
    root_kids[0] = header;
    root_kids[1] = scroll;

    Node* root = node_linear_v(a);
    root->set_gap(0).set_id("table-view");
    root->set_children(root_kids, 2);

    return root;
}
