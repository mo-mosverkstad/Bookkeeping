import type { Table } from "../model/Table.ts";
import type { Graph } from "../model/Graph.ts";
import type { Document } from "../model/Document.ts";
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
    document?: Document;
}

// ── viewFactory — dispatches on model type ────────────────────────────────────

import { TableView } from "./table-view.ts";
import { FlowDiagramView } from "./flow-diagram-view.ts";
import { DocumentView } from "./document-view.ts";
import type { AppController } from "../controller/index.ts";
import type { SourceEditorView } from "../source-editor/source-editor-view.ts";
import { Document as DocumentClass } from "../model/Document.ts";
import { Graph as GraphClass } from "../model/Graph.ts";

export function viewFactory(
    model: Table | Graph | Document,
    controller: AppController,
    sourceEditor?: SourceEditorView,
): WorkspaceView {
    if (model instanceof DocumentClass) {
        return new DocumentView(controller, sourceEditor);
    }
    if (model instanceof TableClass) {
        const view = new TableView(document.createElement("div"));
        view.setController(controller);
        const handler = controller.getEntityClickHandler();
        if (handler) view.setEntityClickHandler(handler);
        const dismiss = controller.getDismissPanelsHandler();
        if (dismiss) view.setOnCellFocusChange(dismiss);
        if (sourceEditor) {
            view.setSourceEditor(sourceEditor);
        }
        return view;
    }
    const g = model as GraphClass;
    const diagramView = new FlowDiagramView(g.viewType, controller);
    if (sourceEditor) diagramView.setSourceEditor(sourceEditor);
    return diagramView;
}
