import type { ERDiagramAST } from "./types.ts";

export function renderERDiagram(ast: ERDiagramAST, W = 800, H = 600): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", String(W)); svg.setAttribute("height", String(H));
    svg.style.fontFamily = "system-ui, sans-serif"; svg.style.fontSize = "13px";

    const boxW = 130, boxH = 40, gapX = 80, gapY = 80;
    const cols = Math.max(1, Math.floor(W / (boxW + gapX)));
    const positions = new Map<string, { x: number; y: number }>();

    ast.entities.forEach((e, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = 40 + col * (boxW + gapX), y = 40 + row * (boxH + gapY);
        positions.set(e.name, { x, y });
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(x)); rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(boxW)); rect.setAttribute("height", String(boxH));
        rect.setAttribute("fill", "#fef3c7"); rect.setAttribute("stroke", "#92400e");
        svg.appendChild(rect);
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(x + boxW / 2)); text.setAttribute("y", String(y + 25));
        text.setAttribute("text-anchor", "middle"); text.setAttribute("font-weight", "bold");
        text.textContent = e.name; svg.appendChild(text);
    });

    for (const r of ast.relations) {
        const from = positions.get(r.from), to = positions.get(r.to);
        if (!from || !to) continue;
        const x1 = from.x + boxW, y1 = from.y + boxH / 2;
        const x2 = to.x, y2 = to.y + boxH / 2;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(x1)); line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2)); line.setAttribute("y2", String(y2));
        line.setAttribute("stroke", "#475569"); svg.appendChild(line);
        if (r.label) {
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            const lw = r.label.length * 7 + 8;
            bg.setAttribute("x", String(mx - lw / 2)); bg.setAttribute("y", String(my - 12));
            bg.setAttribute("width", String(lw)); bg.setAttribute("height", "16");
            bg.setAttribute("fill", "white"); bg.setAttribute("rx", "3");
            svg.appendChild(bg);
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", String(mx)); text.setAttribute("y", String(my));
            text.setAttribute("text-anchor", "middle"); text.setAttribute("font-size", "11");
            text.textContent = r.label; svg.appendChild(text);
        }
    }
    return svg;
}
