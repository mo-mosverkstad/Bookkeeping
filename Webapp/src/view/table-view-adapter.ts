/**
 * TableViewAdapter — wraps the existing TableView to conform to WorkspaceView.
 *
 * Uses only the public API of TableView — no (x as any) casts.
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
        sourceInput: HTMLTextAreaElement,
    ) {
        this.tableView = new TableView(
            document.createElement("div"),  // placeholder — replaced on mount via setContainer()
            tabStrip,
            sourceInput,
        );
        this.tableView.setController(controller);
    }

    mount(container: HTMLElement, data: WorkspaceData, savedState?: ViewState): void {
        this.container = container;
        if (savedState) this.state = savedState as TableState;

        // Re-wire the TableView's container to the actual workspace element
        this.tableView.setContainer(container);

        const kb = this.tableView.getController()?.getKnowledgeBase();
        if (kb) {
            this.tableView.renderAll(kb.tables);
        }

        if (this.state.scrollTop || this.state.scrollLeft) {
            container.scrollTop  = this.state.scrollTop;
            container.scrollLeft = this.state.scrollLeft;
        }
    }

    unmount(): ViewState {
        const sort = this.tableView.getSortState();
        const state: TableState = {
            scrollTop:  this.container?.scrollTop  ?? 0,
            scrollLeft: this.container?.scrollLeft ?? 0,
            sortCol: sort.sortCol,
            sortAsc: sort.sortAsc,
        };
        this.state = state;
        return state;
    }

    update(_data: WorkspaceData): void {
        const kb = this.tableView.getController()?.getKnowledgeBase();
        if (kb) this.tableView.renderAll(kb.tables);
    }

    /** Expose the underlying TableView for direct use by main.ts. */
    getTableView(): TableView { return this.tableView; }
}
