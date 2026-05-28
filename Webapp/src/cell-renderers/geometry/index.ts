import type { CellRenderer } from "../interface.ts";
import { parseGeometry } from "./grammar.ts";
import { renderGeometry } from "./render.ts";
import type { GeometryProgram } from "./types.ts";

export const geometryPlugin: CellRenderer = {
    type_id: "geometry",
    version: "1.0.0",
    parse(text: string): unknown { return parseGeometry(text); },
    render(ast: unknown): HTMLElement { return renderGeometry(ast as GeometryProgram); },
};
