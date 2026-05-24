import { renderCell } from "../plugins/registry.ts";
import type { Table, Row } from "../model/index.ts";
import type { AppController } from "../controller/index.ts";

export class TableView {
    private container: HTMLElement;
    private tabStrip: HTMLElement;
    private sourceInput: HTMLTextAreaElement;
    private controller: AppController | null = null;
    private onEntityClick: ((entityId: string) => void) | null = null;
    private onStatus: ((msg: string) => void) | null = null;
    private activeTabIdx = 0;
    private currentTables: Table[] = [];
    private suppressBlur = false;   // set true during Alt+Enter to block blur-commit

    private activeCell: {
        td: HTMLElement;
        originalValue: string;
        typeId: string;
        commit: (value: string) => void;
        cancel: () => void;
    } | null = null;

    constructor(container: HTMLElement, tabStrip: HTMLElement, sourceInput: HTMLTextAreaElement) {
        this.container = container;
        this.tabStrip = tabStrip;
        this.sourceInput = sourceInput;

        this.sourceInput.addEventListener("input", () => {
            this.autoResize();
            if (!this.activeCell) return;
            this.showRendered(this.activeCell.td, this.sourceInput.value, this.activeCell.typeId);
        });

        this.sourceInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && e.altKey) {
                // Alt+Enter — insert newline, stay focused
                e.preventDefault();
                e.stopPropagation();
                this.suppressBlur = true;
                const el = this.sourceInput;
                const start = el.selectionStart ?? el.value.length;
                const end   = el.selectionEnd   ?? el.value.length;
                el.value = el.value.slice(0, start) + "\n" + el.value.slice(end);
                el.selectionStart = el.selectionEnd = start + 1;
                this.autoResize();
                if (this.activeCell)
                    this.showRendered(this.activeCell.td, el.value, this.activeCell.typeId);
                // Re-focus in next tick in case the browser moved focus away
                requestAnimationFrame(() => {
                    this.suppressBlur = false;
                    el.focus();
                });
            } else if (e.key === "Enter" && !e.altKey) {
                e.preventDefault();
                this.activeCell?.commit(this.sourceInput.value);
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.activeCell?.cancel();
            }
        });

        this.sourceInput.addEventListener("blur", () => {
            if (this.suppressBlur) return;
            if (this.activeCell) this.activeCell.commit(this.sourceInput.value);
        });
    }

    setController(controller: AppController): void { this.controller = controller; }
    setEntityClickHandler(handler: (entityId: string) => void): void { this.onEntityClick = handler; }
    setStatusCallback(cb: (msg: string) => void): void { this.onStatus = cb; }
    getActiveTableIdx(): number { return this.activeTabIdx; }

    renderAll(tables: Table[]): void {
        this.cancelActive();
        this.currentTables = tables;
        if (this.activeTabIdx >= tables.length) this.activeTabIdx = Math.max(0, tables.length - 1);
        this.renderTabStrip(tables);
        this.renderActiveTable();
    }

    renderFiltered(tables: Table[], entityIds: Set<string>, label: string): void {
        this.cancelActive();
        this.tabStrip.innerHTML = "";
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

    private renderTabStrip(tables: Table[]): void {
        this.tabStrip.innerHTML = "";
        tables.forEach((table, i) => {
            const tab = document.createElement("button");
            tab.className = "tab-btn" + (i === this.activeTabIdx ? " tab-active" : "");
            tab.textContent = table.name;
            tab.addEventListener("click", () => {
                this.activeTabIdx = i;
                this.renderAll(this.currentTables);
            });
            this.tabStrip.appendChild(tab);
        });
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
        this.renderTableRows(table, table.rows, this.activeTabIdx);
        this.onStatus?.(`${table.name}  —  ${table.rows.length} rows × ${table.columns.length} cols`);
    }

    private renderTableRows(table: Table, rows: Row[], tableIdx: number): void {
        const tableEl = document.createElement("table");
        tableEl.className = "knowledge-table";

        let sortCol = -1;
        let sortAsc = true;
        let currentRows = rows;

        const render = () => {
            tableEl.innerHTML = "";

            const thead = document.createElement("thead");
            const headerRow = document.createElement("tr");
            if (tableIdx >= 0) headerRow.appendChild(document.createElement("th")); // drag handle
            table.columns.forEach((col, i) => {
                const th = document.createElement("th");
                th.textContent = col.name + (i === sortCol ? (sortAsc ? " ▲" : " ▼") : "");
                th.addEventListener("click", () => {
                    if (sortCol === i) sortAsc = !sortAsc; else { sortCol = i; sortAsc = true; }
                    currentRows = [...rows].sort((a, b) => {
                        const av = a.getCellValue(i), bv = b.getCellValue(i);
                        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
                    });
                    render();
                });
                headerRow.appendChild(th);
            });
            if (tableIdx >= 0) headerRow.appendChild(document.createElement("th")); // actions
            thead.appendChild(headerRow);
            tableEl.appendChild(thead);

            const tbody = document.createElement("tbody");
            for (const row of currentRows) {
                const rowIdx = table.rows.indexOf(row);
                const tr = document.createElement("tr");
                tr.dataset.rowIdx = String(rowIdx);

                if (tableIdx >= 0) {
                    const dragTd = document.createElement("td");
                    dragTd.className = "row-drag-handle";
                    dragTd.textContent = "⠿";
                    dragTd.title = "Drag to reorder";
                    tr.appendChild(dragTd);
                    tr.draggable = true;
                    this.attachDragHandlers(tr, tbody, tableIdx, table);
                }

                row.cells.forEach((cell, colIdx) => {
                    const td = document.createElement("td");

                    if (colIdx === 0 && this.onEntityClick) {
                        td.style.cursor = "pointer";
                        td.style.textDecoration = "underline";
                        td.addEventListener("click", (e) => {
                            e.stopPropagation();
                            this.onEntityClick!(row.entityId);
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
                            this.activateCell(td, cell.value, cell.typeId, (newValue) => {
                                this.controller!.editCell(tableIdx, rowIdx, colIdx, newValue);
                            });
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
        };

        render();
        this.container.appendChild(tableEl);
    }

    // ── Drag-to-reorder ───────────────────────────────────────────────────────

    private dragSrcIdx: number | null = null;

    private attachDragHandlers(tr: HTMLTableRowElement, tbody: HTMLElement, tableIdx: number, table: Table): void {
        tr.addEventListener("dragstart", (e) => {
            this.dragSrcIdx = Number(tr.dataset.rowIdx);
            tr.classList.add("row-dragging");
            e.dataTransfer!.effectAllowed = "move";
        });
        tr.addEventListener("dragend", () => tr.classList.remove("row-dragging"));
        tr.addEventListener("dragover", (e) => { e.preventDefault(); tr.classList.add("row-drag-over"); });
        tr.addEventListener("dragleave", () => tr.classList.remove("row-drag-over"));
        tr.addEventListener("drop", (e) => {
            e.preventDefault();
            tr.classList.remove("row-drag-over");
            const toIdx = Number(tr.dataset.rowIdx);
            if (this.dragSrcIdx !== null && this.dragSrcIdx !== toIdx)
                this.controller!.moveRow(tableIdx, this.dragSrcIdx, toIdx);
            this.dragSrcIdx = null;
        });
    }

    // ── Cell activation — formula bar becomes the editor ─────────────────────

    private activateCell(
        td: HTMLElement,
        originalValue: string,
        typeId: string,
        onCommit: (value: string) => void,
    ): void {
        td.classList.add("cell-active");

        this.sourceInput.value = originalValue;
        this.sourceInput.placeholder = typeId;
        this.autoResize();
        requestAnimationFrame(() => {
            this.sourceInput.focus();
            this.sourceInput.select();
        });

        const commit = (value: string) => {
            this.activeCell = null;
            td.classList.remove("cell-active");
            this.sourceInput.value = "";
            this.sourceInput.placeholder = "Select a cell to edit…";
            this.resetResize();
            onCommit(value);
            this.showRendered(td, value, typeId);
        };

        const cancel = () => {
            this.activeCell = null;
            td.classList.remove("cell-active");
            this.sourceInput.value = "";
            this.sourceInput.placeholder = "Select a cell to edit…";
            this.resetResize();
            this.showRendered(td, originalValue, typeId);
        };

        this.activeCell = { td, originalValue, typeId, commit, cancel };
    }

    commitActive(): void {
        if (!this.activeCell) return;
        this.activeCell.commit(this.sourceInput.value);
    }

    cancelActive(): void { this.activeCell?.cancel(); }

    // ── Auto-resize textarea to fit content ───────────────────────────────────

    private autoResize(): void {
        const el = this.sourceInput;
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
    }

    private resetResize(): void {
        this.sourceInput.style.height = "";
    }

    private showRendered(td: HTMLElement, value: string, typeId: string): void {
        td.innerHTML = "";
        td.appendChild(renderCell(typeId, value));
    }
}
