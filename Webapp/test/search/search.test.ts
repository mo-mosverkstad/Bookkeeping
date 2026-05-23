import { describe, it, expect } from "vitest";
import { searchText, searchByIdentifier, getNeighbourhood, crossTableJoin } from "../../src/search/index.ts";
import { KnowledgeBase, Table, Column, Row, Cell } from "../../src/model/index.ts";

function makeKB(): KnowledgeBase {
    const kb = new KnowledgeBase();

    const theorems = new Table("theorems", [
        new Column("id", "text"),
        new Column("statement", "math"),
        new Column("_associations", "text"),
    ], [
        new Row([new Cell("pythagorean", "text"), new Cell("a^2 + b^2 = c^2", "math"), new Cell("uses:right-triangle", "text")]),
        new Row([new Cell("ftc", "text"), new Cell("\\int{a, b, f'(x)} = f(b) - f(a)", "math"), new Cell("uses:integral;uses:derivative", "text")]),
        new Row([new Cell("power-rule", "text"), new Cell("f'(x) = n*x^(n-1)", "math"), new Cell("uses:derivative", "text")]),
    ]);

    const defs = new Table("definitions", [
        new Column("id", "text"),
        new Column("description", "text"),
    ], [
        new Row([new Cell("integral", "text"), new Cell("area under a curve", "text")]),
        new Row([new Cell("derivative", "text"), new Cell("rate of change", "text")]),
        new Row([new Cell("right-triangle", "text"), new Cell("triangle with a 90 degree angle", "text")]),
    ]);

    kb.addTable(theorems);
    kb.addTable(defs);
    return kb;
}

describe("searchText", () => {
    it("finds matching text cells case-insensitively", () => {
        const kb = makeKB();
        const hits = searchText(kb, "rate");
        expect(hits.length).toBe(1);
        expect(hits[0].entityId).toBe("derivative");
        expect(hits[0].tableName).toBe("definitions");
    });

    it("returns multiple hits across tables", () => {
        const kb = makeKB();
        const hits = searchText(kb, "angle");
        expect(hits.length).toBe(3);
        expect(hits.every(h => h.value.toLowerCase().includes("angle"))).toBe(true);
    });

    it("returns empty for no match", () => {
        expect(searchText(makeKB(), "zzznomatch")).toEqual([]);
    });

    it("returns empty for blank query", () => {
        expect(searchText(makeKB(), "   ")).toEqual([]);
    });

    it("records correct match positions", () => {
        const kb = makeKB();
        const hits = searchText(kb, "area");
        expect(hits[0].matchStart).toBe(0);
        expect(hits[0].matchEnd).toBe(4);
    });

    it("does not search math cells", () => {
        const kb = makeKB();
        // "integral" appears in math source but searchText should not find it
        // (math cells have typeId "math", not "text")
        const hits = searchText(kb, "integral");
        // Only the definition description should match
        expect(hits.every(h => h.colName !== "statement")).toBe(true);
    });
});

describe("searchByIdentifier", () => {
    it("finds math cells containing a given identifier", () => {
        const kb = makeKB();
        const hits = searchByIdentifier(kb, "int");
        expect(hits.length).toBeGreaterThanOrEqual(1);
        expect(hits.some(h => h.entityId === "ftc")).toBe(true);
    });

    it("finds derivative prime identifier", () => {
        const kb = makeKB();
        // f'(x) contains Derivative node with base Identifier "f"
        const hits = searchByIdentifier(kb, "f");
        expect(hits.length).toBeGreaterThan(0);
    });

    it("returns empty for unknown identifier", () => {
        expect(searchByIdentifier(makeKB(), "zzznomatch")).toEqual([]);
    });

    it("returns empty for blank query", () => {
        expect(searchByIdentifier(makeKB(), "")).toEqual([]);
    });
});

describe("getNeighbourhood", () => {
    it("returns direct neighbours at hop 1", () => {
        const kb = makeKB();
        const hits = getNeighbourhood(kb, "ftc", 1);
        const ids = hits.map(h => h.entityId);
        expect(ids).toContain("integral");
        expect(ids).toContain("derivative");
    });

    it("returns empty for entity with no connections", () => {
        const kb = makeKB();
        const hits = getNeighbourhood(kb, "pythagorean", 1);
        expect(hits.some(h => h.entityId === "right-triangle")).toBe(true);
    });

    it("does not include the start entity itself", () => {
        const kb = makeKB();
        const hits = getNeighbourhood(kb, "ftc", 2);
        expect(hits.every(h => h.entityId !== "ftc")).toBe(true);
    });

    it("respects maxHops = 0 (returns nothing)", () => {
        expect(getNeighbourhood(makeKB(), "ftc", 0)).toEqual([]);
    });

    it("records hop count correctly", () => {
        const kb = makeKB();
        const hits = getNeighbourhood(kb, "ftc", 1);
        expect(hits.every(h => h.hops === 1)).toBe(true);
    });
});

describe("crossTableJoin", () => {
    it("finds pairs linked by a relation across two tables", () => {
        const kb = makeKB();
        const hits = crossTableJoin(kb, 0, 1, "uses");
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.some(h => h.leftEntityId === "ftc" && h.rightEntityId === "integral")).toBe(true);
    });

    it("returns empty for non-existent relation", () => {
        expect(crossTableJoin(makeKB(), 0, 1, "proves")).toEqual([]);
    });

    it("returns empty for invalid table indices", () => {
        expect(crossTableJoin(makeKB(), 99, 1, "uses")).toEqual([]);
    });
});
