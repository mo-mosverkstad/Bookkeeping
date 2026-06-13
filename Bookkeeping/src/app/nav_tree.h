#pragma once
#include "src/core/arena.h"
#include "src/graphics/ui.h"
#include <cstring>
#include <cstdio>

// ── Navigation tree: expandable/collapsible hierarchy ────────────────────────

struct NavNode {
    const char* label;
    const char* id;          // unique identifier for actions
    NavNode* children;
    uint16_t child_count;
    uint16_t child_capacity;
    bool expanded;
    uint8_t depth;           // nesting level (0 = root)
};

struct NavTree {
    NavNode* root;           // top-level nodes array
    uint16_t root_count;
    uint16_t root_capacity;

    void init(Arena* a, uint16_t cap = 32) {
        root = (NavNode*)arena_alloc(a, sizeof(NavNode) * cap, 8);
        root_count = 0;
        root_capacity = cap;
    }

    NavNode* add_root(Arena* a, const char* label, const char* id, uint16_t child_cap = 16) {
        if (root_count >= root_capacity) return nullptr;
        NavNode* n = &root[root_count++];
        n->label = label;
        n->id = id;
        n->children = (NavNode*)arena_alloc(a, sizeof(NavNode) * child_cap, 8);
        n->child_count = 0;
        n->child_capacity = child_cap;
        n->expanded = true;
        n->depth = 0;
        return n;
    }

    static NavNode* add_child(Arena* a, NavNode* parent, const char* label, const char* id, uint16_t child_cap = 8) {
        if (parent->child_count >= parent->child_capacity) return nullptr;
        NavNode* n = &parent->children[parent->child_count++];
        n->label = label;
        n->id = id;
        n->children = child_cap > 0 ? (NavNode*)arena_alloc(a, sizeof(NavNode) * child_cap, 8) : nullptr;
        n->child_count = 0;
        n->child_capacity = child_cap;
        n->expanded = false;
        n->depth = parent->depth + 1;
        return n;
    }

    // Toggle expand/collapse by id. Returns the toggled node or nullptr.
    NavNode* toggle(const char* id) {
        NavNode* found = find_recursive(root, root_count, id);
        if (found) found->expanded = !found->expanded;
        return found;
    }

private:
    static NavNode* find_recursive(NavNode* nodes, uint16_t count, const char* id) {
        for (uint16_t i = 0; i < count; i++) {
            if (strcmp(nodes[i].id, id) == 0) return &nodes[i];
            if (nodes[i].child_count > 0) {
                NavNode* r = find_recursive(nodes[i].children, nodes[i].child_count, id);
                if (r) return r;
            }
        }
        return nullptr;
    }
};

// ── Render navigation tree to LayoutNode ─────────────────────────────────────

static inline void nav_render_node(Arena* a, NavNode* node, UI& parent, float indent_px, float row_h) {
    float x_off = node->depth * indent_px;
    const char* prefix = (node->child_count > 0) ? (node->expanded ? "▼ " : "▶ ") : "  ";
    char* text = (char*)arena_alloc(a, strlen(prefix) + strlen(node->label) + 1, 1);
    snprintf(text, strlen(prefix) + strlen(node->label) + 1, "%s%s", prefix, node->label);

    auto row = HStack(a, 0).size(0, row_h).id(node->id);
    if (x_off > 0) row.child(Box(a, x_off, row_h)); // indent spacer
    row.child(Label(a, text, 11, COLOR_WHITE));
    parent.child(std::move(row));

    if (node->expanded) {
        for (uint16_t i = 0; i < node->child_count; i++)
            nav_render_node(a, &node->children[i], parent, indent_px, row_h);
    }
}

inline LayoutNode* nav_tree_build(Arena* a, NavTree* tree, float width = 200, float height = 300) {
    auto vstack = VStack(a, 1).size(width, 0).id("nav-tree");
    for (uint16_t i = 0; i < tree->root_count; i++)
        nav_render_node(a, &tree->root[i], vstack, 14, 20);

    // Wrap in scroll if needed
    auto scroll = Scroll(a, width, height, 0).id("nav-scroll").child(std::move(vstack));
    return build(scroll);
}
