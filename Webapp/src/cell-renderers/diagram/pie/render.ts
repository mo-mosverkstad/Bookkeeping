import type { PieAST, PieSlice } from "./types.ts";

export function parsePie(source: string): PieAST {
    const lines = source.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    let title = "";
    const slices: PieSlice[] = [];

    for (const line of lines) {
        if (line === "pie") continue;
        if (line.startsWith("title ")) { title = line.slice(6).trim(); continue; }
        // "Label" : value
        const m = line.match(/^"([^"]+)"\s*:\s*(\d+(?:\.\d+)?)/);
        if (m) slices.push({ label: m[1], value: parseFloat(m[2]) });
    }
    if (slices.length === 0) throw new Error("Pie chart has no slices");
    return { title, slices };
}

export function renderPie(ast: PieAST, W = 800, H = 600): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", String(W)); svg.setAttribute("height", String(H));
    svg.style.fontFamily = "system-ui, sans-serif"; svg.style.fontSize = "13px";

    const cx = W / 2, cy = H / 2 + 20, r = Math.min(W, H) * 0.35;
    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
    const total = ast.slices.reduce((s, sl) => s + sl.value, 0);

    if (ast.title) {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", String(cx)); t.setAttribute("y", "25");
        t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", "16"); t.setAttribute("font-weight", "bold");
        t.textContent = ast.title; svg.appendChild(t);
    }

    let angle = 0;
    ast.slices.forEach((slice, i) => {
        const sliceAngle = (slice.value / total) * Math.PI * 2;
        const x1 = cx + r * Math.cos(angle);
        const y1 = cy + r * Math.sin(angle);
        const x2 = cx + r * Math.cos(angle + sliceAngle);
        const y2 = cy + r * Math.sin(angle + sliceAngle);
        const largeArc = sliceAngle > Math.PI ? 1 : 0;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`);
        path.setAttribute("fill", colors[i % colors.length]);
        path.setAttribute("stroke", "white"); path.setAttribute("stroke-width", "2");
        svg.appendChild(path);

        // Label
        const midAngle = angle + sliceAngle / 2;
        const lx = cx + (r * 0.65) * Math.cos(midAngle);
        const ly = cy + (r * 0.65) * Math.sin(midAngle);
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(lx)); text.setAttribute("y", String(ly));
        text.setAttribute("text-anchor", "middle"); text.setAttribute("fill", "white"); text.setAttribute("font-weight", "bold");
        text.textContent = slice.label; svg.appendChild(text);

        angle += sliceAngle;
    });

    return svg;
}
