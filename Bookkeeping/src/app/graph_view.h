#pragma once
#include "src/core/model/graph.h"
#include "src/core/arena.h"
#include "src/graphics/ui.h"
#include "src/graphics/node_builder.h"
#include <cmath>

// Graph renderer: renders a Graph as nodes (rectangles + labels) and edges (lines)
// within a CoordinateLayout. Supports pan/zoom via scroll offsets.

struct GraphViewConfig {
    Color node_fill = {50, 60, 80, 255};
    Color node_stroke = {100, 140, 200, 255};
    Color node_text = {220, 220, 240, 255};
    Color edge_color = {120, 120, 140, 255};
    float font_size = 12;
    float viewport_width = 600;
    float viewport_height = 400;
};

inline LayoutNode* graph_view_build(Arena* a, Graph* graph, const GraphViewConfig& cfg) {
    // Root is a coordinate layout (absolute positioning for nodes/edges)
    Node* root = node_coord(a);
    root->size(cfg.viewport_width, cfg.viewport_height).set_id("graph-view");

    uint16_t total_elements = graph->edge_count; // lines for edges
    // Create elements for edges (rendered on root as lines)
    root->attach(make_elements(a, total_elements), total_elements);
    for (uint16_t i = 0; i < graph->edge_count; i++) {
        GraphEdge& e = graph->edges[i];
        GraphNode& from = graph->nodes[e.from];
        GraphNode& to = graph->nodes[e.to];
        // Line from center of source to center of target
        float x1 = from.x + from.w / 2;
        float y1 = from.y + from.h / 2;
        float x2 = to.x + to.w / 2;
        float y2 = to.y + to.h / 2;

        // Shorten line to stop at node border
        float dx = x2 - x1, dy = y2 - y1;
        float len = sqrtf(dx*dx + dy*dy);
        if (len > 0) {
            float nx = dx / len, ny = dy / len;
            x1 += nx * (from.w / 2);
            y1 += ny * (from.h / 2);
            x2 -= nx * (to.w / 2);
            y2 -= ny * (to.h / 2);
        }
        root->elements[i] = elem_line({x1, y1, x2, y2, cfg.edge_color, 1.5f});
    }

    // Create child nodes for graph nodes (positioned absolutely)
    auto kids = make_children(a, graph->node_count);
    for (uint16_t i = 0; i < graph->node_count; i++) {
        GraphNode& gn = graph->nodes[i];
        Node* node = node_leaf(a, gn.w, gn.h);
        node->pos(gn.x, gn.y).set_id(gn.id);
        node->attach(make_elements(a, 2), 2);
        node->elements[0] = elem_rect({0, 0, gn.w, gn.h, cfg.node_fill, cfg.node_stroke, 1.5f, 4});
        node->elements[1] = elem_text({6, 7, gn.label, "sans", cfg.font_size, cfg.node_text, TEXT_NORMAL, ALIGN_LEFT, 0});
        kids[i] = node;
    }
    root->set_children(kids, graph->node_count);
    return root;
}
