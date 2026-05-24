import { KnowledgeBase, Table, Column, Row, Cell, EditHistory } from "../model/index.ts";
import { parseCSV } from "../data/csv.ts";
import { searchText, searchByIdentifier, getNeighbourhood, crossTableJoin } from "../search/index.ts";
import type { SearchHit, NeighbourHit, JoinHit } from "../search/index.ts";
import type { TableView } from "../view/table-view.ts";
import type { GraphFilterView } from "../view/graph-filter-view.ts";

/**
 * Controller — orchestrates model and view.
 * Handles user actions, updates the model, and tells the view to re-render.
 */
export class AppController {
    private knowledgeBase = new KnowledgeBase();
    private tableView: TableView | null = null;
    private graphFilterView: GraphFilterView | null = null;
    readonly history = new EditHistory();

    setTableView(view: TableView): void { this.tableView = view; }
    setGraphFilterView(view: GraphFilterView): void { this.graphFilterView = view; }

    getKnowledgeBase(): KnowledgeBase { return this.knowledgeBase; }

    /** Load a CSV file into the knowledge base. */
    loadCSV(fileName: string, csvText: string): void {
        const parsed = parseCSV(csvText);
        const columns = parsed.headers.map((name, i) => new Column(name, parsed.types[i] ?? "text"));
        const rows = parsed.rows.map(rawRow => new Row(rawRow.map((val, i) => new Cell(val, columns[i].typeId))));
        const table = new Table(fileName.replace(/\.csv$/, ""), columns, rows);
        this.knowledgeBase.addTable(table);
        this.refreshViews();
    }

    /** Filter tables by relation and target. */
    filterByRelation(relation: string, target: string): void {
        const matchingIds = new Set(this.knowledgeBase.graph.filterByRelation(relation, target));
        if (this.tableView) {
            this.tableView.renderFiltered(this.knowledgeBase.tables, matchingIds, `${relation} → ${target}`);
        }
    }

    /** Show all tables unfiltered. */
    showAll(): void {
        if (this.tableView) {
            this.tableView.renderAll(this.knowledgeBase.tables);
        }
    }

    /** Get associations for an entity (for detail panel). */
    getAssociationsFor(entityId: string) {
        return this.knowledgeBase.graph.getAssociationsFor(entityId);
    }

    getInverse(relation: string): string | null {
        return this.knowledgeBase.graph.getInverse(relation);
    }

    /** Edit a single cell value. Records undo action. */
    editCell(tableIdx: number, rowIdx: number, colIdx: number, newValue: string): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table) return;
        const cell = table.rows[rowIdx]?.cells[colIdx];
        if (!cell) return;
        const oldValue = cell.value;
        if (oldValue === newValue) return;
        this.history.push({ type: "cell", tableIdx, rowIdx, colIdx, oldValue, newValue });
        cell.value = newValue;
        this.showAll();
    }

    /** Append an empty row to a table. Records undo action. */
    addRow(tableIdx: number): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table) return;
        const row = new Row(table.columns.map(c => new Cell("", c.typeId)));
        this.history.push({ type: "addRow", tableIdx, row });
        table.rows.push(row);
        this.showAll();
    }

    /** Insert an empty row at a specific index. Records undo action. */
    insertRow(tableIdx: number, atIdx: number): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table) return;
        const row = new Row(table.columns.map(c => new Cell("", c.typeId)));
        this.history.push({ type: "addRow", tableIdx, row });
        table.rows.splice(atIdx, 0, row);
        this.showAll();
    }

    /** Move a row from one index to another. Records undo action. */
    moveRow(tableIdx: number, fromIdx: number, toIdx: number): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table || fromIdx === toIdx) return;
        this.history.push({ type: "moveRow", tableIdx, fromIdx, toIdx });
        const [row] = table.rows.splice(fromIdx, 1);
        table.rows.splice(toIdx, 0, row);
        this.showAll();
    }

    /** Delete a row by index. Records undo action. */
    deleteRow(tableIdx: number, rowIdx: number): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table) return;
        const [row] = table.rows.splice(rowIdx, 1);
        if (!row) return;
        this.history.push({ type: "deleteRow", tableIdx, rowIdx, row });
        this.showAll();
    }

    /** Undo the last edit action. */
    undo(): void {
        const action = this.history.undo();
        if (!action) return;
        const table = this.knowledgeBase.tables[action.tableIdx];
        if (!table) return;
        if (action.type === "cell") {
            table.rows[action.rowIdx].cells[action.colIdx].value = action.oldValue;
        } else if (action.type === "addRow") {
            table.rows.pop();
        } else if (action.type === "deleteRow") {
            table.rows.splice(action.rowIdx, 0, action.row);
        } else if (action.type === "moveRow") {
            const [row] = table.rows.splice(action.toIdx, 1);
            table.rows.splice(action.fromIdx, 0, row);
        }
        this.showAll();
    }

    /** Redo the last undone action. */
    redo(): void {
        const action = this.history.redo();
        if (!action) return;
        const table = this.knowledgeBase.tables[action.tableIdx];
        if (!table) return;
        if (action.type === "cell") {
            table.rows[action.rowIdx].cells[action.colIdx].value = action.newValue;
        } else if (action.type === "addRow") {
            table.rows.push(action.row);
        } else if (action.type === "deleteRow") {
            table.rows.splice(action.rowIdx, 1);
        } else if (action.type === "moveRow") {
            const [row] = table.rows.splice(action.fromIdx, 1);
            table.rows.splice(action.toIdx, 0, row);
        }
        this.showAll();
    }

    /** Export a table as CSV text. */
    exportCSV(tableIdx: number): string {
        return this.knowledgeBase.exportTableAsCSV(tableIdx);
    }

    /** Full-text search across all text cells. */
    searchText(query: string): SearchHit[] {
        return searchText(this.knowledgeBase, query);
    }

    /** Structural search: find entities whose math cells contain a given identifier. */
    searchByIdentifier(name: string): SearchHit[] {
        return searchByIdentifier(this.knowledgeBase, name);
    }

    /** Graph neighbourhood: all entities within maxHops of startEntityId. */
    getNeighbourhood(startEntityId: string, maxHops: number): NeighbourHit[] {
        return getNeighbourhood(this.knowledgeBase, startEntityId, maxHops);
    }

    /** Cross-table join: entity pairs from two tables linked by a relation. */
    crossTableJoin(leftTableIdx: number, rightTableIdx: number, relation: string): JoinHit[] {
        return crossTableJoin(this.knowledgeBase, leftTableIdx, rightTableIdx, relation);
    }

    /** Names of all currently loaded files (for session persistence). */
    getLoadedFileNames(): string[] {
        return this.knowledgeBase.tables.map(t => t.name);
    }

    private refreshViews(): void {
        if (this.graphFilterView) {
            this.graphFilterView.updateDropdowns(
                this.knowledgeBase.graph.getRelationTypes(),
                this.knowledgeBase.graph.getAllEntityIds(),
            );
        }
        this.showAll();
    }
}
