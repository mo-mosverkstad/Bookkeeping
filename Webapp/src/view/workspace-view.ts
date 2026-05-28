import type { Table } from "../model/Table.ts";
import type { Graph } from "../model/Graph.ts";
import { Table as TableClass } from "../model/Table.ts";

export type ViewState = unknown;

// ── Toolbar actions ───────────────────────────────────────────────────────────

export interface ToolbarAction {
    id: string;
    label: string;
    title?: string;
    disabled?: boolean;
}

// ── WorkspaceView interface ───────────────────────────────────────────────────

export interface WorkspaceView {
    mount(container: HTMLElement, data: WorkspaceData, state?: ViewState): void;
    unmount(): ViewState;
    update(data: WorkspaceData): void;
    /** Dynamic toolbar actions specific to this view. Empty array = no actions. */
    getToolbarActions(): ToolbarAction[];
    /** Called when a toolbar action button is clicked. */
    onToolbarAction(id: string): void;
}

export interface WorkspaceData {
    table?: Table;
    graph?: Graph;
}

// ── viewFactory — dispatches on model type, not on control file string ────────

import { TableView } from "./table-view.ts";
import { FlowDiagramView } from "./flow-diagram-view.ts";
import type { AppController } from "../controller/index.ts";
import type { SourceEditorView } from "./source-editor-view.ts";

export function viewFactory(
    model: Table | Graph,
    controller: AppController,
    sourceEditor?: SourceEditorView,
): WorkspaceView {
    if (model instanceof TableClass) {
        const view = new TableView(document.createElement("div"));
        view.setController(controller);
        const handler = controller.getEntityClickHandler();
        if (handler) view.setEntityClickHandler(handler);
        if (sourceEditor) {
            view.setSourceEditor(sourceEditor);
            sourceEditor.setOnCellApply((value, _type) => {
                const tv = view;
                if (tv.getActiveTableIdx() >= 0) {
                    // commitActive reads getValue() from the source editor
                    tv.commitActive();
                }
            });
        }
        return view;
    }
    const g = model as Graph;
    return new FlowDiagramView(g.viewType, controller);
}
