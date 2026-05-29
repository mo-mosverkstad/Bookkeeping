/**
 * main.ts — application startup.
 *
 * Instantiates all layers and wires them together. Contains no logic.
 */

import { AppController } from "./controller/index.ts";
import { GraphFilterView } from "./shell/graph-filter-view.ts";
import { SearchView } from "./shell/search-view.ts";
import { WorkspaceController } from "./knowledge-pane/workspace-controller.ts";
import { AppShell } from "./shell/app-shell.ts";
import { SourceEditorView } from "./source-editor/source-editor-view.ts";
import { NavigationTreeView } from "./shell/navigation-tree-view.ts";

window.addEventListener("load", () => {
    // ── DOM references ────────────────────────────────────────────────────────
    const errorEl              = document.getElementById("error-message")!;
    const fileInput            = document.getElementById("file-input") as HTMLInputElement;
    const workspaceEl          = document.getElementById("workspace")!;
    const tableContainer       = document.getElementById("table-container")!;
    const tabStrip             = document.getElementById("tab-strip")!;
    const graphFilterContainer = document.getElementById("graph-filter-container")!;
    const searchContainer      = document.getElementById("search-container")!;
    const sessionBanner        = document.getElementById("session-banner") as HTMLElement;
    const btnExport            = document.getElementById("btn-export-csv")!;
    const btnToggleSidebar     = document.getElementById("btn-toggle-sidebar")!;
    const btnToggleNav         = document.getElementById("btn-toggle-nav")!;
    const navTreePanel         = document.getElementById("nav-tree-panel")!;
    const navTreeEl            = document.getElementById("nav-tree")!;
    const dynamicToolbar       = document.getElementById("dynamic-toolbar")!;
    const statusText           = document.getElementById("status-text")!;
    const sidebarEl            = document.getElementById("sidebar")!;
    const sourceEditorContainer = document.getElementById("source-editor-container")!;

    // ── Controller (model layer) ──────────────────────────────────────────────
    const controller = new AppController();

    // ── Toolbar-level views (always visible) ──────────────────────────────────
    const graphFilterView = new GraphFilterView(graphFilterContainer, controller);
    const searchView      = new SearchView(searchContainer, controller);

    controller.setGraphFilterView(graphFilterView);

    // ── Workspace controller (tab strip + view dispatch) ──────────────────────
    const workspace = new WorkspaceController(
        tabStrip,
        tableContainer,
        (msg) => { statusText.textContent = msg; },
    );

    controller.setWorkspaceController(workspace);

    controller.setEntityClickHandler((entityId: string) => {
        graphFilterView.showEntityAssociations(entityId);
        searchView.showNeighbourhood(entityId);
    });

    controller.setDismissPanelsHandler(() => {
        graphFilterView.getDetailPanel().innerHTML = "";
        searchView.hideNeighbourhood();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            graphFilterView.getDetailPanel().innerHTML = "";
            searchView.hideNeighbourhood();
        }
    });

    // ── Source code editor (sidebar) ──────────────────────────────────────────
    const sourceEditor = new SourceEditorView(controller, sourceEditorContainer);

    // ── AppShell ──────────────────────────────────────────────────────────────
    // Navigation tree
    const navTree = new NavigationTreeView(navTreeEl, controller);
    navTree.setWorkspaceController(workspace);

    const shell = new AppShell(controller, workspace, sourceEditor, navTree, {
        fileInput,
        workspaceEl,
        errorEl,
        sessionBanner,
        dynamicToolbar,
        btnExport,
        btnToggleSidebar,
        btnToggleNav,
        navTreePanel,
        sidebarEl,
        statusText,
    });
    shell.init();
});
