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

    // Manual test case
    inputElement.value = "-2*(3+5)*4e^x^2";
    buttonElement.click();
});
