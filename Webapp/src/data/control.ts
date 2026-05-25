/**
 * Control file — `control.json`
 *
 * Declares how a folder of CSV files should be loaded and rendered.
 * Standard tables use view: "table". Diagram entries bind one or more
 * CSV files together and dispatch to a diagram renderer.
 *
 * If control.json is absent, every CSV loads as a standard table
 * (backward compatible).
 */

// ── Mapping field declarations ────────────────────────────────────────────────

export interface NodeMapping {
    id: string;           // column name → node identity
    label?: string;       // column name → display label (falls back to id)
    type?: string;        // column name → node type (drives nodeStyles)
    x?: string;           // column name → x position hint
    y?: string;           // column name → y position hint
    width?: string;       // column name → width hint (spatial)
    height?: string;      // column name → height hint (spatial)
    parent?: string;      // column name → parent node id (spatial)
}

export interface EdgeMapping {
    from: string;         // column name → source node id
    to: string;           // column name → target node id
    type?: string;        // column name → edge type (drives edgeStyles)
    label?: string;       // column name → edge label
}

export interface ActorMapping {
    id: string;           // column name → actor identity
    label?: string;       // column name → display label
}

export interface MessageMapping {
    from: string;         // column name → source actor id
    to: string;           // column name → target actor id
    label?: string;       // column name → message label
    time?: string;        // column name → ordering key
    type?: string;        // column name → message type
}

// ── File source declarations ──────────────────────────────────────────────────

export interface NodeSource {
    file: string;
    mapping: NodeMapping;
}

export interface EdgeSource {
    file: string;
    mapping: EdgeMapping;
}

export interface ActorSource {
    file: string;
    mapping: ActorMapping;
}

export interface MessageSource {
    file: string;
    mapping: MessageMapping;
}

// ── Style declarations ────────────────────────────────────────────────────────

export interface NodeStyle {
    shape?: "ellipse" | "rect" | "diamond";
    color?: string;
}

export interface EdgeStyle {
    arrow?: "open" | "filled" | "flat";
    dash?: boolean;
    color?: string;
}

// ── Control file entries ──────────────────────────────────────────────────────

export interface TableDecl {
    id: string;
    view: "table";
    file: string;
}

export type DiagramView = "flow" | "spatial" | "relation" | "sequence";

export interface FlowDecl {
    id: string;
    view: "flow" | "spatial" | "relation";
    nodes: NodeSource | NodeSource[];
    edges?: EdgeSource;
    nodeStyles?: Record<string, NodeStyle>;
    edgeStyles?: Record<string, EdgeStyle>;
}

export interface SequenceDecl {
    id: string;
    view: "sequence";
    actors: ActorSource;
    messages: MessageSource;
}

export type ControlEntry = TableDecl | FlowDecl | SequenceDecl;

export interface ControlFile {
    version: string;
    entries: ControlEntry[];
}

// ── Resolved diagram declaration (after CSV files are loaded) ─────────────────

/** A resolved node row: the raw CSV row plus the resolved mapping fields. */
export interface ResolvedNode {
    id: string;
    label: string;
    type: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    parent?: string;
    /** All other columns keyed by column name */
    extra: Record<string, string>;
}

export interface ResolvedEdge {
    from: string;
    to: string;
    type: string;
    label: string;
}

export interface ResolvedActor {
    id: string;
    label: string;
}

export interface ResolvedMessage {
    from: string;
    to: string;
    label: string;
    time: number;
    type: string;
}

export interface ResolvedDiagram {
    entry: ControlEntry;
    nodes?: ResolvedNode[];
    edges?: ResolvedEdge[];
    actors?: ResolvedActor[];
    messages?: ResolvedMessage[];
    nodeStyles: Record<string, NodeStyle>;
    edgeStyles: Record<string, EdgeStyle>;
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseControlFile(json: unknown): ControlFile {
    if (typeof json !== "object" || json === null)
        throw new Error("control.json must be a JSON object");
    const obj = json as Record<string, unknown>;
    if (!Array.isArray(obj["entries"]))
        throw new Error("control.json must have an \"entries\" array");
    return {
        version: String(obj["version"] ?? "1.0"),
        entries: (obj["entries"] as unknown[]).map(parseEntry),
    };
}

function parseEntry(raw: unknown): ControlEntry {
    if (typeof raw !== "object" || raw === null)
        throw new Error("Each control.json entry must be an object");
    const e = raw as Record<string, unknown>;
    const id = String(e["id"] ?? "");
    const view = String(e["view"] ?? "table");

    if (view === "table") {
        return { id, view: "table", file: String(e["file"] ?? "") };
    }

    if (view === "sequence") {
        return {
            id, view: "sequence",
            actors: parseActorSource(e["actors"]),
            messages: parseMessageSource(e["messages"]),
        };
    }

    if (view === "flow" || view === "spatial" || view === "relation") {
        const rawNodes = e["nodes"];
        const nodes: NodeSource | NodeSource[] = Array.isArray(rawNodes)
            ? rawNodes.map(parseNodeSource)
            : parseNodeSource(rawNodes);
        const decl: FlowDecl = { id, view: view as FlowDecl["view"], nodes };
        if (e["edges"]) decl.edges = parseEdgeSource(e["edges"]);
        if (e["nodeStyles"]) decl.nodeStyles = e["nodeStyles"] as Record<string, NodeStyle>;
        if (e["edgeStyles"]) decl.edgeStyles = e["edgeStyles"] as Record<string, EdgeStyle>;
        return decl;
    }

    throw new Error(`Unknown view type: "${view}"`);
}

function parseNodeSource(raw: unknown): NodeSource {
    if (typeof raw !== "object" || raw === null)
        throw new Error("nodes entry must be an object");
    const s = raw as Record<string, unknown>;
    const mapping = s["mapping"] as Record<string, string>;
    if (!mapping?.["id"]) throw new Error("nodes mapping must have an \"id\" field");
    return { file: String(s["file"] ?? ""), mapping: mapping as unknown as NodeMapping };
}

function parseEdgeSource(raw: unknown): EdgeSource {
    if (typeof raw !== "object" || raw === null)
        throw new Error("edges entry must be an object");
    const s = raw as Record<string, unknown>;
    const mapping = s["mapping"] as Record<string, string>;
    if (!mapping?.["from"] || !mapping?.["to"])
        throw new Error("edges mapping must have \"from\" and \"to\" fields");
    return { file: String(s["file"] ?? ""), mapping: mapping as unknown as EdgeMapping };
}

function parseActorSource(raw: unknown): ActorSource {
    if (typeof raw !== "object" || raw === null)
        throw new Error("actors entry must be an object");
    const s = raw as Record<string, unknown>;
    const mapping = s["mapping"] as Record<string, string>;
    if (!mapping?.["id"]) throw new Error("actors mapping must have an \"id\" field");
    return { file: String(s["file"] ?? ""), mapping: mapping as unknown as ActorMapping };
}

function parseMessageSource(raw: unknown): MessageSource {
    if (typeof raw !== "object" || raw === null)
        throw new Error("messages entry must be an object");
    const s = raw as Record<string, unknown>;
    const mapping = s["mapping"] as Record<string, string>;
    if (!mapping?.["from"] || !mapping?.["to"])
        throw new Error("messages mapping must have \"from\" and \"to\" fields");
    return { file: String(s["file"] ?? ""), mapping: mapping as unknown as MessageMapping };
}

// ── Row resolver ──────────────────────────────────────────────────────────────

/**
 * Resolve raw CSV rows into ResolvedNode[] using a NodeMapping.
 * headers: column names from the CSV header row.
 * rows: data rows (string arrays).
 */
export function resolveNodes(
    headers: string[],
    rows: string[][],
    mapping: NodeMapping,
): ResolvedNode[] {
    const idx = (name: string | undefined) =>
        name !== undefined ? headers.indexOf(name) : -1;

    const idIdx     = idx(mapping.id);
    const labelIdx  = idx(mapping.label);
    const typeIdx   = idx(mapping.type);
    const xIdx      = idx(mapping.x);
    const yIdx      = idx(mapping.y);
    const wIdx      = idx(mapping.width);
    const hIdx      = idx(mapping.height);
    const parentIdx = idx(mapping.parent);

    const mappedCols = new Set([
        mapping.id, mapping.label, mapping.type,
        mapping.x, mapping.y, mapping.width, mapping.height, mapping.parent,
    ].filter(Boolean));

    return rows.map(row => {
        const get = (i: number) => (i >= 0 ? (row[i] ?? "") : "");
        const id = get(idIdx);
        const extra: Record<string, string> = {};
        headers.forEach((h, i) => { if (!mappedCols.has(h)) extra[h] = row[i] ?? ""; });
        const node: ResolvedNode = {
            id,
            label: labelIdx >= 0 ? get(labelIdx) : id,
            type:  typeIdx  >= 0 ? get(typeIdx)  : "",
            extra,
        };
        if (xIdx >= 0 && get(xIdx)) node.x = parseFloat(get(xIdx));
        if (yIdx >= 0 && get(yIdx)) node.y = parseFloat(get(yIdx));
        if (wIdx >= 0 && get(wIdx)) node.width  = parseFloat(get(wIdx));
        if (hIdx >= 0 && get(hIdx)) node.height = parseFloat(get(hIdx));
        if (parentIdx >= 0 && get(parentIdx)) node.parent = get(parentIdx);
        return node;
    });
}

export function resolveEdges(
    headers: string[],
    rows: string[][],
    mapping: EdgeMapping,
): ResolvedEdge[] {
    const idx = (name: string | undefined) =>
        name !== undefined ? headers.indexOf(name) : -1;
    const fromIdx  = idx(mapping.from);
    const toIdx    = idx(mapping.to);
    const typeIdx  = idx(mapping.type);
    const labelIdx = idx(mapping.label);
    const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "") : "");
    return rows.map(row => ({
        from:  get(row, fromIdx),
        to:    get(row, toIdx),
        type:  get(row, typeIdx),
        label: get(row, labelIdx),
    }));
}

export function resolveActors(
    headers: string[],
    rows: string[][],
    mapping: ActorMapping,
): ResolvedActor[] {
    const idIdx    = headers.indexOf(mapping.id);
    const labelIdx = mapping.label ? headers.indexOf(mapping.label) : -1;
    return rows.map(row => {
        const id = row[idIdx] ?? "";
        return { id, label: labelIdx >= 0 ? (row[labelIdx] ?? id) : id };
    });
}

export function resolveMessages(
    headers: string[],
    rows: string[][],
    mapping: MessageMapping,
): ResolvedMessage[] {
    const idx = (name: string | undefined) =>
        name !== undefined ? headers.indexOf(name) : -1;
    const fromIdx  = idx(mapping.from);
    const toIdx    = idx(mapping.to);
    const labelIdx = idx(mapping.label);
    const timeIdx  = idx(mapping.time);
    const typeIdx  = idx(mapping.type);
    const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "") : "");
    return rows.map((row, i) => ({
        from:  get(row, fromIdx),
        to:    get(row, toIdx),
        label: get(row, labelIdx),
        time:  timeIdx >= 0 && get(row, timeIdx) ? parseFloat(get(row, timeIdx)) : i,
        type:  get(row, typeIdx),
    }));
}
