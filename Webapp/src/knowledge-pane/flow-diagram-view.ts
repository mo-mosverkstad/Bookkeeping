/**
 * FlowDiagramView — renders flow/spatial/relation/sequence diagrams as SVG.
 *
 * Layout strategy:
 *   1. Tarjan SCC detects strongly-connected components (cycles).
 *   2. Cycle nodes are placed on a circle (polygon layout).
 *   3. Non-cycle nodes are placed in layered ranks above/below the circle.
 *   4. DAG edges use orthogonal routing; back-edges use curved arcs.
 */

import type { WorkspaceView, WorkspaceData, ViewState, ToolbarAction } from "./workspace-view.ts";
import type { NodeStyle, EdgeStyle } from "../data/control.ts";
import type { Graph } from "../model/Graph.ts";
import type { AppController } from "../controller/index.ts";
import { serializeGraph, parseGraphSource } from "../data/graph-source.ts";
import type { SourceEditorView } from "../source-editor/source-editor-view.ts";

// ── Thin adapters: Graph → the shapes renderGraph/renderSequence expect ───────

interface RNode { id: string; label: string; type: string; x?: number; y?: number; extra: Record<string, string> }
interface REdge { id: string; from: string; to: string; type: string; label: string }
interface RActor { id: string; label: string }
interface RMessage { from: string; to: string; label: string; time: number; type: string }

function graphToNodes(g: Graph): RNode[] {
    return g.nodes.map(n => ({
        id: n.id,
        label: n.label,
        type: n.type,
        x: n.properties.has("x") ? parseFloat(n.properties.get("x")!.value) : undefined,
        y: n.properties.has("y") ? parseFloat(n.properties.get("y")!.value) : undefined,
        extra: {},
    }));
}

function graphToEdges(g: Graph): REdge[] {
    return g.edges.map(e => ({ id: e.id, from: e.from, to: e.to, type: e.type, label: e.label }));
}

function graphToActors(g: Graph): RActor[] {
    return g.nodes.map(n => ({ id: n.id, label: n.label }));
}

function graphToMessages(g: Graph): RMessage[] {
    return g.edges.map((e, i) => ({
        from: e.from,
        to: e.to,
        label: e.label,
        time: e.properties.has("time") ? parseFloat(e.properties.get("time")!.value) : i,
        type: e.type,
    }));
}

// ── State ─────────────────────────────────────────────────────────────────────

interface DiagramState {
    panX: number;
    panY: number;
    zoom: number;
    selectedNodeIds: string[];
}

const DEFAULT_STATE: DiagramState = { panX: 0, panY: 0, zoom: 1, selectedNodeIds: [] };

// ── SVG helpers ───────────────────────────────────────────────────────────────

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
    const el = document.createElementNS(SVG_NS, tag) as SVGElement;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
}

// ── Node geometry ─────────────────────────────────────────────────────────────

const CHAR_W  = 7;
const PAD_X   = 14;
const MIN_W   = 64;
const NODE_H  = 32;

function nodeW(label: string): number {
    return Math.max(MIN_W, label.length * CHAR_W + PAD_X * 2);
}

interface LayoutNode {
    id: string;
    label: string;
    type: string;
    x: number;   // centre x
    y: number;   // centre y
    w: number;
    h: number;
    /** true if this node sits on the main cycle ring */
    onCycle: boolean;
}

// ── Tarjan SCC ────────────────────────────────────────────────────────────────

/**
 * Returns all strongly-connected components with size > 1.
 * Each SCC is an array of node ids forming a cycle.
 */
function findCycles(
    nodeIds: string[],
    edges: REdge[],
): string[][] {
    const out = new Map<string, string[]>();
    for (const id of nodeIds) out.set(id, []);
    for (const e of edges) {
        if (out.has(e.from) && out.has(e.to)) out.get(e.from)!.push(e.to);
    }

    const index   = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];
    let counter = 0;

    function strongconnect(v: string): void {
        index.set(v, counter);
        lowlink.set(v, counter);
        counter++;
        stack.push(v);
        onStack.add(v);

        for (const w of (out.get(v) ?? [])) {
            if (!index.has(w)) {
                strongconnect(w);
                lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
            } else if (onStack.has(w)) {
                lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
            }
        }

        if (lowlink.get(v) === index.get(v)) {
            const scc: string[] = [];
            let w: string;
            do {
                w = stack.pop()!;
                onStack.delete(w);
                scc.push(w);
            } while (w !== v);
            if (scc.length > 1) sccs.push(scc);
        }
    }

    for (const id of nodeIds) {
        if (!index.has(id)) strongconnect(id);
    }

    return sccs;
}

// ── Layout computation ────────────────────────────────────────────────────────

const RING_PAD    = 20;   // padding around the cycle ring
const RANK_GAP    = 56;   // vertical gap between layered ranks
const COL_GAP     = 16;   // horizontal gap between nodes in same rank

/**
 * Compute (x, y) for every node.
 *
 * Algorithm:
 *   1. Find the largest SCC — that is the "main cycle".
 *   2. Place cycle nodes evenly on a circle, ordered by their appearance
 *      in the edge sequence (walk the cycle edges to get traversal order).
 *   3. Remaining nodes are laid out in ranks above the circle (ancestors)
 *      or below (descendants) using BFS on the DAG formed by removing
 *      back-edges.
 */
function computeLayout(
    nodes: RNode[],
    edges: REdge[],
    canvasW: number,
    canvasH: number,
): Map<string, LayoutNode> {
    const nodeMap = new Map<string, RNode>(nodes.map(n => [n.id, n]));
    const nodeIds = nodes.map(n => n.id);

    // ── 1. Find main cycle ────────────────────────────────────────────────────
    const sccs = findCycles(nodeIds, edges);
    // Pick the largest SCC as the main cycle
    const cycleSet = new Set<string>(
        sccs.length > 0
            ? sccs.reduce((a, b) => a.length >= b.length ? a : b)
            : []
    );

    // ── 2. Order cycle nodes by traversal ────────────────────────────────────
    // Walk edges that stay within the cycle to get a consistent ring order.
    const cycleEdges = edges.filter(e => cycleSet.has(e.from) && cycleSet.has(e.to));
    const cycleNodes = orderCycleNodes([...cycleSet], cycleEdges);

    // ── 3. Place cycle nodes on a circle ─────────────────────────────────────
    const n = cycleNodes.length;
    // Radius: fit the total perimeter of all node bounding boxes around the ring.
    // Each node occupies an arc of (nodeW + COL_GAP) px; the ring circumference
    // must be at least that total so no two adjacent nodes overlap.
    const totalPerimeter = cycleNodes.reduce(
        (s, id) => s + nodeW(nodeMap.get(id)?.label ?? id) + COL_GAP, 0
    );
    const minRadius = n > 0
        ? Math.max(80, totalPerimeter / (2 * Math.PI))
        : 0;
    const radius = minRadius + RING_PAD;

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    const layout = new Map<string, LayoutNode>();

    cycleNodes.forEach((id, i) => {
        // Start at top (−π/2) and go clockwise
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const label = nodeMap.get(id)?.label ?? id;
        layout.set(id, {
            id, label,
            type: nodeMap.get(id)?.type ?? "",
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
            w: nodeW(label),
            h: NODE_H,
            onCycle: true,
        });
    });

    // ── 4. Lay out non-cycle nodes in ranks ───────────────────────────────────
    // Build a DAG by removing back-edges (edges whose target is in the cycle
    // and whose source is also in the cycle — i.e. pure cycle edges).
    // Non-cycle nodes connect to the cycle via "entry" edges (into cycle) or
    // "exit" edges (out of cycle).
    const dagEdges = edges.filter(e => !(cycleSet.has(e.from) && cycleSet.has(e.to)));

    // BFS rank assignment for non-cycle nodes
    const rank = new Map<string, number>();
    const outDag = new Map<string, string[]>();
    const inDegDag = new Map<string, number>();
    for (const id of nodeIds) { outDag.set(id, []); inDegDag.set(id, 0); }
    for (const e of dagEdges) {
        if (!nodeMap.has(e.from) || !nodeMap.has(e.to)) continue;
        outDag.get(e.from)!.push(e.to);
        inDegDag.set(e.to, (inDegDag.get(e.to) ?? 0) + 1);
    }

    // Seed: cycle nodes are rank 0 anchors; non-cycle sources are rank -N
    // We do two BFS passes:
    //   Pass A (forward from sources): assigns positive ranks to descendants
    //   Pass B (backward from cycle): assigns negative ranks to ancestors

    // Forward BFS from non-cycle sources (nodes with no incoming DAG edges
    // and not on the cycle)
    const sources = nodeIds.filter(
        id => !cycleSet.has(id) && (inDegDag.get(id) ?? 0) === 0
    );
    // If no non-cycle sources exist, all nodes are on the cycle — done.
    if (sources.length > 0) {
        const queue: string[] = [...sources];
        const enqueued = new Set<string>(queue);
        for (const id of sources) rank.set(id, 0);

        let head = 0;
        while (head < queue.length) {
            const id = queue[head++];
            const r = rank.get(id) ?? 0;
            for (const next of (outDag.get(id) ?? [])) {
                if (cycleSet.has(next)) continue; // stop at cycle boundary
                const cur = rank.get(next) ?? -Infinity;
                if (r + 1 > cur) {
                    rank.set(next, r + 1);
                    if (!enqueued.has(next)) { enqueued.add(next); queue.push(next); }
                }
            }
        }
    }

    // Place non-cycle nodes in ranks above the circle
    const byRank = new Map<number, string[]>();
    for (const id of nodeIds) {
        if (cycleSet.has(id)) continue;
        const r = rank.get(id) ?? 0;
        if (!byRank.has(r)) byRank.set(r, []);
        byRank.get(r)!.push(id);
    }

    // Rank 0 sits just above the topmost cycle node
    const topCycleY = cycleNodes.length > 0
        ? Math.min(...cycleNodes.map(id => layout.get(id)!.y)) - NODE_H / 2
        : cy - radius;

    const rankNums = [...byRank.keys()].sort((a, b) => a - b);
    rankNums.forEach((r, ri) => {
        const ids = byRank.get(r)!;
        const sizes = ids.map(id => nodeW(nodeMap.get(id)?.label ?? id));
        const totalW = sizes.reduce((s, w) => s + w, 0) + COL_GAP * (ids.length - 1);
        let x = Math.max(20, (canvasW - totalW) / 2);
        const y = topCycleY - RANK_GAP * (rankNums.length - ri);

        ids.forEach((id, col) => {
            const w = sizes[col];
            const label = nodeMap.get(id)?.label ?? id;
            layout.set(id, {
                id, label,
                type: nodeMap.get(id)?.type ?? "",
                x: x + w / 2,
                y,
                w,
                h: NODE_H,
                onCycle: false,
            });
            x += w + COL_GAP;
        });
    });

    // Any node still not placed (isolated or unreachable) — place below circle
    let fallbackY = cy + radius + RANK_GAP;
    for (const id of nodeIds) {
        if (!layout.has(id)) {
            const label = nodeMap.get(id)?.label ?? id;
            layout.set(id, {
                id, label,
                type: nodeMap.get(id)?.type ?? "",
                x: canvasW / 2,
                y: fallbackY,
                w: nodeW(label),
                h: NODE_H,
                onCycle: false,
            });
            fallbackY += NODE_H + COL_GAP;
        }
    }

    return layout;
}

/**
 * Order cycle nodes by walking the cycle edges starting from the node
 * with the lowest in-degree within the cycle (most likely the entry point).
 */
function orderCycleNodes(ids: string[], cycleEdges: REdge[]): string[] {
    if (ids.length === 0) return [];

    const outMap = new Map<string, string>();
    for (const e of cycleEdges) outMap.set(e.from, e.to);

    // Start from the node that has an incoming edge from outside the cycle,
    // or just the first node if none found.
    const idSet = new Set(ids);
    let start = ids[0];
    // Prefer a node that appears as a "to" in cycleEdges but whose "from"
    // is not in the cycle — i.e. the entry point. Fall back to ids[0].
    for (const id of ids) {
        if (!outMap.has(id)) { start = id; break; }
    }

    const ordered: string[] = [];
    const visited = new Set<string>();
    let cur = start;
    while (idSet.has(cur) && !visited.has(cur)) {
        ordered.push(cur);
        visited.add(cur);
        cur = outMap.get(cur) ?? "";
    }
    // Add any remaining cycle nodes not reached by the walk
    for (const id of ids) {
        if (!visited.has(id)) ordered.push(id);
    }
    return ordered;
}

// ── Edge routing ──────────────────────────────────────────────────────────────

/**
 * Orthogonal path between two layout nodes.
 * Routes: bottom of source → vertical → horizontal jog → vertical → top of target.
 * For same-rank nodes: horizontal with a vertical detour.
 */
function orthogonalPath(from: LayoutNode, to: LayoutNode): string {
    const ARROW = 8;
    const x1 = from.x;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y - to.h / 2 - ARROW;

    if (Math.abs(y1 - (to.y - to.h / 2)) < 4 || from.y > to.y - to.h) {
        // Same rank or source is below target — route with horizontal detour
        const vy = Math.max(y1, to.y + to.h / 2) + RANK_GAP * 0.35;
        return `M ${x1} ${y1} L ${x1} ${vy} L ${x2} ${vy} L ${x2} ${y2}`;
    }

    const midY = (y1 + y2) / 2;
    if (Math.abs(x1 - x2) < 3) return `M ${x1} ${y1} L ${x2} ${y2}`;
    return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
}

/**
 * Curved arc path for an edge between two cycle nodes.
 * Uses a quadratic Bézier that bows outward from the circle centre,
 * so the arc follows the ring perimeter rather than cutting through it.
 */
function cyclePath(
    from: LayoutNode,
    to: LayoutNode,
    cx: number,
    cy: number,
): string {
    const ARROW = 8;

    // Direction from centre to each node
    const ax = from.x - cx, ay = from.y - cy;
    const bx = to.x   - cx, by = to.y   - cy;

    // Exit point: edge of source node in the outward direction
    const aLen = Math.sqrt(ax * ax + ay * ay) || 1;
    const x1 = from.x + (ax / aLen) * (from.w / 2);
    const y1 = from.y + (ay / aLen) * (from.h / 2);

    // Entry point: edge of target node in the inward direction
    const bLen = Math.sqrt(bx * bx + by * by) || 1;
    const x2 = to.x + (bx / bLen) * (to.w / 2 + ARROW);
    const y2 = to.y + (by / bLen) * (to.h / 2 + ARROW);

    // Control point: midpoint between the two nodes, pushed outward from centre
    const mx = (from.x + to.x) / 2 - cx;
    const my = (from.y + to.y) / 2 - cy;
    const mLen = Math.sqrt(mx * mx + my * my) || 1;
    const pushFactor = 1.35;
    const qx = cx + (mx / mLen) * (mLen * pushFactor + 20);
    const qy = cy + (my / mLen) * (mLen * pushFactor + 20);

    return `M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`;
}

/**
 * Classify each edge as either a "cycle edge" (both endpoints on the cycle)
 * or a "dag edge" (at least one endpoint off the cycle).
 */
function classifyEdges(
    edges: REdge[],
    cycleSet: Set<string>,
): { cycleEdges: REdge[]; dagEdges: REdge[] } {
    const cycleEdges: REdge[] = [];
    const dagEdges: REdge[] = [];
    for (const e of edges) {
        if (cycleSet.has(e.from) && cycleSet.has(e.to)) cycleEdges.push(e);
        else dagEdges.push(e);
    }
    return { cycleEdges, dagEdges };
}

// ── renderGraph ───────────────────────────────────────────────────────────────

function renderGraph(
    nodes: RNode[],
    edges: REdge[],
    nodeStyles: Record<string, NodeStyle>,
    edgeStyles: Record<string, EdgeStyle>,
    W: number,
    H: number,
    state: DiagramState,
    selectedEdgeId: string | null,
    edgeDrawMode: boolean,
    onSelect: (id: string, shapeEl: SVGElement, lblEl: SVGElement) => void,
    onDblClick: (id: string, shapeEl: SVGElement, lblEl: SVGElement) => void,
    onEdgeSelect: (edgeId: string) => void,
): SVGElement {
    const layout = computeLayout(nodes, edges, W, H);

    // Determine cycle membership for edge routing
    const sccs = findCycles(nodes.map(n => n.id), edges);
    const mainCycle = sccs.length > 0
        ? sccs.reduce((a, b) => a.length >= b.length ? a : b)
        : [];
    const cycleSet = new Set<string>(mainCycle);
    const { cycleEdges, dagEdges } = classifyEdges(edges, cycleSet);

    // Circle centre (used for arc control points)
    const cycleLayouts = mainCycle.map(id => layout.get(id)).filter(Boolean) as LayoutNode[];
    const circleCx = cycleLayouts.length > 0
        ? cycleLayouts.reduce((s, n) => s + n.x, 0) / cycleLayouts.length
        : W / 2;
    const circleCy = cycleLayouts.length > 0
        ? cycleLayouts.reduce((s, n) => s + n.y, 0) / cycleLayouts.length
        : H / 2;

    // Canvas bounds
    const allNodes = [...layout.values()];
    const maxY = allNodes.length > 0
        ? Math.max(...allNodes.map(n => n.y + n.h / 2 + 40))
        : H;
    const minY = allNodes.length > 0
        ? Math.min(...allNodes.map(n => n.y - n.h / 2 - 40))
        : 0;
    const svgH = Math.max(H, maxY - Math.min(0, minY) + 60);
    const offsetY = minY < 0 ? -minY + 40 : 0;

    const svg = svgEl("svg", { width: W, height: svgH, viewBox: `0 0 ${W} ${svgH}` });
    svg.style.cssText = "display:block;width:100%;height:100%;background:#f8fafc;";

    // ── Defs: arrowhead markers ───────────────────────────────────────────────
    const defs = svgEl("defs");
    const allTypes = new Set(["", ...edges.map(e => e.type)]);
    for (const type of allTypes) {
        const style = edgeStyles[type] ?? edgeStyles[""] ?? { arrow: "filled", dash: false };
        const color = style.color ?? "#475569";
        const mid = `arrow-${type || "default"}`;
        const marker = svgEl("marker", {
            id: mid, markerWidth: "8", markerHeight: "6",
            refX: "8", refY: "3", orient: "auto",
        });
        marker.appendChild(
            style.arrow === "flat"
                ? svgEl("line", { x1: "0", y1: "0", x2: "0", y2: "6", stroke: color, "stroke-width": "2" })
                : svgEl("path", { d: "M0,0 L8,3 L0,6 Z", fill: color })
        );
        defs.appendChild(marker);
    }
    svg.appendChild(defs);

    const edgeGroup = svgEl("g", { transform: `translate(0,${offsetY})` });
    const nodeGroup = svgEl("g", { transform: `translate(0,${offsetY})` });

    // ── Draw cycle edges (arcs) ───────────────────────────────────────────────
    for (const edge of cycleEdges) {
        const from = layout.get(edge.from);
        const to   = layout.get(edge.to);
        if (!from || !to) continue;

        const style = edgeStyles[edge.type] ?? edgeStyles[""] ?? { arrow: "filled", dash: false };
        const isSelEdge = selectedEdgeId === edge.id;
        const color = isSelEdge ? "#3b82f6" : (style.color ?? "#94a3b8");
        const mid   = `arrow-${edge.type || "default"}`;

        const d = cyclePath(from, to, circleCx, circleCy);
        const eg = svgEl("g");
        eg.style.cursor = "pointer";
        // Invisible wide hit area
        eg.appendChild(svgEl("path", { d, fill: "none", stroke: "transparent", "stroke-width": "10" }));
        eg.appendChild(svgEl("path", {
            d, fill: "none", stroke: color,
            "stroke-width": isSelEdge ? "2.5" : "1.5",
            "stroke-dasharray": style.dash ? "5 3" : "none",
            "marker-end": `url(#${mid})`,
        }));
        eg.addEventListener("click", (e) => { e.stopPropagation(); onEdgeSelect(edge.id); });
        edgeGroup.appendChild(eg);

        if (edge.label) {
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            const outX = circleCx + (mx - circleCx) * 1.25;
            const outY = circleCy + (my - circleCy) * 1.25;
            edgeGroup.appendChild(svgEl("rect", {
                x: outX - edge.label.length * 3.5 - 3, y: outY - 9,
                width: edge.label.length * 7 + 6, height: 13,
                fill: "#f8fafc", rx: "2",
            }));
            const lbl = svgEl("text", {
                x: outX, y: outY,
                "text-anchor": "middle", "font-size": "9",
                "font-family": "system-ui, sans-serif", fill: "#64748b",
            });
            lbl.textContent = edge.label;
            edgeGroup.appendChild(lbl);
        }
    }

    // ── Draw DAG edges (orthogonal) ───────────────────────────────────────────
    for (const edge of dagEdges) {
        const from = layout.get(edge.from);
        const to   = layout.get(edge.to);
        if (!from || !to) continue;

        const style = edgeStyles[edge.type] ?? edgeStyles[""] ?? { arrow: "filled", dash: false };
        const isSelEdge = selectedEdgeId === edge.id;
        const color = isSelEdge ? "#3b82f6" : (style.color ?? "#94a3b8");
        const mid   = `arrow-${edge.type || "default"}`;
        const d = orthogonalPath(from, to);

        const eg = svgEl("g");
        eg.style.cursor = "pointer";
        eg.appendChild(svgEl("path", { d, fill: "none", stroke: "transparent", "stroke-width": "10" }));
        eg.appendChild(svgEl("path", {
            d, fill: "none", stroke: color,
            "stroke-width": isSelEdge ? "2.5" : "1.5",
            "stroke-dasharray": style.dash ? "5 3" : "none",
            "marker-end": `url(#${mid})`,
        }));
        eg.addEventListener("click", (e) => { e.stopPropagation(); onEdgeSelect(edge.id); });
        edgeGroup.appendChild(eg);

        if (edge.label) {
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            edgeGroup.appendChild(svgEl("rect", {
                x: mx - edge.label.length * 3.5 - 3, y: my - 9,
                width: edge.label.length * 7 + 6, height: 13,
                fill: "#f8fafc", rx: "2",
            }));
            const lbl = svgEl("text", {
                x: mx, y: my,
                "text-anchor": "middle", "font-size": "9",
                "font-family": "system-ui, sans-serif", fill: "#64748b",
            });
            lbl.textContent = edge.label;
            edgeGroup.appendChild(lbl);
        }
    }

    // ── Draw nodes ────────────────────────────────────────────────────────────
    for (const node of layout.values()) {
        const style   = nodeStyles[node.type] ?? nodeStyles[""] ?? { shape: "rect", color: "#e2e8f0" };
        const shape   = style.shape ?? "rect";
        const fill    = style.color ?? "#e2e8f0";
        const sel     = state.selectedNodeIds.includes(node.id);
        const stroke  = sel ? "#3b82f6" : "#94a3b8";
        const strokeW = sel ? "2" : "1";
        const hw = node.w / 2, hh = node.h / 2;

        let shapeEl: SVGElement;
        if (shape === "ellipse") {
            shapeEl = svgEl("ellipse", { cx: node.x, cy: node.y, rx: hw, ry: hh, fill, stroke, "stroke-width": strokeW });
        } else if (shape === "diamond") {
            shapeEl = svgEl("polygon", {
                points: `${node.x},${node.y - hh} ${node.x + hw},${node.y} ${node.x},${node.y + hh} ${node.x - hw},${node.y}`,
                fill, stroke, "stroke-width": strokeW,
            });
        } else {
            shapeEl = svgEl("rect", { x: node.x - hw, y: node.y - hh, width: node.w, height: node.h, rx: "4", fill, stroke, "stroke-width": strokeW });
        }

        const maxChars = Math.floor(node.w / CHAR_W) - 1;
        const labelText = node.label.length > maxChars
            ? node.label.slice(0, maxChars - 1) + "…"
            : node.label;
        const lbl = svgEl("text", {
            x: node.x, y: node.y + 4,
            "text-anchor": "middle", "font-size": "11",
            "font-family": "system-ui, sans-serif", fill: "#1e293b",
        });
        lbl.textContent = labelText;

        const g = svgEl("g");
        g.setAttribute("data-node-id", node.id);
        g.style.cursor = edgeDrawMode ? "crosshair" : "pointer";
        shapeEl.classList.add("node-shape");
        lbl.classList.add("node-label");
        g.appendChild(shapeEl);
        g.appendChild(lbl);
        g.addEventListener("click", (e) => { e.stopPropagation(); onSelect(node.id, shapeEl, lbl); });
        g.addEventListener("dblclick", (e) => { e.stopPropagation(); onDblClick(node.id, shapeEl, lbl); });
        nodeGroup.appendChild(g);
    }

    // ── Pan / zoom ────────────────────────────────────────────────────────────
    const panGroup = svgEl("g");
    panGroup.appendChild(edgeGroup);
    panGroup.appendChild(nodeGroup);
    svg.appendChild(panGroup);

    let { panX, panY, zoom } = state;
    let dragging = false, lastX = 0, lastY = 0;

    const applyTransform = () =>
        panGroup.setAttribute("transform", `translate(${panX},${panY}) scale(${zoom})`);
    applyTransform();

    svg.addEventListener("mousedown", (e) => {
        // Prevent text selection during pan drag
        e.preventDefault();
        dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    svg.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        panX += e.clientX - lastX; panY += e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        state.panX = panX; state.panY = panY;
        applyTransform();
    });
    svg.addEventListener("mouseup",    () => { dragging = false; });
    svg.addEventListener("mouseleave", () => { dragging = false; });
    // Prevent browser context menu over the diagram
    svg.addEventListener("contextmenu", (e) => e.preventDefault());
    // Prevent text selection on double-click inside the SVG
    svg.addEventListener("dblclick", (e) => e.preventDefault());
    svg.addEventListener("wheel", (e) => {
        e.preventDefault();
        zoom = Math.max(0.2, Math.min(4, zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
        state.zoom = zoom;
        applyTransform();
    }, { passive: false });

    return svg;
}

// ── renderSequence ────────────────────────────────────────────────────────────

function renderSequence(
    actors: RActor[],
    messages: RMessage[],
    W: number,
    H: number,
): SVGElement {
    const ACTOR_W = 110, ACTOR_H = 32, TOP_PAD = 20, MSG_GAP = 44;
    const spacing = Math.max(ACTOR_W + 30, W / (actors.length + 1));
    const actorX: Record<string, number> = {};
    actors.forEach((a, i) => { actorX[a.id] = spacing * (i + 1); });

    const svgH = Math.max(H, TOP_PAD + ACTOR_H + messages.length * MSG_GAP + 60);
    const svg = svgEl("svg", { width: W, height: svgH, viewBox: `0 0 ${W} ${svgH}` });
    svg.style.cssText = "display:block;width:100%;height:100%;background:#f8fafc;";

    const defs = svgEl("defs");
    const marker = svgEl("marker", { id: "seq-arrow", markerWidth: "8", markerHeight: "6", refX: "8", refY: "3", orient: "auto" });
    marker.appendChild(svgEl("path", { d: "M0,0 L8,3 L0,6 Z", fill: "#475569" }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    const lifelineBottom = TOP_PAD + ACTOR_H + messages.length * MSG_GAP + 20;
    for (const a of actors) {
        const x = actorX[a.id];
        svg.appendChild(svgEl("rect", { x: x - ACTOR_W / 2, y: TOP_PAD, width: ACTOR_W, height: ACTOR_H, fill: "#e2e8f0", stroke: "#94a3b8", "stroke-width": "1", rx: "4" }));
        const lbl = svgEl("text", { x, y: TOP_PAD + ACTOR_H / 2 + 4, "text-anchor": "middle", "font-size": "11", "font-family": "system-ui, sans-serif", fill: "#1e293b" });
        lbl.textContent = a.label;
        svg.appendChild(lbl);
        svg.appendChild(svgEl("line", { x1: x, y1: TOP_PAD + ACTOR_H, x2: x, y2: lifelineBottom, stroke: "#cbd5e1", "stroke-width": "1", "stroke-dasharray": "4 3" }));
    }

    [...messages].sort((a, b) => a.time - b.time).forEach((msg, i) => {
        const y = TOP_PAD + ACTOR_H + (i + 1) * MSG_GAP;
        const x1 = actorX[msg.from], x2 = actorX[msg.to];
        if (x1 === undefined || x2 === undefined) return;
        svg.appendChild(svgEl("line", { x1, y1: y, x2, y2: y, stroke: "#475569", "stroke-width": "1.5", "marker-end": "url(#seq-arrow)" }));
        if (msg.label) {
            const lbl = svgEl("text", { x: (x1 + x2) / 2, y: y - 5, "text-anchor": "middle", "font-size": "10", "font-family": "system-ui, sans-serif", fill: "#475569" });
            lbl.textContent = msg.label;
            svg.appendChild(lbl);
        }
    });

    return svg;
}

// ── FlowDiagramView ───────────────────────────────────────────────────────────

export class FlowDiagramView implements WorkspaceView {
    private readonly viewType: string;
    private readonly controller: AppController | null;
    private sourceEditor: SourceEditorView | null = null;
    private _syncing = false;
    private container: HTMLElement | null = null;
    private svg: SVGElement | null = null;
    private state: DiagramState = { ...DEFAULT_STATE };
    private currentData: WorkspaceData | null = null;
    private kbGraphIdx = 0;
    private selectedEdgeId: string | null = null;
    /** Non-null = edge-draw mode. Empty string = waiting for first node. */
    private edgeFromNodeId: string | null = null;
    /** Node id to enter inline-edit on next render. */
    private pendingEditNodeId: string | null = null;
    /** Callback to refresh the dynamic toolbar after selection changes. */
    private toolbarRefresh: (() => void) | null = null;
    /** Timer used to distinguish single-click from double-click. */
    private clickTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(viewType: string, controller?: AppController) {
        this.viewType = viewType;
        this.controller = controller ?? null;
    }

    setSourceEditor(se: SourceEditorView): void { this.sourceEditor = se; }

    setToolbarRefreshCallback(cb: () => void): void {
        this.toolbarRefresh = cb;
    }

    mount(container: HTMLElement, data: WorkspaceData, savedState?: ViewState): void {
        this.container = container;
        this.currentData = data;
        if (savedState) this.state = savedState as DiagramState;
        if (data.graph && this.controller) {
            this.kbGraphIdx = this.controller.getKnowledgeBase().graphs.indexOf(data.graph);
        }
        this.render();
        // Ensure source editor shows graph source after all mount/unmount cleanup
        if (this.sourceEditor && data.graph) {
            const se = this.sourceEditor;
            const graph = data.graph;
            const self = this;
            requestAnimationFrame(() => {
                se.setText(serializeGraph(graph));
                se.setOnCellApply((value: string) => { self.applySourceEdit(value); });
            });
        }
    }

    unmount(): ViewState {
        if (this.svg && this.container?.contains(this.svg))
            this.container.removeChild(this.svg);
        this.svg = null;
        this.edgeFromNodeId = null;
        this.pendingEditNodeId = null;
        if (this.clickTimer) { clearTimeout(this.clickTimer); this.clickTimer = null; }
        this.sourceEditor?.setOnCellApply(null);
        this.sourceEditor?.clear();
        return { ...this.state };
    }

    update(data: WorkspaceData): void {
        this.currentData = data;
        if (this.container) this.render();
    }

    getToolbarActions(): ToolbarAction[] {
        const edgeMode = this.edgeFromNodeId !== null;
        const hasNode = this.state.selectedNodeIds.length > 0;
        const hasEdge = this.selectedEdgeId !== null;
        const hasSelection = hasNode || hasEdge;

        const deleteLabel = hasNode ? `Delete Node` : hasEdge ? `Delete Edge` : `Delete`;
        const deleteTitle = hasNode
            ? `Delete selected node and its edges`
            : hasEdge
            ? `Delete selected edge`
            : `Select a node or edge first`;

        return [
            { id: "add-node", label: "+ Node", title: "Add a new node" },
            { id: "add-edge",
              label: edgeMode ? "Cancel Edge" : "+ Edge",
              title: edgeMode
                ? `Cancel — click source node is "${this.edgeFromNodeId || "?"}"`
                : "Click source node then target node to connect" },
            { id: "delete", label: deleteLabel, title: deleteTitle, disabled: !hasSelection },
        ];
    }

    onToolbarAction(id: string): void {
        const graph = this.currentData?.graph;
        if (!graph) return;

        if (id === "add-node") {
            const base = "node";
            let n = graph.nodes.length + 1;
            let nodeId = `${base}-${n}`;
            while (graph.getNode(nodeId)) nodeId = `${base}-${++n}`;
            graph.addNode(nodeId, { label: nodeId });
            this.state.selectedNodeIds = [nodeId];
            this.selectedEdgeId = null;
            this.edgeFromNodeId = null;
            this.pendingEditNodeId = nodeId;
            this.render();
            this.toolbarRefresh?.();

        } else if (id === "add-edge") {
            if (this.edgeFromNodeId !== null) {
                this.edgeFromNodeId = null;
            } else {
                this.edgeFromNodeId = "";
                this.state.selectedNodeIds = [];
                this.selectedEdgeId = null;
            }
            this.render();
            this.toolbarRefresh?.();

        } else if (id === "delete") {
            if (this.state.selectedNodeIds.length > 0) {
                const nodeId = this.state.selectedNodeIds[0];
                graph.removeNode(nodeId);
                this.state.selectedNodeIds = [];
            } else if (this.selectedEdgeId) {
                graph.removeEdge(this.selectedEdgeId);
                this.selectedEdgeId = null;
            }
            this.render();
            this.toolbarRefresh?.();
        }
    }

    private onNodeClick(nodeId: string): void {
        if (this.edgeFromNodeId !== null) {
            if (this.edgeFromNodeId === "" || this.edgeFromNodeId === nodeId) {
                // First click in edge-draw mode: set source
                this.edgeFromNodeId = nodeId;
                this.state.selectedNodeIds = [nodeId];
            } else {
                // Second click: create edge
                this.currentData?.graph?.addEdge(this.edgeFromNodeId, nodeId);
                this.edgeFromNodeId = null;
                this.state.selectedNodeIds = [];
            }
        } else {
            // Normal selection toggle
            const idx = this.state.selectedNodeIds.indexOf(nodeId);
            if (idx >= 0) this.state.selectedNodeIds.splice(idx, 1);
            else this.state.selectedNodeIds = [nodeId];
            this.selectedEdgeId = null;
        }
        this.render();
        this.toolbarRefresh?.();
    }

    private onNodeDblClick(nodeId: string, shapeEl: SVGElement, lblEl: SVGElement): void {
        if (!this.controller) return;
        const graph = this.currentData?.graph;
        if (!graph) return;
        const node = graph.getNode(nodeId);
        if (!node) return;

        // Hide the SVG text label
        lblEl.style.display = "none";

        // Size the foreignObject to the shape bounding box
        let bbox: { x: number; y: number; width: number; height: number };
        try {
            bbox = (shapeEl as SVGGraphicsElement).getBBox();
        } catch {
            bbox = { x: 0, y: 0, width: 80, height: 24 };
        }

        const fo = svgEl("foreignObject", {
            x: bbox.x, y: bbox.y,
            width: Math.max(bbox.width, 80), height: Math.max(bbox.height, 24),
        }) as SVGForeignObjectElement;

        const input = document.createElement("input");
        input.type = "text";
        input.value = node.label;
        input.style.cssText = [
            "width:100%;height:100%;box-sizing:border-box;",
            "border:2px solid #3b82f6;border-radius:3px;",
            "font:11px system-ui,sans-serif;text-align:center;",
            "background:#fff;outline:none;padding:0 4px;",
        ].join("");

        fo.appendChild(input);
        // Append to the panGroup's parent so it sits above the node
        shapeEl.closest("g[transform]")?.appendChild(fo)
            ?? shapeEl.parentElement?.appendChild(fo);

        let committed = false;
        const commit = () => {
            if (committed) return;
            committed = true;
            const newLabel = input.value.trim() || node.label;
            fo.remove();
            lblEl.style.display = "";
            if (newLabel !== node.label) {
                this.controller!.editNodeLabel(this.kbGraphIdx, nodeId, newLabel);
                this.render();
            }
        };

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter")  { e.preventDefault(); commit(); }
            if (e.key === "Escape") { committed = true; fo.remove(); lblEl.style.display = ""; }
        });
        input.addEventListener("blur", commit);

        requestAnimationFrame(() => { input.focus(); input.select(); });
    }

    private render(): void {
        if (!this.container || !this.currentData?.graph) return;
        if (this.svg && this.container.contains(this.svg))
            this.container.removeChild(this.svg);

        const graph = this.currentData.graph;
        const W = this.container.clientWidth  || 800;
        const H = this.container.clientHeight || 600;

        if (this.viewType === "sequence") {
            this.svg = renderSequence(graphToActors(graph), graphToMessages(graph), W, H);
        } else {
            const edgeMode = this.edgeFromNodeId !== null;
            this.svg = renderGraph(
                graphToNodes(graph), graphToEdges(graph),
                graph.nodeStyles, graph.edgeStyles,
                W, H, this.state, this.selectedEdgeId, edgeMode,
                // Single-click: use timer to distinguish from dblclick
                (nodeId, _shapeEl, _lblEl) => {
                    if (this.clickTimer) { clearTimeout(this.clickTimer); this.clickTimer = null; }
                    this.clickTimer = setTimeout(() => {
                        this.clickTimer = null;
                        this.onNodeClick(nodeId);
                    }, 220);
                },
                // Double-click: cancel pending single-click, enter edit
                (nodeId, shapeEl, lblEl) => {
                    if (this.clickTimer) { clearTimeout(this.clickTimer); this.clickTimer = null; }
                    this.onNodeDblClick(nodeId, shapeEl, lblEl);
                },
                (edgeId) => {
                    this.selectedEdgeId = this.selectedEdgeId === edgeId ? null : edgeId;
                    this.state.selectedNodeIds = [];
                    this.render();
                    this.toolbarRefresh?.();
                },
            );
        }

        this.container.appendChild(this.svg);

        // Trigger inline edit for newly added node
        if (this.pendingEditNodeId && this.svg) {
            const nodeId = this.pendingEditNodeId;
            this.pendingEditNodeId = null;
            const g = this.svg.querySelector(`[data-node-id="${nodeId}"]`);
            if (g) {
                const shapeEl = g.querySelector(".node-shape") as SVGElement;
                const lblEl   = g.querySelector(".node-label") as SVGElement;
                if (shapeEl && lblEl) this.onNodeDblClick(nodeId, shapeEl, lblEl);
            }
        }
        this.syncSourceEditor();
    }

    // ── Source editor sync ────────────────────────────────────────────────────

    private syncSourceEditor(): void {
        if (this._syncing || !this.sourceEditor || !this.currentData?.graph) return;
        const text = serializeGraph(this.currentData.graph);
        this.sourceEditor.setText(text);
        // Use rAF to ensure this runs after any synchronous cleanup (e.g. table unmount)
        requestAnimationFrame(() => {
            this.sourceEditor?.setOnCellApply((value: string) => {
                this.applySourceEdit(value);
            });
        });
    }

    private applySourceEdit(source: string): void {
        if (!this.currentData?.graph) return;
        parseGraphSource(source, this.currentData.graph);
        this._syncing = true;
        this.render();
        this._syncing = false;
    }
}
