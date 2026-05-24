import { AppController } from "./controller/index.ts";
import { TableView } from "./view/table-view.ts";
import { GraphFilterView } from "./view/graph-filter-view.ts";
import { SearchView } from "./view/search-view.ts";
import { mathPlugin } from "./plugins/math/index.ts";
import type { MathNode } from "./plugins/math/types.ts";
import { renderMath } from "./plugins/math/render.ts";
import { saveSession, loadSession } from "./view/session.ts";

window.addEventListener("load", () => {
    const input = document.getElementById("input") as HTMLInputElement;
    const renderBtn = document.getElementById("render")!;
    const result = document.getElementById("result")!;
    const errorEl = document.getElementById("error-message")!;
    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    const workspace = document.getElementById("workspace")!;
    const tableContainer = document.getElementById("table-container")!;
    const tabStrip = document.getElementById("tab-strip")!;
    const graphFilterContainer = document.getElementById("graph-filter-container")!;
    const searchContainer = document.getElementById("search-container")!;
    const sessionBanner = document.getElementById("session-banner") as HTMLElement;
    const editBar = document.getElementById("cell-edit-bar") as HTMLElement;
    const editPreview = document.getElementById("cell-edit-preview") as HTMLElement;
    const btnAddRow = document.getElementById("btn-add-row")!;
    const btnExport = document.getElementById("btn-export-csv")!;
    const statusText = document.getElementById("status-text")!;

    // ── MVC wiring ────────────────────────────────────────────────────────────
    const controller = new AppController();

    const tableView = new TableView(tableContainer, tabStrip, editBar, editPreview);
    const graphFilterView = new GraphFilterView(graphFilterContainer, controller);
    const searchView = new SearchView(searchContainer, controller);

    controller.setTableView(tableView);
    controller.setGraphFilterView(graphFilterView);
    tableView.setController(controller);

    tableView.setEntityClickHandler((entityId) => {
        graphFilterView.showEntityAssociations(entityId);
        searchView.showNeighbourhood(entityId);
    });

    tableView.setStatusCallback((msg) => { statusText.textContent = msg; });

    // ── Toolbar: add row / export ─────────────────────────────────────────────
    btnAddRow.addEventListener("click", () => {
        const idx = tableView.getActiveTableIdx();
        if (idx >= 0) controller.addRow(idx);
    });
    btnExport.addEventListener("click", () => {
        const idx = tableView.getActiveTableIdx();
        if (idx < 0) return;
        const csv = controller.exportCSV(idx);
        const name = controller.getLoadedFileNames()[idx] ?? "table";
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${name}.csv`; a.click();
        URL.revokeObjectURL(url);
    });

    // ── Cancel active cell edit when clicking outside ─────────────────────────
    document.addEventListener("click", () => tableView.cancelActive());

    // ── Undo / Redo ───────────────────────────────────────────────────────────
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
            e.preventDefault(); controller.undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
            e.preventDefault(); controller.redo();
        }
    });

    // ── File loading ──────────────────────────────────────────────────────────
    function loadFile(file: File) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                controller.loadCSV(file.name, reader.result as string);
                errorEl.textContent = "";
                statusText.textContent = `Loaded: ${file.name}`;
                saveSession(controller.getLoadedFileNames());
            } catch (e) { errorEl.textContent = (e as Error).message; }
        };
        reader.readAsText(file);
    }

    fileInput.addEventListener("change", () => {
        if (fileInput.files) for (const f of Array.from(fileInput.files)) loadFile(f);
    });

    workspace.addEventListener("dragover", (e) => { e.preventDefault(); workspace.classList.add("drag-over"); });
    workspace.addEventListener("dragleave", () => workspace.classList.remove("drag-over"));
    workspace.addEventListener("drop", (e) => {
        e.preventDefault(); workspace.classList.remove("drag-over");
        if (e.dataTransfer?.files) for (const f of Array.from(e.dataTransfer.files)) loadFile(f);
    });

    // ── Session restore ───────────────────────────────────────────────────────
    const session = loadSession();
    if (session && session.fileNames.length > 0) {
        sessionBanner.hidden = false;
        sessionBanner.innerHTML =
            `<span>Last session: <strong>${session.fileNames.join(", ")}</strong></span>` +
            `<button id="dismiss-session">✕</button>`;
        document.getElementById("dismiss-session")?.addEventListener("click", () => {
            sessionBanner.hidden = true;
        });
    }

    // ── Expression renderer ───────────────────────────────────────────────────
    renderBtn.addEventListener("click", () => {
        try {
            const ast = mathPlugin.parse(input.value) as MathNode;
            result.innerHTML = "";
            result.appendChild(renderMath(ast));
            errorEl.textContent = "";
        } catch (e) { errorEl.textContent = (e as Error).message; result.innerHTML = ""; }
    });

    // ── Demo test cases ───────────────────────────────────────────────────────
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
    renderBtn.click();
    (window as any).__nextTest = () => { idx = (idx + 1) % testCases.length; input.value = testCases[idx]; renderBtn.click(); };
});
