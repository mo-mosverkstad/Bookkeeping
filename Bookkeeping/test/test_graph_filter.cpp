#include "test/test.h"
#include "src/core/arena.h"
#include "src/core/model/table.h"
#include "src/core/model/graph.h"
#include "src/core/parser/csv.h"
#include "src/app/graph_filter.h"
#include <cstring>

TEST(filter_by_graph_membership) {
    Arena a = arena_create(32768);
    const char* csv = "Name,Score\ntext,text\nAlice,90\nBob,80\nCharlie,70\nDiana,60";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    Graph g; g.init(&a, "g");
    g.add_node("Alice", "Alice");
    g.add_node("Charlie", "Charlie");
    g.add_edge(0, 1, "knows");

    FilterResult fr = graph_filter_table(&a, t, 0, &g);
    ASSERT_EQ(fr.count, (uint32_t)2); // Alice and Charlie
    ASSERT_EQ(fr.rows[0], (uint32_t)0); // Alice = row 0
    ASSERT_EQ(fr.rows[1], (uint32_t)2); // Charlie = row 2
    arena_destroy(&a);
}

TEST(filter_by_relation) {
    Arena a = arena_create(32768);
    const char* csv = "Name\ntext\nA\nB\nC";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    Graph g; g.init(&a, "g");
    g.add_node("A", "A"); g.add_node("B", "B"); g.add_node("C", "C");
    g.add_edge(0, 1, "parent");
    g.add_edge(1, 2, "sibling");

    FilterResult fr = graph_filter_by_relation(&a, t, 0, &g, "parent");
    ASSERT_EQ(fr.count, (uint32_t)2); // A (from) and B (to) have "parent" edge
    arena_destroy(&a);
}

TEST(filter_no_matches) {
    Arena a = arena_create(32768);
    const char* csv = "X\ntext\nFoo\nBar";
    Table* t = csv_parse(&a, arena_str_cstr(&a, "t"), csv, strlen(csv));
    Graph g; g.init(&a, "g");
    g.add_node("Baz", "Baz");

    FilterResult fr = graph_filter_table(&a, t, 0, &g);
    ASSERT_EQ(fr.count, (uint32_t)0);
    arena_destroy(&a);
}

TEST(get_relations) {
    Arena a = arena_create(16384);
    Graph g; g.init(&a, "g");
    g.add_node("A", "A"); g.add_node("B", "B"); g.add_node("C", "C");
    g.add_edge(0, 1, "knows");
    g.add_edge(1, 2, "likes");
    g.add_edge(0, 2, "knows"); // duplicate label

    RelationList rl = graph_get_relations(&a, &g);
    ASSERT_EQ(rl.count, (uint16_t)2); // "knows" and "likes" (deduplicated)
    arena_destroy(&a);
}

TEST(get_associations) {
    Arena a = arena_create(16384);
    Graph g; g.init(&a, "g");
    g.add_node("A", "A"); g.add_node("B", "B"); g.add_node("C", "C");
    g.add_edge(0, 1, "parent");
    g.add_edge(2, 0, "child");

    AssociationResult ar = graph_get_associations(&a, &g, "A");
    ASSERT_EQ(ar.count, (uint16_t)2);
    // A→B (outgoing "parent") and C→A (incoming "child")
    ASSERT_TRUE(ar.items[0].outgoing);
    ASSERT_TRUE(strcmp(ar.items[0].target, "B") == 0);
    ASSERT_TRUE(!ar.items[1].outgoing);
    ASSERT_TRUE(strcmp(ar.items[1].target, "C") == 0);
    arena_destroy(&a);
}

TEST(get_associations_empty) {
    Arena a = arena_create(8192);
    Graph g; g.init(&a, "g");
    g.add_node("X", "X");
    AssociationResult ar = graph_get_associations(&a, &g, "X");
    ASSERT_EQ(ar.count, (uint16_t)0);
    arena_destroy(&a);
}

int main() { return run_all_tests(); }
