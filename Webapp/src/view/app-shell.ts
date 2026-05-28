/**
 * AppShell — owns all application-level event wiring and file loading.
 */

import { AppController } from "../controller/index.ts";
import { WorkspaceController } from "./workspace-controller.ts";
import { viewFactory } from "./workspace-view.ts";
import type { WorkspaceView } from "./workspace-view.ts";
import { SourceEditorView } from "./source-editor-view.ts";
import { saveSession, loadSession } from "./session.ts";
import { parseCSV } from "../data/csv.ts";
import type { ControlFile } from "../data/control.ts";

export class AppShell {
    private readonly controller: AppController;
    private readonly workspace: WorkspaceController;
    private readonly sourceEditor: SourceEditorView;
    private readonly elements: {
        fileInput: HTMLInputElement;
        workspaceEl: HTMLElement;
        errorEl: HTMLElement;
        sessionBanner: HTMLElement;
        dynamicToolbar: HTMLElement;
        btnExport: HTMLElement;
        btnToggleSidebar: HTMLElement;
        sidebarEl: HTMLElement;
        statusText: HTMLElement;
    };

    constructor(
        controller: AppController,
        workspace: WorkspaceController,
        sourceEditor: SourceEditorView,
        elements: {
            fileInput: HTMLInputElement;
            workspaceEl: HTMLElement;
            errorEl: HTMLElement;
            sessionBanner: HTMLElement;
            dynamicToolbar: HTMLElement;
            btnExport: HTMLElement;
            btnToggleSidebar: HTMLElement;
            sidebarEl: HTMLElement;
            statusText: HTMLElement;
        },
    ) {
        this.controller = controller;
        this.workspace = workspace;
        this.sourceEditor = sourceEditor;
        this.elements = elements;
    }

    init(): void {
        this.wireKeyboard();
        this.wireStaticToolbar();
        this.wireDynamicToolbar();
        this.wireSidebar();
        this.wireFileLoading();
        this.wireSessionBanner();
        this.elements.fileInput.setAttribute("accept", ".csv,.json,.graph.json");
    }

    // ── Keyboard ──────────────────────────────────────────────────────────────

    private wireKeyboard(): void {
        document.addEventListener("keydown", (e) => {
            // Source editor handles Ctrl+Z/Y in capture phase when focused
            if (this.sourceEditor.focused) return;
            if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
                e.preventDefault();
                this.controller.undo();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
                e.preventDefault();
                this.controller.redo();
            } else if (e.key === "Escape") {
                // Escape clears row selection (source editor not focused — guarded above)
                this.workspace.getActiveTableView()?.clearSelection();
            }
        });

        // Cancel active cell edit when clicking outside the workspace and sidebar
        document.addEventListener("click", (e) => {
            const target = e.target as Node;
            // Don't cancel if clicking inside the sidebar (source editor)
            if (this.elements.sidebarEl.contains(target)) return;
            this.workspace.getActiveTableView()?.cancelActive();
        });
    }

    // ── Static toolbar ────────────────────────────────────────────────────────

    private wireStaticToolbar(): void {
        this.elements.btnExport.addEventListener("click", () => {
            const tv = this.workspace.getActiveTableView();
            if (!tv) return;
            const idx = tv.getActiveTableIdx();
            const csv = this.controller.exportCSV(idx);
            const name = this.controller.getLoadedFileNames()[idx] ?? "table";
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `${name}.csv`; a.click();
            URL.revokeObjectURL(url);
        });
    }

    // ── Dynamic toolbar ───────────────────────────────────────────────────────

    private wireDynamicToolbar(): void {
        this.workspace.setToolbarChangeHandler((actions, view) => {
            const rebuild = () => {
                const el = this.elements.dynamicToolbar;
                el.innerHTML = "";
                for (const action of view.getToolbarActions()) {
                    const btn = document.createElement("button");
                    btn.id = `dyn-${action.id}`;
                    btn.textContent = action.label;
                    if (action.title) btn.title = action.title;
                    if (action.disabled) btn.disabled = true;
                    btn.addEventListener("click", () => {
                        view.onToolbarAction(action.id);
                        rebuild();
                    });
                    el.appendChild(btn);
                }
            };
            rebuild();
        });
    }

    // ── Sidebar toggle ────────────────────────────────────────────────────────

    private wireSidebar(): void {
        const btn = this.elements.btnToggleSidebar;
        const sidebar = this.elements.sidebarEl;

        // Sidebar starts open — mark button as open
        btn.classList.add("sidebar-open");

        btn.addEventListener("click", () => {
            const collapsed = sidebar.classList.toggle("sidebar-collapsed");
            btn.classList.toggle("sidebar-open", !collapsed);
            btn.textContent = collapsed ? "\u25B6 Editor" : "\u25C0 Editor";
        });
    }

    // ── File loading ──────────────────────────────────────────────────────────

    private wireFileLoading(): void {
        this.elements.fileInput.addEventListener("change", () => {
            if (this.elements.fileInput.files)
                this.loadFiles(Array.from(this.elements.fileInput.files));
        });

        const ws = this.elements.workspaceEl;
        ws.addEventListener("dragover", (e) => {
            // Only show the file-drop highlight when the drag carries actual files
            if (!e.dataTransfer?.types.includes("Files")) return;
            e.preventDefault();
            ws.classList.add("drag-over");
        });
        ws.addEventListener("dragleave", () => ws.classList.remove("drag-over"));
        ws.addEventListener("drop", (e) => {
            ws.classList.remove("drag-over");
            // Ignore row-reorder drags and any drop that carries no files
            if (!e.dataTransfer?.files.length) return;
            e.preventDefault();
            this.loadFiles(Array.from(e.dataTransfer.files));
        });
    }

    private loadFiles(files: File[]): void {
        const reads = files.map(file => new Promise<{ name: string; text: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, text: reader.result as string });
            reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
            reader.readAsText(file);
        }));

        Promise.all(reads).then(results => {
            try {
                this.controller.getKnowledgeBase().clear();
                this.workspace.clear();

                const controlResult = results.find(r => r.name === "control.json");
                const csvResults    = results.filter(r => r.name.endsWith(".csv"));
                const graphResults  = results.filter(r => r.name.endsWith(".graph.json"));

                if (controlResult) {
                    this.loadControlBatch(controlResult.text, csvResults, graphResults);
                } else {
                    this.loadPlainBatch(csvResults, graphResults);
                }

                this.elements.errorEl.textContent = "";
                saveSession(this.controller.getLoadedFileNames());
            } catch (e) {
                this.elements.errorEl.textContent = (e as Error).message;
            }
        }).catch(e => { this.elements.errorEl.textContent = (e as Error).message; });
    }

    private loadControlBatch(
        controlText: string,
        csvResults: { name: string; text: string }[],
        graphResults: { name: string; text: string }[],
    ): void {
        const controlFile: ControlFile = this.controller.loadControlFile(controlText);

        const csvMap = new Map<string, { headers: string[]; types: string[]; rows: string[][] }>();
        for (const { name, text } of csvResults) csvMap.set(name, parseCSV(text));

        const graphMap = new Map<string, string>();
        for (const { name, text } of graphResults) graphMap.set(name, text);

        for (const entry of controlFile.entries) {
            if (entry.view === "table") {
                const file = (entry as { file: string }).file;
                const r = csvResults.find(r => r.name === file);
                if (r) this.controller.loadCSV(file, r.text);
            }
        }
        this.controller.resolveAllDiagrams(controlFile, csvMap, graphMap);
        this.registerAllTabs();
        this.elements.statusText.textContent =
            `Loaded control.json with ${controlFile.entries.length} entries`;
    }

    private loadPlainBatch(
        csvResults: { name: string; text: string }[],
        graphResults: { name: string; text: string }[],
    ): void {
        for (const { name, text } of graphResults) this.controller.loadGraph(name, text);
        for (const { name, text } of csvResults)   this.controller.loadCSV(name, text);
        this.registerAllTabs();
        const names = [
            ...graphResults.map(r => r.name),
            ...csvResults.map(r => r.name),
        ];
        this.elements.statusText.textContent = `Loaded: ${names.join(", ")}`;
    }

    private registerAllTabs(): void {
        const kb = this.controller.getKnowledgeBase();
        for (const graph of kb.graphs) {
            const view = viewFactory(graph, this.controller);
            this.workspace.registerTab(graph.name, view, { graph });
        }
        for (const table of kb.tables) {
            const view = viewFactory(table, this.controller, this.sourceEditor);
            this.workspace.registerTab(table.name, view, { table });
        }
        this.workspace.activateFirst();
    }

    // ── Session banner ────────────────────────────────────────────────────────

    private wireSessionBanner(): void {
        const session = loadSession();
        if (!session || session.fileNames.length === 0) return;

        const banner = this.elements.sessionBanner;
        banner.hidden = false;
        banner.innerHTML =
            `<span>Last session: <strong>${session.fileNames.join(", ")}</strong></span>` +
            `<button id="dismiss-session">✕</button>`;
        banner.addEventListener("click", (e) => {
            if ((e.target as HTMLElement).id === "dismiss-session") {
                e.stopPropagation();
                banner.hidden = true;
            }
        });
    }
}
