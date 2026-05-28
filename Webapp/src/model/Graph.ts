import { TypedValue } from "./TypedValue.ts";
import { GraphNode } from "./GraphNode.ts";
import { GraphEdge } from "./GraphEdge.ts";
import type { NodeStyle, EdgeStyle } from "../data/control.ts";

export type GraphViewType = "flow" | "spatial" | "relation" | "sequence" | "network";

// ── JSON serialisation shapes ─────────────────────────────────────────────────

interface RawTypedValue { value: string; typeId: string }
type RawPropValue = string | RawTypedValue;

interface RawNode {
    id: string;
    [key: string]: RawPropValue;
}

interface RawEdge {
    id?: string;
    from: string;
    to: string;
    [key: string]: RawPropValue | undefined;
}

interface RawGraphFile {
    version?: string;
    name?: string;
    view?: string;
    nodes?: RawNode[];
    edges?: RawEdge[];
    nodeStyles?: Record<string, NodeStyle>;
    edgeStyles?: Record<string, EdgeStyle>;
    layout?: Record<string, { x: number; y: number }>;
}

// ── Graph ─────────────────────────────────────────────────────────────────────

export class Graph {
    readonly name: string;
    readonly viewType: GraphViewType;
    nodes: GraphNode[];
    edges: GraphEdge[];
    nodeStyles: Record<string, NodeStyle>;
    edgeStyles: Record<string, EdgeStyle>;
    layout: Record<string, { x: number; y: number }>;
    /** Original filename this graph was loaded from (e.g. "glycolysis.graph.json"). */
    sourceFile: string | null = null;
    /** Monotonically increasing counter — never resets, never reuses values. */
    private edgeSeq: number;

    constructor(
        name: string,
        viewType: GraphViewType,
        nodes: GraphNode[] = [],
        edges: GraphEdge[] = [],
        nodeStyles: Record<string, NodeStyle> = {},
        edgeStyles: Record<string, EdgeStyle> = {},
        layout: Record<string, { x: number; y: number }> = {},
        edgeSeq = 0,
    ) {
        this.name = name;
        this.viewType = viewType;
        this.nodes = nodes;
        this.edges = edges;
        this.nodeStyles = nodeStyles;
        this.edgeStyles = edgeStyles;
        this.layout = layout;
        this.edgeSeq = edgeSeq;
    }

    private nextEdgeId(): string {
        return `e${this.edgeSeq++}`;
    }

    // ── Factory ───────────────────────────────────────────────────────────────

    static fromGraphJSON(name: string, json: unknown): Graph {
        if (typeof json !== "object" || json === null)
            throw new Error(".graph.json must be a JSON object");
        const raw = json as RawGraphFile;

        const viewType = (raw.view ?? "flow") as GraphViewType;
        const nodes = (raw.nodes ?? []).map((rn, i) => {
            if (typeof rn.id !== "string" || !rn.id)
                throw new Error(`.graph.json node[${i}] must have a string "id"`);
            const props = new Map<string, TypedValue>();
            for (const [k, v] of Object.entries(rn)) {
                if (k === "id") continue;
                props.set(k, parseRawProp(v));
            }
            return new GraphNode(rn.id, props);
        });

        let edgeCounter = 0;
        const edges = (raw.edges ?? []).map(re => {
            if (typeof re.from !== "string" || typeof re.to !== "string")
                throw new Error(".graph.json edge must have string \"from\" and \"to\"");
            const id = typeof re.id === "string" ? re.id : `e${edgeCounter++}`;
            const props = new Map<string, TypedValue>();
            for (const [k, v] of Object.entries(re)) {
                if (k === "id" || k === "from" || k === "to" || v === undefined) continue;
                props.set(k, parseRawProp(v as RawPropValue));
            }
            return new GraphEdge(id, re.from, re.to, props);
        });

        // Set edgeSeq to one past the highest numeric id so addEdge never collides
        const edgeSeq = edges.reduce((max, e) => {
            const n = parseInt(e.id.replace(/^e/, ""), 10);
            return isNaN(n) ? max : Math.max(max, n + 1);
        }, 0);

        return new Graph(
            raw.name ?? name,
            viewType,
            nodes,
            edges,
            raw.nodeStyles ?? {},
            raw.edgeStyles ?? {},
            raw.layout ?? {},
            edgeSeq,
        );
    }

    // ── Serialisation ─────────────────────────────────────────────────────────

    toGraphJSON(): string {
        const rawNodes: RawNode[] = this.nodes.map(n => {
            const obj: RawNode = { id: n.id };
            for (const [k, tv] of n.properties) {
                obj[k] = tv.typeId === "text" ? tv.value : { value: tv.value, typeId: tv.typeId };
            }
            return obj;
        });

        const rawEdges: RawEdge[] = this.edges.map(e => {
            const obj: RawEdge = { id: e.id, from: e.from, to: e.to };
            for (const [k, tv] of e.properties) {
                obj[k] = tv.typeId === "text" ? tv.value : { value: tv.value, typeId: tv.typeId };
            }
            return obj;
        });

        const out: RawGraphFile = {
            version: "1.0",
            name: this.name,
            view: this.viewType,
            nodes: rawNodes,
            edges: rawEdges,
        };
        if (Object.keys(this.nodeStyles).length > 0) out.nodeStyles = this.nodeStyles;
        if (Object.keys(this.edgeStyles).length > 0) out.edgeStyles = this.edgeStyles;
        if (Object.keys(this.layout).length > 0) out.layout = this.layout;

        return JSON.stringify(out, null, 2);
    }

    // ── Node mutations ────────────────────────────────────────────────────────

    addNode(id: string, props: Record<string, string> = {}): GraphNode {
        const properties = new Map<string, TypedValue>(
            Object.entries(props).map(([k, v]) => [k, new TypedValue(v, "text")])
        );
        const node = new GraphNode(id, properties);
        this.nodes.push(node);
        return node;
    }

    removeNode(id: string): GraphNode | undefined {
        const idx = this.nodes.findIndex(n => n.id === id);
        if (idx < 0) return undefined;
        const [node] = this.nodes.splice(idx, 1);
        // Remove all edges connected to this node
        this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
        return node;
    }

    getNode(id: string): GraphNode | undefined {
        return this.nodes.find(n => n.id === id);
    }

    // ── Edge mutations ────────────────────────────────────────────────────────

    addEdge(from: string, to: string, props: Record<string, string> = {}): GraphEdge {
        const id = this.nextEdgeId();
        const properties = new Map<string, TypedValue>(
            Object.entries(props).map(([k, v]) => [k, new TypedValue(v, "text")])
        );
        const edge = new GraphEdge(id, from, to, properties);
        this.edges.push(edge);
        return edge;
    }

    removeEdge(id: string): GraphEdge | undefined {
        const idx = this.edges.findIndex(e => e.id === id);
        if (idx < 0) return undefined;
        const [edge] = this.edges.splice(idx, 1);
        return edge;
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    getEdgesFrom(nodeId: string): GraphEdge[] {
        return this.edges.filter(e => e.from === nodeId);
    }

    getEdgesTo(nodeId: string): GraphEdge[] {
        return this.edges.filter(e => e.to === nodeId);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRawProp(v: RawPropValue): TypedValue {
    if (typeof v === "string") return new TypedValue(v, "text");
    return new TypedValue(v.value, v.typeId);
}
