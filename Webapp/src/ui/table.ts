import { renderCell } from "../plugins/registry.ts";
import type { TableData } from "../data/types.ts";

export function createTable(data: TableData): HTMLElement {
    const container = document.createElement("div");
    container.className = "table-container";
    let sortCol = -1, sortAsc = true, rows = [...data.rows];

    function renderTable() {
        container.innerHTML = "";
        const table = document.createElement("table");
        table.className = "knowledge-table";
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        data.headers.forEach((header, i) => {
            const th = document.createElement("th");
            th.textContent = header + (i === sortCol ? (sortAsc ? " ▲" : " ▼") : "");
            th.addEventListener("click", () => {
                if (sortCol === i) sortAsc = !sortAsc; else { sortCol = i; sortAsc = true; }
                rows = [...data.rows].sort((a, b) => { const av = a[i] ?? "", bv = b[i] ?? ""; return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av); });
                renderTable();
            });
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        const tbody = document.createElement("tbody");
        for (const row of rows) {
            const tr = document.createElement("tr");
            data.headers.forEach((_, i) => { const td = document.createElement("td"); td.appendChild(renderCell(data.types[i] ?? "text", row[i] ?? "")); tr.appendChild(td); });
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        container.appendChild(table);
    }
    renderTable();
    return container;
}
