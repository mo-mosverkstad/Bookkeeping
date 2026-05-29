import type { SequenceAST } from "./types.ts";

export function renderSequenceDiagram(ast: SequenceAST, W = 800, H = 600): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.style.fontFamily = "system-ui, sans-serif";
    svg.style.fontSize = "13px";

    const pCount = ast.participants.length;
    const gap = W / (pCount + 1);
    const headerY = 40, msgGap = 50;

    // Lifelines
    for (let i = 0; i < pCount; i++) {
        const x = gap * (i + 1);
        // Header box
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(x - 40)); rect.setAttribute("y", "10");
        rect.setAttribute("width", "80"); rect.setAttribute("height", "30");
        rect.setAttribute("fill", "#dbeafe"); rect.setAttribute("stroke", "#1d4ed8");
        svg.appendChild(rect);
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(x)); text.setAttribute("y", "30");
        text.setAttribute("text-anchor", "middle"); text.setAttribute("fill", "#1e293b");
        text.textContent = ast.participants[i];
        svg.appendChild(text);
        // Lifeline
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(x)); line.setAttribute("y1", String(headerY));
        line.setAttribute("x2", String(x)); line.setAttribute("y2", String(H - 20));
        line.setAttribute("stroke", "#94a3b8"); line.setAttribute("stroke-dasharray", "4,3");
        svg.appendChild(line);
    }

    // Messages
    const pIdx = (name: string) => ast.participants.indexOf(name);
    for (let i = 0; i < ast.messages.length; i++) {
        const msg = ast.messages[i];
        const y = headerY + 30 + i * msgGap;
        const x1 = gap * (pIdx(msg.from) + 1);
        const x2 = gap * (pIdx(msg.to) + 1);

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(x1)); line.setAttribute("y1", String(y));
        line.setAttribute("x2", String(x2)); line.setAttribute("y2", String(y));
        line.setAttribute("stroke", "#475569"); line.setAttribute("stroke-width", "1.5");
        if (msg.arrow === "dashed") line.setAttribute("stroke-dasharray", "5,3");
        svg.appendChild(line);

        // Arrowhead
        const dir = x2 > x1 ? 1 : -1;
        const ah = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        ah.setAttribute("points", `${x2},${y} ${x2 - dir * 8},${y - 4} ${x2 - dir * 8},${y + 4}`);
        ah.setAttribute("fill", "#475569");
        svg.appendChild(ah);

        // Label
        const lx = (x1 + x2) / 2;
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(lx)); text.setAttribute("y", String(y - 8));
        text.setAttribute("text-anchor", "middle"); text.setAttribute("fill", "#1e293b");
        text.setAttribute("font-size", "12");
        text.textContent = msg.label;
        svg.appendChild(text);
    }

    return svg;
}
