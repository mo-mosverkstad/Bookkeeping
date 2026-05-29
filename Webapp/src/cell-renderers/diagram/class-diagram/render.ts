import type { ClassDiagramAST } from "./types.ts";

export function renderClassDiagram(ast: ClassDiagramAST, W = 800, H = 600): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", String(W)); svg.setAttribute("height", String(H));
    svg.style.fontFamily = "system-ui, sans-serif"; svg.style.fontSize = "12px";

    const boxW = 150, boxH = 80, gapX = 40, gapY = 60;
    const cols = Math.max(1, Math.floor(W / (boxW + gapX)));
    const positions = new Map<string, { x: number; y: number }>();

    ast.classes.forEach((cls, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = 30 + col * (boxW + gapX), y = 30 + row * (boxH + gapY);
        positions.set(cls.name, { x, y });

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(x)); rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(boxW)); rect.setAttribute("height", String(boxH));
        rect.setAttribute("fill", "#f1f5f9"); rect.setAttribute("stroke", "#475569");
        g.appendChild(rect);

        const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
        title.setAttribute("x", String(x + boxW / 2)); title.setAttribute("y", String(y + 18));
        title.setAttribute("text-anchor", "middle"); title.setAttribute("font-weight", "bold");
        title.textContent = cls.name;
        g.appendChild(title);

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(x)); line.setAttribute("y1", String(y + 25));
        line.setAttribute("x2", String(x + boxW)); line.setAttribute("y2", String(y + 25));
        line.setAttribute("stroke", "#475569");
        g.appendChild(line);

        let ty = y + 40;
        for (const m of cls.members.concat(cls.methods).slice(0, 3)) {
            const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
            t.setAttribute("x", String(x + 5)); t.setAttribute("y", String(ty));
            t.setAttribute("font-size", "11"); t.textContent = m;
            g.appendChild(t); ty += 14;
        }
        svg.appendChild(g);
    });

    for (const rel of ast.relations) {
        const from = positions.get(rel.from), to = positions.get(rel.to);
        if (!from || !to) continue;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(from.x + boxW / 2)); line.setAttribute("y1", String(from.y + boxH));
        line.setAttribute("x2", String(to.x + boxW / 2)); line.setAttribute("y2", String(to.y));
        line.setAttribute("stroke", "#475569"); line.setAttribute("stroke-width", "1.5");
        if (rel.type === "dependency") line.setAttribute("stroke-dasharray", "5,3");
        svg.appendChild(line);
    }
    return svg;
}
