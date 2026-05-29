import { describe, it, expect } from "vitest";
import { parseFlowchart } from "../../src/cell-renderers/diagram/flowchart/grammar.ts";

describe("Flowchart Grammar", () => {
    it("parses basic TD flowchart", () => {
        const ast = parseFlowchart("flowchart TD\n    A --> B");
        expect(ast.direction).toBe("TD");
        expect(ast.statements).toHaveLength(3); // 2 nodes + 1 edge
    });

    it("parses LR direction", () => {
        const ast = parseFlowchart("flowchart LR\n    A --> B");
        expect(ast.direction).toBe("LR");
    });

    it("parses graph keyword (alias for flowchart)", () => {
        const ast = parseFlowchart("graph TD\n    A --> B");
        expect(ast.direction).toBe("TD");
    });

    it("TB normalizes to TD", () => {
        const ast = parseFlowchart("flowchart TB\n    A --> B");
        expect(ast.direction).toBe("TD");
    });

    it("parses rect shape [label]", () => {
        const ast = parseFlowchart("flowchart TD\n    A[Hello World]");
        const node = ast.statements.find(s => s.type === "node" && s.id === "A");
        expect(node).toBeDefined();
        expect((node as any).shape).toBe("rect");
        expect((node as any).label).toBe("Hello World");
    });

    it("parses round shape (label)", () => {
        const ast = parseFlowchart("flowchart TD\n    A(Rounded)");
        const node = ast.statements.find(s => s.type === "node" && s.id === "A");
        expect((node as any).shape).toBe("round");
    });

    it("parses diamond shape {label}", () => {
        const ast = parseFlowchart("flowchart TD\n    A{Decision}");
        const node = ast.statements.find(s => s.type === "node" && s.id === "A");
        expect((node as any).shape).toBe("diamond");
    });

    it("parses circle shape ((label))", () => {
        const ast = parseFlowchart("flowchart TD\n    A((Circle))");
        const node = ast.statements.find(s => s.type === "node" && s.id === "A");
        expect((node as any).shape).toBe("circle");
    });

    it("parses stadium shape ([label])", () => {
        const ast = parseFlowchart("flowchart TD\n    A([Stadium])");
        const node = ast.statements.find(s => s.type === "node" && s.id === "A");
        expect((node as any).shape).toBe("stadium");
    });

    it("parses subroutine shape [[label]]", () => {
        const ast = parseFlowchart("flowchart TD\n    A[[Subroutine]]");
        const node = ast.statements.find(s => s.type === "node" && s.id === "A");
        expect((node as any).shape).toBe("subroutine");
    });

    it("parses hex shape {{label}}", () => {
        const ast = parseFlowchart("flowchart TD\n    A{{Hex}}");
        const node = ast.statements.find(s => s.type === "node" && s.id === "A");
        expect((node as any).shape).toBe("hex");
    });

    it("parses edge chain A --> B --> C", () => {
        const ast = parseFlowchart("flowchart TD\n    A --> B --> C");
        const edges = ast.statements.filter(s => s.type === "edge");
        expect(edges).toHaveLength(2);
        expect((edges[0] as any).from).toBe("A");
        expect((edges[0] as any).to).toBe("B");
        expect((edges[1] as any).from).toBe("B");
        expect((edges[1] as any).to).toBe("C");
    });

    it("parses thick arrow ==>", () => {
        const ast = parseFlowchart("flowchart TD\n    A ==> B");
        const edge = ast.statements.find(s => s.type === "edge");
        expect((edge as any).style).toBe("thick");
    });

    it("parses dotted arrow -.->", () => {
        const ast = parseFlowchart("flowchart TD\n    A -.-> B");
        const edge = ast.statements.find(s => s.type === "edge");
        expect((edge as any).style).toBe("dotted");
    });

    it("parses multiple statements", () => {
        const ast = parseFlowchart("flowchart TD\n    A[Start] --> B{Check}\n    B --> C[End]\n    B --> D[Fail]");
        const nodes = ast.statements.filter(s => s.type === "node");
        const edges = ast.statements.filter(s => s.type === "edge");
        expect(nodes).toHaveLength(4);
        expect(edges).toHaveLength(3);
    });

    it("deduplicates node definitions", () => {
        const ast = parseFlowchart("flowchart TD\n    A[Start] --> B\n    A --> C");
        const nodes = ast.statements.filter(s => s.type === "node");
        const aNodes = nodes.filter(n => (n as any).id === "A");
        expect(aNodes).toHaveLength(1);
    });

    it("bare nodes get default shape", () => {
        const ast = parseFlowchart("flowchart TD\n    A --> B");
        const node = ast.statements.find(s => s.type === "node" && (s as any).id === "A");
        expect((node as any).shape).toBe("default");
        expect((node as any).label).toBe("A");
    });
});
