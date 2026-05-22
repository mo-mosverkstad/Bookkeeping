/**
 * Model layer — business data structures.
 * Pure data, no DOM, no rendering, no file I/O.
 */

/** A single cell in a table. */
export class Cell {
    constructor(
        public readonly value: string,
        public readonly typeId: string,
    ) {}
}

/** A column definition. */
export class Column {
    constructor(
        public readonly name: string,
        public readonly typeId: string,
    ) {}
}

/** A row (entity) in a table. */
export class Row {
    constructor(
        public readonly cells: Cell[],
    ) {}

    /** Get the entity ID (first cell value). */
    get entityId(): string {
        return this.cells[0]?.value ?? "";
    }

    /** Get cell value by column index. */
    getCellValue(colIdx: number): string {
        return this.cells[colIdx]?.value ?? "";
    }
}

/** A knowledge table — the core business object. */
export class Table {
    constructor(
        public readonly name: string,
        public readonly columns: Column[],
        public readonly rows: Row[],
    ) {}

    /** Get column index by name. Returns -1 if not found. */
    getColumnIndex(name: string): number {
        return this.columns.findIndex(c => c.name === name);
    }

    /** Get all entity IDs (first column values). */
    getEntityIds(): string[] {
        return this.rows.map(r => r.entityId);
    }

    /** Get a subset of rows by entity IDs. */
    filterByEntityIds(ids: Set<string>): Row[] {
        return this.rows.filter(r => ids.has(r.entityId));
    }

    /** Sort rows by column index. Returns a new sorted array (does not mutate). */
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
    constructor(
        public readonly source: string,
        public readonly relation: string,
        public readonly target: string,
    ) {}
}

/** A relation type definition. */
export class RelationType {
    constructor(
        public readonly name: string,
        public readonly inverse: string,
        public readonly symmetric: boolean,
    ) {}
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

    /** Parse association column values and store edges. */
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

    /** Alias for addFromColumn (backward compat). */
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

/** The knowledge base — top-level container for all loaded data. */
export class KnowledgeBase {
    public readonly tables: Table[] = [];
    public readonly graph = new AssociationGraph();

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
}
