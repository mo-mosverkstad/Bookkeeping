import { parseFlowchart } from "./flowchart/grammar.ts";
import { renderFlowchart } from "./flowchart/render.ts";
import { parseSequence } from "./sequence/grammar.ts";
import { renderSequenceDiagram } from "./sequence/render.ts";
import { parseClassDiagram } from "./class-diagram/grammar.ts";
import { renderClassDiagram } from "./class-diagram/render.ts";
import { parseStateDiagram } from "./state/grammar.ts";
import { renderStateDiagram } from "./state/render.ts";
import { parseERDiagram } from "./er/grammar.ts";
import { renderERDiagram } from "./er/render.ts";
import { parseGantt } from "./gantt/grammar.ts";
import { renderGantt } from "./gantt/render.ts";
import { parsePie, renderPie } from "./pie/render.ts";

export interface DiagramResult {
    type: string;
    ast: unknown;
    render(width?: number, height?: number): SVGElement;
}

export function parseDiagram(source: string): DiagramResult {
    const trimmed = source.trim();
    const firstLine = trimmed.split(/\r?\n/)[0].trim();

    if (/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)/.test(firstLine)) {
        const ast = parseFlowchart(trimmed);
        return { type: "flowchart", ast, render(w, h) { return renderFlowchart(ast, w, h); } };
    }

    if (firstLine === "sequenceDiagram" || firstLine.startsWith("sequenceDiagram")) {
        const ast = parseSequence(trimmed);
        return { type: "sequence", ast, render(w, h) { return renderSequenceDiagram(ast, w, h); } };
    }

    if (firstLine === "classDiagram" || firstLine.startsWith("classDiagram")) {
        const ast = parseClassDiagram(trimmed);
        return { type: "class", ast, render(w, h) { return renderClassDiagram(ast, w, h); } };
    }

    if (/^stateDiagram/.test(firstLine)) {
        const ast = parseStateDiagram(trimmed);
        return { type: "state", ast, render(w, h) { return renderStateDiagram(ast, w, h); } };
    }

    if (firstLine === "erDiagram" || firstLine.startsWith("erDiagram")) {
        const ast = parseERDiagram(trimmed);
        return { type: "er", ast, render(w, h) { return renderERDiagram(ast, w, h); } };
    }

    if (firstLine === "gantt" || firstLine.startsWith("gantt")) {
        const ast = parseGantt(trimmed);
        return { type: "gantt", ast, render(w, h) { return renderGantt(ast, w, h); } };
    }

    if (firstLine === "pie" || firstLine.startsWith("pie")) {
        const ast = parsePie(trimmed);
        return { type: "pie", ast, render(w, h) { return renderPie(ast, w, h); } };
    }

    throw new Error("Unknown diagram type. Supported: flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, gantt, pie");
}
