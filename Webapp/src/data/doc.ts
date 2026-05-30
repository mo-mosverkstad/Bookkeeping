/**
 * doc.ts — parser for .doc.json Document files.
 *
 * A .doc.json file orchestrates one reference sheet. It declares which
 * table and graph files belong to it, how they are arranged into sections,
 * and how they reference each other (the legend/reference-mapping pattern).
 *
 * Table and Graph files are loaded separately and passed in via the
 * fileMap parameter. The parser resolves file references against this map.
 */

import { Document, Section } from "../model/Document.ts";
import type { Block, ReferenceMapping } from "../model/Document.ts";
import type { Table } from "../model/Table.ts";
import type { Graph } from "../model/Graph.ts";

// ── Raw JSON shapes ───────────────────────────────────────────────────────────

interface RawTableBlock {
    type: "table";
    file: string;
}

interface RawGraphBlock {
    type: "graph";
    file: string;
    labelStyle?: "default" | "numbered";
}

interface RawDiagramBlock {
    type: `graph_${string}`;
    file: string;
    labelStyle?: "default" | "numbered";
}

interface RawReferenceMapping {
    chartSection: string;
    nodeIdColumn: string;
    labelColumn: string;
}

interface RawSection {
    id: string;
    title?: string;
    block: RawTableBlock | RawGraphBlock | RawDiagramBlock;
    referenceMapping?: RawReferenceMapping;
}

interface RawDocument {
    version?: string;
    name?: string;
    sections?: RawSection[];
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a .doc.json file into a Document model object.
 *
 * @param fileName     The name of the .doc.json file (used as fallback document name).
 * @param json         The parsed JSON object from the file.
 * @param tableMap     Map from filename → Table (already loaded).
 * @param graphMap     Map from filename → Graph (already loaded).
 * @param diagramMap   Map from filename → source text (already loaded .diagram files).
 *
 * Sections whose referenced file is not found in the maps are skipped with
 * a console warning rather than throwing — this allows partial loading when
 * some files are missing.
 */
export function parseDocJSON(
    fileName: string,
    json: unknown,
    tableMap: Map<string, Table>,
    graphMap: Map<string, Graph>,
    diagramMap: Map<string, string> = new Map(),
): Document {
    if (typeof json !== "object" || json === null)
        throw new Error(`${fileName}: .doc.json must be a JSON object`);

    const raw = json as RawDocument;
    const name = raw.name ?? fileName.replace(/\.doc\.json$/, "").replace(/\.doc$/, "");
    const sections: Section[] = [];

    for (const rs of raw.sections ?? []) {
        if (!rs.id) {
            console.warn(`${fileName}: section missing "id", skipping`);
            continue;
        }

        const title = rs.title ?? rs.id;
        let block: Block | null = null;

        if (rs.block.type === "table") {
            const table = tableMap.get(rs.block.file);
            if (!table) {
                console.warn(`${fileName}: table file "${rs.block.file}" not loaded, skipping section "${rs.id}"`);
                continue;
            }
            block = { kind: "table", file: rs.block.file, table };
        } else if (rs.block.type === "graph") {
            const graph = graphMap.get(rs.block.file);
            if (!graph) {
                console.warn(`${fileName}: graph file "${rs.block.file}" not loaded, skipping section "${rs.id}"`);
                continue;
            }
            block = {
                kind: "graph",
                file: rs.block.file,
                graph,
                labelStyle: rs.block.labelStyle ?? "default",
            };
        } else if (rs.block.type.startsWith("graph_")) {
            // Diagram block: graph_flowchart, graph_sequence, graph_class, etc.
            const diagramType = rs.block.type.slice(6); // strip "graph_"
            const source = diagramMap.get(rs.block.file);
            if (!source) {
                console.warn(`${fileName}: diagram file "${rs.block.file}" not loaded, skipping section "${rs.id}"`);
                continue;
            }
            block = {
                kind: "diagram",
                file: rs.block.file,
                source,
                diagramType,
                labelStyle: (rs.block as RawDiagramBlock).labelStyle ?? "default",
            };
        } else {
            console.warn(`${fileName}: unknown block type "${rs.block.type}" in section "${rs.id}", skipping`);
            continue;
        }

        const refMap: ReferenceMapping | null = rs.referenceMapping
            ? {
                chartSection: rs.referenceMapping.chartSection,
                nodeIdColumn: rs.referenceMapping.nodeIdColumn,
                labelColumn:  rs.referenceMapping.labelColumn,
            }
            : null;

        sections.push(new Section(rs.id, title, block, refMap));
    }

    return new Document(name, sections);
}
