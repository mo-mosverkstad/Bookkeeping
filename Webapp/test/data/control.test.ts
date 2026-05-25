import { describe, it, expect } from "vitest";
import {
    parseControlFile,
    resolveNodes,
    resolveEdges,
    resolveActors,
    resolveMessages,
} from "../../src/data/control.ts";
import type { FlowDecl, SequenceDecl } from "../../src/data/control.ts";

// ── parseControlFile ──────────────────────────────────────────────────────────

describe("parseControlFile", () => {
    it("parses a table entry", () => {
        const cf = parseControlFile({
            version: "1.0",
            entries: [{ id: "theorems", view: "table", file: "theorems.csv" }],
        });
        expect(cf.version).toBe("1.0");
        expect(cf.entries).toHaveLength(1);
        expect(cf.entries[0].view).toBe("table");
        expect((cf.entries[0] as any).file).toBe("theorems.csv");
    });

    it("parses a flow entry with nodes and edges", () => {
        const cf = parseControlFile({
            version: "1.0",
            entries: [{
                id: "glycolysis",
                view: "flow",
                nodes: { file: "nodes.csv", mapping: { id: "Formula", label: "Name", type: "Kind" } },
                edges: { file: "edges.csv", mapping: { from: "From", to: "To", type: "Type" } },
            }],
        });
        const entry = cf.entries[0] as FlowDecl;
        expect(entry.view).toBe("flow");
        expect(Array.isArray(entry.nodes)).toBe(false);
        expect((entry.nodes as any).file).toBe("nodes.csv");
        expect(entry.edges?.file).toBe("edges.csv");
    });

    it("parses a flow entry with multiple node sources", () => {
        const cf = parseControlFile({
            version: "1.0",
            entries: [{
                id: "metabolism",
                view: "flow",
                nodes: [
                    { file: "glycolysis.csv", mapping: { id: "Formula", label: "Name" } },
                    { file: "tca.csv",        mapping: { id: "Formula", label: "Name" } },
                ],
                edges: { file: "edges.csv", mapping: { from: "From", to: "To" } },
            }],
        });
        const entry = cf.entries[0] as FlowDecl;
        expect(Array.isArray(entry.nodes)).toBe(true);
        expect((entry.nodes as any[]).length).toBe(2);
    });

    it("parses a sequence entry", () => {
        const cf = parseControlFile({
            version: "1.0",
            entries: [{
                id: "login",
                view: "sequence",
                actors:   { file: "actors.csv",   mapping: { id: "Actor" } },
                messages: { file: "messages.csv", mapping: { from: "From", to: "To", label: "Msg" } },
            }],
        });
        const entry = cf.entries[0] as SequenceDecl;
        expect(entry.view).toBe("sequence");
        expect(entry.actors.file).toBe("actors.csv");
        expect(entry.messages.mapping.label).toBe("Msg");
    });

    it("parses nodeStyles and edgeStyles", () => {
        const cf = parseControlFile({
            version: "1.0",
            entries: [{
                id: "g",
                view: "flow",
                nodes: { file: "n.csv", mapping: { id: "Id" } },
                nodeStyles: { compound: { shape: "ellipse", color: "#e0f2fe" } },
                edgeStyles:  { reaction: { arrow: "filled", dash: false } },
            }],
        });
        const entry = cf.entries[0] as FlowDecl;
        expect(entry.nodeStyles?.["compound"]?.shape).toBe("ellipse");
        expect(entry.edgeStyles?.["reaction"]?.arrow).toBe("filled");
    });

    it("throws on missing entries array", () => {
        expect(() => parseControlFile({ version: "1.0" })).toThrow();
    });

    it("throws on unknown view type", () => {
        expect(() => parseControlFile({
            version: "1.0",
            entries: [{ id: "x", view: "unknown" }],
        })).toThrow();
    });

    it("throws on flow entry missing id in node mapping", () => {
        expect(() => parseControlFile({
            version: "1.0",
            entries: [{
                id: "g", view: "flow",
                nodes: { file: "n.csv", mapping: { label: "Name" } },
            }],
        })).toThrow();
    });
});

// ── resolveNodes ──────────────────────────────────────────────────────────────

describe("resolveNodes", () => {
    const headers = ["Formula", "Name", "Kind", "Notes"];
    const rows = [
        ["Glucose", "Glucose", "compound", "6-carbon sugar"],
        ["G6P",     "Glucose-6-phosphate", "compound", ""],
        ["HK",      "Hexokinase", "enzyme", ""],
    ];

    it("maps id, label, type correctly", () => {
        const nodes = resolveNodes(headers, rows, { id: "Formula", label: "Name", type: "Kind" });
        expect(nodes[0].id).toBe("Glucose");
        expect(nodes[0].label).toBe("Glucose");
        expect(nodes[0].type).toBe("compound");
    });

    it("falls back label to id when label mapping absent", () => {
        const nodes = resolveNodes(headers, rows, { id: "Formula" });
        expect(nodes[0].label).toBe("Glucose");
    });

    it("puts unmapped columns in extra", () => {
        const nodes = resolveNodes(headers, rows, { id: "Formula", label: "Name", type: "Kind" });
        expect(nodes[0].extra["Notes"]).toBe("6-carbon sugar");
        expect(nodes[0].extra["Formula"]).toBeUndefined();
        expect(nodes[0].extra["Name"]).toBeUndefined();
    });

    it("parses x/y as floats", () => {
        const h2 = ["Id", "X", "Y"];
        const r2 = [["A", "100.5", "200"]];
        const nodes = resolveNodes(h2, r2, { id: "Id", x: "X", y: "Y" });
        expect(nodes[0].x).toBe(100.5);
        expect(nodes[0].y).toBe(200);
    });

    it("omits x/y when column absent", () => {
        const nodes = resolveNodes(headers, rows, { id: "Formula" });
        expect(nodes[0].x).toBeUndefined();
        expect(nodes[0].y).toBeUndefined();
    });

    it("handles empty rows array", () => {
        expect(resolveNodes(headers, [], { id: "Formula" })).toHaveLength(0);
    });
});

// ── resolveEdges ──────────────────────────────────────────────────────────────

describe("resolveEdges", () => {
    const headers = ["From", "To", "Type", "Enzyme"];
    const rows = [
        ["Glucose", "HK",  "reaction", "Hexokinase"],
        ["HK",      "G6P", "reaction", "Hexokinase"],
        ["PFK",     "F6P", "inhibits", ""],
    ];

    it("maps from/to/type/label", () => {
        const edges = resolveEdges(headers, rows, { from: "From", to: "To", type: "Type", label: "Enzyme" });
        expect(edges[0].from).toBe("Glucose");
        expect(edges[0].to).toBe("HK");
        expect(edges[0].type).toBe("reaction");
        expect(edges[0].label).toBe("Hexokinase");
    });

    it("defaults type and label to empty string when absent", () => {
        const edges = resolveEdges(headers, rows, { from: "From", to: "To" });
        expect(edges[0].type).toBe("");
        expect(edges[0].label).toBe("");
    });

    it("handles empty rows", () => {
        expect(resolveEdges(headers, [], { from: "From", to: "To" })).toHaveLength(0);
    });
});

// ── resolveActors ─────────────────────────────────────────────────────────────

describe("resolveActors", () => {
    it("maps id and label", () => {
        const actors = resolveActors(["Actor", "Display"], [["user", "User"]], { id: "Actor", label: "Display" });
        expect(actors[0].id).toBe("user");
        expect(actors[0].label).toBe("User");
    });

    it("falls back label to id", () => {
        const actors = resolveActors(["Actor"], [["user"]], { id: "Actor" });
        expect(actors[0].label).toBe("user");
    });
});

// ── resolveMessages ───────────────────────────────────────────────────────────

describe("resolveMessages", () => {
    it("maps all fields", () => {
        const msgs = resolveMessages(
            ["From", "To", "Msg", "Order", "MsgType"],
            [["user", "server", "login", "1", "sync"]],
            { from: "From", to: "To", label: "Msg", time: "Order", type: "MsgType" },
        );
        expect(msgs[0].from).toBe("user");
        expect(msgs[0].to).toBe("server");
        expect(msgs[0].label).toBe("login");
        expect(msgs[0].time).toBe(1);
        expect(msgs[0].type).toBe("sync");
    });

    it("uses row index as time when time column absent", () => {
        const msgs = resolveMessages(
            ["From", "To"],
            [["a", "b"], ["c", "d"]],
            { from: "From", to: "To" },
        );
        expect(msgs[0].time).toBe(0);
        expect(msgs[1].time).toBe(1);
    });
});
