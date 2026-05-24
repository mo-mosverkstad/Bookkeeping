import type { Plugin } from "../interface.ts";
import { parseChemistry } from "./grammar.ts";
import { renderChemistry } from "./render.ts";
import type { ChemistryProgram } from "./types.ts";

export const chemistryPlugin: Plugin = {
    type_id: "chemistry",
    version: "1.0.0",
    parse(text: string): unknown { return parseChemistry(text); },
    render(ast: unknown): HTMLElement { return renderChemistry(ast as ChemistryProgram); },
};
