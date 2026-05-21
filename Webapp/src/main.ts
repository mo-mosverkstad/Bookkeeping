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

    // Phase 1 manual test cases — cycle through with console
    const testCases = [
        // TC-01 to TC-10: original cases
        "-2*(3+5)*4e^x^2",
        "a/b + c/d",
        "\\int{0, 1, x^2}",
        "\\sqrt{x+1}",
        "`1T / `1t",
        "\\a + \\1b",
        // TC-19: integral with compound body
        "\\int{0, \\p, \\s*x^2 + 2x - 1}",
        // TC-20: nested fractions
        "(a/b) / (c/d)",
        // TC-21: chained power with coefficients
        "2x^3 + 3x^2 - x + 1",
        // TC-22: function call inside integral
        "\\int{-1, 1, f(x)*g(x)}",
        // TC-23: subscript with expression body
        "x_i + x_j + x_k",
        // TC-24: mixed Greek and Latin in formula
        "\\a*x^2 + \\b*x + \\g",
        // TC-25: deeply nested power
        "a^b^c^d",
        // TC-26: unary chain
        "--x + -y",
        // TC-27: implicit multiplication chain
        "2\\p r^2",
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
