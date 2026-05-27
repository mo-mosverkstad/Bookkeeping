import type { Table } from "./Table.ts";
import type { Graph } from "./Graph.ts";
import { AssociationGraph } from "./AssociationGraph.ts";

export class KnowledgeBase {
    readonly tables: Table[] = [];
    readonly graphs: Graph[] = [];
    readonly graph = new AssociationGraph();

    addTable(table: Table): void {
        this.tables.push(table);
        const assocColIdx = table.getColumnIndex("_associations");
        if (assocColIdx !== -1) {
            const entityIds = table.getEntityIds();
            const assocValues = table.rows.map((_, rowIdx) => table.getCellValue(rowIdx, assocColIdx));
            this.graph.addFromColumn(entityIds, assocValues);
        }
    }

    addGraph(graph: Graph): void {
        this.graphs.push(graph);
    }

    clear(): void {
        this.tables.length = 0;
        this.graphs.length = 0;
        this.graph.clear();
    }

    exportTableAsCSV(tableIdx: number): string {
        return this.tables[tableIdx]?.toCSV() ?? "";
    }
}
