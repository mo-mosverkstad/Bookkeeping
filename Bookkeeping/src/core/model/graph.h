#pragma once
#include "src/core/arena.h"
#include "src/core/str.h"
#include <cstdint>

struct GraphNode {
    const char* id;
    const char* label;
    float x, y;        // position (computed by layout)
    float w, h;        // size
};

struct GraphEdge {
    uint16_t from;     // index into nodes array
    uint16_t to;
    const char* label; // optional edge label
};

struct Graph {
    GraphNode* nodes;
    uint16_t node_count;
    uint16_t node_capacity;
    GraphEdge* edges;
    uint16_t edge_count;
    uint16_t edge_capacity;
    const char* name;

    void init(Arena* a, const char* n, uint16_t node_cap = 64, uint16_t edge_cap = 128) {
        name = n;
        nodes = (GraphNode*)arena_alloc(a, sizeof(GraphNode) * node_cap, 8);
        node_count = 0; node_capacity = node_cap;
        edges = (GraphEdge*)arena_alloc(a, sizeof(GraphEdge) * edge_cap, 8);
        edge_count = 0; edge_capacity = edge_cap;
    }

    uint16_t add_node(const char* id, const char* label) {
        if (node_count >= node_capacity) return node_count;
        uint16_t idx = node_count++;
        nodes[idx] = {id, label, 0, 0, 100, 30};
        return idx;
    }

    void add_edge(uint16_t from, uint16_t to, const char* label = nullptr) {
        if (edge_count >= edge_capacity) return;
        edges[edge_count++] = {from, to, label};
    }

    int find_node(const char* id) const {
        for (uint16_t i = 0; i < node_count; i++)
            if (strcmp(nodes[i].id, id) == 0) return i;
        return -1;
    }

    // Simple layered layout: assigns positions in a grid pattern
    void layout_grid(float start_x = 50, float start_y = 50, float h_gap = 150, float v_gap = 60, uint16_t cols = 3) {
        for (uint16_t i = 0; i < node_count; i++) {
            nodes[i].x = start_x + (i % cols) * h_gap;
            nodes[i].y = start_y + (i / cols) * v_gap;
        }
    }
};
