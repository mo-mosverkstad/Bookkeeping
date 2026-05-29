import type { FlowchartAST, FlowStatement, FlowNodeDef, FlowEdge } from "./types.ts";

interface LayoutNode { id: string; label: string; shape: string; x: number; y: number; w: number; h: number; }
interface LayoutEdge { from: string; to: string; label: string; style: string; }

export function renderFlowchart(ast: FlowchartAST, width = 800, height = 600): SVGElement {
    const nodes = ast.statements.filter(s => s.type === "node") as FlowNodeDef[];
    const edges = ast.statements.filter(s => s.type === "edge") as FlowEdge[];

    // Layout
    const layout = layoutNodes(nodes, edges, ast.direction, width, height);
    const layoutMap = new Map(layout.map(n => [n.id, n]));

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

    // Draw edges
    for (const edge of edges) {
        const from = layoutMap.get(edge.from);
        const to = layoutMap.get(edge.to);
        if (!from || !to) continue;

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(from.x + from.w / 2));
        line.setAttribute("y1", String(from.y + from.h / 2));
        line.setAttribute("x2", String(to.x + to.w / 2));
        line.setAttribute("y2", String(to.y + to.h / 2));
        line.setAttribute("stroke", "#475569");
        line.setAttribute("stroke-width", edge.style === "thick" ? "3" : "1.5");
        if (edge.style === "dotted") line.setAttribute("stroke-dasharray", "5,3");
        line.setAttribute("marker-end", "url(#arrowhead)");
        svg.appendChild(line);

        if (edge.label) {
            const mx = (from.x + from.w / 2 + to.x + to.w / 2) / 2;
            const my = (from.y + from.h / 2 + to.y + to.h / 2) / 2;
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", String(mx));
            text.setAttribute("y", String(my - 5));
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("fill", "#64748b");
            text.setAttribute("font-size", "11");
            text.textContent = edge.label;
            svg.appendChild(text);
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

        svg.appendChild(g);
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

function layoutNodes(nodes: FlowNodeDef[], edges: FlowEdge[], direction: string, W: number, H: number): LayoutNode[] {
    if (nodes.length === 0) return [];

    const nodeW = 120, nodeH = 40, gapX = 60, gapY = 60;

    // Build adjacency for topological sort
    const adj = new Map<string, string[]>();
    const inDeg = new Map<string, number>();
    for (const n of nodes) { adj.set(n.id, []); inDeg.set(n.id, 0); }
    for (const e of edges) {
        adj.get(e.from)?.push(e.to);
        inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    }

    // Topological layers (BFS)
    const layers: string[][] = [];
    const queue = nodes.filter(n => (inDeg.get(n.id) ?? 0) === 0).map(n => n.id);
    const visited = new Set<string>();

    while (queue.length > 0) {
        const layer = [...queue];
        layers.push(layer);
        queue.length = 0;
        for (const id of layer) {
            visited.add(id);
            for (const next of adj.get(id) ?? []) {
                inDeg.set(next, (inDeg.get(next) ?? 0) - 1);
                if ((inDeg.get(next) ?? 0) <= 0 && !visited.has(next)) {
                    queue.push(next);
                    visited.add(next);
                }
            }
        }
    }
    // Add any unvisited nodes (cycles)
    for (const n of nodes) {
        if (!visited.has(n.id)) layers.push([n.id]);
    }

    const isHorizontal = direction === "LR" || direction === "RL";
    const result: LayoutNode[] = [];

    for (let li = 0; li < layers.length; li++) {
        const layer = layers[li];
        for (let ni = 0; ni < layer.length; ni++) {
            const id = layer[ni];
            const node = nodes.find(n => n.id === id)!;
            const w = Math.max(nodeW, node.label.length * 9 + 20);
            const h = node.shape === "diamond" ? 60 : nodeH;

            let x: number, y: number;
            if (isHorizontal) {
                x = 40 + li * (nodeW + gapX);
                y = (H - layer.length * (nodeH + gapY) + gapY) / 2 + ni * (nodeH + gapY);
            } else {
                x = (W - layer.length * (w + gapX) + gapX) / 2 + ni * (w + gapX);
                y = 40 + li * (nodeH + gapY);
            }
            if (direction === "RL") x = W - x - w;
            if (direction === "BT") y = H - y - h;

            result.push({ id, label: node.label, shape: node.shape, x, y, w, h });
        }
    }

    return result;
}
