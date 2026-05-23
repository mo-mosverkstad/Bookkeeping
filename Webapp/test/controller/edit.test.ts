import { describe, it, expect } from "vitest";
import { AppController } from "../../src/controller/index.ts";
import { Table, Column, Row, Cell } from "../../src/model/index.ts";

function makeController(): AppController {
    const ctrl = new AppController();
    const kb = ctrl.getKnowledgeBase();
    const table = new Table("t", [new Column("id", "text"), new Column("val", "math")], [
        new Row([new Cell("a", "text"), new Cell("x^2", "math")]),
        new Row([new Cell("b", "text"), new Cell("y+1", "math")]),
    ]);
    kb.addTable(table);
    return ctrl;
}

describe("AppController.editCell", () => {
    it("updates cell value", () => {
        const ctrl = makeController();
        ctrl.editCell(0, 0, 1, "z^3");
        expect(ctrl.getKnowledgeBase().tables[0].rows[0].cells[1].value).toBe("z^3");
    });

    it("does nothing for same value", () => {
        const ctrl = makeController();
        ctrl.editCell(0, 0, 1, "x^2");
        expect(ctrl.history.canUndo()).toBe(false);
    });

    it("records undo action", () => {
        const ctrl = makeController();
        ctrl.editCell(0, 0, 1, "z^3");
        expect(ctrl.history.canUndo()).toBe(true);
    });
});

describe("AppController undo/redo", () => {
    it("undo restores old cell value", () => {
        const ctrl = makeController();
        ctrl.editCell(0, 0, 1, "z^3");
        ctrl.undo();
        expect(ctrl.getKnowledgeBase().tables[0].rows[0].cells[1].value).toBe("x^2");
    });

    it("redo re-applies edit", () => {
        const ctrl = makeController();
        ctrl.editCell(0, 0, 1, "z^3");
        ctrl.undo();
        ctrl.redo();
        expect(ctrl.getKnowledgeBase().tables[0].rows[0].cells[1].value).toBe("z^3");
    });

    it("multiple undos work in order", () => {
        const ctrl = makeController();
        ctrl.editCell(0, 0, 1, "z^3");
        ctrl.editCell(0, 0, 1, "w^4");
        ctrl.undo();
        expect(ctrl.getKnowledgeBase().tables[0].rows[0].cells[1].value).toBe("z^3");
        ctrl.undo();
        expect(ctrl.getKnowledgeBase().tables[0].rows[0].cells[1].value).toBe("x^2");
    });
});

describe("AppController.addRow", () => {
    it("appends an empty row", () => {
        const ctrl = makeController();
        ctrl.addRow(0);
        expect(ctrl.getKnowledgeBase().tables[0].rows.length).toBe(3);
    });

    it("new row has correct number of cells", () => {
        const ctrl = makeController();
        ctrl.addRow(0);
        const newRow = ctrl.getKnowledgeBase().tables[0].rows[2];
        expect(newRow.cells.length).toBe(2);
        expect(newRow.cells[0].value).toBe("");
    });

    it("undo removes added row", () => {
        const ctrl = makeController();
        ctrl.addRow(0);
        ctrl.undo();
        expect(ctrl.getKnowledgeBase().tables[0].rows.length).toBe(2);
    });
});

describe("AppController.deleteRow", () => {
    it("removes the row", () => {
        const ctrl = makeController();
        ctrl.deleteRow(0, 0);
        expect(ctrl.getKnowledgeBase().tables[0].rows.length).toBe(1);
        expect(ctrl.getKnowledgeBase().tables[0].rows[0].entityId).toBe("b");
    });

    it("undo restores deleted row at correct position", () => {
        const ctrl = makeController();
        ctrl.deleteRow(0, 0);
        ctrl.undo();
        expect(ctrl.getKnowledgeBase().tables[0].rows.length).toBe(2);
        expect(ctrl.getKnowledgeBase().tables[0].rows[0].entityId).toBe("a");
    });
});

describe("AppController.exportCSV", () => {
    it("produces correct CSV", () => {
        const ctrl = makeController();
        const csv = ctrl.exportCSV(0);
        const lines = csv.split("\n");
        expect(lines[0]).toBe("id,val");
        expect(lines[1]).toBe("text,math");
        expect(lines[2]).toBe("a,x^2");
        expect(lines[3]).toBe("b,y+1");
    });
});
