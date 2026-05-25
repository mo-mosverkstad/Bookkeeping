/**
 * TableViewAdapter — wraps the existing TableView to conform to WorkspaceView.
 *
 * The existing TableView is already a view component. This adapter makes it
 * conform to the WorkspaceView interface so it can be managed by the same
 * tab-switching machinery as diagram views.
 */

import type { WorkspaceView, WorkspaceData, ViewState } from "./workspace-view.ts";
import { TableView } from "./table-view.ts";
import type { AppController } from "../controller/index.ts";

interface TableState {
    scrollTop: number;
    scrollLeft: number;
    sortCol: number;
    sortAsc: boolean;
}

export class TableViewAdapter implements WorkspaceView {
    private tableView: TableView;
    private container: HTMLElement | null = null;
    private state: TableState = { scrollTop: 0, scrollLeft: 0, sortCol: -1, sortAsc: true };

    constructor(
        controller: AppController,
        tabStrip: HTMLElement,
    ) {
        this.tableView = new TableView(
            document.createElement("div"),      // placeholder — replaced on mount
            tabStrip,
            document.createElement("textarea"), // placeholder — not used by adapter
        );
        this.tableView.setController(controller);
    }

    mount(container: HTMLElement, data: WorkspaceData, savedState?: ViewState): void {
        this.container = container;
        if (savedState) this.state = savedState as TableState;

        // Re-wire the TableView's container to the actual workspace element
        (this.tableView as any).container = container;

        // Restore scroll position after render
        const kb = (this.tableView as any).controller?.getKnowledgeBase?.();
        if (kb) {
            this.tableView.renderAll(kb.tables);
        }

        if (this.state.scrollTop || this.state.scrollLeft) {
            container.scrollTop  = this.state.scrollTop;
            container.scrollLeft = this.state.scrollLeft;
        }
    }

    unmount(): ViewState {
        const state: TableState = {
            scrollTop:  this.container?.scrollTop  ?? 0,
            scrollLeft: this.container?.scrollLeft ?? 0,
            sortCol: (this.tableView as any).sortCol ?? -1,
            sortAsc: (this.tableView as any).sortAsc ?? true,
        };
        this.state = state;
        return state;
    }

    update(_data: WorkspaceData): void {
        const kb = (this.tableView as any).controller?.getKnowledgeBase?.();
        if (kb) this.tableView.renderAll(kb.tables);
    }

    /** Expose the underlying TableView for direct use by main.ts. */
    getTableView(): TableView { return this.tableView; }
}
