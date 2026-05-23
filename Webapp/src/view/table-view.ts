import { renderCell } from "../plugins/registry.ts";
import type { Table, Row } from "../model/index.ts";
import type { AppController } from "../controller/index.ts";

const TEXT_TYPES = new Set(["text", "plain", "plaintext"]);

export class TableView {
    private container: HTMLElement;
    private editBar: HTMLElement;
    private editPreview: HTMLElement;
    private controller: AppController | null = null;
    private onEntityClick: ((entityId: string) => void) | null = null;

    private activeCell: {
        td: HTMLElement;
        originalValue: string;
        typeId: string;
        commit: (value: string) => void;
        cancel: () => void;
    } | null = null;

    constructor(container: HTMLElement, editBar: HTMLElement, editPreview: HTMLElement) {
        this.container = container;
        this.editBar = editBar;
        this.editPreview = editPreview;
    }

    setController(controller: AppController): void { this.controller = controller; }
    setEntityClickHandler(handler: (entityId: string) => void): void { this.onEntityClick = handler; }

    renderAll(tables: Table[]): void {
        this.cancelActive();
        this.container.innerHTML = "";
        tables.forEach((table, tableIdx) => this.renderTable(table, table.rows, tableIdx));
    }

    renderFiltered(tables: Table[], entityIds: Set<string>, label: string): void {
        this.cancelActive();
        this.container.innerHTML = "";
        for (const table of tables) {
            const filtered = table.filterByEntityIds(entityIds);
            if (filtered.length === 0) continue;
            const h3 = document.createElement("h3");
            h3.textContent = `${table.name} (filtered: ${label})`;
            this.container.appendChild(h3);
            this.renderTableRows(table, filtered, -1);
        }
        if (this.container.children.length === 0) {
            this.container.textContent = "No entities match this filter.";
        }
    }

    private renderTable(table: Table, rows: Row[], tableIdx: number): void {
        const h3 = document.createElement("h3");
        h3.textContent = table.name;
        this.container.appendChild(h3);
        this.renderTableRows(table, rows, tableIdx);
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
            if (tableIdx >= 0) {
                headerRow.appendChild(document.createElement("th"));
            }
            thead.appendChild(headerRow);
            tableEl.appendChild(thead);

            const tbody = document.createElement("tbody");
            for (const row of currentRows) {
                const rowIdx = table.rows.indexOf(row);
                const tr = document.createElement("tr");

                row.cells.forEach((cell, colIdx) => {
                    const td = document.createElement("td");

                    if (colIdx === 0 && this.onEntityClick) {
                        td.style.cursor = "pointer";
                        td.style.textDecoration = "underline";
                        td.addEventListener("click", () => this.onEntityClick!(row.entityId));
                    }

                    if (tableIdx >= 0 && this.controller) {
                        this.makeEditableCell(td, cell.value, cell.typeId, (newValue) => {
                            this.controller!.editCell(tableIdx, rowIdx, colIdx, newValue);
                        });
                    } else {
                        td.appendChild(renderCell(cell.typeId, cell.value));
                    }

                    tr.appendChild(td);
                });

                if (tableIdx >= 0 && this.controller) {
                    const tdAct = document.createElement("td");
                    tdAct.className = "row-actions";
                    const delBtn = document.createElement("button");
                    delBtn.textContent = "✕";
                    delBtn.className = "row-delete-btn";
                    delBtn.title = "Delete row";
                    delBtn.addEventListener("click", () => {
                        if (confirm(`Delete row "${row.entityId}"?`)) {
                            this.controller!.deleteRow(tableIdx, rowIdx);
                        }
                    });
                    tdAct.appendChild(delBtn);
                    tr.appendChild(tdAct);
                }

                tbody.appendChild(tr);
            }
            tableEl.appendChild(tbody);
        };

        render();
        this.container.appendChild(tableEl);

        if (tableIdx >= 0 && this.controller) {
            const toolbar = document.createElement("div");
            toolbar.className = "table-toolbar";

            const addBtn = document.createElement("button");
            addBtn.textContent = "+ Add Row";
            addBtn.addEventListener("click", () => this.controller!.addRow(tableIdx));
            toolbar.appendChild(addBtn);

            const exportBtn = document.createElement("button");
            exportBtn.textContent = "⬇ Export CSV";
            exportBtn.addEventListener("click", () => {
                const csv = this.controller!.exportCSV(tableIdx);
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${table.name}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            });
            toolbar.appendChild(exportBtn);

            this.container.appendChild(toolbar);
        }
    }

    // ── Cell editing ──────────────────────────────────────────────────────────

    private makeEditableCell(
        td: HTMLElement,
        value: string,
        typeId: string,
        onCommit: (newValue: string) => void,
    ): void {
        this.showRendered(td, value, typeId);
        td.classList.add("editable-cell");

        td.addEventListener("click", (e) => {
            if (this.activeCell?.td === td) return;
            this.cancelActive();
            e.stopPropagation();
            this.activateCell(td, value, typeId, onCommit);
        });
    }

    private activateCell(
        td: HTMLElement,
        originalValue: string,
        typeId: string,
        onCommit: (value: string) => void,
    ): void {
        const isText = TEXT_TYPES.has(typeId);

        td.classList.add("cell-active");

        // Switch cell to source editor
        td.innerHTML = "";
        td.contentEditable = "true";
        td.textContent = originalValue;
        td.focus();

        // Cursor to end
        const range = document.createRange();
        range.selectNodeContents(td);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);

        // For syntax cells: show live preview in the top bar
        if (!isText) {
            this.showPreview(originalValue, typeId);
            const onInput = () => this.showPreview(td.textContent ?? "", typeId);
            td.addEventListener("input", onInput);
            // Store cleanup on the element so commit/cancel can remove it
            (td as any).__onInput = onInput;
        }

        const commit = (value: string) => {
            if (!isText) {
                td.removeEventListener("input", (td as any).__onInput);
                this.hidePreview();
            }
            this.activeCell = null;
            td.contentEditable = "false";
            td.classList.remove("cell-active");
            onCommit(value);
            this.showRendered(td, value, typeId);
        };

        const cancel = () => {
            if (!isText) {
                td.removeEventListener("input", (td as any).__onInput);
                this.hidePreview();
            }
            this.activeCell = null;
            td.contentEditable = "false";
            td.classList.remove("cell-active");
            this.showRendered(td, originalValue, typeId);
        };

        this.activeCell = { td, originalValue, typeId, commit, cancel };

        td.addEventListener("keydown", onKey);
        td.addEventListener("blur", onBlur);

        function onKey(e: KeyboardEvent) {
            if (e.key === "Enter") {
                e.preventDefault();
                td.removeEventListener("keydown", onKey);
                td.removeEventListener("blur", onBlur);
                commit(td.textContent ?? "");
            } else if (e.key === "Escape") {
                e.preventDefault();
                td.removeEventListener("keydown", onKey);
                td.removeEventListener("blur", onBlur);
                cancel();
            }
        }

        function onBlur() {
            td.removeEventListener("keydown", onKey);
            td.removeEventListener("blur", onBlur);
            commit(td.textContent ?? "");
        }
    }

    // ── Top bar preview (syntax cells only) ───────────────────────────────────

    private showPreview(value: string, typeId: string): void {
        this.editPreview.innerHTML = "";
        this.editPreview.appendChild(renderCell(typeId, value));
        this.editBar.hidden = false;
    }

    private hidePreview(): void {
        this.editBar.hidden = true;
        this.editPreview.innerHTML = "";
    }

    // ── Public: commit / cancel ───────────────────────────────────────────────

    commitActive(): void {
        if (!this.activeCell) return;
        const value = this.activeCell.td.textContent ?? "";
        this.activeCell.commit(value);
    }

    cancelActive(): void {
        this.activeCell?.cancel();
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private showRendered(td: HTMLElement, value: string, typeId: string): void {
        td.contentEditable = "false";
        td.innerHTML = "";
        td.appendChild(renderCell(typeId, value));
    }
}
