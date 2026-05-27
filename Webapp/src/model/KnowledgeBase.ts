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
            const assocValues = table.rows.map((_, rowIdx) => table.getCellValue(rowIdx, assocColIdx));
            this.graph.addFromColumn(entityIds, assocValues);
        }
    }

    clear(): void {
        this.tables.length = 0;
        this.diagrams.length = 0;
        this.graph.clear();
    }

    exportTableAsCSV(tableIdx: number): string {
        return this.tables[tableIdx]?.toCSV() ?? "";
    }
}
