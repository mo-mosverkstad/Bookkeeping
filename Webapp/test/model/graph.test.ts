import { describe, it, expect } from "vitest";
import { Graph } from "../../src/model/Graph.ts";
import { TypedValue } from "../../src/model/TypedValue.ts";
import { Cell } from "../../src/model/Cell.ts";
import { GraphNode } from "../../src/model/GraphNode.ts";
import { GraphEdge } from "../../src/model/GraphEdge.ts";
import { KnowledgeBase } from "../../src/model/KnowledgeBase.ts";

// ── TypedValue / Cell ─────────────────────────────────────────────────────────

describe("TypedValue", () => {
    it("stores value and typeId", () => {
        const tv = new TypedValue("x^2", "math");
        expect(tv.value).toBe("x^2");
        expect(tv.typeId).toBe("math");
    });

    it("Cell extends TypedValue", () => {
        const c = new Cell("hello", "text");
        expect(c instanceof TypedValue).toBe(true);
        expect(c.value).toBe("hello");
        expect(c.typeId).toBe("text");
    });
});

// ── GraphNode ─────────────────────────────────────────────────────────────────

describe("GraphNode", () => {
    it("label falls back to id when no label property", () => {
        const n = new GraphNode("Glucose");
        expect(n.label).toBe("Glucose");
    });

    it("label reads from properties map", () => {
        const props = new Map([["label", new TypedValue("Glucose compound", "text")]]);
        const n = new GraphNode("Glucose", props);
        expect(n.label).toBe("Glucose compound");
    });

    it("type defaults to empty string", () => {
        const n = new GraphNode("A");
        expect(n.type).toBe("");
    });
});

// ── GraphEdge ─────────────────────────────────────────────────────────────────

describe("GraphEdge", () => {
    it("stores from/to and reads type/label from properties", () => {
        const props = new Map([
            ["type",  new TypedValue("reaction", "text")],
            ["label", new TypedValue("Hexokinase", "text")],
        ]);
        const e = new GraphEdge("e0", "Glucose", "G6P", props);
        expect(e.from).toBe("Glucose");
        expect(e.to).toBe("G6P");
        expect(e.type).toBe("reaction");
        expect(e.label).toBe("Hexokinase");
    });

    it("type and label default to empty string", () => {
        const e = new GraphEdge("e0", "A", "B");
        expect(e.type).toBe("");
        expect(e.label).toBe("");
    });
});

// ── Graph.fromGraphJSON ───────────────────────────────────────────────────────

describe("Graph.fromGraphJSON", () => {
    const raw = {
        version: "1.0",
        name: "glycolysis",
        view: "flow",
        nodes: [
            { id: "Glucose", label: "Glucose", type: "compound" },
            { id: "HK",      label: "Hexokinase", type: "enzyme" },
        ],
        edges: [
            { id: "e0", from: "Glucose", to: "HK", type: "reaction", label: "step1" },
        ],
        nodeStyles: { compound: { shape: "ellipse", color: "#e0f2fe" } },
        edgeStyles:  { reaction: { arrow: "filled", dash: false } },
    };

    it("parses name and viewType", () => {
        const g = Graph.fromGraphJSON("glycolysis", raw);
        expect(g.name).toBe("glycolysis");
        expect(g.viewType).toBe("flow");
    });

    it("parses nodes with label and type as TypedValue properties", () => {
        const g = Graph.fromGraphJSON("g", raw);
        expect(g.nodes).toHaveLength(2);
        expect(g.nodes[0].id).toBe("Glucose");
        expect(g.nodes[0].label).toBe("Glucose");
        expect(g.nodes[0].type).toBe("compound");
    });

    it("parses edges with from/to/type/label", () => {
        const g = Graph.fromGraphJSON("g", raw);
        expect(g.edges).toHaveLength(1);
        expect(g.edges[0].from).toBe("Glucose");
        expect(g.edges[0].to).toBe("HK");
        expect(g.edges[0].type).toBe("reaction");
        expect(g.edges[0].label).toBe("step1");
    });

    it("parses nodeStyles and edgeStyles", () => {
        const g = Graph.fromGraphJSON("g", raw);
        expect(g.nodeStyles["compound"]?.shape).toBe("ellipse");
        expect(g.edgeStyles["reaction"]?.arrow).toBe("filled");
    });

    it("parses typed property values (object form)", () => {
        const g = Graph.fromGraphJSON("g", {
            view: "flow",
            nodes: [{ id: "ATP", label: "ATP", formula: { value: "C_10H_16N_5O_13P_3", typeId: "chemistry" } }],
            edges: [],
        });
        const tv = g.nodes[0].properties.get("formula");
        expect(tv?.value).toBe("C_10H_16N_5O_13P_3");
        expect(tv?.typeId).toBe("chemistry");
    });

    it("auto-generates edge ids when absent", () => {
        const g = Graph.fromGraphJSON("g", {
            view: "flow",
            nodes: [{ id: "A" }, { id: "B" }],
            edges: [{ from: "A", to: "B" }],
        });
        expect(g.edges[0].id).toBe("e0");
    });

    it("throws on non-object input", () => {
        expect(() => Graph.fromGraphJSON("g", null)).toThrow();
        expect(() => Graph.fromGraphJSON("g", "string")).toThrow();
    });

    it("throws on node missing id", () => {
        expect(() => Graph.fromGraphJSON("g", {
            view: "flow",
            nodes: [{ label: "no id" }],
            edges: [],
        })).toThrow();
    });
});

// ── Graph.toGraphJSON ─────────────────────────────────────────────────────────

describe("Graph.toGraphJSON round-trip", () => {
    it("round-trips losslessly", () => {
        const original = {
            version: "1.0",
            name: "test",
            view: "flow",
            nodes: [
                { id: "A", label: "Node A", type: "compound" },
                { id: "B", label: "Node B", type: "enzyme" },
            ],
            edges: [
                { id: "e0", from: "A", to: "B", type: "reaction", label: "step" },
            ],
            nodeStyles: { compound: { shape: "ellipse" as const, color: "#fff" } },
            edgeStyles:  { reaction: { arrow: "filled" as const, dash: false } },
        };
        const g = Graph.fromGraphJSON("test", original);
        const json = JSON.parse(g.toGraphJSON());
        const g2 = Graph.fromGraphJSON("test", json);

        expect(g2.nodes).toHaveLength(2);
        expect(g2.nodes[0].id).toBe("A");
        expect(g2.nodes[0].label).toBe("Node A");
        expect(g2.edges[0].from).toBe("A");
        expect(g2.edges[0].label).toBe("step");
        expect(g2.nodeStyles["compound"]?.shape).toBe("ellipse");
    });
});

// ── Graph mutations ───────────────────────────────────────────────────────────

describe("Graph mutations", () => {
    it("addNode appends a node", () => {
        const g = new Graph("g", "flow");
        const n = g.addNode("X", { label: "Node X", type: "compound" });
        expect(g.nodes).toHaveLength(1);
        expect(n.id).toBe("X");
        expect(n.label).toBe("Node X");
    });

    it("removeNode removes node and its edges", () => {
        const g = new Graph("g", "flow");
        g.addNode("A");
        g.addNode("B");
        g.addEdge("A", "B");
        g.removeNode("A");
        expect(g.nodes).toHaveLength(1);
        expect(g.edges).toHaveLength(0);
    });

    it("removeNode returns undefined for unknown id", () => {
        const g = new Graph("g", "flow");
        expect(g.removeNode("nonexistent")).toBeUndefined();
    });

    it("addEdge appends an edge", () => {
        const g = new Graph("g", "flow");
        g.addNode("A"); g.addNode("B");
        const e = g.addEdge("A", "B", { type: "reaction", label: "step" });
        expect(g.edges).toHaveLength(1);
        expect(e.from).toBe("A");
        expect(e.type).toBe("reaction");
    });

    it("removeEdge removes by id", () => {
        const g = new Graph("g", "flow");
        g.addNode("A"); g.addNode("B");
        const e = g.addEdge("A", "B");
        g.removeEdge(e.id);
        expect(g.edges).toHaveLength(0);
    });

    it("getEdgesFrom and getEdgesTo filter correctly", () => {
        const g = new Graph("g", "flow");
        g.addNode("A"); g.addNode("B"); g.addNode("C");
        g.addEdge("A", "B");
        g.addEdge("A", "C");
        g.addEdge("B", "C");
        expect(g.getEdgesFrom("A")).toHaveLength(2);
        expect(g.getEdgesTo("C")).toHaveLength(2);
        expect(g.getEdgesFrom("C")).toHaveLength(0);
    });
});

// ── KnowledgeBase.addGraph ────────────────────────────────────────────────────

describe("KnowledgeBase.addGraph", () => {
    it("stores graphs co-equal with tables", () => {
        const kb = new KnowledgeBase();
        const g = new Graph("glycolysis", "flow");
        kb.addGraph(g);
        expect(kb.graphs).toHaveLength(1);
        expect(kb.graphs[0].name).toBe("glycolysis");
        expect(kb.tables).toHaveLength(0);
    });

    it("clear() removes both tables and graphs", () => {
        const kb = new KnowledgeBase();
        kb.addGraph(new Graph("g", "flow"));
        kb.clear();
        expect(kb.graphs).toHaveLength(0);
    });
});
