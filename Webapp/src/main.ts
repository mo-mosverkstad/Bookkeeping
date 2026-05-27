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

window.addEventListener("load", () => {
    // ── DOM references ────────────────────────────────────────────────────────
    const sourceInput          = document.getElementById("cell-source-input") as HTMLTextAreaElement;
    const errorEl              = document.getElementById("error-message")!;
    const fileInput            = document.getElementById("file-input") as HTMLInputElement;
    const workspaceEl          = document.getElementById("workspace")!;
    const tableContainer       = document.getElementById("table-container")!;
    const tabStrip             = document.getElementById("tab-strip")!;
    const graphFilterContainer = document.getElementById("graph-filter-container")!;
    const searchContainer      = document.getElementById("search-container")!;
    const sessionBanner        = document.getElementById("session-banner") as HTMLElement;
    const btnExport            = document.getElementById("btn-export-csv")!;
    const dynamicToolbar       = document.getElementById("dynamic-toolbar")!;
    const statusText           = document.getElementById("status-text")!;

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

    // Entity click handler — stored on controller, applied by viewFactory to each TableView
    controller.setEntityClickHandler((entityId: string) => {
        graphFilterView.showEntityAssociations(entityId);
        searchView.showNeighbourhood(entityId);
    });

    // ── AppShell (startup wiring: keyboard, toolbar, file loading, session) ───
    const shell = new AppShell(controller, workspace, {
        fileInput,
        workspaceEl,
        sourceInput,
        errorEl,
        sessionBanner,
        dynamicToolbar,
        btnExport,
        statusText,
    });
    shell.init();
});
