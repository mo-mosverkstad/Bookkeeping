/**
 * main.ts — application startup.
 *
 * Instantiates all layers and wires them together. Contains no logic.
 */

import { AppController } from "./controller/index.ts";
import { GraphFilterView } from "./view/graph-filter-view.ts";
import { SearchView } from "./view/search-view.ts";
import { WorkspaceController } from "./view/workspace-controller.ts";
import { AppShell } from "./view/app-shell.ts";
import { SourceEditorView } from "./view/source-editor-view.ts";

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

    // ── Source code editor (sidebar) ──────────────────────────────────────────
    const sourceEditor = new SourceEditorView(controller, sourceEditorContainer);

    // ── AppShell ──────────────────────────────────────────────────────────────
    const shell = new AppShell(controller, workspace, sourceEditor, {
        fileInput,
        workspaceEl,
        errorEl,
        sessionBanner,
        dynamicToolbar,
        btnExport,
        btnToggleSidebar,
        sidebarEl,
        statusText,
    });
    shell.init();
});
