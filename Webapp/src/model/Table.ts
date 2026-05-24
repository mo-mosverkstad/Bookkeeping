import type { Column } from "./Column.ts";
import type { Row } from "./Row.ts";

export class Table {
    readonly name: string;
    readonly columns: Column[];
    rows: Row[];
    constructor(name: string, columns: Column[], rows: Row[]) {
        this.name = name;
        this.columns = columns;
        this.rows = rows;
    }

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
