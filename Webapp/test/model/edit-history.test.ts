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

describe("EditHistory saved position tracking", () => {
    it("starts at saved position", () => {
        const h = new EditHistory();
        expect(h.isAtSavedPosition()).toBe(true);
    });

    it("push moves away from saved position", () => {
        const h = new EditHistory();
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" });
        expect(h.isAtSavedPosition()).toBe(false);
    });

    it("markSaved sets current position as saved", () => {
        const h = new EditHistory();
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" });
        h.markSaved();
        expect(h.isAtSavedPosition()).toBe(true);
    });

    it("push after markSaved is no longer at saved position", () => {
        const h = new EditHistory();
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" });
        h.markSaved();
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "b", newValue: "c" });
        expect(h.isAtSavedPosition()).toBe(false);
    });

    it("undo back to saved position returns true", () => {
        const h = new EditHistory();
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" });
        h.markSaved();
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "b", newValue: "c" });
        expect(h.isAtSavedPosition()).toBe(false);
        h.undo();
        expect(h.isAtSavedPosition()).toBe(true);
    });

    it("redo past saved position is dirty", () => {
        const h = new EditHistory();
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" });
        h.markSaved();
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "b", newValue: "c" });
        h.undo();
        expect(h.isAtSavedPosition()).toBe(true);
        h.redo();
        expect(h.isAtSavedPosition()).toBe(false);
    });

    it("undo past saved position is dirty", () => {
        const h = new EditHistory();
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" });
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "b", newValue: "c" });
        h.markSaved();
        h.undo();
        expect(h.isAtSavedPosition()).toBe(false);
    });

    it("multiple undo/redo cycles track position correctly", () => {
        const h = new EditHistory();
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" });
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "b", newValue: "c" });
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "c", newValue: "d" });
        h.markSaved(); // saved at position 3
        expect(h.isAtSavedPosition()).toBe(true);

        h.undo(); // position 2
        expect(h.isAtSavedPosition()).toBe(false);
        h.undo(); // position 1
        expect(h.isAtSavedPosition()).toBe(false);
        h.redo(); // position 2
        expect(h.isAtSavedPosition()).toBe(false);
        h.redo(); // position 3
        expect(h.isAtSavedPosition()).toBe(true);
    });

    it("clear resets saved position", () => {
        const h = new EditHistory();
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" });
        h.markSaved();
        h.clear();
        expect(h.isAtSavedPosition()).toBe(true);
    });

    it("save at start then edit then undo all returns to saved", () => {
        const h = new EditHistory();
        h.markSaved(); // saved at position 0
        h.push({ type: "cell", tableIdx: 0, rowIdx: 0, colIdx: 0, oldValue: "a", newValue: "b" });
        expect(h.isAtSavedPosition()).toBe(false);
        h.undo();
        expect(h.isAtSavedPosition()).toBe(true);
    });
});

describe("AppController dirty tracking with undo/redo", () => {
    function setupController(): import("../../src/controller/index.ts").AppController {
        const { AppController } = require("../../src/controller/index.ts");
        const ctrl = new AppController();
        // Load a table
        ctrl.loadCSV("test.csv", "Name,Value\nrich,rich\nAlpha,1\nBeta,2\n");
        // Store as loaded file (simulates opening)
        const table = ctrl.getKnowledgeBase().tables[0];
        ctrl.storeLoadedFile("test.csv", table.toCSV(), null);
        return ctrl;
    }

    it("edit makes file dirty", () => {
        const ctrl = setupController();
        ctrl.editCell(0, 0, 1, "99", true);
        expect(ctrl.isDirty()).toBe(true);
        expect(ctrl.getDirtyFiles().has("test.csv")).toBe(true);
    });

    it("undo after edit returns to clean", () => {
        const ctrl = setupController();
        ctrl.editCell(0, 0, 1, "99", true);
        expect(ctrl.isDirty()).toBe(true);
        ctrl.undo();
        expect(ctrl.isDirty()).toBe(false);
    });

    it("redo after undo makes dirty again", () => {
        const ctrl = setupController();
        ctrl.editCell(0, 0, 1, "99", true);
        ctrl.undo();
        expect(ctrl.isDirty()).toBe(false);
        ctrl.redo();
        expect(ctrl.isDirty()).toBe(true);
    });

    it("save then undo makes dirty", async () => {
        const ctrl = setupController();
        ctrl.editCell(0, 0, 1, "99", true);
        // Simulate save (updates stored text)
        const table = ctrl.getKnowledgeBase().tables[0];
        ctrl.storeLoadedFile("test.csv", table.toCSV(), null);
        ctrl.getDirtyFiles().delete("test.csv");
        expect(ctrl.isDirty()).toBe(false);
        // Undo reverts the cell — now content differs from saved
        ctrl.undo();
        expect(ctrl.isDirty()).toBe(true);
    });

    it("save then undo then redo returns to clean", () => {
        const ctrl = setupController();
        ctrl.editCell(0, 0, 1, "99", true);
        // Save
        const table = ctrl.getKnowledgeBase().tables[0];
        ctrl.storeLoadedFile("test.csv", table.toCSV(), null);
        ctrl.getDirtyFiles().delete("test.csv");
        // Undo (dirty)
        ctrl.undo();
        expect(ctrl.isDirty()).toBe(true);
        // Redo back to saved state (clean)
        ctrl.redo();
        expect(ctrl.isDirty()).toBe(false);
    });

    it("multiple edits then undo one is still dirty", () => {
        const ctrl = setupController();
        ctrl.editCell(0, 0, 1, "99", true);
        ctrl.editCell(0, 1, 1, "88", true);
        ctrl.undo(); // undoes second edit
        expect(ctrl.isDirty()).toBe(true); // first edit still differs from saved
    });

    it("multiple edits then undo all returns to clean", () => {
        const ctrl = setupController();
        ctrl.editCell(0, 0, 1, "99", true);
        ctrl.editCell(0, 1, 1, "88", true);
        ctrl.undo();
        ctrl.undo();
        expect(ctrl.isDirty()).toBe(false);
    });
});
