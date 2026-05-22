import type { Plugin } from "../interface.ts";
import type { MathNode } from "./types.ts";
import { parser } from "./grammar.ts";
import { renderMath } from "./render.ts";

export const mathPlugin: Plugin = {
    type_id: "math",
    version: "2.0.0",
    parse(text: string): unknown { return parser.parse("Expression", text); },
    render(ast: unknown): HTMLElement { return renderMath(ast as MathNode); },
};
