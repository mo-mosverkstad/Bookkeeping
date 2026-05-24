import { AppController } from "./controller/index.ts";
import { TableView } from "./view/table-view.ts";
import { GraphFilterView } from "./view/graph-filter-view.ts";
import { SearchView } from "./view/search-view.ts";
import { saveSession, loadSession } from "./view/session.ts";

window.addEventListener("load", () => {
    const sourceInput     = document.getElementById("cell-source-input") as HTMLTextAreaElement;
    const errorEl         = document.getElementById("error-message")!;
    const fileInput       = document.getElementById("file-input") as HTMLInputElement;
    const workspace       = document.getElementById("workspace")!;
    const tableContainer  = document.getElementById("table-container")!;
    const tabStrip        = document.getElementById("tab-strip")!;
    const graphFilterContainer = document.getElementById("graph-filter-container")!;
    const searchContainer = document.getElementById("search-container")!;
    const sessionBanner   = document.getElementById("session-banner") as HTMLElement;
    const btnAddRow       = document.getElementById("btn-add-row")!;
    const btnExport       = document.getElementById("btn-export-csv")!;
    const statusText      = document.getElementById("status-text")!;

    // ── MVC wiring ────────────────────────────────────────────────────────────
    const controller = new AppController();

    const tableView = new TableView(tableContainer, tabStrip, sourceInput);
    const graphFilterView = new GraphFilterView(graphFilterContainer, controller);
    const searchView = new SearchView(searchContainer, controller);

    controller.setTableView(tableView);
    controller.setGraphFilterView(graphFilterView);
    tableView.setController(controller);
    tableView.setStatusCallback((msg) => { statusText.textContent = msg; });

    tableView.setEntityClickHandler((entityId) => {
        graphFilterView.showEntityAssociations(entityId);
        searchView.showNeighbourhood(entityId);
    });

    document.addEventListener("click", (e) => {
        // Do not cancel when clicking inside the formula bar
        if (sourceInput.contains(e.target as Node)) return;
        tableView.cancelActive();
    });

    // ── Undo / Redo ───────────────────────────────────────────────────────────
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
            e.preventDefault(); controller.undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
            e.preventDefault(); controller.redo();
        }
    });

    // ── Toolbar ───────────────────────────────────────────────────────────────
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
        sessionBanner.addEventListener("click", (e) => {
            if ((e.target as HTMLElement).id === "dismiss-session") {
                e.stopPropagation();
                sessionBanner.hidden = true;
            }
        });
    }
});
