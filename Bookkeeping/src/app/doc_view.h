#pragma once
#include "src/core/arena.h"
#include "src/core/model/table.h"
#include "src/app/table_view.h"
#include "src/graphics/ui.h"
#include "src/graphics/node_builder.h"
#include <cstring>

// ══════════════════════════════════════════════════════════════════════════════
// Document View — renders multiple tables as collapsible sections in one view
// ══════════════════════════════════════════════════════════════════════════════

struct DocSection {
    const char* id;
    const char* title;
    Table* table;       // nullptr if graph (future)
    bool collapsed;
};

struct DocumentModel {
    const char* name;
    DocSection* sections;
    uint16_t section_count;
    uint16_t section_capacity;
};

inline DocumentModel* doc_create(Arena* a, const char* name, uint16_t cap = 32) {
    DocumentModel* d = arena_new<DocumentModel>(a);
    d->name = name;
    d->sections = (DocSection*)arena_alloc(a, sizeof(DocSection) * cap, 8);
    d->section_count = 0;
    d->section_capacity = cap;
    return d;
}

inline void doc_add_section(DocumentModel* d, const char* id, const char* title, Table* table) {
    if (d->section_count >= d->section_capacity) return;
    d->sections[d->section_count++] = {id, title, table, false};
}

// ── Build document view ──────────────────────────────────────────────────────

struct DocViewConfig {
    float width = 600;
    float height = 400;
    float section_header_h = 28;
    float table_max_rows = 50;  // limit rows per section to avoid massive builds
    Color bg = {248, 250, 252, 255};
    Color header_bg = {241, 245, 249, 255};
    Color header_text = {30, 41, 59, 255};
    Color header_border = {226, 232, 240, 255};
    Color title_text = {30, 41, 59, 255};
    Color toggle_color = {100, 116, 139, 255};
    float font_title = 14;
    float font_section = 12;
    float font_tiny = 10;
};

inline LayoutNode* doc_view_build(Arena* a, DocumentModel* doc, const DocViewConfig& cfg) {
    // Title bar (sticky-like)
    auto title_bar = HStack(a, 0).size(cfg.width, 30)
        .bg(cfg.bg, cfg.header_border, 1)
        .text(doc->name, cfg.font_title, cfg.title_text, TEXT_BOLD);

    // Sections stacked vertically
    auto sections = VStack(a, 0).size(cfg.width, 0).id("doc-sections");

    for (uint16_t i = 0; i < doc->section_count; i++) {
        DocSection& sec = doc->sections[i];

        // Section header (clickable to collapse/expand)
        const char* toggle = sec.collapsed ? "\xe2\x96\xb6 " : "\xe2\x96\xbc "; // ▶ or ▼
        char* hdr_text = (char*)arena_alloc(a, strlen(toggle) + strlen(sec.title) + 1, 1);
        snprintf(hdr_text, strlen(toggle) + strlen(sec.title) + 1, "%s%s", toggle, sec.title);

        auto header = HStack(a, 4).size(cfg.width, cfg.section_header_h).id(sec.id)
            .bg(cfg.header_bg, cfg.header_border, 1)
            .text(hdr_text, cfg.font_section, cfg.header_text, TEXT_BOLD);
        sections.child(std::move(header));

        // Section body (table) — only if not collapsed
        if (!sec.collapsed && sec.table) {
            TableViewConfig tvcfg;
            tvcfg.viewport_width = cfg.width;
            tvcfg.viewport_height = 0; // auto from rows
            tvcfg.header_bg = cfg.bg;
            tvcfg.header_text = {100, 116, 139, 255};
            tvcfg.cell_bg_even = {255, 255, 255, 255};
            tvcfg.cell_bg_odd = {255, 255, 255, 255};
            tvcfg.cell_text = {51, 65, 85, 255};
            tvcfg.border = cfg.header_border;

            // Limit rows for performance
            uint32_t show_rows = sec.table->row_count;
            if (show_rows > (uint32_t)cfg.table_max_rows) show_rows = (uint32_t)cfg.table_max_rows;

            // Build inline table (no scroll — document scrolls as a whole)
            uint16_t cols = sec.table->col_count;
            auto tbl = VStack(a, 0).size(cfg.width, 0);

            // Column headers
            auto hdr_row = HStack(a, 1).size(0, 22);
            for (uint16_t c = 0; c < cols; c++) {
                float cw = cfg.width / cols;
                hdr_row.child(Box(a, cw, 22)
                    .bg(cfg.bg, cfg.header_border, 1)
                    .text(sec.table->columns[c].name.data, cfg.font_tiny, {100,116,139,255}, TEXT_BOLD));
            }
            tbl.child(std::move(hdr_row));

            // Data rows
            for (uint32_t r = 0; r < show_rows; r++) {
                auto row = HStack(a, 1).size(0, 22);
                for (uint16_t c = 0; c < cols; c++) {
                    float cw = cfg.width / cols;
                    Str val = table_get_cell(sec.table, r, c);
                    row.child(Box(a, cw, 22)
                        .bg({255,255,255,255}, cfg.header_border, 1)
                        .text(val.data ? val.data : "", cfg.font_tiny, {51,65,85,255}));
                }
                tbl.child(std::move(row));
            }

            if (sec.table->row_count > (uint32_t)cfg.table_max_rows) {
                char* more = (char*)arena_alloc(a, 32, 1);
                snprintf(more, 32, "  ... +%u more rows", sec.table->row_count - (uint32_t)cfg.table_max_rows);
                tbl.child(Box(a, cfg.width, 18).text(more, cfg.font_tiny, cfg.toggle_color));
            }

            sections.child(std::move(tbl));
        }
    }

    // Wrap in scroll
    auto content = VStack(a, 0).size(cfg.width, 0);
    content.child(std::move(sections));
    LayoutNode* content_node = build(content);

    Node* scroll = node_scroll(a, cfg.width, cfg.height);
    scroll->set_id("doc-scroll");
    auto scroll_kids = make_children(a, 1);
    scroll_kids[0] = content_node;
    scroll->set_children(scroll_kids, 1);

    // Root: title + scroll
    auto root = VStack(a, 0).size(cfg.width, cfg.height + 30).id("doc-view");
    root.child(std::move(title_bar));
    root.child(UI{*scroll, a});
    return build(root);
}
