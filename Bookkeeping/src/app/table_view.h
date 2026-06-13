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
    // Persistent scroll offsets
    float scroll_x = 0;
    float scroll_y = 0;
};

// Build the table view tree. All allocations from the provided arena.
inline LayoutNode* table_view_build(Arena* a, const Table* table, const TableViewConfig& cfg) {
    uint16_t cols = table->col_count;
    uint32_t rows = table->row_count;

    // Compute column widths (based on header text measurement, min cfg.col_min_width)
    float* col_widths = (float*)arena_alloc(a, sizeof(float) * cols, 4);
    if (!col_widths) return node_leaf(a, 100, 20); // OOM guard
    for (uint16_t c = 0; c < cols; c++) {
        // Start with header width
        TextMeasure m = measure_text(table->columns[c].name.data, table->columns[c].name.len,
                                     "sans", 12, TEXT_BOLD);
        col_widths[c] = m.width + 16;
        // Scan data rows for wider values
        uint32_t scan = rows < 50 ? rows : 50; // sample first 50 rows for performance
        for (uint32_t r = 0; r < scan; r++) {
            Str val = table_get_cell(table, r, c);
            if (val.len > 0) {
                TextMeasure cm = measure_text(val.data, val.len, "sans", 12, TEXT_NORMAL);
                float w = cm.width + 16;
                if (w > col_widths[c]) col_widths[c] = w;
            }
        }
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
        // First pass: measure row height from tallest cell
        float row_h = cfg.cell_height;
        for (uint16_t c = 0; c < cols; c++) {
            Str val = table_get_cell(table, r, c);
            if (val.len > 0 && val.data) {
                // Count lines manually for reliable height
                uint32_t lines = 1;
                for (uint32_t i = 0; i < val.len; i++)
                    if (val.data[i] == '\n') lines++;
                float needed = lines * 14.0f + 8; // 14px line height + padding
                if (needed > row_h) row_h = needed;
            }
        }
        // Second pass: build cells with computed row height
        for (uint16_t c = 0; c < cols; c++) {
            Str val = table_get_cell(table, r, c);
            bool is_active = ((int32_t)r == cfg.active_row && (int16_t)c == cfg.active_col);
            Color cell_bg = is_active ? cfg.active_cell_bg : bg;
            Color cell_border = is_active ? cfg.active_cell_border : cfg.border;
            float sw = is_active ? 2.0f : 1.0f;
            auto cell = Box(a, col_widths[c], row_h)
                .bg(cell_bg, cell_border, sw)
                .text(val.data, 12, cfg.cell_text);
            cell_kids[c] = build(cell);
        }
        Node* row = node_linear_h(a);
        row->set_gap(cfg.gap).size(0, row_h);
        row->set_children(cell_kids, cols);
        // Set row id
        char* rid = (char*)arena_alloc(a, 16, 1);
        snprintf(rid, 16, "row-%u", r);
        row->set_id(rid);
        row_nodes[r] = row;
    }

    // ── Scroll viewport for data rows ────────────────────────────────────────
    // Compute total table width from columns
    float total_w = 0;
    for (uint16_t c = 0; c < cols; c++) total_w += col_widths[c] + cfg.gap;
    // Scroll viewport = visible area; content may be wider and scrolls within
    Node* scroll = node_scroll(a, cfg.viewport_width, cfg.viewport_height);
    scroll->set_gap(0).set_id("table-scroll");
    scroll->scroll_x = cfg.scroll_x;
    scroll->scroll_y = cfg.scroll_y;
    scroll->set_children(row_nodes, rows);

    // ── Scroll bars (as overlay nodes after scroll in a coordinate wrapper) ──
    float total_h = 0;
    for (uint32_t r = 0; r < rows; r++) total_h += cfg.cell_height + cfg.gap;
    bool need_vbar = total_h > cfg.viewport_height;
    bool need_hbar = total_w > cfg.viewport_width;

    // Wrap scroll + bars in a coordinate layout
    Node* wrapper = node_coord(a);
    wrapper->size(cfg.viewport_width, cfg.viewport_height).set_id("table-scroll-wrapper");
    uint16_t wrapper_kids_count = 1 + (need_vbar ? 1 : 0) + (need_hbar ? 1 : 0);
    auto wrapper_kids = make_children(a, wrapper_kids_count);
    scroll->pos(0, 0);
    wrapper_kids[0] = scroll;
    uint16_t wi = 1;
    if (need_vbar) {
        float ratio = cfg.viewport_height / total_h;
        float bar_h = ratio * cfg.viewport_height;
        if (bar_h < 20) bar_h = 20;
        float bar_y = 0;
        if (total_h > cfg.viewport_height && cfg.scroll_y > 0)
            bar_y = (cfg.scroll_y / (total_h - cfg.viewport_height)) * (cfg.viewport_height - bar_h);
        Node* vbar = node_leaf(a, 6, bar_h);
        vbar->pos(cfg.viewport_width - 10, bar_y + 2);
        vbar->attach(make_elements(a, 1), 1);
        vbar->elements[0] = elem_rect({0, 0, 6, bar_h, {140, 145, 155, 200}, COLOR_TRANSPARENT, 0, 3});
        wrapper_kids[wi++] = vbar;
    }
    if (need_hbar) {
        float ratio = cfg.viewport_width / total_w;
        float bar_w = ratio * cfg.viewport_width;
        if (bar_w < 20) bar_w = 20;
        float bar_x = 0;
        if (total_w > cfg.viewport_width && cfg.scroll_x > 0)
            bar_x = (cfg.scroll_x / (total_w - cfg.viewport_width)) * (cfg.viewport_width - bar_w);
        Node* hbar = node_leaf(a, bar_w, 6);
        hbar->pos(bar_x + 2, cfg.viewport_height - 10);
        hbar->attach(make_elements(a, 1), 1);
        hbar->elements[0] = elem_rect({0, 0, bar_w, 6, {140, 145, 155, 200}, COLOR_TRANSPARENT, 0, 3});
        wrapper_kids[wi++] = hbar;
    }
    wrapper->set_children(wrapper_kids, wi);

    // ── Root: header + wrapper ───────────────────────────────────────────────
    auto root_kids = (LayoutNode**)arena_alloc(a, sizeof(LayoutNode*) * 2, 8);
    root_kids[0] = header;
    root_kids[1] = wrapper;

    Node* root = node_linear_v(a);
    root->set_gap(0).set_id("table-view");
    root->set_children(root_kids, 2);

    return root;
}
