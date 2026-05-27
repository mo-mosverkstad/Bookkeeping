/**
 * WorkspaceController — owns the tab strip and workspace view lifecycle.
 *
 * Responsibilities:
 *   - Register tabs (id → WorkspaceView + WorkspaceData)
 *   - Activate a tab: unmount current (saving state), mount next (restoring state)
 *   - Expose the active TableView for toolbar actions (add row, export)
 *
 * main.ts registers tabs and calls activateFirst(). All tab switching logic
 * lives here, not in main.ts.
 */

import type { WorkspaceView, WorkspaceData, ViewState, ToolbarAction } from "./workspace-view.ts";
import type { TableView } from "./table-view.ts";

interface TabEntry {
    view: WorkspaceView;
    data: WorkspaceData;
    btn: HTMLButtonElement;
}

export class WorkspaceController {
    private tabs = new Map<string, TabEntry>();
    private savedStates = new Map<string, ViewState>();
    private activeId: string | null = null;
    private readonly tabStrip: HTMLElement;
    private readonly container: HTMLElement;
    private readonly onStatus: (msg: string) => void;
    private onToolbarChange: ((actions: ToolbarAction[], view: WorkspaceView) => void) | null = null;

    constructor(
        tabStrip: HTMLElement,
        container: HTMLElement,
        onStatus: (msg: string) => void,
    ) {
        this.tabStrip = tabStrip;
        this.container = container;
        this.onStatus = onStatus;
    }

    setToolbarChangeHandler(cb: (actions: ToolbarAction[], view: WorkspaceView) => void): void {
        this.onToolbarChange = cb;
    }

    registerTab(id: string, view: WorkspaceView, data: WorkspaceData): void {
        const btn = document.createElement("button");
        btn.className = "tab-btn";
        btn.textContent = id;
        btn.addEventListener("click", () => this.activateTab(id));
        this.tabStrip.appendChild(btn);
        this.tabs.set(id, { view, data, btn });
    }

    activateTab(id: string): void {
        // Save state of currently active view
        if (this.activeId) {
            const current = this.tabs.get(this.activeId);
            if (current) this.savedStates.set(this.activeId, current.view.unmount());
        }

        const next = this.tabs.get(id);
        if (!next) return;

        // Update tab button styles
        this.tabs.forEach(({ btn }) => btn.classList.remove("tab-active"));
        next.btn.classList.add("tab-active");

        // Mount the new view with any saved state
        this.container.innerHTML = "";
        next.view.mount(this.container, next.data, this.savedStates.get(id));
        this.activeId = id;
        this.onStatus(id);
        this.onToolbarChange?.(next.view.getToolbarActions(), next.view);

        // Give the view a callback to refresh the toolbar after selection changes
        const viewWithRefresh = next.view as { setToolbarRefreshCallback?: (cb: () => void) => void };
        viewWithRefresh.setToolbarRefreshCallback?.(() => {
            this.onToolbarChange?.(next.view.getToolbarActions(), next.view);
        });

        // Diagrams handle pan/zoom internally — suppress workspace scrollbars
        const isDiagram = next.data.graph !== undefined;
        this.container.parentElement?.classList.toggle("workspace-diagram", isDiagram);
    }

    activateFirst(): void {
        const first = this.tabs.keys().next().value;
        if (first !== undefined) this.activateTab(first);
    }

    clear(): void {
        if (this.activeId) {
            const current = this.tabs.get(this.activeId);
            current?.view.unmount();
        }
        this.tabs.clear();
        this.savedStates.clear();
        this.activeId = null;
        this.tabStrip.innerHTML = "";
        this.container.innerHTML = "";
    }

    /** Returns the active view if it is a TableView, otherwise null. */
    getActiveTableView(): TableView | null {
        if (!this.activeId) return null;
        const entry = this.tabs.get(this.activeId);
        if (!entry) return null;
        // TableView implements WorkspaceView — check by duck-typing the method
        const view = entry.view as TableView;
        return typeof view.getActiveTableIdx === "function" ? view : null;
    }

    getActiveId(): string | null { return this.activeId; }
}
