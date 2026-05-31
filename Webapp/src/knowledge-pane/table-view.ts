import { renderCell } from "../cell-renderers/registry.ts";
import type { Table, Row } from "../model/index.ts";
import type { AppController } from "../controller/index.ts";
import type { WorkspaceView, WorkspaceData, ViewState, ToolbarAction } from "./workspace-view.ts";
import type { SourceEditorView } from "../source-editor/source-editor-view.ts";

interface TableState {
    scrollTop: number;
    scrollLeft: number;
    sortCol: number;
    sortAsc: boolean;
}

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
    private sortCol = -1;
    private sortAsc = true;
    /** Row objects currently checked for multi-row drag. */
    private selectedRows = new Set<Row>();

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
    }

    setController(controller: AppController): void { this.controller = controller; }
    setSourceEditor(se: SourceEditorView): void { this.sourceEditor = se; }
    setEntityClickHandler(handler: (entityId: string) => void): void { this.onEntityClick = handler; }
    setStatusCallback(cb: (msg: string) => void): void { this.onStatus = cb; }
    setOnCellFocusChange(cb: () => void): void { this.onCellFocusChange = cb; }
    getActiveTableIdx(): number { return this.kbTableIdx; }
    getController(): AppController | null { return this.controller; }
    getSortState(): { sortCol: number; sortAsc: boolean } { return { sortCol: this.sortCol, sortAsc: this.sortAsc }; }
    setContainer(el: HTMLElement): void { this.container = el; }

    // ── WorkspaceView interface ───────────────────────────────────────────────

    mount(container: HTMLElement, data: WorkspaceData, savedState?: ViewState): void {
        this.container = container;
        if (savedState) {
            const s = savedState as TableState;
            this.sortCol = s.sortCol;
            this.sortAsc = s.sortAsc;
        }
        if (data.table) {
            this.currentTables = [data.table];
            this.activeTabIdx = 0;
            // Resolve the real index in kb.tables[] for controller calls
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
            sortCol: this.sortCol,
            sortAsc: this.sortAsc,
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

        let currentRows = rows;

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
                const checkedCount = currentRows.filter(r => this.selectedRows.has(r)).length;
                headerCb.checked = checkedCount === currentRows.length && currentRows.length > 0;
                headerCb.indeterminate = checkedCount > 0 && checkedCount < currentRows.length;
                headerCb.addEventListener("click", (e) => {
                    e.preventDefault();
                    // Read live count at click time, not stale closure value
                    const liveCount = currentRows.filter(r => this.selectedRows.has(r)).length;
                    if (liveCount < currentRows.length) {
                        currentRows.forEach(r => this.selectedRows.add(r));
                    } else {
                        this.selectedRows.clear();
                    }
                    render();
                });
                thCb.appendChild(headerCb);
                headerRow.appendChild(thCb);
            }
            table.columns.forEach((col, i) => {
                const th = document.createElement("th");
                th.textContent = col.name + (i === this.sortCol ? (this.sortAsc ? " ▲" : " ▼") : "");
                th.addEventListener("mousedown", (e) => e.preventDefault()); // no text selection on header click
                th.addEventListener("click", () => {
                    if (this.sortCol === i) this.sortAsc = !this.sortAsc;
                    else { this.sortCol = i; this.sortAsc = true; }
                    currentRows = [...rows].sort((a, b) => {
                        const av = a.getCellValue(i), bv = b.getCellValue(i);
                        return this.sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
                    });
                    render();
                });
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
                const checked = currentRows.filter(r => this.selectedRows.has(r)).length;
                headerCbRef.checked = checked === currentRows.length && currentRows.length > 0;
                headerCbRef.indeterminate = checked > 0 && checked < currentRows.length;
            };

            for (const row of currentRows) {
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

                    if (colIdx === 0 && this.onEntityClick) {
                        td.style.cursor = "pointer";
                        td.style.textDecoration = "underline";
                        td.addEventListener("click", (e) => {
                            e.stopPropagation();
                            this.onEntityClick!(row.entityId);
                            // Also activate the cell for editing
                            if (this.activeCell?.td === td) return;
                            this.cancelActive();
                            this.onCellFocusChange?.();
                            if (tableIdx >= 0 && this.controller) {
                                this.activateCell(td, cell.value, cell.typeId, tableIdx, rowIdx, colIdx, (newValue) => {
                                    this.controller!.editCell(tableIdx, rowIdx, colIdx, newValue);
                                });
                            }
                        });
                    }

                    // Cell always shows rendered output
                    this.showRendered(td, cell.value, cell.typeId);

                    if (tableIdx >= 0 && this.controller) {
                        td.classList.add("editable-cell");
                        td.addEventListener("click", (e) => {
                            if (colIdx === 0 && this.onEntityClick) return; // entity click handled above
                            e.stopPropagation();
                            if (this.activeCell?.td === td) return;
                            this.cancelActive();
                            this.onCellFocusChange?.();
                            this.activateCell(td, cell.value, cell.typeId, tableIdx, rowIdx, colIdx, (newValue) => {
                                this.controller!.editCell(tableIdx, rowIdx, colIdx, newValue);
                            });
                        });
                        // Prevent the browser from selecting cell text on double-click
                        td.addEventListener("dblclick", (e) => e.preventDefault());
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
        };

        render();
        this.container.appendChild(tableEl);
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

    // ── Auto-resize textarea to fit content ───────────────────────────────────


    private showRendered(td: HTMLElement, value: string, typeId: string): void {
        td.innerHTML = "";
        td.appendChild(renderCell(typeId, value));
    }
}
