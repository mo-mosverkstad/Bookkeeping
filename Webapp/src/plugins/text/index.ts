import type { Plugin } from "../interface.ts";

export const textPlugin: Plugin = {
    type_id: "text",
    version: "1.0.0",
    parse(text: string): unknown { return text; },
    render(ast: unknown): HTMLElement {
        const span = document.createElement("span");
        span.textContent = ast as string;
        return span;
    },
};
