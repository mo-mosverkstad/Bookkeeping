/**
 * Model layer — business data structures.
 * Pure data, no DOM, no rendering, no file I/O.
 */

/** A single cell in a table. */
export class Cell {
    value: string;
    readonly typeId: string;
    constructor(value: string, typeId: string) {
        this.value = value;
        this.typeId = typeId;
    }
}

/** A column definition. */
export class Column {
    readonly name: string;
    readonly typeId: string;
    constructor(name: string, typeId: string) {
        this.name = name;
        this.typeId = typeId;
    }
}

/** A row (entity) in a table. */
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

/** A knowledge table — the core business object. */
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

/** An association (edge) between two entities. */
export class Association {
    readonly source: string;
    readonly relation: string;
    readonly target: string;
    constructor(source: string, relation: string, target: string) {
        this.source = source;
        this.relation = relation;
        this.target = target;
    }
}

/** A relation type definition. */
export class RelationType {
    readonly name: string;
    readonly inverse: string;
    readonly symmetric: boolean;
    constructor(name: string, inverse: string, symmetric: boolean) {
        this.name = name;
        this.inverse = inverse;
        this.symmetric = symmetric;
    }
}

/** The association graph — stores all relationships between entities. */
export class AssociationGraph {
    private edges: Association[] = [];
    private vocabulary: RelationType[] = [];

    setVocabulary(vocab: RelationType[] | { relations: RelationType[] }): void {
        this.vocabulary = Array.isArray(vocab) ? vocab : vocab.relations;
    }

    getVocabulary(): RelationType[] {
        return this.vocabulary;
    }

    addAssociation(source: string, relation: string, target: string): void {
        this.edges.push(new Association(source, relation, target));
    }

    addFromColumn(entityIds: string[], associationValues: string[]): void {
        for (let i = 0; i < entityIds.length; i++) {
            const value = associationValues[i];
            if (!value) continue;
            for (const entry of value.split(";").map(s => s.trim()).filter(Boolean)) {
                const colonIdx = entry.indexOf(":");
                if (colonIdx === -1) continue;
                this.addAssociation(entityIds[i], entry.slice(0, colonIdx).trim(), entry.slice(colonIdx + 1).trim());
            }
        }
    }

    addAssociations(entityIds: string[], associationValues: string[]): void {
        this.addFromColumn(entityIds, associationValues);
    }

    getAllEdges(): Association[] { return this.edges; }

    filterByRelation(relation: string, target: string): string[] {
        return this.edges.filter(e => e.relation === relation && e.target === target).map(e => e.source);
    }

    filterBySource(relation: string, source: string): string[] {
        return this.edges.filter(e => e.relation === relation && e.source === source).map(e => e.target);
    }

    getAssociationsFor(entityId: string): { outgoing: Association[]; incoming: Association[] } {
        return {
            outgoing: this.edges.filter(e => e.source === entityId),
            incoming: this.edges.filter(e => e.target === entityId),
        };
    }

    getInverse(relation: string): string | null {
        const rel = this.vocabulary.find(r => r.name === relation);
        if (rel) return rel.inverse;
        const inv = this.vocabulary.find(r => r.inverse === relation);
        if (inv) return inv.name;
        return null;
    }

    getRelationTypes(): string[] { return [...new Set(this.edges.map(e => e.relation))]; }
    getAllEntityIds(): string[] { const s = new Set<string>(); for (const e of this.edges) { s.add(e.source); s.add(e.target); } return [...s]; }
    clear(): void { this.edges = []; }
}

/** A single edit action for undo/redo. */
export type EditAction =
    | { type: "cell"; tableIdx: number; rowIdx: number; colIdx: number; oldValue: string; newValue: string }
    | { type: "addRow"; tableIdx: number; row: Row }
    | { type: "deleteRow"; tableIdx: number; rowIdx: number; row: Row };

/** Undo/redo history stack. */
export class EditHistory {
    private past: EditAction[] = [];
    private future: EditAction[] = [];

    push(action: EditAction): void {
        this.past.push(action);
        this.future = [];
    }

    undo(): EditAction | undefined {
        const action = this.past.pop();
        if (action) this.future.push(action);
        return action;
    }

    redo(): EditAction | undefined {
        const action = this.future.pop();
        if (action) this.past.push(action);
        return action;
    }

    canUndo(): boolean { return this.past.length > 0; }
    canRedo(): boolean { return this.future.length > 0; }
    clear(): void { this.past = []; this.future = []; }
}

/** The knowledge base — top-level container for all loaded data. */
export class KnowledgeBase {
    readonly tables: Table[] = [];
    readonly graph = new AssociationGraph();

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
        this.graph.clear();
    }

    exportTableAsCSV(tableIdx: number): string {
        const table = this.tables[tableIdx];
        if (!table) return "";
        const escape = (v: string) => v.includes(",") || v.includes('"') || v.includes("\n")
            ? `"${v.replace(/"/g, '""')}"`
            : v;
        const headerRow = table.columns.map(c => escape(c.name)).join(",");
        const typeRow = table.columns.map(c => escape(c.typeId)).join(",");
        const dataRows = table.rows.map(r => r.cells.map(c => escape(c.value)).join(","));
        return [headerRow, typeRow, ...dataRows].join("\n");
    }
}
