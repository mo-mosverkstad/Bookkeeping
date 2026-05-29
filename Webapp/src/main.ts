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

window.addEventListener("load", async () => {
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

    // ── File System Strategy ──────────────────────────────────────────────────
    const { HAS_FILE_SYSTEM_ACCESS, NativeFileSystemStrategy, DownloadFallbackStrategy } = await import("./data/file-system.ts");
    const fileSystem = HAS_FILE_SYSTEM_ACCESS
        ? new NativeFileSystemStrategy()
        : new DownloadFallbackStrategy();
    controller.setFileSystemStrategy(fileSystem);

    // Dirty indicator
    controller.setOnDirtyChange(() => {
        const dirtyFiles = controller.getDirtyFiles();
        if (dirtyFiles.size > 0) {
            statusText.textContent = "● Unsaved changes";
            statusText.style.color = "#b45309";
        } else {
            statusText.textContent = fileSystem.canSaveInPlace ? "" : "⇣ Download mode";
            statusText.style.color = "";
        }
        // Mark/clear tabs and nav tree items
        const kb = controller.getKnowledgeBase();
        for (const table of kb.tables) {
            const fileName = table.name + ".csv";
            if (dirtyFiles.has(fileName)) {
                workspace.markTabDirty(table.name);
                navTreeMarkDirty(table.name);
            } else {
                workspace.clearTabDirty(table.name);
                navTreeClearDirty(table.name);
            }
        }
    });

    // Nav tree dirty helpers (navTree defined later, accessed via closure)
    let navTreeRef: NavigationTreeView | null = null;
    const navTreeMarkDirty = (name: string) => navTreeRef?.markDirty(name);
    const navTreeClearDirty = (name: string) => navTreeRef?.clearDirty(name);

    // Status indicator for download mode
    if (!fileSystem.canSaveInPlace) {
        statusText.textContent = "⇣ Download mode";
    }

    // Ctrl+S → save all modified files
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            controller.saveAllModified().then(() => {
                if (controller.isDirty()) return;
                statusText.textContent = fileSystem.canSaveInPlace ? "Saved ✓" : "Downloaded ✓";
                statusText.style.color = "#15803d";
                setTimeout(() => {
                    statusText.textContent = fileSystem.canSaveInPlace ? "" : "⇣ Download mode";
                    statusText.style.color = "";
                }, 2000);
            });
        }
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
    navTreeRef = navTree;
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
