import type { GanttAST } from "./types.ts";

export function renderGantt(ast: GanttAST, W = 800, H = 600): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", String(W)); svg.setAttribute("height", String(H));
    svg.style.fontFamily = "system-ui, sans-serif"; svg.style.fontSize = "12px";

    const leftMargin = 150, topMargin = 50, barH = 24, barGap = 8;
    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

    if (ast.title) {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", String(W / 2)); t.setAttribute("y", "25");
        t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", "16"); t.setAttribute("font-weight", "bold");
        t.textContent = ast.title; svg.appendChild(t);
    }

    let y = topMargin, taskIdx = 0;
    for (const section of ast.sections) {
        // Section header
        const sh = document.createElementNS("http://www.w3.org/2000/svg", "text");
        sh.setAttribute("x", "10"); sh.setAttribute("y", String(y + 16));
        sh.setAttribute("font-weight", "bold"); sh.textContent = section.name;
        svg.appendChild(sh);
        y += 28;

        for (const task of section.tasks) {
            const color = colors[taskIdx % colors.length];
            // Label
            const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.setAttribute("x", String(leftMargin - 10)); label.setAttribute("y", String(y + 16));
            label.setAttribute("text-anchor", "end"); label.textContent = task.name;
            svg.appendChild(label);
            // Bar
            const barW = Math.max(40, (parseInt(task.duration) || 30) * 2);
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", String(leftMargin)); rect.setAttribute("y", String(y));
            rect.setAttribute("width", String(barW)); rect.setAttribute("height", String(barH));
            rect.setAttribute("rx", "4"); rect.setAttribute("fill", color); rect.setAttribute("opacity", "0.8");
            svg.appendChild(rect);
            y += barH + barGap;
            taskIdx++;
        }
    }
    return svg;
}
