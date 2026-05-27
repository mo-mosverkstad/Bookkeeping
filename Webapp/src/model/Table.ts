import { Column } from "./Column.ts";
import { Row } from "./Row.ts";
import { Cell } from "./Cell.ts";

export class Table {
    readonly name: string;
    readonly columns: Column[];
    rows: Row[];

    constructor(name: string, columns: Column[], rows: Row[]) {
        this.name = name;
        this.columns = columns;
        this.rows = rows;
    }

    // ── Factory ───────────────────────────────────────────────────────────────

    /** Build a Table from parsed CSV data. Owns all Column/Row/Cell construction. */
    static fromCSV(
        name: string,
        parsed: { headers: string[]; types: string[]; rows: string[][] },
    ): Table {
        const columns = parsed.headers.map(
            (h, i) => new Column(h, parsed.types[i] ?? "text")
        );
        const rows = parsed.rows.map(
            rawRow => new Row(columns.map((col, i) => new Cell(rawRow[i] ?? "", col.typeId)))
        );
        return new Table(name, columns, rows);
    }

    // ── Row factory ───────────────────────────────────────────────────────────

    /** Create a blank row matching this table's column schema. */
    createEmptyRow(): Row {
        return new Row(this.columns.map(c => new Cell("", c.typeId)));
    }

    // ── Row mutations ─────────────────────────────────────────────────────────

    /** Append a new empty row and return it. */
    appendRow(): Row {
        const row = this.createEmptyRow();
        this.rows.push(row);
        return row;
    }

    /** Insert a new empty row at the given index and return it. */
    insertRowAt(idx: number): Row {
        const row = this.createEmptyRow();
        this.rows.splice(idx, 0, row);
        return row;
    }

    /** Remove the row at the given index and return it. */
    removeRowAt(idx: number): Row {
        const [row] = this.rows.splice(idx, 1);
        return row;
    }

    /** Move a row from one index to another. */
    moveRowFromTo(fromIdx: number, toIdx: number): void {
        const [row] = this.rows.splice(fromIdx, 1);
        this.rows.splice(toIdx, 0, row);
    }

    /** Restore a previously removed row at the given index (for undo). */
    restoreRowAt(idx: number, row: Row): void {
        this.rows.splice(idx, 0, row);
    }

    // ── Cell access ───────────────────────────────────────────────────────────

    /** Read a cell value safely. Returns "" if out of bounds. */
    getCellValue(rowIdx: number, colIdx: number): string {
        return this.rows[rowIdx]?.cells[colIdx]?.value ?? "";
    }

    /** Write a cell value safely. No-op if out of bounds. */
    setCellValue(rowIdx: number, colIdx: number, value: string): void {
        const cell = this.rows[rowIdx]?.cells[colIdx];
        if (cell) cell.value = value;
    }

    /** Serialise this table to CSV text (header row, types row, data rows). */
    toCSV(): string {
        const escape = (v: string) => v.includes(",") || v.includes('"') || v.includes("\n")
            ? `"${v.replace(/"/g, '""')}"` : v;
        const headerRow = this.columns.map(c => escape(c.name)).join(",");
        const typeRow   = this.columns.map(c => escape(c.typeId)).join(",");
        const dataRows  = this.rows.map((_, rowIdx) =>
            this.columns.map((__, colIdx) => escape(this.getCellValue(rowIdx, colIdx))).join(",")
        );
        return [headerRow, typeRow, ...dataRows].join("\n");
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    getColumnIndex(name: string): number {
        return this.columns.findIndex(c => c.name === name);
    }

    getEntityIds(): string[] {
        return this.rows.map(r => r.entityId);
    }

    filterByEntityIds(ids: Set<string>): Row[] {
        return this.rows.filter(r => ids.has(r.entityId));
    }

    sortedRows(colIdx: number, ascending: boolean): Row[] {
        return [...this.rows].sort((a, b) => {
            const av = a.getCellValue(colIdx);
            const bv = b.getCellValue(colIdx);
            return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
    }
}
