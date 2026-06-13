#pragma once
#include "src/core/arena.h"
#include "src/graphics/ui.h"
#include <cstring>

// ── Tab strip: open, close, switch tabs ──────────────────────────────────────

struct Tab {
    const char* label;
    const char* id;        // unique tab identifier
    bool active;
};

struct TabStrip {
    Tab* tabs;
    uint16_t count;
    uint16_t capacity;
    uint16_t active_index; // index of active tab (UINT16_MAX = none)

    void init(Arena* a, uint16_t cap = 16) {
        tabs = (Tab*)arena_alloc(a, sizeof(Tab) * cap, 8);
        count = 0;
        capacity = cap;
        active_index = UINT16_MAX;
    }

    int open(const char* label, const char* id) {
        // If already open, just activate
        for (uint16_t i = 0; i < count; i++) {
            if (strcmp(tabs[i].id, id) == 0) { activate(i); return i; }
        }
        if (count >= capacity) return -1;
        uint16_t idx = count++;
        tabs[idx] = {label, id, false};
        activate(idx);
        return idx;
    }

    void close(uint16_t idx) {
        if (idx >= count) return;
        memmove(&tabs[idx], &tabs[idx + 1], (count - idx - 1) * sizeof(Tab));
        count--;
        if (active_index == idx) {
            active_index = (count > 0) ? (idx > 0 ? idx - 1 : 0) : UINT16_MAX;
            if (active_index < count) tabs[active_index].active = true;
        } else if (active_index > idx && active_index != UINT16_MAX) {
            active_index--;
        }
    }

    void close_by_id(const char* id) {
        for (uint16_t i = 0; i < count; i++) {
            if (strcmp(tabs[i].id, id) == 0) { close(i); return; }
        }
    }

    void activate(uint16_t idx) {
        if (idx >= count) return;
        if (active_index < count) tabs[active_index].active = false;
        active_index = idx;
        tabs[idx].active = true;
    }

    const Tab* active_tab() const {
        return (active_index < count) ? &tabs[active_index] : nullptr;
    }

    int find(const char* id) const {
        for (uint16_t i = 0; i < count; i++)
            if (strcmp(tabs[i].id, id) == 0) return i;
        return -1;
    }
};

// ── Render tab strip to LayoutNode ───────────────────────────────────────────

inline LayoutNode* tab_strip_build(Arena* a, const TabStrip* strip, float max_width = 600) {
    auto hstack = HStack(a, 2).size(max_width, 26).id("tab-strip");

    Color active_bg = {60, 60, 80, 255};
    Color inactive_bg = {35, 35, 45, 255};
    Color active_text = {255, 255, 255, 255};
    Color inactive_text = {160, 160, 160, 255};
    Color border = {80, 80, 100, 255};

    for (uint16_t i = 0; i < strip->count; i++) {
        Color bg = strip->tabs[i].active ? active_bg : inactive_bg;
        Color txt = strip->tabs[i].active ? active_text : inactive_text;

        TextMeasure m = measure_text(strip->tabs[i].label, (uint32_t)strlen(strip->tabs[i].label), "sans", 11, TEXT_NORMAL);

        // Close button id: "close:tabid"
        char* close_id = (char*)arena_alloc(a, strlen(strip->tabs[i].id) + 7, 1);
        snprintf(close_id, strlen(strip->tabs[i].id) + 7, "close:%s", strip->tabs[i].id);

        auto close_btn = Box(a, 16, 24).id(close_id)
            .text("x", 11, txt);

        auto tab = HStack(a, 0).size(m.width + 32, 24).id(strip->tabs[i].id)
            .bg(bg, border, 1)
            .child(Box(a, m.width + 12, 24).text(strip->tabs[i].label, 11, txt))
            .child(std::move(close_btn));

        hstack.child(std::move(tab));
    }

    return build(hstack);
}
