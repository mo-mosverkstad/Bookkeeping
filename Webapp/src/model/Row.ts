import type { Cell } from "./Cell.ts";

export class Row {
    cells: Cell[];
    constructor(cells: Cell[]) {
        this.cells = cells;
    }

    get entityId(): string {
        return this.cells[0]?.value ?? "";
    }

    getCellValue(colIdx: number): string {
        return this.cells[colIdx]?.value ?? "";
    }
}
