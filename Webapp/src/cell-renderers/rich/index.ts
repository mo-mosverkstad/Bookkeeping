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

// Match: math`...`, chem`...`, geom`...`, phys`...`
const EMBED_RE = /\b(math|chem|geom|phys)`([^`]*)`/g;

function parseLine(line: string): RichLine {
    const spans: RichLine = [];
    let lastIndex = 0;

    EMBED_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = EMBED_RE.exec(line)) !== null) {
        // Text before this embedding
        if (match.index > lastIndex) {
            spans.push({ kind: "text", value: line.slice(lastIndex, match.index) });
        }

        const tag = match[1];
        const content = match[2];

        try {
            switch (tag) {
                case "math": {
                    const ast = mathParser.parse("Expression", content) as MathNode;
                    spans.push({ kind: "math", ast });
                    break;
                }
                case "chem": {
                    const ast = parseChemistry(content) as ChemistryProgram;
                    spans.push({ kind: "chemistry", ast });
                    break;
                }
                case "geom": {
                    const ast = parseGeometry(content) as GeometryProgram;
                    spans.push({ kind: "geometry", ast });
                    break;
                }
                case "phys": {
                    const ast = parsePhysics(content) as PhysicsProgram;
                    spans.push({ kind: "physics", ast });
                    break;
                }
            }
        } catch (e) {
            spans.push({ kind: "error", tag, content, message: (e as Error).message });
        }

        lastIndex = match.index + match[0].length;
    }

    // Remaining text after last embedding
    if (lastIndex < line.length) {
        spans.push({ kind: "text", value: line.slice(lastIndex) });
    }

    // If no spans at all (empty line), push empty text
    if (spans.length === 0) {
        spans.push({ kind: "text", value: "" });
    }

    return spans;
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

export const richPlugin: CellRenderer = {
    type_id: "rich",
    version: "2.0.0",
    parse(text: string): unknown {
        return text.split(/\r?\n/).map(parseLine);
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
