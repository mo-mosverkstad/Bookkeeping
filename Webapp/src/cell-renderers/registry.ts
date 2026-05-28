import type { CellRenderer } from "./interface.ts";
import { mathPlugin } from "./math/index.ts";
import { textPlugin } from "./text/index.ts";
import { geometryPlugin } from "./geometry/index.ts";
import { physicsPlugin } from "./physics/index.ts";
import { chemistryPlugin } from "./chemistry/index.ts";

function escapeHTML(message: string): string {
    return message.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/\n/g, "<br>")
        .replace(/ /g, "&nbsp;");
}

const renderers: Record<string, CellRenderer> = {
    math: mathPlugin,
    text: textPlugin,
    geometry: geometryPlugin,
    physics: physicsPlugin,
    chemistry: chemistryPlugin,
};

export function getPlugin(typeId: string): CellRenderer {
    return renderers[typeId] ?? textPlugin;
}

export function renderCell(typeId: string, text: string): HTMLElement {
    const renderer = getPlugin(typeId);
    try {
        const ast = renderer.parse(text);
        return renderer.render(ast);
    } catch (e) {
        const span = document.createElement("span");
        span.className = "cell-error";
        span.innerHTML = `<strong>Parse error:</strong> ${escapeHTML((e as Error).message)}`;
        return span;
    }
}
