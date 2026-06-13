#pragma once
#include "src/core/color.h"

// ══════════════════════════════════════════════════════════════════════════════
// Theme — Webapp-matching light theme (from style.css design tokens)
// ══════════════════════════════════════════════════════════════════════════════

struct Theme {
    // Backgrounds
    Color bg;              // page background
    Color surface;         // panel/card background
    Color accent_light;    // hover highlight, status bar

    // Borders
    Color border;          // standard border
    Color border_light;    // lighter separator
    Color border_heavy;    // tab bar bottom, header underline

    // Text
    Color text;            // primary text
    Color text_secondary;  // secondary text
    Color text_muted;      // annotations, labels

    // Tabs
    Color tab_bar_bg;      // tab bar background
    Color tab_inactive_bg; // inactive tab
    Color tab_inactive_border;
    Color tab_inactive_text;
    Color tab_active_bg;   // active tab (= surface)
    Color tab_active_text;

    // Table
    Color table_header_bg;
    Color table_header_border;
    Color table_header_text;
    Color table_row_hover;
    Color table_cell_border;
    Color table_rownum_text;

    // Cells
    Color cell_active_outline;
    Color cell_selected_bg;
    Color cell_selected_outline;

    // Status bar
    Color status_bg;
    Color status_text;

    // Toolbar
    Color toolbar_bg;
    Color toolbar_btn_border;
    Color toolbar_btn_text;
    Color toolbar_btn_hover;

    // Nav tree
    Color nav_bg;
    Color nav_header_bg;
    Color nav_header_text;
    Color nav_item_text;
    Color nav_item_hover;
    Color nav_folder_arrow;

    // Errors
    Color error_text;
    Color error_bg;
    Color error_border;

    // Search
    Color search_highlight;  // match highlight (yellow)

    // Sidebar
    Color sidebar_bg;

    // Font sizes (in pixels, as float for layout)
    float font_base;
    float font_small;
    float font_tiny;
    float font_heading;
};

// ── Webapp light theme (extracted from style.css :root tokens) ────────────────

inline Theme theme_light() {
    Theme t = {};

    // Backgrounds
    t.bg            = {248, 250, 252, 255};  // #f8fafc
    t.surface       = {255, 255, 255, 255};  // #ffffff
    t.accent_light  = {241, 245, 249, 255};  // #f1f5f9

    // Borders
    t.border        = {226, 232, 240, 255};  // #e2e8f0
    t.border_light  = {241, 245, 249, 255};  // #f1f5f9
    t.border_heavy  = {203, 213, 225, 255};  // #cbd5e1

    // Text
    t.text          = { 30,  41,  59, 255};  // #1e293b
    t.text_secondary= { 51,  65,  85, 255};  // #334155
    t.text_muted    = {100, 116, 139, 255};  // #64748b

    // Tabs
    t.tab_bar_bg    = {226, 232, 240, 255};  // #e2e8f0
    t.tab_inactive_bg = {203, 213, 225, 255};// #cbd5e1
    t.tab_inactive_border = {148, 163, 184, 255}; // #94a3b8
    t.tab_inactive_text = {71, 85, 105, 255};// #475569
    t.tab_active_bg = {255, 255, 255, 255};  // white
    t.tab_active_text = {30, 41, 59, 255};   // #1e293b

    // Table
    t.table_header_bg = {248, 250, 252, 255};// #f8fafc (--bg)
    t.table_header_border = {203, 213, 225, 255}; // #cbd5e1
    t.table_header_text = {100, 116, 139, 255}; // #64748b
    t.table_row_hover = {248, 250, 252, 255};// #f8fafc
    t.table_cell_border = {226, 232, 240, 255}; // #e2e8f0
    t.table_rownum_text = {148, 163, 184, 255}; // #94a3b8

    // Cells
    t.cell_active_outline = {71, 85, 105, 255}; // #475569
    t.cell_selected_bg = {219, 234, 254, 255};  // #dbeafe
    t.cell_selected_outline = {59, 130, 246, 255}; // #3b82f6

    // Status bar
    t.status_bg = {241, 245, 249, 255};      // #f1f5f9
    t.status_text = {100, 116, 139, 255};    // #64748b

    // Toolbar
    t.toolbar_bg = {255, 255, 255, 255};
    t.toolbar_btn_border = {226, 232, 240, 255};
    t.toolbar_btn_text = {51, 65, 85, 255};
    t.toolbar_btn_hover = {241, 245, 249, 255};

    // Nav tree
    t.nav_bg = {248, 250, 252, 255};
    t.nav_header_bg = {241, 245, 249, 255};
    t.nav_header_text = {100, 116, 139, 255};
    t.nav_item_text = {51, 65, 85, 255};
    t.nav_item_hover = {226, 232, 240, 255}; // #e2e8f0
    t.nav_folder_arrow = {148, 163, 184, 255};

    // Errors
    t.error_text = {239, 68, 68, 255};       // #ef4444
    t.error_bg = {254, 242, 242, 255};       // #fef2f2
    t.error_border = {254, 202, 202, 255};   // #fecaca

    // Search
    t.search_highlight = {254, 240, 138, 255}; // #fef08a

    // Sidebar
    t.sidebar_bg = {248, 250, 252, 255};

    // Font sizes
    t.font_base = 13.0f;
    t.font_small = 11.4f;   // 0.88em
    t.font_tiny = 10.1f;    // 0.78em
    t.font_heading = 14.3f; // 1.1em

    return t;
}
