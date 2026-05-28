import type { CellRenderer } from "../interface.ts";
import type { MathNode } from "./types.ts";
import { parser } from "./grammar.ts";
import { renderMath } from "./render.ts";

export const mathPlugin: CellRenderer = {
    type_id: "math",
    version: "2.0.0",
    parse(text: string): unknown { return parser.parse("Expression", text); },
    render(ast: unknown): HTMLElement { return renderMath(ast as MathNode); },
};
