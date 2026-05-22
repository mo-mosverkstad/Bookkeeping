import { mathPlugin } from "../plugins/math/index.ts";
import type { MathNode } from "../plugins/math/types.ts";
import { renderMath } from "../plugins/math/render.ts";

export function initExpressionInput(
    input: HTMLInputElement,
    button: HTMLElement,
    result: HTMLElement,
    errorEl: HTMLElement,
): void {
    button.addEventListener("click", () => {
        try {
            const ast = mathPlugin.parse(input.value) as MathNode;
            console.log(JSON.stringify(ast, null, 2));
            result.innerHTML = "";
            result.appendChild(renderMath(ast));
            errorEl.textContent = "";
        } catch (e) { errorEl.textContent = (e as Error).message; result.innerHTML = ""; }
    });
}
