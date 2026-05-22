import { KnowledgeBase, Table, Column, Row, Cell } from "../model/index.ts";
import { parseCSV } from "../data/csv.ts";
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
