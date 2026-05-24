import type { Plugin } from "../interface.ts";
import { parsePhysics } from "./grammar.ts";
import { renderPhysics } from "./render.ts";
import type { PhysicsProgram } from "./types.ts";

export const physicsPlugin: Plugin = {
    type_id: "physics",
    version: "1.0.0",
    parse(text: string): unknown { return parsePhysics(text); },
    render(ast: unknown): HTMLElement { return renderPhysics(ast as PhysicsProgram); },
};
