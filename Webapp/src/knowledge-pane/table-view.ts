import { renderCell } from "../cell-renderers/registry.ts";
import type { Table, Row } from "../model/index.ts";
import type { AppController } from "../controller/index.ts";
import type { WorkspaceView, WorkspaceData, ViewState, ToolbarAction } from "./workspace-view.ts";
import type { SourceEditorView } from "../source-editor/source-editor-view.ts";

interface TableState {
    scrollTop: number;
    scrollLeft: number;
}

/** Identifies a cell by row/col index within the rendered table. */
interface CellCoord { row: number; col: number; }

export class TableView implements WorkspaceView {
    private container: HTMLElement;
    private sourceEditor: SourceEditorView | null = null;
    private controller: AppController | null = null;
    private onEntityClick: ((entityId: string) => void) | null = null;
    private onCellFocusChange: (() => void) | null = null;
    private onStatus: ((msg: string) => void) | null = null;
    private activeTabIdx = 0;
    private currentTables: Table[] = [];
    /** The real index of the mounted table in kb.tables[]. Used for all controller calls. */
    private kbTableIdx = 0;
    /** Row objects currently checked for multi-row drag. */
    private selectedRows = new Set<Row>();

    // ── Multi-cell selection state ────────────────────────────────────────────
    /** Set of selected cell coordinates (row,col) for multi-cell selection. */
    private selectedCells: CellCoord[] = [];
    /** Anchor cell for shift-click range selection. */
    private selectionAnchor: CellCoord | null = null;
    /** Clipboard for cut cells (Ctrl+X). */
    private cutBuffer: { row: number; col: number; value: string }[] = [];
    /** Reference to the current tbody for cell-highlight updates. */
    private currentTbody: HTMLElement | null = null;
    /** Zoom level for the table view. */
    private zoom = 1;

    private activeCell: {
        td: HTMLElement;
        originalValue: string;
        typeId: string;
        tableIdx: number;
        rowIdx: number;
        colIdx: number;
        commit: (value: string) => void;
        cancel: () => void;
        onCommit: (value: string) => void;
    } | null = null;


    constructor(container: HTMLElement) {
        this.container = container;
        this.handleKeyDown = this.handleKeyDown.bind(this);
        document.addEventListener("keydown", this.handleKeyDown);
        this.attachWheelZoom(container);
    }

    private attachWheelZoom(el: HTMLElement): void {
        el.addEventListener("wheel", (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            if (e.deltaY < 0) this.zoom = Math.min(4, this.zoom * 1.1);
            else this.zoom = Math.max(0.25, this.zoom / 1.1);
            this.applyZoom();
        }, { passive: false });
    }

    setController(controller: AppController): void { this.controller = controller; }
    setSourceEditor(se: SourceEditorView): void { this.sourceEditor = se; }
    setEntityClickHandler(handler: (entityId: string) => void): void { this.onEntityClick = handler; }
    setStatusCallback(cb: (msg: string) => void): void { this.onStatus = cb; }
    setOnCellFocusChange(cb: () => void): void { this.onCellFocusChange = cb; }
    getActiveTableIdx(): number { return this.kbTableIdx; }
    getController(): AppController | null { return this.controller; }
    setContainer(el: HTMLElement): void { this.container = el; this.attachWheelZoom(el); }

    // ── WorkspaceView interface ───────────────────────────────────────────────

    mount(container: HTMLElement, data: WorkspaceData, savedState?: ViewState): void {
        this.container = container;
        this.attachWheelZoom(container);
        if (data.table) {
            this.currentTables = [data.table];
            this.activeTabIdx = 0;
            const kb = this.controller?.getKnowledgeBase();
            this.kbTableIdx = kb ? kb.tables.indexOf(data.table) : 0;
        }
        this.renderActiveTable();
        if (savedState) {
            const s = savedState as TableState;
            container.scrollTop  = s.scrollTop;
            container.scrollLeft = s.scrollLeft;
        }
    }

    unmount(): ViewState {
        this.cancelActive();
        return {
            scrollTop:  this.container.scrollTop,
            scrollLeft: this.container.scrollLeft,
        } satisfies TableState;
    }

    update(data: WorkspaceData): void {
        if (data.table) {
            this.currentTables = [data.table];
            this.renderActiveTable();
        }
    }

    getToolbarActions(): ToolbarAction[] {
        return [
            { id: "add-row", label: "+ Row", title: "Add row" },
        ];
    }

    onToolbarAction(id: string): void {
        if (id === "add-row" && this.controller) {
            this.controller.addRow(this.kbTableIdx);
        }
    }

    /**
     * Render only the table body for a specific table index into the container,
     * without touching the tab strip. Used by main.ts when control.json drives
     * tab creation externally.
     */
    renderTable(_tableIdx?: number): void {
        this.cancelActive();
        this.container.innerHTML = "";
        const table = this.currentTables[0];
        if (!table) return;
        this.container.className = "";
        this.renderTableRows(table, table.rows, this.kbTableIdx);
        this.onStatus?.(`${table.name}  —  ${table.rows.length} rows × ${table.columns.length} cols`);
    }

    renderAll(tables: Table[]): void {
        this.cancelActive();
        this.currentTables = tables;
        if (this.activeTabIdx >= tables.length) this.activeTabIdx = Math.max(0, tables.length - 1);
        this.renderActiveTable();
    }

    renderFiltered(tables: Table[], entityIds: Set<string>, label: string): void {
        this.cancelActive();
        this.container.innerHTML = "";
        this.container.className = "";
        for (const table of tables) {
            const filtered = table.filterByEntityIds(entityIds);
            if (filtered.length === 0) continue;
            const h3 = document.createElement("h3");
            h3.textContent = `${table.name} (filtered: ${label})`;
            this.container.appendChild(h3);
            this.renderTableRows(table, filtered, -1);
        }
        if (this.container.children.length === 0)
            this.container.textContent = "No entities match this filter.";
    }


    private renderActiveTable(): void {
        this.container.innerHTML = "";
        const table = this.currentTables[this.activeTabIdx];
        if (!table) {
            this.container.className = "drop-hint";
            this.container.textContent = "Drop .csv files here or use Open above.";
            return;
        }
        this.container.className = "";
        this.renderTableRows(table, table.rows, this.kbTableIdx);
        this.onStatus?.(`${table.name}  —  ${table.rows.length} rows × ${table.columns.length} cols`);
    }

    private renderTableRows(table: Table, rows: Row[], tableIdx: number): void {
        const tableEl = document.createElement("table");
        tableEl.className = "knowledge-table";

        const render = () => {
            tableEl.innerHTML = "";

            const thead = document.createElement("thead");
            const headerRow = document.createElement("tr");
            if (tableIdx >= 0) {
                const thCb = document.createElement("th");
                thCb.className = "row-check-col";
                const headerCb = document.createElement("input");
                headerCb.type = "checkbox";
                headerCb.title = "Select / deselect all rows";
                const checkedCount = rows.filter(r => this.selectedRows.has(r)).length;
                headerCb.checked = checkedCount === rows.length && rows.length > 0;
                headerCb.indeterminate = checkedCount > 0 && checkedCount < rows.length;
                headerCb.addEventListener("click", (e) => {
                    e.preventDefault();
                    // Read live count at click time, not stale closure value
                    const liveCount = rows.filter(r => this.selectedRows.has(r)).length;
                    if (liveCount < rows.length) {
                        rows.forEach(r => this.selectedRows.add(r));
                    } else {
                        this.selectedRows.clear();
                    }
                    render();
                });
                thCb.appendChild(headerCb);
                headerRow.appendChild(thCb);
            }
            table.columns.forEach((col) => {
                const th = document.createElement("th");
                th.textContent = col.name;
                headerRow.appendChild(th);
            });
            if (tableIdx >= 0) headerRow.appendChild(document.createElement("th")); // actions
            thead.appendChild(headerRow);
            tableEl.appendChild(thead);

            const tbody = document.createElement("tbody");
            // Keep a reference to the header checkbox so individual row
            // checkboxes can update it live without a full re-render.
            let headerCbRef: HTMLInputElement | null = null;
            if (tableIdx >= 0) {
                headerCbRef = thead.querySelector<HTMLInputElement>("input[type=checkbox]");
            }

            const updateHeaderCb = () => {
                if (!headerCbRef) return;
                const checked = rows.filter(r => this.selectedRows.has(r)).length;
                headerCbRef.checked = checked === rows.length && rows.length > 0;
                headerCbRef.indeterminate = checked > 0 && checked < rows.length;
            };

            for (const row of rows) {
                const rowIdx = table.rows.indexOf(row);
                const tr = document.createElement("tr");
                tr.dataset.rowIdx = String(rowIdx);

                if (tableIdx >= 0) {
                    const cbTd = document.createElement("td");
                    cbTd.className = "row-check-col";
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.checked = this.selectedRows.has(row);
                    cb.addEventListener("mousedown", (e) => e.stopPropagation());
                    cbTd.addEventListener("mousedown", (e) => {
                        if ((e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
                    });
                    cb.addEventListener("change", () => {
                        if (cb.checked) {
                            this.selectedRows.add(row);
                        } else {
                            this.selectedRows.delete(row);
                        }
                        tr.classList.toggle("row-selected", cb.checked);
                        updateHeaderCb();
                    });
                    cbTd.appendChild(cb);
                    tr.appendChild(cbTd);
                    tr.draggable = true;
                    tr.classList.toggle("row-selected", this.selectedRows.has(row));
                    this.attachDragHandlers(tr, tbody, tableIdx, table, row);
                }

                row.cells.forEach((cell, colIdx) => {
                    const td = document.createElement("td");

                    // Double-click on col 0 triggers entity navigation
                    if (colIdx === 0 && this.onEntityClick) {
                        td.style.cursor = "pointer";
                        td.style.textDecoration = "underline";
                        td.addEventListener("dblclick", (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            this.onEntityClick!(row.entityId);
                        });
                    }

                    // Cell always shows rendered output
                    this.showRendered(td, cell.value, cell.typeId);

                    if (tableIdx >= 0 && this.controller) {
                        td.classList.add("editable-cell");
                        td.dataset.row = String(rowIdx);
                        td.dataset.col = String(colIdx);

                        td.addEventListener("mousedown", (e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const coord: CellCoord = { row: rowIdx, col: colIdx };

                            if (e.shiftKey && this.selectionAnchor) {
                                this.selectRange(this.selectionAnchor, coord);
                                return;
                            }
                            if (e.ctrlKey || e.metaKey) {
                                this.toggleCellSelection(coord);
                                return;
                            }
                            // Check if clicking inside an already-selected region → start drag-to-move
                            if (this.selectedCells.length >= 1 && this.isCellSelected(coord)) {
                                this.startCellDrag(e, tableIdx);
                                return;
                            }

                            // Activate cell immediately
                            this.cancelActive();
                            this.clearCellSelection();
                            this.selectedCells = [coord];
                            this.selectionAnchor = coord;
                            this.updateCellHighlights();
                            this.onCellFocusChange?.();
                            this.activateCell(td, cell.value, cell.typeId, tableIdx, rowIdx, colIdx, (newValue) => {
                                this.controller!.editCell(tableIdx, rowIdx, colIdx, newValue);
                            });

                            // Also track drag-to-select if mouse moves
                            const onMove = (me: MouseEvent) => {
                                const target = document.elementFromPoint(me.clientX, me.clientY) as HTMLElement | null;
                                const hitTd = target?.closest<HTMLElement>("td.editable-cell");
                                if (!hitTd || !hitTd.dataset.row || !hitTd.dataset.col) return;
                                const to: CellCoord = { row: parseInt(hitTd.dataset.row), col: parseInt(hitTd.dataset.col) };
                                if (to.row !== coord.row || to.col !== coord.col) {
                                    this.cancelActive();
                                    this.selectRange(coord, to);
                                }
                            };
                            const onUp = () => {
                                document.removeEventListener("mousemove", onMove);
                                document.removeEventListener("mouseup", onUp);
                            };
                            document.addEventListener("mousemove", onMove);
                            document.addEventListener("mouseup", onUp);
                        });

                        // Prevent browser text selection on double-click
                        td.addEventListener("dblclick", (e) => {
                            if (!(colIdx === 0 && this.onEntityClick)) e.preventDefault();
                        });
                    }

                    tr.appendChild(td);
                });

                if (tableIdx >= 0 && this.controller) {
                    const tdAct = document.createElement("td");
                    tdAct.className = "row-actions";

                    const insertBtn = document.createElement("button");
                    insertBtn.textContent = "+";
                    insertBtn.className = "row-insert-btn";
                    insertBtn.title = "Insert row below";
                    insertBtn.addEventListener("click", () => this.controller!.insertRow(tableIdx, rowIdx + 1));

                    const delBtn = document.createElement("button");
                    delBtn.textContent = "✕";
                    delBtn.className = "row-delete-btn";
                    delBtn.title = "Delete row";
                    delBtn.addEventListener("click", () => {
                        if (confirm(`Delete row "${row.entityId}"?`)) this.controller!.deleteRow(tableIdx, rowIdx);
                    });

                    tdAct.appendChild(insertBtn);
                    tdAct.appendChild(delBtn);
                    tr.appendChild(tdAct);
                }

                tbody.appendChild(tr);
            }
            tableEl.appendChild(tbody);
            if (tableIdx >= 0) this.attachTbodyDragHandlers(tbody, tableIdx, table);
            this.currentTbody = tbody;
        };

        render();
        this.container.appendChild(tableEl);
        this.applyZoom();
        if (tableIdx >= 0) this.renderZoomBar();
    }

    // ── Drag-to-reorder ───────────────────────────────────────────────────────

    /**
     * The Row objects being dragged. Set on dragstart, cleared on dragend.
     * Using Row objects (not indices) means the set is never stale after re-renders.
     */
    private dragRows: Row[] = [];

    private attachDragHandlers(tr: HTMLTableRowElement, tbody: HTMLElement, _tableIdx: number, table: Table, row: Row): void {
        tr.addEventListener("dragstart", (e) => {
            // `row` is the Row object for this tr, passed from the render loop.
            // If it's in the selection, drag the whole selection; otherwise just this row.
            if (this.selectedRows.has(row) && this.selectedRows.size > 0) {
                this.dragRows = table.rows.filter(r => this.selectedRows.has(r));
            } else {
                this.dragRows = [row];
            }

            e.dataTransfer!.effectAllowed = "move";
            // Store count so drop handler knows multi vs single
            e.dataTransfer!.setData("text/plain", String(this.dragRows.length));

            // Custom ghost: show all dragged rows stacked
            if (this.dragRows.length > 1) {
                const ghost = document.createElement("div");
                ghost.style.cssText = [
                    "position:fixed;top:-9999px;left:0;",
                    "background:#fff;border:1px solid #cbd5e1;",
                    "border-radius:4px;padding:2px 0;",
                    "font:13px system-ui,sans-serif;color:#1e293b;",
                    "box-shadow:0 2px 8px rgba(0,0,0,0.15);",
                    "pointer-events:none;",
                ].join("");
                for (const r of this.dragRows) {
                    const idx = table.rows.indexOf(r);
                    const srcTr = tbody.querySelector<HTMLTableRowElement>(`tr[data-row-idx="${idx}"]`);
                    const line = document.createElement("div");
                    line.style.cssText = "padding:3px 10px;border-bottom:1px solid #f1f5f9;white-space:nowrap;";
                    const firstCell = srcTr?.querySelectorAll("td")[1];
                    line.textContent = firstCell?.textContent?.trim() ?? r.getCellValue(0);
                    ghost.appendChild(line);
                }
                document.body.appendChild(ghost);
                e.dataTransfer!.setDragImage(ghost, 0, 0);
                requestAnimationFrame(() => ghost.remove());
            }

            // Dim all dragged rows
            for (const r of this.dragRows) {
                const idx = table.rows.indexOf(r);
                tbody.querySelector<HTMLTableRowElement>(`tr[data-row-idx="${idx}"]`)
                    ?.classList.add("row-dragging");
            }
        });

        tr.addEventListener("dragend", () => {
            tbody.querySelectorAll(".row-dragging").forEach(el => el.classList.remove("row-dragging"));
            this.clearDropIndicator(tbody);
            this.dragRows = [];
        });
    }

    private attachTbodyDragHandlers(tbody: HTMLElement, tableIdx: number, table: Table): void {
        tbody.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer!.dropEffect = "move";
            this.showDropIndicator(tbody, this.getInsertIdx(e, tbody, table), table);
        });
        tbody.addEventListener("dragleave", (e) => {
            if (!tbody.contains(e.relatedTarget as Node))
                this.clearDropIndicator(tbody);
        });
        tbody.addEventListener("drop", (e) => {
            e.preventDefault();
            this.clearDropIndicator(tbody);
            if (this.dragRows.length === 0) return;

            const insertIdx = this.getInsertIdx(e, tbody, table);

            if (this.dragRows.length === 1) {
                // Single-row move
                const from = table.rows.indexOf(this.dragRows[0]);
                if (from === -1) { this.dragRows = []; return; }
                const to = insertIdx > from ? insertIdx - 1 : insertIdx;
                if (from !== to) this.controller!.moveRow(tableIdx, from, to);
            } else {
                // Multi-row move: resolve live indices NOW (at drop time)
                const liveIndices = this.dragRows
                    .map(r => table.rows.indexOf(r))
                    .filter(i => i !== -1)
                    .sort((a, b) => a - b);
                if (liveIndices.length > 0)
                    this.controller!.moveRows(tableIdx, liveIndices, insertIdx);
            }

            this.dragRows = [];
        });
    }


    /**
     * Determine the insertion index (0 = before first row, n = after last row)
     * based on the cursor's vertical position within the tbody.
     */
    private getInsertIdx(e: DragEvent, tbody: HTMLElement, table: Table): number {
        const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr"));
        for (let i = 0; i < rows.length; i++) {
            const rect = rows[i].getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) return i;
        }
        return table.rows.length;
    }

    /** Reposition (or create) the blue drop-indicator line inside the tbody. */
    private showDropIndicator(tbody: HTMLElement, insertIdx: number, _table: Table): void {
        const container = tbody.closest("table")!.parentElement!;
        container.style.position = "relative";

        let indicator = container.querySelector<HTMLElement>(".row-drop-indicator");
        if (!indicator) {
            indicator = document.createElement("div");
            indicator.className = "row-drop-indicator";
            container.appendChild(indicator);
        }

        const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr"));
        const containerRect = container.getBoundingClientRect();
        const tableEl = tbody.closest("table")!;
        const tableRect = tableEl.getBoundingClientRect();

        let targetY: number;
        if (rows.length === 0) {
            targetY = 0;
        } else if (insertIdx === 0) {
            targetY = rows[0].getBoundingClientRect().top - containerRect.top;
        } else if (insertIdx >= rows.length) {
            const last = rows[rows.length - 1].getBoundingClientRect();
            targetY = last.bottom - containerRect.top;
        } else {
            targetY = rows[insertIdx].getBoundingClientRect().top - containerRect.top;
        }

        indicator.style.top   = `${targetY}px`;
        indicator.style.left  = `${tableRect.left - containerRect.left}px`;
        indicator.style.width = `${tableRect.width}px`;
    }

    private clearDropIndicator(tbody: HTMLElement): void {
        tbody.closest("table")?.parentElement
            ?.querySelectorAll(".row-drop-indicator")
            .forEach(el => el.remove());
    }

    // ── Cell activation — formula bar becomes the editor ─────────────────────

    private activateCell(
        td: HTMLElement,
        originalValue: string,
        typeId: string,
        tableIdx: number,
        rowIdx: number,
        colIdx: number,
        onCommit: (value: string) => void,
    ): void {
        td.classList.add("cell-active");

        this.sourceEditor?.setText(originalValue, typeId as import("../source-editor/highlighter.ts").SyntaxType);
        this.sourceEditor?.setOnCellApply(() => this.commitActive());
        requestAnimationFrame(() => { this.sourceEditor?.focusTextarea(); });

        const deactivate = () => {
            this.activeCell = null;
            td.classList.remove("cell-active");
            this.sourceEditor?.setOnCellApply(null);
            this.sourceEditor?.clear();
        };

        const commit = (value: string) => {
            deactivate();
            onCommit(value);
            this.showRendered(td, value, typeId);
        };

        const cancel = () => {
            deactivate();
            this.showRendered(td, originalValue, typeId);
        };

        this.activeCell = { td, originalValue, typeId, tableIdx, rowIdx, colIdx, commit, cancel, onCommit };
    }

    commitActive(): void {
        if (!this.activeCell) return;
        const value = this.sourceEditor?.getValue() ?? this.activeCell.originalValue;
        if (value === this.activeCell.originalValue) return;
        // Update model silently (no re-render), then update just this cell's DOM
        this.activeCell.originalValue = value;
        this.controller!.editCell(this.activeCell.tableIdx, this.activeCell.rowIdx, this.activeCell.colIdx, value, true);
        this.showRendered(this.activeCell.td, value, this.activeCell.typeId);
    }

    cancelActive(): void {
        if (!this.activeCell) return;
        this.commitActive();
        const { td } = this.activeCell!;
        this.activeCell = null;
        td.classList.remove("cell-active");
        this.sourceEditor?.setOnCellApply(null);
        this.sourceEditor?.clear();
    }

    /** Clear all row checkbox selections and re-render. */
    clearSelection(): void {
        if (this.selectedRows.size === 0) return;
        this.selectedRows.clear();
        this.dragRows = [];
        this.renderActiveTable();
    }

    // ── Multi-cell selection ──────────────────────────────────────────────────

    private isCellSelected(coord: CellCoord): boolean {
        return this.selectedCells.some(c => c.row === coord.row && c.col === coord.col);
    }

    private clearCellSelection(): void {
        this.selectedCells = [];
        this.cutBuffer = [];
        this.updateCellHighlights();
    }

    private toggleCellSelection(coord: CellCoord): void {
        const idx = this.selectedCells.findIndex(c => c.row === coord.row && c.col === coord.col);
        if (idx >= 0) {
            this.selectedCells.splice(idx, 1);
        } else {
            this.selectedCells.push(coord);
            this.selectionAnchor = coord;
        }
        this.updateCellHighlights();
    }

    private selectRange(from: CellCoord, to: CellCoord): void {
        const minRow = Math.min(from.row, to.row);
        const maxRow = Math.max(from.row, to.row);
        const minCol = Math.min(from.col, to.col);
        const maxCol = Math.max(from.col, to.col);
        this.selectedCells = [];
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                this.selectedCells.push({ row: r, col: c });
            }
        }
        this.updateCellHighlights();
    }

    /** Drag-to-move: when user drags an already-selected region, move cells to drop target. */
    private startCellDrag(_startEvent: MouseEvent, tableIdx: number): void {
        const table = this.currentTables[this.activeTabIdx];
        if (!table || !this.controller) return;

        // Snapshot values of selected cells
        const cellData = this.selectedCells.map(c => ({
            row: c.row, col: c.col, value: table.getCellValue(c.row, c.col),
        }));

        // Compute selection bounding box
        const minRow = Math.min(...this.selectedCells.map(c => c.row));
        const minCol = Math.min(...this.selectedCells.map(c => c.col));
        const maxRow = Math.max(...this.selectedCells.map(c => c.row));
        const maxCol = Math.max(...this.selectedCells.map(c => c.col));
        const spanRows = maxRow - minRow + 1;
        const spanCols = maxCol - minCol + 1;

        // Create ghost overlay element (shown only once mouse moves)
        const ghost = document.createElement("div");
        ghost.className = "cell-drag-ghost";
        ghost.style.display = "none";
        this.container.style.position = "relative";
        this.container.appendChild(ghost);

        const updateGhost = (destRow: number, destCol: number) => {
            // Get bounding rect of the destination region
            const topLeft = this.getCellElement(destRow, destCol);
            const bottomRight = this.getCellElement(
                Math.min(destRow + spanRows - 1, table.rows.length - 1),
                Math.min(destCol + spanCols - 1, table.columns.length - 1),
            );
            if (!topLeft || !bottomRight) { ghost.style.display = "none"; return; }
            const containerRect = this.container.getBoundingClientRect();
            const tlRect = topLeft.getBoundingClientRect();
            const brRect = bottomRight.getBoundingClientRect();
            ghost.style.display = "";
            ghost.style.top = `${tlRect.top - containerRect.top + this.container.scrollTop}px`;
            ghost.style.left = `${tlRect.left - containerRect.left + this.container.scrollLeft}px`;
            ghost.style.width = `${brRect.right - tlRect.left}px`;
            ghost.style.height = `${brRect.bottom - tlRect.top}px`;
        };

        let didMove = false;
        let lastDestRow = minRow;
        let lastDestCol = minCol;

        const onMove = (e: MouseEvent) => {
            const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
            const td = target?.closest<HTMLElement>("td.editable-cell");
            if (!td || !td.dataset.row || !td.dataset.col) return;
            lastDestRow = parseInt(td.dataset.row);
            lastDestCol = parseInt(td.dataset.col);
            if (lastDestRow === minRow && lastDestCol === minCol) return;
            if (!didMove) {
                didMove = true;
                this.currentTbody?.closest("table")?.classList.add("cells-dragging");
            }
            ghost.style.display = "";
            updateGhost(lastDestRow, lastDestCol);
        };

        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            this.currentTbody?.closest("table")?.classList.remove("cells-dragging");
            ghost.remove();

            // Don't move if dropping back on the same origin
            if (lastDestRow === minRow && lastDestCol === minCol) return;

            // Check if destination contains non-empty cells
            let hasContent = false;
            for (const c of cellData) {
                const dr = lastDestRow + (c.row - minRow);
                const dc = lastDestCol + (c.col - minCol);
                if (dr >= 0 && dr < table.rows.length && dc >= 0 && dc < table.columns.length) {
                    // Skip if this destination cell is also a source cell (moving within itself)
                    if (this.selectedCells.some(s => s.row === dr && s.col === dc)) continue;
                    if (table.getCellValue(dr, dc) !== "") { hasContent = true; break; }
                }
            }

            if (hasContent) {
                if (!confirm("Destination cells contain data. Do you want to replace them?")) return;
            }

            this.controller!.moveCells(tableIdx, cellData, lastDestRow, lastDestCol);
            this.selectedCells = [];
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }

    private updateCellHighlights(): void {
        if (!this.currentTbody) return;
        // Remove all existing highlights
        this.currentTbody.querySelectorAll(".cell-selected, .cell-cut").forEach(el => {
            el.classList.remove("cell-selected", "cell-cut");
        });
        // Add selection highlight
        for (const coord of this.selectedCells) {
            const td = this.getCellElement(coord.row, coord.col);
            if (td) td.classList.add("cell-selected");
        }
        // Add cut highlight
        for (const cell of this.cutBuffer) {
            const td = this.getCellElement(cell.row, cell.col);
            if (td) td.classList.add("cell-cut");
        }
    }

    private getCellElement(row: number, col: number): HTMLElement | null {
        if (!this.currentTbody) return null;
        const tr = this.currentTbody.querySelector<HTMLTableRowElement>(`tr[data-row-idx="${row}"]`);
        if (!tr) return null;
        // +1 to skip the checkbox column
        const tds = tr.querySelectorAll<HTMLElement>("td.editable-cell");
        return tds[col] ?? null;
    }

    private handleKeyDown(e: KeyboardEvent): void {
        // Only handle when our container is in the DOM and visible
        if (!this.container.isConnected) return;
        if (!this.currentTbody) return;
        // Don't intercept keys when source editor is focused
        if (this.sourceEditor?.focused) return;

        const ctrl = e.ctrlKey || e.metaKey;

        // Arrow keys with Shift to extend selection
        if (e.key.startsWith("Arrow") && this.selectionAnchor) {
            if (e.shiftKey) {
                e.preventDefault();
                const last = this.selectedCells.length > 0
                    ? this.selectedCells[this.selectedCells.length - 1]
                    : this.selectionAnchor;
                const next = this.moveCoord(last, e.key);
                if (next) {
                    this.selectedCells.push(next);
                    this.updateCellHighlights();
                }
            } else if (!ctrl && this.selectedCells.length > 0) {
                // Arrow without shift: move single selection
                e.preventDefault();
                const current = this.selectedCells[this.selectedCells.length - 1];
                const next = this.moveCoord(current, e.key);
                if (next) {
                    this.cancelActive();
                    this.selectedCells = [next];
                    this.selectionAnchor = next;
                    this.updateCellHighlights();
                }
            }
            return;
        }

        // Ctrl+X — cut selected cells
        if (ctrl && e.key === "x" && this.selectedCells.length > 0) {
            e.preventDefault();
            const table = this.currentTables[this.activeTabIdx];
            if (!table) return;
            this.cutBuffer = this.selectedCells.map(c => ({
                row: c.row, col: c.col, value: table.getCellValue(c.row, c.col),
            }));
            this.updateCellHighlights();
            this.onStatus?.(`Cut ${this.cutBuffer.length} cell(s) — select destination and Ctrl+V to paste`);
            return;
        }

        // Ctrl+V — paste cut cells at current anchor
        if (ctrl && e.key === "v" && this.cutBuffer.length > 0 && this.selectionAnchor) {
            e.preventDefault();
            if (!this.controller) return;
            this.controller.moveCells(
                this.kbTableIdx,
                this.cutBuffer,
                this.selectionAnchor.row,
                this.selectionAnchor.col,
            );
            this.cutBuffer = [];
            this.selectedCells = [];
            return;
        }

        // Escape — clear selection
        if (e.key === "Escape") {
            if (this.cutBuffer.length > 0) {
                this.cutBuffer = [];
                this.updateCellHighlights();
                this.onStatus?.("Cut cancelled");
            } else if (this.selectedCells.length > 0) {
                this.clearCellSelection();
            }
        }

        // Delete/Backspace — clear selected cells
        if ((e.key === "Delete" || e.key === "Backspace") && this.selectedCells.length > 1 && !this.activeCell) {
            e.preventDefault();
            const table = this.currentTables[this.activeTabIdx];
            if (!table || !this.controller) return;
            for (const c of this.selectedCells) {
                this.controller.editCell(this.kbTableIdx, c.row, c.col, "", true);
            }
            this.clearCellSelection();
            this.controller.showAll();
        }
    }

    private moveCoord(coord: CellCoord, key: string): CellCoord | null {
        const table = this.currentTables[this.activeTabIdx];
        if (!table) return null;
        let { row, col } = coord;
        if (key === "ArrowUp") row--;
        else if (key === "ArrowDown") row++;
        else if (key === "ArrowLeft") col--;
        else if (key === "ArrowRight") col++;
        if (row < 0 || row >= table.rows.length || col < 0 || col >= table.columns.length) return null;
        return { row, col };
    }

    // ── Auto-resize textarea to fit content ───────────────────────────────────


    private applyZoom(): void {
        const table = this.container.querySelector<HTMLElement>("table.knowledge-table");
        if (table) {
            table.style.transformOrigin = "top left";
            table.style.transform = `scale(${this.zoom})`;
        }
        const label = this.container.querySelector<HTMLElement>(".zoom-label");
        if (label) label.textContent = `${Math.round(this.zoom * 100)}%`;
    }

    private renderZoomBar(): void {
        const bar = document.createElement("div");
        bar.className = "table-zoom-bar";

        const btnMinus = document.createElement("button");
        btnMinus.textContent = "−";
        btnMinus.title = "Zoom out";
        btnMinus.addEventListener("click", () => {
            this.zoom = Math.max(0.25, this.zoom / 1.25);
            this.applyZoom();
        });

        const label = document.createElement("span");
        label.className = "zoom-label";
        label.textContent = `${Math.round(this.zoom * 100)}%`;
        label.title = "Reset zoom";
        label.addEventListener("click", () => {
            this.zoom = 1;
            this.applyZoom();
        });

        const btnPlus = document.createElement("button");
        btnPlus.textContent = "+";
        btnPlus.title = "Zoom in";
        btnPlus.addEventListener("click", () => {
            this.zoom = Math.min(4, this.zoom * 1.25);
            this.applyZoom();
        });

        bar.appendChild(btnMinus);
        bar.appendChild(label);
        bar.appendChild(btnPlus);
        this.container.appendChild(bar);
    }

    private showRendered(td: HTMLElement, value: string, typeId: string): void {
        td.innerHTML = "";
        td.appendChild(renderCell(typeId, value));
    }
}
