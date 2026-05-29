import type { GanttAST, GanttSection, GanttTask } from "./types.ts";

export function parseGantt(source: string): GanttAST {
    const lines = source.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    if (lines[0] !== "gantt") throw new Error("Expected 'gantt' keyword");

    let title = "", dateFormat = "YYYY-MM-DD";
    const sections: GanttSection[] = [];
    let currentSection: GanttSection = { name: "Default", tasks: [] };

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("title ")) { title = line.slice(6).trim(); continue; }
        if (line.startsWith("dateFormat ")) { dateFormat = line.slice(11).trim(); continue; }
        if (line.startsWith("section ")) {
            if (currentSection.tasks.length > 0) sections.push(currentSection);
            currentSection = { name: line.slice(8).trim(), tasks: [] };
            continue;
        }
        // Task: Name :id, start, duration
        const m = line.match(/^(.+?)\s*:([\w]*),?\s*(.+?),\s*(.+)$/);
        if (m) {
            currentSection.tasks.push({ name: m[1], id: m[2] || "", start: m[3].trim(), duration: m[4].trim() });
        }
    }
    if (currentSection.tasks.length > 0) sections.push(currentSection);
    return { title, dateFormat, sections };
}
