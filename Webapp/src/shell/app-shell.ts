/**
 * AppShell — owns all application-level event wiring and file loading.
 */

import { AppController } from "../controller/index.ts";
import { WorkspaceController } from "../knowledge-pane/workspace-controller.ts";
import { viewFactory } from "../knowledge-pane/workspace-view.ts";
import { SourceEditorView } from "../source-editor/source-editor-view.ts";
import { NavigationTreeView } from "./navigation-tree-view.ts";
import { saveSession, loadSession } from "./session.ts";
import { parseCSV } from "../data/csv.ts";
import { parseDocJSON } from "../data/doc.ts";
import type { ControlFile } from "../data/control.ts";

export class AppShell {
    private readonly controller: AppController;
    private readonly workspace: WorkspaceController;
    private readonly sourceEditor: SourceEditorView;
    private readonly navTree: NavigationTreeView;
    private readonly elements: {
        fileInput: HTMLInputElement;
        workspaceEl: HTMLElement;
        errorEl: HTMLElement;
        sessionBanner: HTMLElement;
        dynamicToolbar: HTMLElement;
        btnExport: HTMLElement;
        btnToggleSidebar: HTMLElement;
        btnToggleNav: HTMLElement;
        navTreePanel: HTMLElement;
        sidebarEl: HTMLElement;
        statusText: HTMLElement;
    };

    constructor(
        controller: AppController,
        workspace: WorkspaceController,
        sourceEditor: SourceEditorView,
        navTree: NavigationTreeView,
        elements: {
            fileInput: HTMLInputElement;
            workspaceEl: HTMLElement;
            errorEl: HTMLElement;
            sessionBanner: HTMLElement;
            dynamicToolbar: HTMLElement;
            btnExport: HTMLElement;
            btnToggleSidebar: HTMLElement;
            btnToggleNav: HTMLElement;
            navTreePanel: HTMLElement;
            sidebarEl: HTMLElement;
            statusText: HTMLElement;
        },
    ) {
        this.controller = controller;
        this.workspace = workspace;
        this.sourceEditor = sourceEditor;
        this.navTree = navTree;
        this.elements = elements;
    }

    init(): void {
        this.wireKeyboard();
        this.wireStaticToolbar();
        this.wireDynamicToolbar();
        this.wireSidebar();
        this.wireNavTree();
        this.wireFileLoading();
        this.wireSessionBanner();
        this.elements.fileInput.setAttribute("accept", ".csv,.json");
    }

    // ── Keyboard ──────────────────────────────────────────────────────────────

    private wireKeyboard(): void {
        document.addEventListener("keydown", (e) => {
            if (this.sourceEditor.focused) return;
            if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
                e.preventDefault();
                this.controller.undo();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
                e.preventDefault();
                this.controller.redo();
            } else if (e.key === "Escape") {
                this.workspace.getActiveTableView()?.clearSelection();
            }
        });

        document.addEventListener("click", (e) => {
            const target = e.target as Node;
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
        btn.classList.add("sidebar-open");
        btn.addEventListener("click", () => {
            const collapsed = sidebar.classList.toggle("sidebar-collapsed");
            btn.classList.toggle("sidebar-open", !collapsed);
            btn.textContent = collapsed ? "\u25B6 Editor" : "\u25C0 Editor";
        });
    }

    // ── Nav tree toggle ───────────────────────────────────────────────────────

    private wireNavTree(): void {
        const btn = this.elements.btnToggleNav;
        const panel = this.elements.navTreePanel;
        btn.classList.add("nav-open");
        btn.addEventListener("click", () => {
            const collapsed = panel.classList.toggle("nav-collapsed");
            btn.classList.toggle("nav-open", !collapsed);
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
            if (!e.dataTransfer?.types.includes("Files")) return;
            e.preventDefault();
            ws.classList.add("drag-over");
        });
        ws.addEventListener("dragleave", () => ws.classList.remove("drag-over"));
        ws.addEventListener("drop", (e) => {
            ws.classList.remove("drag-over");
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

                const isDocJson   = (n: string) => n.endsWith(".doc.json") || n.endsWith(".doc");
                const isGraphJson = (n: string) => n.endsWith(".graph.json") || (n.endsWith(".json") && !isDocJson(n) && n !== "control.json");

                const controlResult = results.find(r => r.name === "control.json");
                const docResults    = results.filter(r => isDocJson(r.name));
                const csvResults    = results.filter(r => r.name.endsWith(".csv"));
                const graphResults  = results.filter(r => isGraphJson(r.name));

                if (controlResult) {
                    this.loadControlBatch(controlResult.text, csvResults, graphResults, docResults);
                } else {
                    this.loadPlainBatch(csvResults, graphResults, docResults);
                }

                this.elements.errorEl.textContent = "";
                saveSession(this.controller.getLoadedFileNames());
            } catch (e) {
                this.elements.errorEl.textContent = (e as Error).message;
            }
        }).catch(e => { this.elements.errorEl.textContent = (e as Error).message; });
    }

    // ── Shared doc-loading helper ─────────────────────────────────────────────

    /**
     * Load all .doc.json files into the KB.
     * Ensures every CSV/graph they reference is loaded first.
     * Uses sourceFile to key the graph map — works regardless of what name
     * control.json assigned to the graph.
     */
    private loadDocResults(
        docResults: { name: string; text: string }[],
        csvResults:  { name: string; text: string }[],
        graphResults: { name: string; text: string }[],
    ): void {
        if (docResults.length === 0) return;
        const kb = this.controller.getKnowledgeBase();

        // Load any CSV not yet in KB
        for (const { name, text } of csvResults)
            if (!kb.tables.find(t => t.name + ".csv" === name))
                this.controller.loadCSV(name, text);

        // Load any graph not yet in KB (keyed by sourceFile)
        for (const { name, text } of graphResults)
            if (!kb.graphs.find(g => g.sourceFile === name))
                this.controller.loadGraph(name, text);

        // Build lookup maps
        const tableMap = new Map(kb.tables.map(t => [t.name + ".csv", t]));
        // Key graph map by sourceFile — handles graphs named by control entry id
        const graphMap = new Map(
            kb.graphs.filter(g => g.sourceFile).map(g => [g.sourceFile!, g])
        );

        for (const { name, text } of docResults) {
            const doc = parseDocJSON(name, JSON.parse(text) as unknown, tableMap, graphMap);
            this.controller.loadDocument(doc);
        }
    }

    private loadControlBatch(
        controlText: string,
        csvResults:  { name: string; text: string }[],
        graphResults: { name: string; text: string }[],
        docResults:  { name: string; text: string }[] = [],
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

        this.loadDocResults(docResults, csvResults, graphResults);
        this.registerAllTabs();
        this.elements.statusText.textContent =
            `Loaded control.json with ${controlFile.entries.length} entries`;
    }

    private loadPlainBatch(
        csvResults:  { name: string; text: string }[],
        graphResults: { name: string; text: string }[],
        docResults:  { name: string; text: string }[] = [],
    ): void {
        for (const { name, text } of graphResults) this.controller.loadGraph(name, text);
        for (const { name, text } of csvResults)   this.controller.loadCSV(name, text);
        this.loadDocResults(docResults, csvResults, graphResults);
        this.registerAllTabs();
        const kb = this.controller.getKnowledgeBase();
        this.elements.statusText.textContent =
            `Loaded ${kb.documents.length} docs, ${kb.tables.length} tables, ${kb.graphs.length} graphs`;
    }

    private registerAllTabs(): void {
        const kb = this.controller.getKnowledgeBase();

        for (const doc of kb.documents) {
            this.workspace.registerView(
                doc.name,
                () => viewFactory(doc, this.controller, this.sourceEditor),
                { document: doc },
            );
        }

        const docGraphFiles = new Set(kb.documents.flatMap(d =>
            d.getGraphSections().map(s => (s.block as import("../model/Document.ts").GraphBlock).graph.sourceFile ?? "")
        ));
        for (const graph of kb.graphs) {
            if (docGraphFiles.has(graph.sourceFile ?? graph.name)) continue;
            this.workspace.registerView(
                graph.name,
                () => viewFactory(graph, this.controller, this.sourceEditor),
                { graph },
            );
        }

        const docTableNames = new Set(kb.documents.flatMap(d =>
            d.getTableSections().map(s => (s.block as import("../model/Document.ts").TableBlock).table.name)
        ));
        for (const table of kb.tables) {
            if (docTableNames.has(table.name)) continue;
            this.workspace.registerView(
                table.name,
                () => viewFactory(table, this.controller, this.sourceEditor),
                { table },
            );
        }

        this.workspace.openFirst();
        this.navTree.refresh();
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
