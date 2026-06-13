#pragma once
#include "src/core/arena.h"
#include "src/app/tab_strip.h"
#include "src/app/nav_tree.h"
#include "src/graphics/layout/layout.h"
#include <cstring>

// ── Workspace: manages views (mount/unmount), tabs, and nav tree ─────────────

enum ViewType : uint8_t {
    VIEW_NONE = 0,
    VIEW_TABLE,
    VIEW_GRAPH,
    VIEW_SEARCH_RESULTS,
    VIEW_DOCUMENT,
};

struct ViewSlot {
    const char* id;
    ViewType type;
    void* data;            // pointer to Table*, Graph*, SearchResult*, etc.
    LayoutNode* cached_tree; // last rendered layout (nullptr = needs rebuild)
    float scroll_x, scroll_y; // per-view scroll state
};

struct Workspace {
    TabStrip tabs;
    NavTree nav;
    ViewSlot* views;
    uint16_t view_count;
    uint16_t view_capacity;

    void init(Arena* a, uint16_t view_cap = 16) {
        tabs.init(a, view_cap);
        nav.init(a, view_cap);
        views = (ViewSlot*)arena_alloc(a, sizeof(ViewSlot) * view_cap, 8);
        memset(views, 0, sizeof(ViewSlot) * view_cap);
        view_count = 0;
        view_capacity = view_cap;
    }

    // Mount a view into the workspace (opens a tab and registers the view)
    int mount(const char* label, const char* id, ViewType type, void* data) {
        int tab_idx = tabs.open(label, id);
        if (tab_idx < 0) return -1;
        // Check if view already registered
        for (uint16_t i = 0; i < view_count; i++) {
            if (strcmp(views[i].id, id) == 0) {
                views[i].data = data;
                views[i].cached_tree = nullptr;
                return tab_idx;
            }
        }
        if (view_count >= view_capacity) return -1;
        views[view_count++] = {id, type, data, nullptr};
        return tab_idx;
    }

    // Unmount a view (closes tab, removes view slot)
    void unmount(const char* id) {
        tabs.close_by_id(id);
        for (uint16_t i = 0; i < view_count; i++) {
            if (strcmp(views[i].id, id) == 0) {
                memmove(&views[i], &views[i + 1], (view_count - i - 1) * sizeof(ViewSlot));
                view_count--;
                return;
            }
        }
    }

    // Get the active view slot (or nullptr)
    ViewSlot* active_view() {
        const Tab* t = tabs.active_tab();
        if (!t) return nullptr;
        for (uint16_t i = 0; i < view_count; i++)
            if (strcmp(views[i].id, t->id) == 0) return &views[i];
        return nullptr;
    }

    // Invalidate cached tree for a view (marks for rebuild)
    void invalidate(const char* id) {
        for (uint16_t i = 0; i < view_count; i++) {
            if (strcmp(views[i].id, id) == 0) { views[i].cached_tree = nullptr; return; }
        }
    }
};
