import type { StateDiagramAST } from "./types.ts";

export function renderStateDiagram(ast: StateDiagramAST, W = 800, H = 600): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", String(W)); svg.setAttribute("height", String(H));
    svg.style.fontFamily = "system-ui, sans-serif"; svg.style.fontSize = "13px";

    const nodeR = 30, gapX = 120, gapY = 80;
    const cols = Math.max(1, Math.floor(W / (nodeR * 2 + gapX)));
    const positions = new Map<string, { x: number; y: number }>();

    ast.states.forEach((s, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = 80 + col * (nodeR * 2 + gapX), y = 60 + row * gapY;
        positions.set(s.id, { x, y });

        if (s.id === "[*]") {
            const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            c.setAttribute("cx", String(x)); c.setAttribute("cy", String(y));
            c.setAttribute("r", "8"); c.setAttribute("fill", "#1e293b");
            svg.appendChild(c);
        } else {
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", String(x - 40)); rect.setAttribute("y", String(y - 18));
            rect.setAttribute("width", "80"); rect.setAttribute("height", "36");
            rect.setAttribute("rx", "8"); rect.setAttribute("fill", "#f1f5f9"); rect.setAttribute("stroke", "#475569");
            svg.appendChild(rect);
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", String(x)); text.setAttribute("y", String(y + 5));
            text.setAttribute("text-anchor", "middle"); text.textContent = s.label;
            svg.appendChild(text);
        }
    });

    for (const t of ast.transitions) {
        const from = positions.get(t.from), to = positions.get(t.to);
        if (!from || !to) continue;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(from.x)); line.setAttribute("y1", String(from.y));
        line.setAttribute("x2", String(to.x)); line.setAttribute("y2", String(to.y));
        line.setAttribute("stroke", "#475569"); line.setAttribute("marker-end", "url(#arrowhead)");
        svg.appendChild(line);
        if (t.label) {
            const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", String(mx)); text.setAttribute("y", String(my - 8));
            text.setAttribute("text-anchor", "middle"); text.setAttribute("font-size", "11"); text.setAttribute("fill", "#64748b");
            text.textContent = t.label; svg.appendChild(text);
        }
    }
    return svg;
}
