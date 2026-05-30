import type { GanttAST } from "./types.ts";

export function renderGantt(ast: GanttAST, W = 800, H = 600): SVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", String(W)); svg.setAttribute("height", String(H));
    svg.style.fontFamily = "system-ui, sans-serif"; svg.style.fontSize = "12px";

    const leftMargin = 160, topMargin = 60, barH = 22, barGap = 6, sectionGap = 20;
    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

    // Title
    if (ast.title) {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", String(W / 2)); t.setAttribute("y", "24");
        t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", "15"); t.setAttribute("font-weight", "bold");
        t.textContent = ast.title; svg.appendChild(t);
    }

    // Resolve task dates
    interface ResolvedTask { name: string; start: number; end: number; section: number }
    const resolved: ResolvedTask[] = [];
    const taskById = new Map<string, ResolvedTask>();

    function parseDays(dur: string): number {
        const m = dur.match(/^(\d+)d$/);
        return m ? parseInt(m[1]) : 30;
    }

    function parseDate(s: string): number {
        const d = new Date(s);
        return isNaN(d.getTime()) ? NaN : d.getTime();
    }

    let sectionIdx = 0;
    for (const section of ast.sections) {
        for (const task of section.tasks) {
            let startMs: number;
            if (task.start.startsWith("after ")) {
                const depId = task.start.slice(6).trim();
                const dep = taskById.get(depId);
                startMs = dep ? dep.end : Date.now();
            } else {
                startMs = parseDate(task.start);
                if (isNaN(startMs)) startMs = Date.now();
            }
            const days = parseDays(task.duration);
            const endMs = startMs + days * 86400000;
            const r: ResolvedTask = { name: task.name, start: startMs, end: endMs, section: sectionIdx };
            resolved.push(r);
            if (task.id) taskById.set(task.id, r);
        }
        sectionIdx++;
    }

    if (resolved.length === 0) return svg;

    // Compute timeline range
    const minTime = Math.min(...resolved.map(t => t.start));
    const maxTime = Math.max(...resolved.map(t => t.end));
    const timeRange = maxTime - minTime || 86400000;
    const chartW = W - leftMargin - 20;

    function timeToX(ms: number): number {
        return leftMargin + ((ms - minTime) / timeRange) * chartW;
    }

    // Draw date axis
    const axisY = topMargin - 10;
    const numTicks = Math.min(6, Math.max(2, Math.floor(chartW / 100)));
    for (let i = 0; i <= numTicks; i++) {
        const ms = minTime + (timeRange * i) / numTicks;
        const x = timeToX(ms);
        const d = new Date(ms);
        const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(x)); text.setAttribute("y", String(axisY));
        text.setAttribute("text-anchor", "middle"); text.setAttribute("font-size", "10"); text.setAttribute("fill", "#64748b");
        text.textContent = label; svg.appendChild(text);
        // Grid line
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(x)); line.setAttribute("y1", String(topMargin));
        line.setAttribute("x2", String(x)); line.setAttribute("y2", String(H - 10));
        line.setAttribute("stroke", "#e2e8f0"); line.setAttribute("stroke-width", "1");
        svg.appendChild(line);
    }

    // Draw tasks
    let y = topMargin;
    let currentSectionIdx = -1;
    let taskColorIdx = 0;
    for (const task of resolved) {
        if (task.section !== currentSectionIdx) {
            currentSectionIdx = task.section;
            // Section header
            const sName = ast.sections[currentSectionIdx].name;
            const sh = document.createElementNS("http://www.w3.org/2000/svg", "text");
            sh.setAttribute("x", "8"); sh.setAttribute("y", String(y + 14));
            sh.setAttribute("font-weight", "bold"); sh.setAttribute("font-size", "11"); sh.setAttribute("fill", "#334155");
            sh.textContent = sName; svg.appendChild(sh);
            y += sectionGap;
        }

        const color = colors[taskColorIdx % colors.length];
        const x1 = timeToX(task.start);
        const x2 = timeToX(task.end);
        const barW = Math.max(4, x2 - x1);

        // Task label
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", String(leftMargin - 8)); label.setAttribute("y", String(y + barH / 2 + 4));
        label.setAttribute("text-anchor", "end"); label.setAttribute("font-size", "11"); label.setAttribute("fill", "#1e293b");
        label.textContent = task.name; svg.appendChild(label);

        // Bar
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(x1)); rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(barW)); rect.setAttribute("height", String(barH));
        rect.setAttribute("rx", "3"); rect.setAttribute("fill", color); rect.setAttribute("opacity", "0.85");
        svg.appendChild(rect);

        y += barH + barGap;
        taskColorIdx++;
    }

    return svg;
}
