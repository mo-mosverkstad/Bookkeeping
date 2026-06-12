#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/model/graph.h"
#include "src/app/graph_view.h"
#include "src/graphics/backend/software_backend.h"
#include <cstring>

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPH MODEL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(graph_create_empty) {
    Arena a = arena_create(8192);
    Graph g; g.init(&a, "test");
    ASSERT_EQ(g.node_count, (uint16_t)0);
    ASSERT_EQ(g.edge_count, (uint16_t)0);
    ASSERT_TRUE(strcmp(g.name, "test") == 0);
    arena_destroy(&a);
}

TEST(graph_add_nodes) {
    Arena a = arena_create(8192);
    Graph g; g.init(&a, "g");
    uint16_t n0 = g.add_node("A", "Node A");
    uint16_t n1 = g.add_node("B", "Node B");
    ASSERT_EQ(n0, (uint16_t)0);
    ASSERT_EQ(n1, (uint16_t)1);
    ASSERT_EQ(g.node_count, (uint16_t)2);
    ASSERT_TRUE(strcmp(g.nodes[0].label, "Node A") == 0);
    arena_destroy(&a);
}

TEST(graph_add_edges) {
    Arena a = arena_create(8192);
    Graph g; g.init(&a, "g");
    g.add_node("A", "A"); g.add_node("B", "B"); g.add_node("C", "C");
    g.add_edge(0, 1, "knows");
    g.add_edge(1, 2);
    ASSERT_EQ(g.edge_count, (uint16_t)2);
    ASSERT_EQ(g.edges[0].from, (uint16_t)0);
    ASSERT_EQ(g.edges[0].to, (uint16_t)1);
    ASSERT_TRUE(strcmp(g.edges[0].label, "knows") == 0);
    ASSERT_EQ(g.edges[1].label, (const char*)nullptr);
    arena_destroy(&a);
}

TEST(graph_find_node) {
    Arena a = arena_create(8192);
    Graph g; g.init(&a, "g");
    g.add_node("alpha", "Alpha"); g.add_node("beta", "Beta");
    ASSERT_EQ(g.find_node("alpha"), 0);
    ASSERT_EQ(g.find_node("beta"), 1);
    ASSERT_EQ(g.find_node("gamma"), -1);
    arena_destroy(&a);
}

TEST(graph_layout_grid) {
    Arena a = arena_create(8192);
    Graph g; g.init(&a, "g");
    g.add_node("A", "A"); g.add_node("B", "B"); g.add_node("C", "C");
    g.add_node("D", "D"); g.add_node("E", "E");
    g.layout_grid(10, 20, 120, 50, 3);
    // Row 0: A(10,20), B(130,20), C(250,20)
    ASSERT_NEAR(g.nodes[0].x, 10.0f, 0.01f);
    ASSERT_NEAR(g.nodes[1].x, 130.0f, 0.01f);
    ASSERT_NEAR(g.nodes[2].x, 250.0f, 0.01f);
    // Row 1: D(10,70), E(130,70)
    ASSERT_NEAR(g.nodes[3].y, 70.0f, 0.01f);
    ASSERT_NEAR(g.nodes[4].x, 130.0f, 0.01f);
    arena_destroy(&a);
}

TEST(graph_many_nodes) {
    Arena a = arena_create(32768);
    Graph g; g.init(&a, "big", 128, 256);
    for (int i = 0; i < 50; i++) {
        char id[8]; snprintf(id, 8, "n%d", i);
        g.add_node(arena_str_cstr(&a, id).data, id);
    }
    ASSERT_EQ(g.node_count, (uint16_t)50);
    g.layout_grid(0, 0, 100, 50, 10);
    ASSERT_NEAR(g.nodes[10].y, 50.0f, 0.01f); // second row
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPH VIEW RENDERING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

TEST(graphview_builds_tree) {
    Arena a = arena_create(32768);
    Graph g; g.init(&a, "g");
    g.add_node("A", "Node A"); g.add_node("B", "Node B");
    g.add_edge(0, 1);
    g.layout_grid();

    GraphViewConfig cfg;
    LayoutNode* view = graph_view_build(&a, &g, cfg);
    ASSERT_TRUE(view != nullptr);
    ASSERT_TRUE(strcmp(view->id, "graph-view") == 0);
    ASSERT_EQ(view->child_count, (uint16_t)2); // 2 nodes
    ASSERT_EQ(view->element_count, (uint16_t)1); // 1 edge line
    arena_destroy(&a);
}

TEST(graphview_nodes_positioned) {
    Arena a = arena_create(32768);
    Graph g; g.init(&a, "g");
    g.add_node("A", "A"); g.add_node("B", "B");
    g.layout_grid(100, 50, 200, 80, 2);

    GraphViewConfig cfg;
    LayoutNode* view = graph_view_build(&a, &g, cfg);
    // Node A at (100, 50), Node B at (300, 50)
    ASSERT_NEAR(view->children[0]->x, 100.0f, 0.01f);
    ASSERT_NEAR(view->children[0]->y, 50.0f, 0.01f);
    ASSERT_NEAR(view->children[1]->x, 300.0f, 0.01f);
    arena_destroy(&a);
}

TEST(graphview_edge_is_line) {
    Arena a = arena_create(32768);
    Graph g; g.init(&a, "g");
    g.add_node("A", "A"); g.add_node("B", "B");
    g.add_edge(0, 1);
    g.layout_grid();

    GraphViewConfig cfg;
    LayoutNode* view = graph_view_build(&a, &g, cfg);
    ASSERT_EQ(view->elements[0].type, ELEM_LINE);
    arena_destroy(&a);
}

TEST(graphview_computes) {
    Arena a = arena_create(32768);
    Graph g; g.init(&a, "g");
    g.add_node("X", "Hello"); g.add_node("Y", "World");
    g.add_edge(0, 1);
    g.layout_grid();

    GraphViewConfig cfg;
    LayoutNode* view = graph_view_build(&a, &g, cfg);
    view->compute(600, 400);
    ASSERT_NEAR(view->width, 600.0f, 0.01f);
    ASSERT_NEAR(view->height, 400.0f, 0.01f);
    arena_destroy(&a);
}

TEST(graphview_renders) {
    Arena a = arena_create(32768);
    Graph g; g.init(&a, "g");
    g.add_node("A", "Alpha"); g.add_node("B", "Beta");
    g.add_edge(0, 1);
    g.layout_grid(20, 20, 150, 60, 2);

    GraphViewConfig cfg; cfg.viewport_width = 400; cfg.viewport_height = 150;
    LayoutNode* view = graph_view_build(&a, &g, cfg);
    view->compute(400, 150);

    SoftwareBackend sw(400, 150);
    sw.begin_frame(400, 150);
    view->render(&sw);
    sw.end_frame();

    // Node A position (20,20) with fill → pixel inside node should have node_fill color
    Color c = sw.get_pixel(70, 30); // clearly inside (20..120, 20..50)
    ASSERT_EQ(c.r, cfg.node_fill.r);
    arena_destroy(&a);
}

TEST(graphview_hit_test_node) {
    Arena a = arena_create(32768);
    Graph g; g.init(&a, "g");
    g.add_node("A", "A"); g.add_node("B", "B");
    g.layout_grid(0, 0, 200, 60, 2);

    GraphViewConfig cfg; cfg.viewport_width = 500; cfg.viewport_height = 100;
    LayoutNode* view = graph_view_build(&a, &g, cfg);
    view->compute(500, 100);

    // Hit inside node A (at 0,0 with w=100,h=30)
    HitResult r = view->hit_surface(50, 15);
    ASSERT_TRUE(r.node != nullptr);
    ASSERT_TRUE(r.node->id != nullptr);
    ASSERT_TRUE(strcmp(r.node->id, "A") == 0);

    // Hit inside node B (at 200,0)
    r = view->hit_surface(250, 15);
    ASSERT_TRUE(r.node != nullptr);
    ASSERT_TRUE(strcmp(r.node->id, "B") == 0);
    arena_destroy(&a);
}

TEST(graphview_no_edges_empty) {
    Arena a = arena_create(16384);
    Graph g; g.init(&a, "g");
    g.add_node("solo", "Solo Node");
    g.layout_grid();

    GraphViewConfig cfg;
    LayoutNode* view = graph_view_build(&a, &g, cfg);
    ASSERT_EQ(view->element_count, (uint16_t)0); // no edges
    ASSERT_EQ(view->child_count, (uint16_t)1);   // one node
    arena_destroy(&a);
}

TEST(graphview_complex_graph) {
    Arena a = arena_create(65536);
    Graph g; g.init(&a, "complex", 32, 64);
    for (int i = 0; i < 10; i++) {
        char id[4]; snprintf(id, 4, "%c", 'A' + i);
        g.add_node(arena_str_cstr(&a, id).data, arena_str_cstr(&a, id).data);
    }
    // Chain: A->B->C->...->J
    for (int i = 0; i < 9; i++) g.add_edge(i, i+1);
    // Cross edges
    g.add_edge(0, 5); g.add_edge(2, 7);
    g.layout_grid(10, 10, 100, 50, 5);

    GraphViewConfig cfg; cfg.viewport_width = 600; cfg.viewport_height = 200;
    LayoutNode* view = graph_view_build(&a, &g, cfg);
    view->compute(600, 200);
    ASSERT_EQ(view->child_count, (uint16_t)10);
    ASSERT_EQ(view->element_count, (uint16_t)11); // 9 + 2 edges
    arena_destroy(&a);
}

// ═══════════════════════════════════════════════════════════════════════════════

int main() {
    return run_all_tests();
}
