import { AppController } from "./controller/index.ts";
import { TableView } from "./view/table-view.ts";
import { GraphFilterView } from "./view/graph-filter-view.ts";
import { SearchView } from "./view/search-view.ts";
import { FlowDiagramView } from "./view/flow-diagram-view.ts";
import { saveSession, loadSession } from "./view/session.ts";
import { parseCSV } from "./data/csv.ts";
import type { ControlFile, ControlEntry } from "./data/control.ts";

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

    // ── Diagram tab management ────────────────────────────────────────────────

    /**
     * Active diagram view — non-null when a diagram tab is selected.
     * Null when a table tab is selected.
     */
    let activeDiagramView: FlowDiagramView | null = null;

    /**
     * Render the tab strip from a ControlFile, wiring both table tabs and
     * diagram tabs. Table tabs delegate to tableView; diagram tabs mount a
     * FlowDiagramView into tableContainer.
     *
     * TableView.renderAll() normally rebuilds the tab strip itself — we
     * suppress that by passing an external tabStrip owner flag and rendering
     * only the table body, not the tabs.
     */
    function renderControlTabs(controlFile: ControlFile): void {
        tabStrip.innerHTML = "";
        let firstTab = true;

        function activateEntry(entry: ControlEntry, tab: HTMLButtonElement): void {
            // Deactivate all tabs
            tabStrip.querySelectorAll(".tab-btn").forEach(t => t.classList.remove("tab-active"));
            tab.classList.add("tab-active");

            // Unmount any active diagram view
            if (activeDiagramView) {
                activeDiagramView.unmount();
                activeDiagramView = null;
            }

            if (entry.view === "table") {
                // Render only the table body — do NOT let TableView touch the tab strip
                tableContainer.innerHTML = "";
                const tableIdx = controller.getLoadedFileNames().indexOf(
                    (entry as { file: string }).file.replace(/\.csv$/, "")
                );
                if (tableIdx >= 0) {
                    tableView.renderTable(tableIdx);
                }
            } else {
                // Show a diagram view
                tableContainer.innerHTML = "";

                const diagrams = controller.getDiagrams();
                const diagram = diagrams.find(d => d.entry.id === entry.id);
                if (!diagram) {
                    tableContainer.textContent = `No diagram data for "${entry.id}"`;
                    return;
                }

                activeDiagramView = new FlowDiagramView(entry.view as string);
                activeDiagramView.mount(tableContainer, { diagram });
                statusText.textContent = `Diagram: ${entry.id}`;
            }
        }

        controlFile.entries.forEach((entry: ControlEntry) => {
            const tab = document.createElement("button");
            tab.className = "tab-btn";
            tab.textContent = entry.id;
            tab.addEventListener("click", () => activateEntry(entry, tab));
            tabStrip.appendChild(tab);

            if (firstTab) {
                firstTab = false;
                activateEntry(entry, tab);
                tab.classList.add("tab-active");
            }
        });
    }

    // ── File loading ──────────────────────────────────────────────────────────

    /**
     * Read all dropped/selected files as text, then process them together.
     * If a control.json is present, use it to drive tab creation and diagram
     * resolution. Otherwise fall back to loading all CSVs as plain tables.
     */
    function loadFiles(files: File[]): void {
        const reads: Promise<{ name: string; text: string }>[] = files.map(
            file => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve({ name: file.name, text: reader.result as string });
                reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
                reader.readAsText(file);
            })
        );

        Promise.all(reads).then(results => {
            try {
                const controlResult = results.find(r => r.name === "control.json");
                const csvResults = results.filter(r => r.name.endsWith(".csv"));

                if (controlResult) {
                    // Phase 12 path: control.json present
                    const controlFile = controller.loadControlFile(controlResult.text);

                    // Build a map of filename → parsed CSV for diagram resolution
                    const csvMap = new Map<string, { headers: string[]; types: string[]; rows: string[][] }>();
                    for (const { name, text } of csvResults) {
                        csvMap.set(name, parseCSV(text));
                    }

                    // Load only the CSV files referenced by table entries
                    for (const entry of controlFile.entries) {
                        if (entry.view === "table") {
                            const file = (entry as { file: string }).file;
                            const parsed = csvMap.get(file);
                            if (parsed) {
                                controller.loadCSV(file, csvResults.find(r => r.name === file)!.text);
                            }
                        }
                    }

                    // Resolve diagram declarations
                    controller.resolveAllDiagrams(controlFile, csvMap);

                    // Build tab strip from control file
                    renderControlTabs(controlFile);

                    errorEl.textContent = "";
                    statusText.textContent = `Loaded control.json with ${controlFile.entries.length} entries`;
                    saveSession(controller.getLoadedFileNames());

                } else {
                    // Fallback path: no control.json — load all CSVs as plain tables
                    for (const { name, text } of csvResults) {
                        controller.loadCSV(name, text);
                    }
                    errorEl.textContent = "";
                    statusText.textContent = `Loaded: ${csvResults.map(r => r.name).join(", ")}`;
                    saveSession(controller.getLoadedFileNames());
                }
            } catch (e) {
                errorEl.textContent = (e as Error).message;
            }
        }).catch(e => {
            errorEl.textContent = (e as Error).message;
        });
    }

    fileInput.addEventListener("change", () => {
        if (fileInput.files) loadFiles(Array.from(fileInput.files));
    });

    workspace.addEventListener("dragover", (e) => { e.preventDefault(); workspace.classList.add("drag-over"); });
    workspace.addEventListener("dragleave", () => workspace.classList.remove("drag-over"));
    workspace.addEventListener("drop", (e) => {
        e.preventDefault(); workspace.classList.remove("drag-over");
        if (e.dataTransfer?.files) loadFiles(Array.from(e.dataTransfer.files));
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
