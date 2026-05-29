import { Graph } from "../model/Graph.ts";
import { GraphNode } from "../model/GraphNode.ts";
import { GraphEdge } from "../model/GraphEdge.ts";
import { TypedValue } from "../model/TypedValue.ts";

/**
 * Serialize a Graph to a human-readable text format.
 *
 * Format:
 *   # name
 *   @view flow
 *
 *   node <id> "<label>" [key=value ...]
 *   edge <from> -> <to> "<label>" [key=value ...]
 */
export function serializeGraph(graph: Graph): string {
    const lines: string[] = [];
    lines.push(`# ${graph.name}`);
    lines.push(`@view ${graph.viewType}`);
    lines.push("");

    for (const node of graph.nodes) {
        let line = `node ${node.id}`;
        const label = node.properties.get("label")?.value;
        if (label) line += ` "${label}"`;
        for (const [k, tv] of node.properties) {
            if (k === "label") continue;
            line += ` ${k}=${tv.value}`;
        }
        lines.push(line);
    }

    if (graph.nodes.length > 0 && graph.edges.length > 0) lines.push("");

    for (const edge of graph.edges) {
        let line = `edge ${edge.from} -> ${edge.to}`;
        const label = edge.properties.get("label")?.value;
        if (label) line += ` "${label}"`;
        for (const [k, tv] of edge.properties) {
            if (k === "label") continue;
            line += ` ${k}=${tv.value}`;
        }
        lines.push(line);
    }

    return lines.join("\n");
}

/**
 * Parse graph source text back into a Graph, replacing its nodes and edges.
 * Returns the modified graph or throws on parse error.
 */
export function parseGraphSource(source: string, graph: Graph): void {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    let edgeSeq = 0;

    for (const rawLine of source.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || line.startsWith("@")) continue;

        if (line.startsWith("node ")) {
            const node = parseNodeLine(line);
            if (node) nodes.push(node);
        } else if (line.startsWith("edge ")) {
            const edge = parseEdgeLine(line, edgeSeq++);
            if (edge) edges.push(edge);
        }
    }

    graph.nodes = nodes;
    graph.edges = edges;
}

function parseNodeLine(line: string): GraphNode | null {
    // node <id> ["label"] [key=value ...]
    const rest = line.slice(5).trim();
    const idMatch = rest.match(/^(\S+)/);
    if (!idMatch) return null;
    const id = idMatch[1];
    let remaining = rest.slice(id.length).trim();

    const props = new Map<string, TypedValue>();

    // Optional quoted label
    if (remaining.startsWith('"')) {
        const endQuote = remaining.indexOf('"', 1);
        if (endQuote > 0) {
            props.set("label", new TypedValue(remaining.slice(1, endQuote), "text"));
            remaining = remaining.slice(endQuote + 1).trim();
        }
    }

    // key=value pairs
    for (const kv of remaining.split(/\s+/)) {
        if (!kv) continue;
        const eq = kv.indexOf("=");
        if (eq > 0) {
            props.set(kv.slice(0, eq), new TypedValue(kv.slice(eq + 1), "text"));
        }
    }

    return new GraphNode(id, props);
}

function parseEdgeLine(line: string, seq: number): GraphEdge | null {
    // edge <from> -> <to> ["label"] [key=value ...]
    const rest = line.slice(5).trim();
    const arrowIdx = rest.indexOf("->");
    if (arrowIdx < 0) return null;

    const from = rest.slice(0, arrowIdx).trim();
    let remaining = rest.slice(arrowIdx + 2).trim();

    // <to> is the next non-space token
    const toMatch = remaining.match(/^(\S+)/);
    if (!toMatch) return null;
    const to = toMatch[1];
    remaining = remaining.slice(to.length).trim();

    const props = new Map<string, TypedValue>();

    // Optional quoted label
    if (remaining.startsWith('"')) {
        const endQuote = remaining.indexOf('"', 1);
        if (endQuote > 0) {
            props.set("label", new TypedValue(remaining.slice(1, endQuote), "text"));
            remaining = remaining.slice(endQuote + 1).trim();
        }
    }

    // key=value pairs
    for (const kv of remaining.split(/\s+/)) {
        if (!kv) continue;
        const eq = kv.indexOf("=");
        if (eq > 0) {
            props.set(kv.slice(0, eq), new TypedValue(kv.slice(eq + 1), "text"));
        }
    }

    return new GraphEdge(`e${seq}`, from, to, props);
}
