import type { Table } from "./Table.ts";
import { AssociationGraph } from "./AssociationGraph.ts";
import type { ResolvedDiagram } from "../data/control.ts";

export class KnowledgeBase {
    readonly tables: Table[] = [];
    readonly graph = new AssociationGraph();
    readonly diagrams: ResolvedDiagram[] = [];

    addTable(table: Table): void {
        this.tables.push(table);
        const assocColIdx = table.getColumnIndex("_associations");
        if (assocColIdx !== -1) {
            const entityIds = table.getEntityIds();
            const assocValues = table.rows.map(r => r.getCellValue(assocColIdx));
            this.graph.addFromColumn(entityIds, assocValues);
        }
    }

    clear(): void {
        this.tables.length = 0;
        this.diagrams.length = 0;
        this.graph.clear();
    }

    exportTableAsCSV(tableIdx: number): string {
        const table = this.tables[tableIdx];
        if (!table) return "";
        const escape = (v: string) => v.includes(",") || v.includes('"') || v.includes("\n")
            ? `"${v.replace(/"/g, '""')}"` : v;
        const headerRow = table.columns.map(c => escape(c.name)).join(",");
        const typeRow = table.columns.map(c => escape(c.typeId)).join(",");
        const dataRows = table.rows.map(r => r.cells.map(c => escape(c.value)).join(","));
        return [headerRow, typeRow, ...dataRows].join("\n");
    }
}
