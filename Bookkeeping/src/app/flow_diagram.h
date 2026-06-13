#pragma once
#include "src/core/model/graph.h"
#include "src/core/arena.h"
#include "src/graphics/ui.h"
#include "src/graphics/node_builder.h"
#include <cmath>
#include <cstring>

// ══════════════════════════════════════════════════════════════════════════════
// Flow Diagram View — layered DAG layout with proper node positioning
// ══════════════════════════════════════════════════════════════════════════════

enum NodeShape : uint8_t { SHAPE_RECT = 0, SHAPE_ELLIPSE, SHAPE_DIAMOND };

struct FlowDiagramConfig {
    Color node_fill     = {255, 255, 255, 255};  // white
    Color node_stroke   = {71, 85, 105, 255};    // #475569
    Color node_text     = {30, 41, 59, 255};     // #1e293b
    Color edge_color    = {100, 116, 139, 255};  // #64748b
    Color arrow_color   = {71, 85, 105, 255};    // #475569
    Color bg            = {248, 250, 252, 255};  // #f8fafc
    float font_size     = 11;
    float node_h        = 32;
    float h_gap         = 40;   // horizontal gap between nodes in same rank
    float v_gap         = 60;   // vertical gap between ranks
    float viewport_width  = 600;
    float viewport_height = 400;
    float padding       = 30;
};

// ── Layered layout algorithm ─────────────────────────────────────────────────
// 1. Topological sort → assign ranks (longest path from source)
// 2. Position nodes within each rank (center-aligned)
// 3. Draw edges with arrowheads

struct FlowNode {
    uint16_t idx;
    int16_t rank;
    float x, y, w, h;
};

static inline void flow_assign_ranks(const Graph* g, int16_t* ranks) {
    // Longest-path layering: rank = longest path from any source
    for (uint16_t i = 0; i < g->node_count; i++) ranks[i] = -1;

    // Find sources (nodes with no incoming edges)
    bool* has_incoming = (bool*)alloca(g->node_count);
    memset(has_incoming, 0, g->node_count);
    for (uint16_t e = 0; e < g->edge_count; e++)
        has_incoming[g->edges[e].to] = true;

    // BFS from sources
    uint16_t* queue = (uint16_t*)alloca(sizeof(uint16_t) * g->node_count);
    uint16_t qh = 0, qt = 0;
    for (uint16_t i = 0; i < g->node_count; i++) {
        if (!has_incoming[i]) { ranks[i] = 0; queue[qt++] = i; }
    }
    // If no sources (all cyclic), start from node 0
    if (qt == 0) { ranks[0] = 0; queue[qt++] = 0; }

    while (qh < qt) {
        uint16_t cur = queue[qh++];
        for (uint16_t e = 0; e < g->edge_count; e++) {
            if (g->edges[e].from == cur) {
                uint16_t to = g->edges[e].to;
                int16_t new_rank = ranks[cur] + 1;
                if (new_rank > ranks[to]) {
                    ranks[to] = new_rank;
                    queue[qt++] = to; // may revisit (longest path)
                }
            }
        }
        if (qt > g->node_count * 4) break; // safety: avoid infinite loop on cycles
    }
    // Assign rank 0 to any unranked nodes
    for (uint16_t i = 0; i < g->node_count; i++)
        if (ranks[i] < 0) ranks[i] = 0;
}

inline LayoutNode* flow_diagram_build(Arena* a, Graph* graph, const FlowDiagramConfig& cfg) {
    if (graph->node_count == 0) {
        auto lbl = Label(a, "(empty graph)", cfg.font_size);
        return build(lbl);
    }

    uint16_t n = graph->node_count;

    // 1. Compute node widths from labels
    float* node_w = (float*)arena_alloc(a, sizeof(float) * n, 4);
    for (uint16_t i = 0; i < n; i++) {
        TextMeasure m = measure_text(graph->nodes[i].label,
            (uint32_t)strlen(graph->nodes[i].label), "sans", cfg.font_size, TEXT_NORMAL);
        node_w[i] = m.width + 28;
        if (node_w[i] < 64) node_w[i] = 64;
    }

    // 2. Assign ranks (layers)
    int16_t* ranks = (int16_t*)arena_alloc(a, sizeof(int16_t) * n, 2);
    flow_assign_ranks(graph, ranks);

    int16_t max_rank = 0;
    for (uint16_t i = 0; i < n; i++)
        if (ranks[i] > max_rank) max_rank = ranks[i];

    // 3. Count nodes per rank and position within rank
    uint16_t* rank_count = (uint16_t*)arena_alloc(a, sizeof(uint16_t) * (max_rank + 1), 2);
    uint16_t* rank_pos = (uint16_t*)arena_alloc(a, sizeof(uint16_t) * n, 2);
    memset(rank_count, 0, sizeof(uint16_t) * (max_rank + 1));
    for (uint16_t i = 0; i < n; i++) {
        rank_pos[i] = rank_count[ranks[i]];
        rank_count[ranks[i]]++;
    }

    // 4. Compute positions (centered per rank)
    float* pos_x = (float*)arena_alloc(a, sizeof(float) * n, 4);
    float* pos_y = (float*)arena_alloc(a, sizeof(float) * n, 4);
    for (uint16_t i = 0; i < n; i++) {
        float rank_width = 0;
        // Sum widths of all nodes at this rank
        for (uint16_t j = 0; j < n; j++)
            if (ranks[j] == ranks[i]) rank_width += node_w[j] + cfg.h_gap;
        rank_width -= cfg.h_gap;

        float start_x = cfg.padding + (cfg.viewport_width - 2*cfg.padding - rank_width) / 2;
        if (start_x < cfg.padding) start_x = cfg.padding;

        // Walk to this node's position within rank
        float cx = start_x;
        for (uint16_t j = 0; j < n; j++) {
            if (ranks[j] == ranks[i] && rank_pos[j] < rank_pos[i])
                cx += node_w[j] + cfg.h_gap;
        }

        pos_x[i] = cx;
        pos_y[i] = cfg.padding + ranks[i] * (cfg.node_h + cfg.v_gap);
    }

    // Also update the Graph model positions (for hit testing)
    for (uint16_t i = 0; i < n; i++) {
        graph->nodes[i].x = pos_x[i];
        graph->nodes[i].y = pos_y[i];
        graph->nodes[i].w = node_w[i];
        graph->nodes[i].h = cfg.node_h;
    }

    // 5. Compute viewport size from actual content
    float content_w = 0, content_h = 0;
    for (uint16_t i = 0; i < n; i++) {
        float r = pos_x[i] + node_w[i] + cfg.padding;
        float b = pos_y[i] + cfg.node_h + cfg.padding;
        if (r > content_w) content_w = r;
        if (b > content_h) content_h = b;
    }
    float vw = content_w > cfg.viewport_width ? content_w : cfg.viewport_width;
    float vh = content_h > cfg.viewport_height ? content_h : cfg.viewport_height;

    // 6. Build layout tree
    Node* root = node_coord(a);
    root->size(vw, vh).set_id("flow-diagram");

    // Edges (as line elements on root, drawn behind nodes)
    uint16_t edge_count = graph->edge_count;
    Element* edge_elems = make_elements(a, edge_count + n); // edges + possible arrowheads
    uint16_t elem_idx = 0;

    for (uint16_t e = 0; e < graph->edge_count; e++) {
        uint16_t fi = graph->edges[e].from, ti = graph->edges[e].to;
        float x1 = pos_x[fi] + node_w[fi] / 2;
        float y1 = pos_y[fi] + cfg.node_h / 2;
        float x2 = pos_x[ti] + node_w[ti] / 2;
        float y2 = pos_y[ti] + cfg.node_h / 2;

        // Shorten to node borders
        float dx = x2 - x1, dy = y2 - y1;
        float len = sqrtf(dx*dx + dy*dy);
        if (len > 0) {
            float nx = dx / len, ny = dy / len;
            x1 += nx * (node_w[fi] / 2);
            y1 += ny * (cfg.node_h / 2);
            x2 -= nx * (node_w[ti] / 2);
            y2 -= ny * (cfg.node_h / 2);
        }
        edge_elems[elem_idx++] = elem_line({x1, y1, x2, y2, cfg.edge_color, 1.5f});
    }
    root->attach(edge_elems, elem_idx);

    // Nodes (as children with absolute positioning)
    auto kids = make_children(a, n);
    for (uint16_t i = 0; i < n; i++) {
        Node* nd = node_leaf(a, node_w[i], cfg.node_h);
        nd->pos(pos_x[i], pos_y[i]).set_id(graph->nodes[i].id);
        nd->attach(make_elements(a, 2), 2);
        nd->elements[0] = elem_rect({0, 0, node_w[i], cfg.node_h, cfg.node_fill, cfg.node_stroke, 1.5f, 4});
        nd->elements[1] = elem_text({8, 8, graph->nodes[i].label, "sans", cfg.font_size, cfg.node_text, TEXT_NORMAL, ALIGN_LEFT, 0});
        kids[i] = nd;
    }
    root->set_children(kids, n);
    return root;
}
