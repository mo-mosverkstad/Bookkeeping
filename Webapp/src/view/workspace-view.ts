/**
 * WorkspaceView — interface for all workspace-level views.
 *
 * Cell plugins (math, chemistry, geometry, physics) operate at micro scale —
 * one cell, stateless, interchangeable. The cell plugin registry fits them.
 *
 * Display views operate at macro scale — one or more CSV files rendered as a
 * coherent view filling #workspace. They are stateful, have layout, support
 * interaction (pan, zoom, click, select), and own the workspace for the
 * duration of a tab's active lifetime.
 *
 * The right model is a view component class hierarchy, not a plugin registry.
 * Each view type is a proper class. viewFactory() selects the correct class
 * based on the control file entry's view type.
 */

import type { ResolvedDiagram } from "../data/control.ts";
import type { Table } from "../model/Table.ts";

// ── ViewState — opaque per-view state blob ────────────────────────────────────

/**
 * Each view type defines its own state shape internally.
 * The controller stores states as unknown blobs and passes them back to the
 * same view type that produced them — it never inspects them.
 */
export type ViewState = unknown;

// ── WorkspaceView interface ───────────────────────────────────────────────────

export interface WorkspaceView {
    /**
     * Mount this view into the container element.
     * data: resolved diagram data (null for TableView which uses tables directly).
     * state: optional saved state from a previous unmount() call.
     */
    mount(container: HTMLElement, data: WorkspaceData, state?: ViewState): void;

    /**
     * Unmount this view from the container.
     * Returns the current state so it can be restored on next mount().
     */
    unmount(): ViewState;

    /**
     * Called when the underlying data has changed (e.g. a cell was edited
     * in the table tab while this diagram tab is inactive).
     */
    update(data: WorkspaceData): void;
}

// ── WorkspaceData — what gets passed to mount/update ─────────────────────────

export interface WorkspaceData {
    /** For table views: the Table object to render. */
    table?: Table;
    /** For diagram views: the resolved node/edge/actor/message data. */
    diagram?: ResolvedDiagram;
}

// ── viewFactory — selects the correct WorkspaceView class ────────────────────

import { TableViewAdapter } from "./table-view-adapter.ts";
import { FlowDiagramView } from "./flow-diagram-view.ts";
import type { ControlEntry } from "../data/control.ts";
import type { AppController } from "../controller/index.ts";

export function viewFactory(
    entry: ControlEntry,
    controller: AppController,
    tabStrip: HTMLElement,
    sourceInput: HTMLTextAreaElement,
): WorkspaceView {
    switch (entry.view) {
        case "table":
            return new TableViewAdapter(controller, tabStrip, sourceInput);
        case "flow":
        case "spatial":
        case "relation":
            return new FlowDiagramView(entry.view);
        case "sequence":
            return new FlowDiagramView("sequence");
        default:
            return new FlowDiagramView("flow");
    }
}
