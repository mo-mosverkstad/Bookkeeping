import { initExpressionInput } from "./ui/expression-input.ts";
import { initFileLoader } from "./ui/file-loader.ts";

window.addEventListener("load", () => {
    const input = document.getElementById("input") as HTMLInputElement;
    const button = document.getElementById("render")!;
    const result = document.getElementById("result")!;
    const errorEl = document.getElementById("error-message")!;
    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    const tableContainer = document.getElementById("table-container")!;

    initExpressionInput(input, button, result, errorEl);
    initFileLoader(fileInput, tableContainer, errorEl);

    // Demo test cases
    const testCases = [
        "-2*(3+5)*4e^x^2", "a/b + c/d", "\\int{0, 1, x^2}", "\\sqrt{x+1}",
        "`1T / `1t", "\\a + \\1b", "[a]", "[[a, b], [c, d]]", "(a, b, c)",
        "A[k]", "u.v", "+{k=0, n, A[k]}", "*{k=0, n, A[k]}", "x_i^2",
        "a <= b", "x != y", "x \\in \\\\R", "\\ha_0", "n!", "f'(x)", "f''(x)",
        "|x|", "[a_1, ..., a_n]", "\\floor{x+1}", "\\ceil{x}", "\\bar{x}",
        "\\hat{x}", "\\inner{x, y}", "\\binom{n, r}", "\\S{k=0, n, k^2}",
        "\\lim{x->0, f(x)}",
    ];
    let idx = 0;
    input.value = testCases[0];
    button.click();
    (window as any).__nextTest = () => { idx = (idx + 1) % testCases.length; input.value = testCases[idx]; button.click(); };
});
