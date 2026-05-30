import type { FlowchartAST, FlowStatement, FlowNodeDef, FlowEdge } from "./types.ts";
import { findBackEdges, findCycles } from "../graph-utils.ts";

interface LayoutNode { id: string; label: string; shape: string; x: number; y: number; w: number; h: number; }
interface LayoutEdge { from: string; to: string; label: string; style: string; }

export function renderFlowchart(ast: FlowchartAST, width = 800, height = 600): SVGElement {
    const nodes = ast.statements.filter(s => s.type === "node") as FlowNodeDef[];
    const edges = ast.statements.filter(s => s.type === "edge") as FlowEdge[];

    // Detect ring layout
    const sccs = findCycles(nodes.map(n => n.id), edges);
    const mainCycle = sccs.length > 0 ? sccs.reduce((a, b) => a.length >= b.length ? a : b) : [];
    const ringSet = new Set(mainCycle);
    const isRing = ringSet.size >= nodes.length * 0.5 && ringSet.size >= 3;

    // Layout
    const layout = layoutNodes(nodes, edges, ast.direction, width, height);
    const layoutMap = new Map(layout.map(n => [n.id, n]));

    // Compute ring center for arc edges
    let ringCx = width / 2, ringCy = height / 2;
    if (isRing) {
        const ringNodes = layout.filter(n => ringSet.has(n.id));
        ringCx = ringNodes.reduce((s, n) => s + n.x + n.w / 2, 0) / ringNodes.length;
        ringCy = ringNodes.reduce((s, n) => s + n.y + n.h / 2, 0) / ringNodes.length;
    }

    // Create SVG
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.fontFamily = "system-ui, sans-serif";
    svg.style.fontSize = "13px";

    // Defs for arrowhead
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "arrowhead");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("refX", "10");
    marker.setAttribute("refY", "3.5");
    marker.setAttribute("orient", "auto");
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", "0 0, 10 3.5, 0 7");
    polygon.setAttribute("fill", "#475569");
    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);

    // Groups: nodes behind, edges+arrows on top so arrowheads are visible
    const nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const edgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(nodeGroup);
    svg.appendChild(edgeGroup);

    // Draw edges
    for (const edge of edges) {
        const from = layoutMap.get(edge.from);
        const to = layoutMap.get(edge.to);
        if (!from || !to) continue;

        const fcx = from.x + from.w / 2, fcy = from.y + from.h / 2;
        const tcx = to.x + to.w / 2, tcy = to.y + to.h / 2;
        const bothOnRing = isRing && ringSet.has(edge.from) && ringSet.has(edge.to);
        const isH = ast.direction === "LR" || ast.direction === "RL";

        let d: string;
        if (bothOnRing) {
            const startPt = nodeIntersect(tcx, tcy, from);
            const endPt = nodeIntersect(fcx, fcy, to);
            const mx = (fcx + tcx) / 2, my = (fcy + tcy) / 2;
            const dx = mx - ringCx, dy = my - ringCy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const push = 40;
            const qx = mx + (dx / dist) * push;
            const qy = my + (dy / dist) * push;
            d = `M ${startPt.x} ${startPt.y} Q ${qx} ${qy} ${endPt.x} ${endPt.y}`;
        } else {
            const isBack = isH
                ? (ast.direction === "LR" ? tcx <= fcx : tcx >= fcx)
                : (ast.direction === "BT" ? tcy >= fcy : tcy <= fcy);
            if (isBack) {
                if (isH) {
                    // LR/RL back-edge: route above the graph
                    const topY = Math.min(from.y, to.y) - 50;
                    const x1 = fcx, y1 = from.y;
                    const x2 = tcx, y2 = to.y;
                    d = `M ${x1} ${y1} C ${x1} ${topY}, ${x2} ${topY}, ${x2} ${y2}`;
                } else {
                    // TD/BT back-edge: route to the right of the graph
                    const rightX = Math.max(from.x + from.w, to.x + to.w) + 50;
                    const x1 = from.x + from.w, y1 = fcy;
                    const x2 = to.x + to.w, y2 = tcy;
                    d = `M ${x1} ${y1} C ${rightX} ${y1}, ${rightX} ${y2}, ${x2} ${y2}`;
                }
            } else {
                if (isH) {
                    const x1 = ast.direction === "RL" ? from.x : from.x + from.w;
                    const x2 = ast.direction === "RL" ? to.x + to.w : to.x;
                    const mx = (x1 + x2) / 2;
                    d = `M ${x1} ${fcy} C ${mx} ${fcy}, ${mx} ${tcy}, ${x2} ${tcy}`;
                } else {
                    const y1 = ast.direction === "BT" ? from.y : from.y + from.h;
                    const y2 = ast.direction === "BT" ? to.y + to.h : to.y;
                    const my = (y1 + y2) / 2;
                    d = `M ${fcx} ${y1} C ${fcx} ${my}, ${tcx} ${my}, ${tcx} ${y2}`;
                }
            }
        }

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#475569");
        path.setAttribute("stroke-width", edge.style === "thick" ? "3" : "1.5");
        if (edge.style === "dotted") path.setAttribute("stroke-dasharray", "5,3");
        path.setAttribute("marker-end", "url(#arrowhead)");
        edgeGroup.appendChild(path);

        if (edge.label) {
            const mx = (from.x + from.w / 2 + to.x + to.w / 2) / 2;
            const my = (from.y + from.h / 2 + to.y + to.h / 2) / 2;
            const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            const lw = edge.label.length * 7 + 8;
            bg.setAttribute("x", String(mx - lw / 2)); bg.setAttribute("y", String(my - 10));
            bg.setAttribute("width", String(lw)); bg.setAttribute("height", "16");
            bg.setAttribute("fill", "white"); bg.setAttribute("rx", "3");
            edgeGroup.appendChild(bg);
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", String(mx));
            text.setAttribute("y", String(my + 3));
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("fill", "#64748b");
            text.setAttribute("font-size", "11");
            text.textContent = edge.label;
            edgeGroup.appendChild(text);
        }
    }

    // Draw nodes
    for (const node of layout) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("transform", `translate(${node.x}, ${node.y})`);

        const shape = createShape(node);
        g.appendChild(shape);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(node.w / 2));
        text.setAttribute("y", String(node.h / 2 + 4));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "#1e293b");
        text.textContent = node.label;
        g.appendChild(text);

        nodeGroup.appendChild(g);
    }

    return svg;
}

function createShape(node: LayoutNode): SVGElement {
    const { w, h, shape } = node;
    switch (shape) {
        case "round": {
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("width", String(w)); rect.setAttribute("height", String(h));
            rect.setAttribute("rx", "8"); rect.setAttribute("ry", "8");
            rect.setAttribute("fill", "#f1f5f9"); rect.setAttribute("stroke", "#475569");
            return rect;
        }
        case "diamond": {
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            poly.setAttribute("points", `${w/2},0 ${w},${h/2} ${w/2},${h} 0,${h/2}`);
            poly.setAttribute("fill", "#fef3c7"); poly.setAttribute("stroke", "#92400e");
            return poly;
        }
        case "circle": {
            const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            c.setAttribute("cx", String(w/2)); c.setAttribute("cy", String(h/2));
            c.setAttribute("r", String(Math.min(w, h) / 2));
            c.setAttribute("fill", "#dbeafe"); c.setAttribute("stroke", "#1d4ed8");
            return c;
        }
        case "stadium": {
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("width", String(w)); rect.setAttribute("height", String(h));
            rect.setAttribute("rx", String(h/2)); rect.setAttribute("ry", String(h/2));
            rect.setAttribute("fill", "#dcfce7"); rect.setAttribute("stroke", "#166534");
            return rect;
        }
        case "hex": {
            const dx = 10;
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            poly.setAttribute("points", `${dx},0 ${w-dx},0 ${w},${h/2} ${w-dx},${h} ${dx},${h} 0,${h/2}`);
            poly.setAttribute("fill", "#fae8ff"); poly.setAttribute("stroke", "#86198f");
            return poly;
        }
        case "subroutine": {
            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            const outer = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            outer.setAttribute("width", String(w)); outer.setAttribute("height", String(h));
            outer.setAttribute("fill", "#f1f5f9"); outer.setAttribute("stroke", "#475569");
            g.appendChild(outer);
            const l1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
            l1.setAttribute("x1", "8"); l1.setAttribute("y1", "0"); l1.setAttribute("x2", "8"); l1.setAttribute("y2", String(h));
            l1.setAttribute("stroke", "#475569");
            g.appendChild(l1);
            const l2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
            l2.setAttribute("x1", String(w-8)); l2.setAttribute("y1", "0"); l2.setAttribute("x2", String(w-8)); l2.setAttribute("y2", String(h));
            l2.setAttribute("stroke", "#475569");
            g.appendChild(l2);
            return g;
        }
        default: { // rect
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("width", String(w)); rect.setAttribute("height", String(h));
            rect.setAttribute("fill", "#f1f5f9"); rect.setAttribute("stroke", "#475569");
            return rect;
        }
    }
}

/** Compute intersection of a ray from (px,py) to node center with the node's border. */
function nodeIntersect(px: number, py: number, node: LayoutNode): { x: number; y: number } {
    const cx = node.x + node.w / 2, cy = node.y + node.h / 2;
    const dx = cx - px, dy = cy - py;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };

    if (node.shape === "circle") {
        const r = Math.min(node.w, node.h) / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return { x: cx - (dx / dist) * r, y: cy - (dy / dist) * r };
    }

    // Rectangle intersection
    const hw = node.w / 2, hh = node.h / 2;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    let t: number;
    if (absDx * hh > absDy * hw) {
        t = hw / absDx;
    } else {
        t = hh / absDy;
    }
    return { x: cx - dx * t, y: cy - dy * t };
}

function layoutNodes(nodes: FlowNodeDef[], edges: FlowEdge[], direction: string, W: number, H: number): LayoutNode[] {
    if (nodes.length === 0) return [];

    const nodeH = 40, gapX = 40, gapY = 70;

    // Pre-compute node sizes
    const sizeMap = new Map<string, { w: number; h: number }>();
    for (const n of nodes) {
        const w = Math.max(100, n.label.length * 9 + 30);
        const h = n.shape === "diamond" ? 60 : nodeH;
        sizeMap.set(n.id, { w, h });
    }

    // Detect cycles — if there's a cycle, use ring layout for cycle nodes
    const sccs = findCycles(nodes.map(n => n.id), edges);
    const mainCycle = sccs.length > 0 ? sccs.reduce((a, b) => a.length >= b.length ? a : b) : [];
    const cycleSet = new Set(mainCycle);

    // If most nodes are in a cycle, use ring layout for the whole graph
    if (cycleSet.size >= nodes.length * 0.75 && cycleSet.size >= 4) {
        return layoutRing(nodes, edges, cycleSet, sizeMap, W, H);
    }

    // Otherwise use layered layout (existing Sugiyama approach)
    // 1. Break cycles
    const backEdges = findBackEdges(nodes.map(n => n.id), edges);
    const dagEdges = edges.filter(e => !backEdges.has(`${e.from}->${e.to}`));

    // 2. Assign ranks (longest path from sources)
    const dagAdj = new Map<string, string[]>();
    const dagIn = new Map<string, string[]>();
    const inDeg = new Map<string, number>();
    for (const n of nodes) { dagAdj.set(n.id, []); dagIn.set(n.id, []); inDeg.set(n.id, 0); }
    for (const e of dagEdges) {
        dagAdj.get(e.from)?.push(e.to);
        dagIn.get(e.to)?.push(e.from);
        inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    }

    const rank = new Map<string, number>();
    const queue: string[] = [];
    for (const n of nodes) if ((inDeg.get(n.id) ?? 0) === 0) { queue.push(n.id); rank.set(n.id, 0); }
    let head = 0;
    while (head < queue.length) {
        const id = queue[head++];
        const r = rank.get(id)!;
        for (const next of dagAdj.get(id) ?? []) {
            if ((rank.get(next) ?? -1) < r + 1) rank.set(next, r + 1);
            inDeg.set(next, (inDeg.get(next) ?? 0) - 1);
            if ((inDeg.get(next) ?? 0) <= 0 && !queue.includes(next)) queue.push(next);
        }
    }
    for (const n of nodes) if (!rank.has(n.id)) rank.set(n.id, 0);

    // 3. Group into layers
    const layerMap = new Map<number, string[]>();
    for (const n of nodes) {
        const r = rank.get(n.id)!;
        if (!layerMap.has(r)) layerMap.set(r, []);
        layerMap.get(r)!.push(n.id);
    }
    const sortedRanks = [...layerMap.keys()].sort((a, b) => a - b);
    const layers = sortedRanks.map(r => layerMap.get(r)!);

    // 4. Reduce crossings: order nodes in each layer by barycenter of parents
    for (let i = 1; i < layers.length; i++) {
        const prevLayer = layers[i - 1];
        const prevPos = new Map(prevLayer.map((id, idx) => [id, idx]));
        layers[i].sort((a, b) => {
            const parentsA = (dagIn.get(a) ?? []).filter(p => prevPos.has(p));
            const parentsB = (dagIn.get(b) ?? []).filter(p => prevPos.has(p));
            const baryA = parentsA.length > 0 ? parentsA.reduce((s, p) => s + prevPos.get(p)!, 0) / parentsA.length : 0;
            const baryB = parentsB.length > 0 ? parentsB.reduce((s, p) => s + prevPos.get(p)!, 0) / parentsB.length : 0;
            return baryA - baryB;
        });
    }

    // 5. Assign coordinates — position nodes to minimize edge lengths
    const isHorizontal = direction === "LR" || direction === "RL";
    const posMap = new Map<string, { x: number; y: number }>();

    // Compute layer spacing based on max node size in each layer
    const layerSpacing = isHorizontal
        ? Math.max(140, Math.min(200, W / (layers.length + 1)))
        : nodeH + gapY;

    // Initial placement: evenly spaced within each layer
    for (let li = 0; li < layers.length; li++) {
        const layer = layers[li];
        let crossOffset = 0;
        for (const id of layer) {
            const sz = sizeMap.get(id)!;
            if (isHorizontal) {
                posMap.set(id, { x: li * layerSpacing, y: crossOffset });
            } else {
                posMap.set(id, { x: crossOffset, y: li * layerSpacing });
            }
            crossOffset += (isHorizontal ? sz.h : sz.w) + gapX;
        }
    }

    // Iterative position refinement (like dagre's coordinate assignment)
    // Multiple passes: down then up, each time moving nodes toward the median of their neighbors
    for (let iter = 0; iter < 4; iter++) {
        // Down pass: position each node at median of its parents
        for (let li = 1; li < layers.length; li++) {
            for (const id of layers[li]) {
                const parents = (dagIn.get(id) ?? []).filter(p => posMap.has(p));
                if (parents.length === 0) continue;
                const parentCenters = parents.map(p => {
                    const pp = posMap.get(p)!; const ps = sizeMap.get(p)!;
                    return isHorizontal ? pp.y + ps.h / 2 : pp.x + ps.w / 2;
                }).sort((a, b) => a - b);
                const median = parentCenters[Math.floor(parentCenters.length / 2)];
                const sz = sizeMap.get(id)!;
                const pos = posMap.get(id)!;
                if (isHorizontal) pos.y = median - sz.h / 2;
                else pos.x = median - sz.w / 2;
            }
            resolveOverlaps(layers[li], posMap, sizeMap, gapX, isHorizontal);
        }

        // Up pass: position each node at median of its children
        for (let li = layers.length - 2; li >= 0; li--) {
            for (const id of layers[li]) {
                const children = (dagAdj.get(id) ?? []).filter(c => posMap.has(c));
                if (children.length === 0) continue;
                const childCenters = children.map(c => {
                    const cp = posMap.get(c)!; const cs = sizeMap.get(c)!;
                    return isHorizontal ? cp.y + cs.h / 2 : cp.x + cs.w / 2;
                }).sort((a, b) => a - b);
                const median = childCenters[Math.floor(childCenters.length / 2)];
                const sz = sizeMap.get(id)!;
                const pos = posMap.get(id)!;
                if (isHorizontal) pos.y = median - sz.h / 2;
                else pos.x = median - sz.w / 2;
            }
            resolveOverlaps(layers[li], posMap, sizeMap, gapX, isHorizontal);
        }
    }

    // Center the whole diagram in the viewport
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [id, pos] of posMap) {
        const sz = sizeMap.get(id)!;
        minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + sz.w); maxY = Math.max(maxY, pos.y + sz.h);
    }
    const offsetX = (W - (maxX - minX)) / 2 - minX;
    const offsetY = (H - (maxY - minY)) / 2 - minY;

    const result: LayoutNode[] = [];
    for (const n of nodes) {
        const pos = posMap.get(n.id)!;
        const sz = sizeMap.get(n.id)!;
        let x = pos.x + offsetX, y = pos.y + offsetY;
        if (direction === "RL") x = W - x - sz.w;
        if (direction === "BT") y = H - y - sz.h;
        result.push({ id: n.id, label: n.label, shape: n.shape, x, y, w: sz.w, h: sz.h });
    }

    return result;
}

function layoutRing(
    nodes: FlowNodeDef[],
    edges: FlowEdge[],
    cycleSet: Set<string>,
    sizeMap: Map<string, { w: number; h: number }>,
    W: number,
    H: number,
): LayoutNode[] {
    // Find entry point: the cycle node that has an incoming edge from a non-cycle node
    const entryNode = [...cycleSet].find(id =>
        edges.some(e => e.to === id && !cycleSet.has(e.from))
    ) || [...cycleSet][0];

    // Walk cycle from entry point following edges
    const cycleAdj = new Map<string, string[]>();
    for (const e of edges) {
        if (cycleSet.has(e.from) && cycleSet.has(e.to)) {
            if (!cycleAdj.has(e.from)) cycleAdj.set(e.from, []);
            cycleAdj.get(e.from)!.push(e.to);
        }
    }
    const cycleNodes: string[] = [];
    const visited = new Set<string>();
    let cur = entryNode;
    while (cur && !visited.has(cur)) {
        cycleNodes.push(cur);
        visited.add(cur);
        cur = (cycleAdj.get(cur) ?? []).find(n => !visited.has(n)) ?? "";
    }
    for (const id of cycleSet) if (!visited.has(id)) cycleNodes.push(id);

    // Compute ring radius
    const totalPerimeter = cycleNodes.reduce((s, id) => s + sizeMap.get(id)!.w + 40, 0);
    const radius = Math.max(120, totalPerimeter / (2 * Math.PI));
    const cx = W / 2, cy = H / 2;

    const result: LayoutNode[] = [];

    // Place cycle nodes on ring — entry at top, flowing clockwise
    cycleNodes.forEach((id, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / cycleNodes.length;
        const sz = sizeMap.get(id)!;
        const node = nodes.find(n => n.id === id)!;
        result.push({
            id, label: node.label, shape: node.shape,
            x: cx + radius * Math.cos(angle) - sz.w / 2,
            y: cy + radius * Math.sin(angle) - sz.h / 2,
            w: sz.w, h: sz.h,
        });
    });

    // Place non-cycle nodes: chain them above the ring entry point, flowing downward (TD)
    const nonCycle = nodes.filter(n => !cycleSet.has(n.id));
    // Sort non-cycle by dependency order (topological from sources)
    const ncAdj = new Map<string, string[]>();
    for (const n of nonCycle) ncAdj.set(n.id, []);
    for (const e of edges) {
        if (!cycleSet.has(e.from) && !cycleSet.has(e.to)) ncAdj.get(e.from)?.push(e.to);
    }
    const ncOrder: string[] = [];
    const ncVisited = new Set<string>();
    function ncDfs(id: string) { ncVisited.add(id); for (const n of ncAdj.get(id) ?? []) if (!ncVisited.has(n)) ncDfs(n); ncOrder.push(id); }
    for (const n of nonCycle) if (!ncVisited.has(n.id)) ncDfs(n.id);
    ncOrder.reverse();

    // Place them top-down above the ring
    const chainGap = 50;
    const totalChainH = ncOrder.reduce((s, id) => s + sizeMap.get(id)!.h + chainGap, 0) - chainGap;
    let curY = cy - radius - 60 - totalChainH;
    for (const id of ncOrder) {
        const n = nodes.find(nd => nd.id === id)!;
        const sz = sizeMap.get(id)!;
        result.push({ id, label: n.label, shape: n.shape, x: cx - sz.w / 2, y: curY, w: sz.w, h: sz.h });
        curY += sz.h + chainGap;
    }

    return result;
}

function resolveOverlaps(
    layer: string[],
    posMap: Map<string, { x: number; y: number }>,
    sizeMap: Map<string, { w: number; h: number }>,
    gap: number,
    isHorizontal: boolean,
): void {
    const sorted = [...layer].sort((a, b) => {
        const pa = posMap.get(a)!, pb = posMap.get(b)!;
        return isHorizontal ? pa.y - pb.y : pa.x - pb.x;
    });
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1], curr = sorted[i];
        const pPrev = posMap.get(prev)!, pCurr = posMap.get(curr)!;
        const szPrev = sizeMap.get(prev)!;
        if (isHorizontal) {
            const minY = pPrev.y + szPrev.h + gap;
            if (pCurr.y < minY) pCurr.y = minY;
        } else {
            const minX = pPrev.x + szPrev.w + gap;
            if (pCurr.x < minX) pCurr.x = minX;
        }
    }
}
