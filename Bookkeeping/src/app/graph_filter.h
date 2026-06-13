#pragma once
#include "src/core/arena.h"
#include "src/core/model/table.h"
#include "src/core/model/graph.h"
#include "src/core/str.h"
#include <cstring>

// ══════════════════════════════════════════════════════════════════════════════
// Graph Filter — filter table rows by graph relationship membership
// ══════════════════════════════════════════════════════════════════════════════

// Check if a cell value appears as a node ID in the graph
inline bool graph_has_entity(const Graph* g, const char* entity) {
    return g->find_node(entity) >= 0;
}

// Filter table: returns array of row indices where column `col` value is a node in graph
struct FilterResult {
    uint32_t* rows;
    uint32_t count;
};

inline FilterResult graph_filter_table(Arena* a, const Table* t, uint16_t col, const Graph* g, uint32_t max_results = 512) {
    FilterResult fr;
    fr.rows = (uint32_t*)arena_alloc(a, sizeof(uint32_t) * max_results, 4);
    fr.count = 0;
    for (uint32_t r = 0; r < t->row_count && fr.count < max_results; r++) {
        Str val = table_get_cell(t, r, col);
        if (val.len > 0 && val.data && g->find_node(val.data) >= 0) {
            fr.rows[fr.count++] = r;
        }
    }
    return fr;
}

// Filter by specific edge relation: rows where col value has edge of given type
inline FilterResult graph_filter_by_relation(Arena* a, const Table* t, uint16_t col,
                                              const Graph* g, const char* relation, uint32_t max_results = 512) {
    FilterResult fr;
    fr.rows = (uint32_t*)arena_alloc(a, sizeof(uint32_t) * max_results, 4);
    fr.count = 0;
    for (uint32_t r = 0; r < t->row_count && fr.count < max_results; r++) {
        Str val = table_get_cell(t, r, col);
        if (val.len == 0 || !val.data) continue;
        int node_idx = g->find_node(val.data);
        if (node_idx < 0) continue;
        // Check if this node has an edge with the given relation label
        for (uint16_t e = 0; e < g->edge_count; e++) {
            if ((g->edges[e].from == (uint16_t)node_idx || g->edges[e].to == (uint16_t)node_idx) &&
                g->edges[e].label && strcmp(g->edges[e].label, relation) == 0) {
                fr.rows[fr.count++] = r;
                break;
            }
        }
    }
    return fr;
}

// Get all unique relation types (edge labels) in a graph
struct RelationList {
    const char** labels;
    uint16_t count;
};

inline RelationList graph_get_relations(Arena* a, const Graph* g) {
    RelationList rl;
    rl.labels = (const char**)arena_alloc(a, sizeof(const char*) * 32, 8);
    rl.count = 0;
    for (uint16_t e = 0; e < g->edge_count && rl.count < 32; e++) {
        if (!g->edges[e].label) continue;
        bool found = false;
        for (uint16_t i = 0; i < rl.count; i++) {
            if (strcmp(rl.labels[i], g->edges[e].label) == 0) { found = true; break; }
        }
        if (!found) rl.labels[rl.count++] = g->edges[e].label;
    }
    return rl;
}

// Get associations for a specific entity (outgoing + incoming edges)
struct Association {
    const char* relation;
    const char* target;
    bool outgoing; // true = from this entity, false = to this entity
};

struct AssociationResult {
    Association* items;
    uint16_t count;
};

inline AssociationResult graph_get_associations(Arena* a, const Graph* g, const char* entity_id) {
    AssociationResult ar;
    ar.items = (Association*)arena_alloc(a, sizeof(Association) * 64, 8);
    ar.count = 0;
    int idx = g->find_node(entity_id);
    if (idx < 0) return ar;
    for (uint16_t e = 0; e < g->edge_count && ar.count < 64; e++) {
        if (g->edges[e].from == (uint16_t)idx) {
            ar.items[ar.count++] = {g->edges[e].label, g->nodes[g->edges[e].to].id, true};
        } else if (g->edges[e].to == (uint16_t)idx) {
            ar.items[ar.count++] = {g->edges[e].label, g->nodes[g->edges[e].from].id, false};
        }
    }
    return ar;
}
