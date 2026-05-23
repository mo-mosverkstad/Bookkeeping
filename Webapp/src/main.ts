import { AppController } from "./controller/index.ts";
import { TableView } from "./view/table-view.ts";
import { GraphFilterView } from "./view/graph-filter-view.ts";
import { mathPlugin } from "./plugins/math/index.ts";
import type { MathNode } from "./plugins/math/types.ts";
import { renderMath } from "./plugins/math/render.ts";

window.addEventListener("load", () => {
    const input = document.getElementById("input") as HTMLInputElement;
    const button = document.getElementById("render")!;
    const result = document.getElementById("result")!;
    const errorEl = document.getElementById("error-message")!;
    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    const tableContainer = document.getElementById("table-container")!;
    const editBar = document.getElementById("cell-edit-bar") as HTMLElement;
    const editPreview = document.getElementById("cell-edit-preview") as HTMLElement;

    // ── MVC wiring ───────────────────────────────────────────────────────────
    const controller = new AppController();

    // View: table area (below filter)
    const tableArea = document.createElement("div");
    tableArea.id = "table-area";
    tableContainer.appendChild(tableArea);

    const tableView = new TableView(tableArea, editBar, editPreview);
    const graphFilterView = new GraphFilterView(tableContainer, controller);

    // Move table area after filter (filter was appended first)
    tableContainer.appendChild(tableArea);

    controller.setTableView(tableView);
    controller.setGraphFilterView(graphFilterView);
    tableView.setController(controller);

    // Entity click → show associations
    tableView.setEntityClickHandler((entityId) => graphFilterView.showEntityAssociations(entityId));

    // Cancel active cell edit when clicking outside the table area
    document.addEventListener("click", () => tableView.cancelActive());

    // ── Undo / Redo ──────────────────────────────────────────────────────────
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
            e.preventDefault();
            controller.undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
            e.preventDefault();
            controller.redo();
        }
    });

    // ── File loading ─────────────────────────────────────────────────────────
    function loadFile(file: File) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                controller.loadCSV(file.name, reader.result as string);
                errorEl.textContent = "";
            } catch (e) { errorEl.textContent = (e as Error).message; }
        };
        reader.readAsText(file);
    }

    fileInput.addEventListener("change", () => {
        const files = fileInput.files;
        if (files) for (let i = 0; i < files.length; i++) loadFile(files[i]);
    });

    tableContainer.addEventListener("dragover", (e) => { e.preventDefault(); tableContainer.classList.add("drag-over"); });
    tableContainer.addEventListener("dragleave", () => { tableContainer.classList.remove("drag-over"); });
    tableContainer.addEventListener("drop", (e) => {
        e.preventDefault(); tableContainer.classList.remove("drag-over");
        const files = e.dataTransfer?.files;
        if (files) for (let i = 0; i < files.length; i++) loadFile(files[i]);
    });

    // ── Expression renderer ──────────────────────────────────────────────────
    button.addEventListener("click", () => {
        try {
            const ast = mathPlugin.parse(input.value) as MathNode;
            console.log(JSON.stringify(ast, null, 2));
            result.innerHTML = "";
            result.appendChild(renderMath(ast));
            errorEl.textContent = "";
        } catch (e) { errorEl.textContent = (e as Error).message; result.innerHTML = ""; }
    });

    // ── Demo test cases ──────────────────────────────────────────────────────
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
