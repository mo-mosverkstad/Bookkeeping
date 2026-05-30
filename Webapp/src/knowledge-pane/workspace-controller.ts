/**
 * WorkspaceController — owns the tab strip and workspace view lifecycle.
 *
 * Tabs are opened on demand (from the nav tree) and can be closed with ✕.
 * registerView() stores a view factory without opening a tab.
 * openTab() opens (or activates if already open) a registered view.
 */

import type { WorkspaceView, WorkspaceData, ViewState, ToolbarAction } from "./workspace-view.ts";
import type { TableView } from "./table-view.ts";

interface TabEntry {
    view: WorkspaceView;
    data: WorkspaceData;
    btn: HTMLButtonElement;
}

interface ViewEntry {
    factory: () => WorkspaceView;
    data: WorkspaceData;
}

export class WorkspaceController {
    private tabs = new Map<string, TabEntry>();
    private registry = new Map<string, ViewEntry>();
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

    /** Register a view factory without opening a tab. */
    registerView(id: string, factory: () => WorkspaceView, data: WorkspaceData): void {
        this.registry.set(id, { factory, data });
    }

    /** Open a registered view as a tab (or activate it if already open). */
    openTab(id: string): void {
        if (this.tabs.has(id)) {
            this.activateTab(id);
            return;
        }
        const entry = this.registry.get(id);
        if (!entry) return;
        const view = entry.factory();
        this.addTab(id, view, entry.data);
        this.activateTab(id);
    }

    /** @deprecated Use registerView + openTab. Kept for control-file path. */
    registerTab(id: string, view: WorkspaceView, data: WorkspaceData): void {
        this.registry.set(id, { factory: () => view, data });
        this.addTab(id, view, data);
    }

    private addTab(id: string, view: WorkspaceView, data: WorkspaceData): void {
        const btn = document.createElement("button");
        btn.className = "tab-btn";

        const labelSpan = document.createElement("span");
        labelSpan.textContent = id;
        btn.appendChild(labelSpan);

        const closeBtn = document.createElement("span");
        closeBtn.className = "tab-close";
        closeBtn.textContent = "✕";
        closeBtn.title = "Close tab";
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.closeTab(id);
        });
        btn.appendChild(closeBtn);

        btn.addEventListener("click", () => this.activateTab(id));
        this.tabStrip.appendChild(btn);
        this.tabs.set(id, { view, data, btn });
    }

    closeTab(id: string): void {
        const entry = this.tabs.get(id);
        if (!entry) return;

        if (this.activeId === id) {
            // Activate an adjacent tab before closing
            const ids = [...this.tabs.keys()];
            const idx = ids.indexOf(id);
            const nextId = ids[idx + 1] ?? ids[idx - 1] ?? null;
            entry.view.unmount();
            entry.btn.remove();
            this.tabs.delete(id);
            this.activeId = null;
            if (nextId) {
                this.activateTab(nextId);
            } else {
                this.container.innerHTML = "Select an item from the navigation tree";
                this.container.className = "drop-hint";
                this.container.parentElement?.classList.remove("workspace-diagram");
            }
        } else {
            entry.btn.remove();
            this.tabs.delete(id);
        }
    }

    activateTab(id: string): void {
        if (!this.tabs.has(id)) {
            this.openTab(id);
            return;
        }

        if (this.activeId) {
            const current = this.tabs.get(this.activeId);
            if (current) this.savedStates.set(this.activeId, current.view.unmount());
        }

        const next = this.tabs.get(id);
        if (!next) return;

        this.tabs.forEach(({ btn }) => btn.classList.remove("tab-active"));
        next.btn.classList.add("tab-active");

        this.container.innerHTML = "";
        this.container.className = "";
        next.view.mount(this.container, next.data, this.savedStates.get(id));
        this.activeId = id;
        this.onStatus(id);
        this.onToolbarChange?.(next.view.getToolbarActions(), next.view);

        const viewWithRefresh = next.view as { setToolbarRefreshCallback?: (cb: () => void) => void };
        viewWithRefresh.setToolbarRefreshCallback?.(() => {
            this.onToolbarChange?.(next.view.getToolbarActions(), next.view);
        });

        const isDiagram = next.data.graph !== undefined;
        this.container.parentElement?.classList.toggle("workspace-diagram", isDiagram);
    }

    activateFirst(): void {
        const first = this.tabs.keys().next().value;
        if (first !== undefined) this.activateTab(first);
    }

    /** Open the first registered view (used after loading files). */
    openFirst(): void {
        const first = this.registry.keys().next().value;
        if (first !== undefined) this.openTab(first);
    }

    clear(): void {
        if (this.activeId) {
            const current = this.tabs.get(this.activeId);
            current?.view.unmount();
        }
        this.tabs.clear();
        this.registry.clear();
        this.savedStates.clear();
        this.activeId = null;
        this.tabStrip.innerHTML = "";
        this.container.innerHTML = "Drop .csv or .graph.json files here or use Open above";
        this.container.className = "drop-hint";
        this.container.parentElement?.classList.remove("workspace-diagram");
    }

    getActiveTableView(): TableView | null {
        if (!this.activeId) return null;
        const entry = this.tabs.get(this.activeId);
        if (!entry) return null;
        const view = entry.view as TableView;
        return typeof view.getActiveTableIdx === "function" ? view : null;
    }

    getActiveId(): string | null { return this.activeId; }
    getRegisteredIds(): string[] { return [...this.registry.keys()]; }
    markTabDirty(id: string): void {
        const entry = this.tabs.get(id);
        if (!entry) return;
        const label = entry.btn.querySelector("span");
        if (label && !label.textContent?.startsWith("● ")) {
            label.textContent = "● " + label.textContent;
        }
    }

    clearTabDirty(id: string): void {
        const entry = this.tabs.get(id);
        if (!entry) return;
        const label = entry.btn.querySelector("span");
        if (label && label.textContent?.startsWith("● ")) {
            label.textContent = label.textContent.slice(2);
        }
    }

}
