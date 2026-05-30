import type { StateDiagramAST } from "./types.ts";
import { findBackEdges } from "../graph-utils.ts";

export function renderStateDiagram(ast: StateDiagramAST, W = 800, H = 600): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", String(W)); svg.setAttribute("height", String(H));
    svg.style.fontFamily = "system-ui, sans-serif"; svg.style.fontSize = "13px";

    // Arrowhead marker
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "state-arrow"); marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "7"); marker.setAttribute("refX", "10");
    marker.setAttribute("refY", "3.5"); marker.setAttribute("orient", "auto");
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", "0 0, 10 3.5, 0 7"); poly.setAttribute("fill", "#475569");
    marker.appendChild(poly); defs.appendChild(marker); svg.appendChild(defs);

    const gapX = 40, gapY = 100;
    const nodeIds = ast.states.map(s => s.id);
    const edges = ast.transitions.map(t => ({ from: t.from, to: t.to }));

    // Layered layout using Sugiyama method
    const backEdges = findBackEdges(nodeIds, edges);
    const dagEdges = edges.filter(e => !backEdges.has(`${e.from}->${e.to}`));
    const dagAdj = new Map<string, string[]>();
    const dagIn = new Map<string, string[]>();
    const inDeg = new Map<string, number>();
    for (const id of nodeIds) { dagAdj.set(id, []); dagIn.set(id, []); inDeg.set(id, 0); }
    for (const e of dagEdges) {
        dagAdj.get(e.from)?.push(e.to);
        dagIn.get(e.to)?.push(e.from);
        inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    }

    // Rank assignment (longest path)
    const rank = new Map<string, number>();
    const queue: string[] = [];
    for (const id of nodeIds) if ((inDeg.get(id) ?? 0) === 0) { queue.push(id); rank.set(id, 0); }
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
    for (const id of nodeIds) if (!rank.has(id)) rank.set(id, 0);

    // Group into layers
    const layerMap = new Map<number, string[]>();
    for (const id of nodeIds) {
        const r = rank.get(id)!;
        if (!layerMap.has(r)) layerMap.set(r, []);
        layerMap.get(r)!.push(id);
    }
    const sortedRanks = [...layerMap.keys()].sort((a, b) => a - b);
    const layers = sortedRanks.map(r => layerMap.get(r)!);

    // Barycenter ordering
    for (let i = 1; i < layers.length; i++) {
        const prevPos = new Map(layers[i - 1].map((id, idx) => [id, idx]));
        layers[i].sort((a, b) => {
            const pA = (dagIn.get(a) ?? []).filter(p => prevPos.has(p));
            const pB = (dagIn.get(b) ?? []).filter(p => prevPos.has(p));
            const bA = pA.length > 0 ? pA.reduce((s, p) => s + prevPos.get(p)!, 0) / pA.length : 0;
            const bB = pB.length > 0 ? pB.reduce((s, p) => s + prevPos.get(p)!, 0) / pB.length : 0;
            return bA - bB;
        });
    }

    // Compute sizes and positions
    const sizeMap = new Map<string, { w: number; h: number }>();
    for (const s of ast.states) {
        const w = s.id === "[*]" ? 20 : Math.max(80, s.label.length * 9 + 20);
        const h = s.id === "[*]" ? 20 : 36;
        sizeMap.set(s.id, { w, h });
    }

    // Assign initial positions
    const posMap = new Map<string, { x: number; y: number }>();
    for (let li = 0; li < layers.length; li++) {
        let cx = 0;
        for (const id of layers[li]) {
            const sz = sizeMap.get(id)!;
            posMap.set(id, { x: cx, y: li * gapY });
            cx += sz.w + gapX;
        }
    }

    // Iterative median positioning (4 passes)
    for (let iter = 0; iter < 4; iter++) {
        for (let li = 1; li < layers.length; li++) {
            for (const id of layers[li]) {
                const parents = (dagIn.get(id) ?? []).filter(p => posMap.has(p));
                if (parents.length === 0) continue;
                const centers = parents.map(p => posMap.get(p)!.x + sizeMap.get(p)!.w / 2).sort((a, b) => a - b);
                posMap.get(id)!.x = centers[Math.floor(centers.length / 2)] - sizeMap.get(id)!.w / 2;
            }
            const sorted = [...layers[li]].sort((a, b) => posMap.get(a)!.x - posMap.get(b)!.x);
            for (let i = 1; i < sorted.length; i++) {
                const minX = posMap.get(sorted[i-1])!.x + sizeMap.get(sorted[i-1])!.w + gapX;
                if (posMap.get(sorted[i])!.x < minX) posMap.get(sorted[i])!.x = minX;
            }
        }
        for (let li = layers.length - 2; li >= 0; li--) {
            for (const id of layers[li]) {
                const children = (dagAdj.get(id) ?? []).filter(c => posMap.has(c));
                if (children.length === 0) continue;
                const centers = children.map(c => posMap.get(c)!.x + sizeMap.get(c)!.w / 2).sort((a, b) => a - b);
                posMap.get(id)!.x = centers[Math.floor(centers.length / 2)] - sizeMap.get(id)!.w / 2;
            }
            const sorted = [...layers[li]].sort((a, b) => posMap.get(a)!.x - posMap.get(b)!.x);
            for (let i = 1; i < sorted.length; i++) {
                const minX = posMap.get(sorted[i-1])!.x + sizeMap.get(sorted[i-1])!.w + gapX;
                if (posMap.get(sorted[i])!.x < minX) posMap.get(sorted[i])!.x = minX;
            }
        }
    }

    // Center in viewport
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [id, pos] of posMap) {
        const sz = sizeMap.get(id)!;
        minX = Math.min(minX, pos.x); maxX = Math.max(maxX, pos.x + sz.w);
        minY = Math.min(minY, pos.y); maxY = Math.max(maxY, pos.y + sz.h);
    }
    const offX = (W - (maxX - minX)) / 2 - minX;
    const offY = (H - (maxY - minY)) / 2 - minY;

    // Compute final positions (center-based for drawing)
    const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const s of ast.states) {
        const pos = posMap.get(s.id)!;
        const sz = sizeMap.get(s.id)!;
        positions.set(s.id, { x: pos.x + offX + sz.w / 2, y: pos.y + offY + sz.h / 2, w: sz.w, h: sz.h });
    }

    // Draw edges with smooth bezier curves, routing back-edges around
    for (const t of ast.transitions) {
        const from = positions.get(t.from), to = positions.get(t.to);
        if (!from || !to) continue;

        // Detect back-edge (target is at same level or above)
        const isBack = to.y <= from.y;

        let d: string;
        if (isBack) {
            // Route around the right side
            const rightX = Math.max(from.x + from.w / 2, to.x + to.w / 2) + 60;
            const x1 = from.x + from.w / 2, y1 = from.y;
            const x2 = to.x + to.w / 2, y2 = to.y;
            d = `M ${x1} ${y1} C ${rightX} ${y1}, ${rightX} ${y2}, ${x2} ${y2}`;
        } else {
            // Normal forward: exit bottom, enter top
            const x1 = from.x, y1 = from.y + from.h / 2;
            const x2 = to.x, y2 = to.y - to.h / 2;
            const my = (y1 + y2) / 2;
            d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
        }

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#475569"); path.setAttribute("stroke-width", "1.5");
        path.setAttribute("marker-end", "url(#state-arrow)");
        svg.appendChild(path);
        if (t.label) {
            const mx = (from.x + to.x) / 2 + (isBack ? 30 : 0);
            const labelY = (from.y + to.y) / 2;
            const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            const lw = t.label.length * 7 + 8;
            bg.setAttribute("x", String(mx - lw / 2)); bg.setAttribute("y", String(labelY - 10));
            bg.setAttribute("width", String(lw)); bg.setAttribute("height", "16");
            bg.setAttribute("fill", "white"); bg.setAttribute("rx", "3");
            svg.appendChild(bg);
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", String(mx)); text.setAttribute("y", String(labelY + 3));
            text.setAttribute("text-anchor", "middle"); text.setAttribute("font-size", "11"); text.setAttribute("fill", "#64748b");
            text.textContent = t.label; svg.appendChild(text);
        }
    }

    // Draw nodes
    for (const s of ast.states) {
        const pos = positions.get(s.id);
        if (!pos) continue;
        if (s.id === "[*]") {
            const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            c.setAttribute("cx", String(pos.x)); c.setAttribute("cy", String(pos.y));
            c.setAttribute("r", "8"); c.setAttribute("fill", "#1e293b");
            svg.appendChild(c);
        } else {
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", String(pos.x - pos.w / 2)); rect.setAttribute("y", String(pos.y - pos.h / 2));
            rect.setAttribute("width", String(pos.w)); rect.setAttribute("height", String(pos.h));
            rect.setAttribute("rx", "8"); rect.setAttribute("fill", "#f1f5f9"); rect.setAttribute("stroke", "#475569");
            svg.appendChild(rect);
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", String(pos.x)); text.setAttribute("y", String(pos.y + 5));
            text.setAttribute("text-anchor", "middle"); text.textContent = s.label;
            svg.appendChild(text);
        }
    }

    return svg;
}
