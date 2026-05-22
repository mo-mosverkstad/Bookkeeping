import { renderCell } from "../plugins/registry.ts";
import type { Table, Row } from "../model/index.ts";

/**
 * Table View — renders Table model objects as HTML tables.
 * Pure presentation: reads from model, writes to DOM.
 */
export class TableView {
    private container: HTMLElement;
    private onEntityClick: ((entityId: string) => void) | null = null;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    setEntityClickHandler(handler: (entityId: string) => void): void {
        this.onEntityClick = handler;
    }

    renderAll(tables: Table[]): void {
        this.container.innerHTML = "";
        for (const table of tables) {
            this.renderTable(table, table.rows);
        }
    }

    renderFiltered(tables: Table[], entityIds: Set<string>, label: string): void {
        this.container.innerHTML = "";
        for (const table of tables) {
            const filtered = table.filterByEntityIds(entityIds);
            if (filtered.length === 0) continue;
            const h3 = document.createElement("h3");
            h3.textContent = `${table.name} (filtered: ${label})`;
            this.container.appendChild(h3);
            this.renderTableRows(table, filtered);
        }
        if (this.container.children.length === 0) {
            this.container.textContent = "No entities match this filter.";
        }
    }

    private renderTable(table: Table, rows: Row[]): void {
        const h3 = document.createElement("h3");
        h3.textContent = table.name;
        this.container.appendChild(h3);
        this.renderTableRows(table, rows);
    }

    private renderTableRows(table: Table, rows: Row[]): void {
        const tableEl = document.createElement("table");
        tableEl.className = "knowledge-table";

        // State for sorting
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
            thead.appendChild(headerRow);
            tableEl.appendChild(thead);

            const tbody = document.createElement("tbody");
            for (const row of currentRows) {
                const tr = document.createElement("tr");
                row.cells.forEach((cell, i) => {
                    const td = document.createElement("td");
                    td.appendChild(renderCell(cell.typeId, cell.value));
                    if (i === 0 && this.onEntityClick) {
                        td.style.cursor = "pointer";
                        td.style.textDecoration = "underline";
                        td.addEventListener("click", () => this.onEntityClick!(row.entityId));
                    }
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            }
            tableEl.appendChild(tbody);
        };

        render();
        this.container.appendChild(tableEl);
    }
}
