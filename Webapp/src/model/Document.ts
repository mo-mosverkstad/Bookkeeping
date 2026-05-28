/**
 * Document — orchestrates one reference sheet.
 *
 * A Document contains an ordered list of Sections. Each Section holds
 * either a Table block or a Graph (Chart) block, plus an optional
 * referenceMapping that connects chart node IDs to table row IDs
 * (the numbered-label / legend pattern).
 *
 * Table and Graph files remain atomic and know nothing about Documents.
 * The Document is the only coordination layer.
 */

import type { Table } from "./Table.ts";
import type { Graph } from "./Graph.ts";

// ── Block types ───────────────────────────────────────────────────────────────

export interface TableBlock {
    readonly kind: "table";
    readonly file: string;
    readonly table: Table;
}

export interface GraphBlock {
    readonly kind: "graph";
    readonly file: string;
    readonly graph: Graph;
    /** When "numbered", the chart renderer shows 1,2,3... instead of labels. */
    readonly labelStyle?: "default" | "numbered";
}

export type Block = TableBlock | GraphBlock;

// ── Reference mapping ─────────────────────────────────────────────────────────

/**
 * Connects chart node IDs to table row IDs within the same Document.
 * Implements the "legend" pattern: the chart shows numbers, the table
 * shows descriptions.
 *
 * chartSection: id of the Section containing the GraphBlock
 * nodeIdColumn: column in this section's table whose values are node IDs
 * labelColumn:  column in this section's table whose values are display labels
 */
export interface ReferenceMapping {
    readonly chartSection: string;
    readonly nodeIdColumn: string;
    readonly labelColumn: string;
}

// ── Section ───────────────────────────────────────────────────────────────────

export class Section {
    readonly id: string;
    readonly title: string;
    readonly block: Block;
    readonly referenceMapping: ReferenceMapping | null;

    constructor(
        id: string,
        title: string,
        block: Block,
        referenceMapping: ReferenceMapping | null = null,
    ) {
        this.id = id;
        this.title = title;
        this.block = block;
        this.referenceMapping = referenceMapping;
    }
}

// ── Document ──────────────────────────────────────────────────────────────────

export class Document {
    readonly name: string;
    readonly sections: Section[];

    constructor(name: string, sections: Section[] = []) {
        this.name = name;
        this.sections = sections;
    }

    getSection(id: string): Section | undefined {
        return this.sections.find(s => s.id === id);
    }

    getTableSections(): Section[] {
        return this.sections.filter(s => s.block.kind === "table");
    }

    getGraphSections(): Section[] {
        return this.sections.filter(s => s.block.kind === "graph");
    }
}
