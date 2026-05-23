import { describe, it, expect } from "vitest";
import { EditHistory, KnowledgeBase, Table, Column, Row, Cell } from "../../src/model/index.ts";

function makeTable(): Table {
    return new Table("t", [new Column("id", "text"), new Column("val", "math")], [
        new Row([new Cell("a", "text"), new Cell("x^2", "math")]),
        new Row([new Cell("b", "text"), new Cell("y+1", "math")]),
    ]);
}

describe("EditHistory", () => {
    it("starts empty", () => {
        const h = new EditHistory();
        expect(h.canUndo()).toBe(false);
        expect(h.canRedo()).toBe(false);
    });

    it("push enables undo", () => {
        const h = new EditHistory();
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" });
        expect(h.canUndo()).toBe(true);
        expect(h.canRedo()).toBe(false);
    });

    it("undo returns action and enables redo", () => {
        const h = new EditHistory();
        const action = { type: "cell" as const, tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" };
        h.push(action);
        const undone = h.undo();
        expect(undone).toEqual(action);
        expect(h.canUndo()).toBe(false);
        expect(h.canRedo()).toBe(true);
    });

    it("redo returns action and re-enables undo", () => {
        const h = new EditHistory();
        const action = { type: "cell" as const, tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" };
        h.push(action);
        h.undo();
        const redone = h.redo();
        expect(redone).toEqual(action);
        expect(h.canUndo()).toBe(true);
        expect(h.canRedo()).toBe(false);
    });

    it("push after undo clears redo stack", () => {
        const h = new EditHistory();
        h.push({ type: "cell" as const, tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" });
        h.undo();
        h.push({ type: "cell" as const, tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "c" });
        expect(h.canRedo()).toBe(false);
    });

    it("undo on empty returns undefined", () => {
        const h = new EditHistory();
        expect(h.undo()).toBeUndefined();
    });

    it("redo on empty returns undefined", () => {
        const h = new EditHistory();
        expect(h.redo()).toBeUndefined();
    });

    it("clear empties both stacks", () => {
        const h = new EditHistory();
        h.push({ type: "cell" as const, tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" });
        h.clear();
        expect(h.canUndo()).toBe(false);
    });
});

describe("KnowledgeBase.exportTableAsCSV", () => {
    it("exports header, types, and data rows", () => {
        const kb = new KnowledgeBase();
        kb.addTable(makeTable());
        const csv = kb.exportTableAsCSV(0);
        const lines = csv.split("\n");
        expect(lines[0]).toBe("id,val");
        expect(lines[1]).toBe("text,math");
        expect(lines[2]).toBe("a,x^2");
        expect(lines[3]).toBe("b,y+1");
    });

    it("quotes fields containing commas", () => {
        const kb = new KnowledgeBase();
        const table = new Table("t", [new Column("id", "text")], [
            new Row([new Cell("a,b", "text")]),
        ]);
        kb.addTable(table);
        const csv = kb.exportTableAsCSV(0);
        expect(csv).toContain('"a,b"');
    });

    it("quotes fields containing double quotes", () => {
        const kb = new KnowledgeBase();
        const table = new Table("t", [new Column("id", "text")], [
            new Row([new Cell('say "hi"', "text")]),
        ]);
        kb.addTable(table);
        const csv = kb.exportTableAsCSV(0);
        expect(csv).toContain('"say ""hi"""');
    });

    it("returns empty string for invalid tableIdx", () => {
        const kb = new KnowledgeBase();
        expect(kb.exportTableAsCSV(99)).toBe("");
    });
});
