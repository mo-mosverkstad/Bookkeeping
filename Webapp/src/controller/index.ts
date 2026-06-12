import { KnowledgeBase, Table, Row, EditHistory, Graph, TypedValue } from "../model/index.ts";
import { serializeGraph } from "../data/graph-source.ts";
import type { FileSystemStrategy, FileHandle } from "../data/file-system.ts";
import type { Document } from "../model/index.ts";
import { parseCSV } from "../data/csv.ts";
import { parseControlFile, resolveNodes, resolveEdges, resolveActors, resolveMessages } from "../data/control.ts";
import type { ControlFile, FlowDecl, SequenceDecl, NodeSource, GraphFileDecl } from "../data/control.ts";
import { searchText, searchByIdentifier, getNeighbourhood, crossTableJoin } from "../search/index.ts";
import type { SearchHit, NeighbourHit, JoinHit } from "../search/index.ts";
import type { WorkspaceController } from "../knowledge-pane/workspace-controller.ts";
import type { GraphFilterView } from "../shell/graph-filter-view.ts";

export class AppController {
    private knowledgeBase = new KnowledgeBase();
    private workspaceController: WorkspaceController | null = null;
    private graphFilterView: GraphFilterView | null = null;
    private entityClickHandler: ((entityId: string) => void) | null = null;
    private dismissPanelsHandler: (() => void) | null = null;
    readonly history = new EditHistory();
    private fileSystem: FileSystemStrategy | null = null;
    private loadedFiles = new Map<string, { text: string; handle: FileHandle | null }>();
    private dirty = new Set<string>();
    private onDirtyChange: (() => void) | null = null;
    /** Callbacks for diagram undo/redo — keyed by diagram name */
    private diagramUpdateCallbacks = new Map<string, (source: string) => void>();
    /** Getters for current diagram content — keyed by diagram name */
    private diagramContentGetters = new Map<string, () => string>();
    /** Per-file saved content baseline — compared against current to determine dirty */
    private savedContent = new Map<string, string>();

    setWorkspaceController(wc: WorkspaceController): void { this.workspaceController = wc; }
    setGraphFilterView(view: GraphFilterView): void { this.graphFilterView = view; }
    setEntityClickHandler(handler: (entityId: string) => void): void {
        this.entityClickHandler = handler;
    }
    setDismissPanelsHandler(handler: () => void): void { this.dismissPanelsHandler = handler; }
    getDismissPanelsHandler(): (() => void) | null { return this.dismissPanelsHandler; }
    getEntityClickHandler(): ((entityId: string) => void) | null {
        return this.entityClickHandler;
    }

    getKnowledgeBase(): KnowledgeBase { return this.knowledgeBase; }

    setFileSystemStrategy(fs: FileSystemStrategy): void { this.fileSystem = fs; }
    getFileSystemStrategy(): FileSystemStrategy | null { return this.fileSystem; }
    isDirty(): boolean { return this.dirty.size > 0; }
    getDirtyFiles(): Set<string> { return this.dirty; }
    setOnDirtyChange(cb: () => void): void { this.onDirtyChange = cb; }
    markDirty(name: string): void { this.dirty.add(name); this.onDirtyChange?.(); }

    storeLoadedFile(name: string, text: string, handle: FileHandle | null): void {
        this.loadedFiles.set(name, { text, handle });
        this.savedContent.set(name, text);
    }

    async saveFile(name: string): Promise<void> {
        if (!this.fileSystem) return;
        const entry = this.loadedFiles.get(name);
        if (!entry) return;
        const content = this.getCurrentContent(name) ?? entry.text;
        const newHandle = await this.fileSystem.save(content, entry.handle, name);
        this.loadedFiles.set(name, { text: content, handle: newHandle });
        this.savedContent.set(name, content);
        this.dirty.delete(name);
        this.onDirtyChange?.();
    }

    async saveAllModified(): Promise<void> {
        for (const name of this.dirty) {
            await this.saveFile(name);
        }
    }

    // ── Table loading ─────────────────────────────────────────────────────────

    loadCSV(fileName: string, csvText: string): void {
        const parsed = parseCSV(csvText);
        const table = Table.fromCSV(fileName.replace(/\.csv$/, ""), parsed);
        this.knowledgeBase.addTable(table);
        this.refreshViews();
    }

    // ── Graph loading ─────────────────────────────────────────────────────────

    /** Load a .graph.json file directly into a Graph model object. */
    loadGraph(fileName: string, jsonText: string): void {
        const json = JSON.parse(jsonText) as unknown;
        const name = fileName.replace(/\.graph\.json$/, "");
        const graph = Graph.fromGraphJSON(name, json);
        graph.sourceFile = fileName;
        this.knowledgeBase.addGraph(graph);
    }

    /** Load a pre-parsed Document into the KnowledgeBase. */
    loadDocument(doc: Document): void {
        this.knowledgeBase.addDocument(doc);
    }

    getGraphs(): Graph[] {
        return this.knowledgeBase.graphs;
    }

    // ── Table operations ──────────────────────────────────────────────────────

    filterByRelation(relation: string, target: string): void {
        const matchingIds = new Set(this.knowledgeBase.graph.filterByRelation(relation, target));
        const tv = this.workspaceController?.getActiveTableView();
        if (tv) tv.renderFiltered(this.knowledgeBase.tables, matchingIds, relation + ' -> ' + target);
    }

    showAll(): void {
        const tv = this.workspaceController?.getActiveTableView();
        if (tv) {
            // Re-render only the active table body — do NOT touch the tab strip
            tv.renderTable(tv.getActiveTableIdx());
        }
    }

    getAssociationsFor(entityId: string) {
        return this.knowledgeBase.graph.getAssociationsFor(entityId);
    }

    getInverse(relation: string): string | null {
        return this.knowledgeBase.graph.getInverse(relation);
    }

    editCell(tableIdx: number, rowIdx: number, colIdx: number, newValue: string, silent = false): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table) return;
        const oldValue = table.getCellValue(rowIdx, colIdx);
        if (oldValue === newValue) return;
        this.history.push({ type: "cell", tableIdx, rowIdx, colIdx, oldValue, newValue });
        table.setCellValue(rowIdx, colIdx, newValue);
        this.markDirty(table.name + ".csv");
        if (!silent) this.showAll();
    }

    addRow(tableIdx: number): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table) return;
        const row = table.appendRow();
        this.history.push({ type: "addRow", tableIdx, row });
        this.markDirty(table.name + ".csv");
        this.showAll();
    }

    insertRow(tableIdx: number, atIdx: number): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table) return;
        const row = table.insertRowAt(atIdx);
        this.history.push({ type: "addRow", tableIdx, row });
        this.markDirty(table.name + ".csv");
        this.showAll();
    }

    moveRow(tableIdx: number, fromIdx: number, toIdx: number): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table || fromIdx === toIdx) return;
        this.history.push({ type: "moveRow", tableIdx, fromIdx, toIdx });
        table.moveRowFromTo(fromIdx, toIdx);
        this.showAll();
    }

    /**
     * Move multiple rows (given by sorted ascending indices) to insertIdx.
     * Removes them all first, then splices them in at the destination.
     * Recorded as a single undoable action.
     */
    moveRows(tableIdx: number, fromIndices: number[], insertIdx: number): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table || fromIndices.length === 0) return;

        const sorted = [...fromIndices].sort((a, b) => a - b);
        const first = sorted[0];
        const last  = sorted[sorted.length - 1];
        // Drop inside the block — no-op
        if (insertIdx >= first && insertIdx <= last + 1) return;

        // Remove rows from highest index to lowest so earlier removals
        // don't shift later indices.
        const removedRows: Row[] = new Array(sorted.length);
        for (let i = sorted.length - 1; i >= 0; i--) {
            removedRows[i] = table.rows.splice(sorted[i], 1)[0];
        }

        // Compute where to insert: how many of the removed rows were
        // strictly before insertIdx shifts the destination down.
        const shift = sorted.filter(idx => idx < insertIdx).length;
        const dest = insertIdx - shift;

        // Splice all rows in at dest, preserving their relative order.
        table.rows.splice(dest, 0, ...removedRows);

        this.history.push({ type: "moveRows", tableIdx, fromIndices: sorted, toIdx: dest, rows: removedRows });
        this.showAll();
    }

    /**
     * Move a rectangular block of cell values from one location to another.
     * The source cells are cleared after moving.
     */
    moveCells(tableIdx: number, cells: { row: number; col: number; value: string }[], destRow: number, destCol: number): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table || cells.length === 0) return;

        // Determine the bounding box of source cells to compute relative offsets
        const minRow = Math.min(...cells.map(c => c.row));
        const minCol = Math.min(...cells.map(c => c.col));

        const undoEntries: { row: number; col: number; oldValue: string; newValue: string }[] = [];

        // Clear source cells
        for (const c of cells) {
            const old = table.getCellValue(c.row, c.col);
            if (old !== "") {
                undoEntries.push({ row: c.row, col: c.col, oldValue: old, newValue: "" });
                table.setCellValue(c.row, c.col, "");
            }
        }

        // Write to destination cells
        for (const c of cells) {
            const dr = destRow + (c.row - minRow);
            const dc = destCol + (c.col - minCol);
            if (dr >= 0 && dr < table.rows.length && dc >= 0 && dc < table.columns.length) {
                const old = table.getCellValue(dr, dc);
                undoEntries.push({ row: dr, col: dc, oldValue: old, newValue: c.value });
                table.setCellValue(dr, dc, c.value);
            }
        }

        this.history.push({ type: "moveCells", tableIdx, entries: undoEntries });
        this.markDirty(table.name + ".csv");
        this.showAll();
    }

    deleteRow(tableIdx: number, rowIdx: number): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table) return;
        const row = table.removeRowAt(rowIdx);
        if (!row) return;
        this.history.push({ type: "deleteRow", tableIdx, rowIdx, row });
        this.markDirty(table.name + ".csv");
        this.showAll();
    }

    // ── Graph node/edge mutations ─────────────────────────────────────────────

    addNode(graphIdx: number, id: string, props: Record<string, string> = {}): void {
        const graph = this.knowledgeBase.graphs[graphIdx];
        if (!graph) return;
        const node = graph.addNode(id, props);
        this.history.push({ type: "addNode", graphIdx, node });
    }

    /** Rename a graph node's label in-place. */
    editNodeLabel(graphIdx: number, nodeId: string, newLabel: string): void {
        const graph = this.knowledgeBase.graphs[graphIdx];
        if (!graph) return;
        const node = graph.getNode(nodeId);
        if (!node) return;
        const tv = node.properties.get("label");
        if (tv) {
            if (tv.value === newLabel) return;
            tv.value = newLabel;
        } else {
            node.properties.set("label", new TypedValue(newLabel, "text"));
        }
    }

    removeNode(graphIdx: number, nodeId: string): void {
        const graph = this.knowledgeBase.graphs[graphIdx];
        if (!graph) return;
        const node = graph.removeNode(nodeId);
        if (!node) return;
        this.history.push({ type: "removeNode", graphIdx, nodeId, node });
    }

    addEdge(graphIdx: number, from: string, to: string, props: Record<string, string> = {}): void {
        const graph = this.knowledgeBase.graphs[graphIdx];
        if (!graph) return;
        const edge = graph.addEdge(from, to, props);
        this.history.push({ type: "addEdge", graphIdx, edge });
    }

    removeEdge(graphIdx: number, edgeId: string): void {
        const graph = this.knowledgeBase.graphs[graphIdx];
        if (!graph) return;
        const edge = graph.removeEdge(edgeId);
        if (!edge) return;
        this.history.push({ type: "removeEdge", graphIdx, edgeId, edge });
    }

    // ── Diagram editing ─────────────────────────────────────────────────────

    /** Record a diagram source edit for global undo/redo. */
    editDiagram(name: string, oldSource: string, newSource: string): void {
        if (oldSource === newSource) return;
        this.history.push({ type: "diagramEdit", diagramName: name, oldSource, newSource });
        this.markDirty(name);
    }

    /** Register a callback to update a diagram view on undo/redo. */
    registerDiagramCallback(name: string, cb: (source: string) => void, getContent?: () => string): void {
        this.diagramUpdateCallbacks.set(name, cb);
        if (getContent) this.diagramContentGetters.set(name, getContent);
    }

    /** Unregister diagram callback (on unmount). */
    unregisterDiagramCallback(name: string): void {
        this.diagramUpdateCallbacks.delete(name);
        this.diagramContentGetters.delete(name);
    }

    // ── Undo / Redo ───────────────────────────────────────────────────────────

    private recheckDirtyFile(name: string): void {
        const saved = this.savedContent.get(name);
        if (saved === undefined) {
            // No saved baseline — file is dirty if it was ever edited
            return;
        }
        const current = this.getCurrentContent(name);
        if (current === null) return;
        if (current === saved) {
            this.dirty.delete(name);
        } else {
            this.dirty.add(name);
        }
        this.onDirtyChange?.();
    }

    /** Get the current in-memory content of a file by name. */
    getCurrentContent(name: string): string | null {
        const table = this.knowledgeBase.tables.find(t => t.name + ".csv" === name || t.name === name);
        if (table) return table.toCSV();
        const graph = this.knowledgeBase.graphs.find(g => g.sourceFile === name || g.name === name);
        if (graph) return serializeGraph(graph);
        // Diagram: get from callback (the DiagramView holds the source)
        const diagramCb = this.diagramContentGetters.get(name);
        if (diagramCb) return diagramCb();
        return null;
    }

    /** Mark a file as saved at its current content. */
    markFileSaved(name: string): void {
        const content = this.getCurrentContent(name);
        if (content !== null) this.savedContent.set(name, content);
        this.dirty.delete(name);
        this.onDirtyChange?.();
    }

    undo(): void {
        const action = this.history.undo();
        if (!action) return;
        if (action.type === "diagramEdit") {
            const cb = this.diagramUpdateCallbacks.get(action.diagramName);
            if (cb) cb(action.oldSource);
            this.recheckDirtyFile(action.diagramName);
            return;
        }
        if (action.type === "cell" || action.type === "addRow" || action.type === "deleteRow" || action.type === "moveRow" || action.type === "moveRows" || action.type === "moveCells") {
            const table = this.knowledgeBase.tables[action.tableIdx];
            if (!table) return;
            if (action.type === "cell") {
                table.setCellValue(action.rowIdx, action.colIdx, action.oldValue);
            } else if (action.type === "moveCells") {
                for (let i = action.entries.length - 1; i >= 0; i--) {
                    const e = action.entries[i];
                    table.setCellValue(e.row, e.col, e.oldValue);
                }
            } else if (action.type === "addRow") {
                const idx = table.rows.lastIndexOf(action.row);
                if (idx >= 0) table.removeRowAt(idx);
            } else if (action.type === "deleteRow") {
                table.restoreRowAt(action.rowIdx, action.row);
            } else if (action.type === "moveRow") {
                table.moveRowFromTo(action.toIdx, action.fromIdx);
            } else if (action.type === "moveRows") {
                table.rows.splice(action.toIdx, action.rows.length);
                for (let i = action.fromIndices.length - 1; i >= 0; i--)
                    table.rows.splice(action.fromIndices[i], 0, action.rows[i]);
            }
            this.navigateToTable(action.tableIdx);
            this.recheckDirtyFile(table.name + ".csv");
        } else {
            const graph = this.knowledgeBase.graphs[action.graphIdx];
            if (!graph) return;
            if (action.type === "addNode") {
                graph.removeNode(action.node.id);
            } else if (action.type === "removeNode") {
                graph.nodes.push(action.node);
            } else if (action.type === "addEdge") {
                graph.removeEdge(action.edge.id);
            } else if (action.type === "removeEdge") {
                graph.edges.push(action.edge);
            }
            this.navigateToGraph(action.graphIdx);
            this.recheckDirtyFile(graph.name);
        }
    }

    redo(): void {
        const action = this.history.redo();
        if (!action) return;
        if (action.type === "diagramEdit") {
            const cb = this.diagramUpdateCallbacks.get(action.diagramName);
            if (cb) cb(action.newSource);
            this.recheckDirtyFile(action.diagramName);
            return;
        }
        if (action.type === "cell" || action.type === "addRow" || action.type === "deleteRow" || action.type === "moveRow" || action.type === "moveRows" || action.type === "moveCells") {
            const table = this.knowledgeBase.tables[action.tableIdx];
            if (!table) return;
            if (action.type === "cell") {
                table.setCellValue(action.rowIdx, action.colIdx, action.newValue);
            } else if (action.type === "moveCells") {
                for (const e of action.entries) {
                    table.setCellValue(e.row, e.col, e.newValue);
                }
            } else if (action.type === "addRow") {
                table.restoreRowAt(table.rows.length, action.row);
            } else if (action.type === "deleteRow") {
                table.removeRowAt(action.rowIdx);
            } else if (action.type === "moveRow") {
                table.moveRowFromTo(action.fromIdx, action.toIdx);
            } else if (action.type === "moveRows") {
                // Redo: remove from original positions, splice at dest
                for (let i = action.fromIndices.length - 1; i >= 0; i--)
                    table.rows.splice(action.fromIndices[i], 1);
                table.rows.splice(action.toIdx, 0, ...action.rows);
            }
            this.navigateToTable(action.tableIdx);
            this.recheckDirtyFile(table.name + ".csv");
        } else {
            const graph = this.knowledgeBase.graphs[action.graphIdx];
            if (!graph) return;
            if (action.type === "addNode") {
                graph.nodes.push(action.node);
            } else if (action.type === "removeNode") {
                graph.removeNode(action.nodeId);
            } else if (action.type === "addEdge") {
                graph.edges.push(action.edge);
            } else if (action.type === "removeEdge") {
                graph.removeEdge(action.edgeId);
            }
            this.navigateToGraph(action.graphIdx);
            this.recheckDirtyFile(graph.name);
        }
    }

    // ── Export ────────────────────────────────────────────────────────────────

    exportCSV(tableIdx: number): string {
        return this.knowledgeBase.exportTableAsCSV(tableIdx);
    }

    exportGraph(graphIdx: number): string {
        return this.knowledgeBase.graphs[graphIdx]?.toGraphJSON() ?? "";
    }

    /** Replace an entire table (from source editor Apply). */
    replaceTable(tableIdx: number, newTable: import("../model/Table.ts").Table): void {
        if (tableIdx < 0 || tableIdx >= this.knowledgeBase.tables.length) return;
        this.knowledgeBase.tables[tableIdx] = newTable;
        this.showAll();
    }

    /** Replace an entire graph (from source editor Apply). */
    replaceGraph(graphIdx: number, newGraph: import("../model/Graph.ts").Graph): void {
        if (graphIdx < 0 || graphIdx >= this.knowledgeBase.graphs.length) return;
        this.knowledgeBase.graphs[graphIdx] = newGraph;
    }

    searchText(query: string): SearchHit[] {
        return searchText(this.knowledgeBase, query);
    }

    searchByIdentifier(name: string): SearchHit[] {
        return searchByIdentifier(this.knowledgeBase, name);
    }

    getNeighbourhood(startEntityId: string, maxHops: number): NeighbourHit[] {
        return getNeighbourhood(this.knowledgeBase, startEntityId, maxHops);
    }

    crossTableJoin(leftTableIdx: number, rightTableIdx: number, relation: string): JoinHit[] {
        return crossTableJoin(this.knowledgeBase, leftTableIdx, rightTableIdx, relation);
    }

    getLoadedFileNames(): string[] {
        return this.knowledgeBase.tables.map(t => t.name);
    }

    // ── Control file (legacy CSV-based diagram path) ──────────────────────────

    loadControlFile(jsonText: string): ControlFile {
        const parsed = JSON.parse(jsonText) as unknown;
        return parseControlFile(parsed);
    }

    /**
     * Resolve all diagram declarations in a ControlFile against loaded CSV
     * data, producing Graph objects stored in knowledgeBase.graphs.
     */
    resolveAllDiagrams(
        controlFile: ControlFile,
        csvFiles: Map<string, { headers: string[]; types: string[]; rows: string[][] }>,
        graphFiles: Map<string, string> = new Map(),
    ): void {
        for (const entry of controlFile.entries) {
            if (entry.view === "table") continue;
            if (entry.view === "diagram") continue;

            // Native .graph.json reference
            if (entry.view === "graph") {
                const decl = entry as GraphFileDecl;
                const text = graphFiles.get(decl.file);
                if (!text) continue;
                const json = JSON.parse(text) as unknown;
                const graph = Graph.fromGraphJSON(decl.id, json);
                graph.sourceFile = decl.file;
                this.knowledgeBase.addGraph(graph);
                continue;
            }

            if (entry.view === "sequence") {
                const seq = entry as SequenceDecl;
                const actorFile = csvFiles.get(seq.actors.file);
                const msgFile   = csvFiles.get(seq.messages.file);
                if (!actorFile || !msgFile) continue;

                const actors   = resolveActors(actorFile.headers, actorFile.rows, seq.actors.mapping);
                const messages = resolveMessages(msgFile.headers, msgFile.rows, seq.messages.mapping);

                // Build a Graph from sequence data
                const graph = new Graph(entry.id, "sequence");
                for (const a of actors) graph.addNode(a.id, { label: a.label });
                for (const m of messages) {
                    graph.addEdge(m.from, m.to, {
                        label: m.label,
                        type: m.type,
                        time: String(m.time),
                    });
                }
                this.knowledgeBase.addGraph(graph);
                continue;
            }

            // flow / spatial / relation
            const flow = entry as FlowDecl;
            const nodeSources: NodeSource[] = Array.isArray(flow.nodes)
                ? flow.nodes
                : [flow.nodes];

            const allNodes = nodeSources.flatMap(src => {
                const f = csvFiles.get(src.file);
                if (!f) return [];
                return resolveNodes(f.headers, f.rows, src.mapping);
            });

            let resolvedEdges: { from: string; to: string; type: string; label: string }[] | undefined;
            if (flow.edges) {
                const ef = csvFiles.get(flow.edges.file);
                if (ef) resolvedEdges = resolveEdges(ef.headers, ef.rows, flow.edges.mapping);
            }

            // Fallback: _associations column
            if (!resolvedEdges && nodeSources.length > 0) {
                const firstFile = csvFiles.get(nodeSources[0].file);
                if (firstFile) {
                    const assocIdx = firstFile.headers.indexOf("_associations");
                    if (assocIdx >= 0) {
                        resolvedEdges = [];
                        firstFile.rows.forEach(row => {
                            const srcId = row[firstFile.headers.indexOf(nodeSources[0].mapping.id)] ?? "";
                            const assocVal = row[assocIdx] ?? "";
                            for (const part of assocVal.split(";")) {
                                const [rel, tgt] = part.split(":");
                                if (tgt) resolvedEdges!.push({ from: srcId, to: tgt.trim(), type: rel?.trim() ?? "", label: "" });
                            }
                        });
                    }
                }
            }

            const graph = new Graph(
                entry.id,
                entry.view as "flow" | "spatial" | "relation",
                [],
                [],
                flow.nodeStyles ?? {},
                flow.edgeStyles ?? {},
            );

            for (const n of allNodes) {
                const props: Record<string, string> = { label: n.label, type: n.type, ...n.extra };
                if (n.x !== undefined) props.x = String(n.x);
                if (n.y !== undefined) props.y = String(n.y);
                graph.addNode(n.id, props);
            }
            // Clear the auto-generated edge ids from addNode calls, then add edges
            graph.edges = [];
            for (const e of (resolvedEdges ?? [])) {
                const props: Record<string, string> = {};
                if (e.type)  props.type  = e.type;
                if (e.label) props.label = e.label;
                graph.addEdge(e.from, e.to, props);
            }

            this.knowledgeBase.addGraph(graph);
        }
    }

    private navigateToTable(tableIdx: number): void {
        const table = this.knowledgeBase.tables[tableIdx];
        if (!table || !this.workspaceController) return;
        const tv = this.workspaceController.getActiveTableView();
        if (tv) {
            // Already on a table tab — check if it's the right one
            const activeId = this.workspaceController.getActiveId();
            if (activeId === table.name) {
                // Same tab: just re-render the body
                tv.renderTable(tableIdx);
                return;
            }
        }
        // Different tab: switch to it (mount re-renders automatically)
        this.workspaceController.activateTab(table.name);
    }

    private navigateToGraph(graphIdx: number): void {
        const graph = this.knowledgeBase.graphs[graphIdx];
        if (!graph || !this.workspaceController) return;
        this.workspaceController.activateTab(graph.name);
    }

    private refreshViews(): void {
        if (this.graphFilterView) {
            this.graphFilterView.updateDropdowns(
                this.knowledgeBase.graph.getRelationTypes(),
                this.knowledgeBase.graph.getAllEntityIds(),
            );
        }
        this.showAll();
    }
}
