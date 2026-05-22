import { parser } from "./parser/grammar.ts";
import { renderMath } from "./render/render.ts";
import type { ASTNode } from "./parser/types.ts";

window.addEventListener("load", function () {
    const inputElement = document.getElementById("input") as HTMLInputElement | null;
    const resultElement = document.getElementById("result");
    const errorElement = document.getElementById("error-message");
    const buttonElement = document.getElementById("render");

    if (!inputElement || !resultElement || !buttonElement || !errorElement) {
        throw new Error("Missing DOM elements");
    }

    buttonElement.addEventListener("click", function () {
        const parseInput = inputElement.value;
        try {
            const ast = parser.parse("Expression", parseInput);
            console.log(JSON.stringify(ast, null, 2));
            resultElement.innerHTML = "";
            resultElement.appendChild(renderMath(ast as ASTNode));
            errorElement.innerText = "";
        } catch (e) {
            errorElement.innerText = (e as Error).message;
            resultElement.innerHTML = "";
        }
    });

    const testCases = [
        // Phase 1 regression cases
        "-2*(3+5)*4e^x^2",
        "a/b + c/d",
        "\\int{0, 1, x^2}",
        "\\sqrt{x+1}",
        "`1T / `1t",
        "\\a + \\1b",
        // Phase 2 cases
        "[a]",
        "[[a, b], [c, d]]",
        "(a, b, c)",
        "A[k]",
        "u.v",
        "+{k=0, n, A[k]}",
        "*{k=0, n, A[k]}",
        "x_i^2",
        "a <= b",
        "x != y",
        "x \\in \\\\R",
        "\\ha_0",
        "n!",
        "f'(x)",
        "f''(x)",
        "|x|",
        "[a_1, ..., a_n]",
        "\\floor{x+1}",
        "\\ceil{x}",
        "\\bar{x}",
        "\\hat{x}",
        "\\inner{x, y}",
        "\\binom{n, r}",
        "\\S{k=0, n, k^2}",
        "\\lim{x->0, f(x)}",
    ];
    let testIndex = 0;
    inputElement.value = testCases[testIndex];
    buttonElement.click();
    (window as any).__nextTest = () => {
        testIndex = (testIndex + 1) % testCases.length;
        inputElement.value = testCases[testIndex];
        buttonElement.click();
    };
});
