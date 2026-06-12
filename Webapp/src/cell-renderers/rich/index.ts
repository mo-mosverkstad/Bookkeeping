import type { CellRenderer } from "../interface.ts";
import { parser as mathParser } from "../math/grammar.ts";
import { renderMath } from "../math/render.ts";
import { parseChemistry } from "../chemistry/grammar.ts";
import { renderChemistry } from "../chemistry/render.ts";
import { parseGeometry } from "../geometry/grammar.ts";
import { renderGeometry } from "../geometry/render.ts";
import { parsePhysics } from "../physics/grammar.ts";
import { renderPhysics } from "../physics/render.ts";
import type { MathNode } from "../math/types.ts";
import type { ChemistryProgram } from "../chemistry/types.ts";
import type { GeometryProgram } from "../geometry/types.ts";
import type { PhysicsProgram } from "../physics/types.ts";

type RichSpan =
    | { kind: "math"; ast: MathNode }
    | { kind: "chemistry"; ast: ChemistryProgram }
    | { kind: "geometry"; ast: GeometryProgram }
    | { kind: "physics"; ast: PhysicsProgram }
    | { kind: "text"; value: string }
    | { kind: "error"; tag: string; content: string; message: string };

type RichLine = RichSpan[];

// Match: $math{...}, $chem{...}, $geom{...}, $phys{...} with balanced braces
const EMBED_START = /\$(math|chem|geom|phys)\{/g;

function extractBalancedBraces(str: string, start: number): { content: string; end: number } | null {
    // start points to the char after the opening {
    let depth = 1;
    let i = start;
    while (i < str.length && depth > 0) {
        if (str[i] === "{") depth++;
        else if (str[i] === "}") depth--;
        if (depth > 0) i++;
    }
    if (depth !== 0) return null;
    return { content: str.slice(start, i), end: i + 1 };
}

function renderSpan(span: RichSpan): HTMLElement {
    switch (span.kind) {
        case "math": return renderMath(span.ast);
        case "chemistry": return renderChemistry(span.ast);
        case "geometry": return renderGeometry(span.ast);
        case "physics": return renderPhysics(span.ast);
        case "error": {
            const el = document.createElement("pre");
            el.className = "cell-error";
            el.textContent = span.message;
            return el;
        }
        case "text": {
            const el = document.createElement("span");
            el.className = "rich-text";
            el.textContent = span.value;
            return el;
        }
    }
}

function parseRich(text: string): RichLine[] {
    const spans: RichSpan[] = [];
    let lastIndex = 0;

    EMBED_START.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = EMBED_START.exec(text)) !== null) {
        const braceStart = match.index + match[0].length;
        const result = extractBalancedBraces(text, braceStart);
        if (!result) break;

        if (match.index > lastIndex) {
            spans.push({ kind: "text", value: text.slice(lastIndex, match.index) });
        }

        const tag = match[1];
        const content = result.content;

        try {
            switch (tag) {
                case "math": {
                    const ast = mathParser.parse("Expression", content.replace(/\n/g, " ")) as MathNode;
                    spans.push({ kind: "math", ast });
                    break;
                }
                case "chem": {
                    const ast = parseChemistry(content.replace(/\n/g, " ")) as ChemistryProgram;
                    spans.push({ kind: "chemistry", ast });
                    break;
                }
                case "geom": {
                    const ast = parseGeometry(content.replace(/\n/g, " ")) as GeometryProgram;
                    spans.push({ kind: "geometry", ast });
                    break;
                }
                case "phys": {
                    const ast = parsePhysics(content.replace(/\n/g, " ")) as PhysicsProgram;
                    spans.push({ kind: "physics", ast });
                    break;
                }
            }
        } catch (e) {
            spans.push({ kind: "error", tag, content, message: (e as Error).message });
        }

        lastIndex = result.end;
        EMBED_START.lastIndex = result.end;
    }

    if (lastIndex < text.length) {
        spans.push({ kind: "text", value: text.slice(lastIndex) });
    }

    if (spans.length === 0) {
        spans.push({ kind: "text", value: "" });
    }

    // Split into lines: only newlines in "text" spans produce line breaks
    const lines: RichLine[] = [[]];
    for (const span of spans) {
        if (span.kind === "text") {
            const parts = span.value.split(/\r?\n/);
            for (let i = 0; i < parts.length; i++) {
                if (i > 0) lines.push([]);
                if (parts[i]) lines[lines.length - 1].push({ kind: "text", value: parts[i] });
            }
        } else {
            lines[lines.length - 1].push(span);
        }
    }

    return lines;
}

export const richPlugin: CellRenderer = {
    type_id: "rich",
    version: "2.0.0",
    parse(text: string): unknown {
        return parseRich(text);
    },
    render(ast: unknown): HTMLElement {
        const lines = ast as RichLine[];
        const container = document.createElement("div");
        container.className = "rich-cell";
        for (let i = 0; i < lines.length; i++) {
            for (const span of lines[i]) {
                container.appendChild(renderSpan(span));
            }
            if (i < lines.length - 1) {
                container.appendChild(document.createElement("br"));
            }
        }
        return container;
    },
};
