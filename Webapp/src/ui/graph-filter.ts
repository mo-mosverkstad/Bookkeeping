import { AssociationGraph } from "../data/graph.ts";
import type { TableData } from "../data/types.ts";
import { createTable } from "./table.ts";

/**
 * Graph filter UI — dropdowns for relation type and target entity,
 * a filter button, and entity click handler for association inspection.
 */
export function initGraphFilter(
    container: HTMLElement,
    graph: AssociationGraph,
    tables: { name: string; data: TableData }[],
): void {
    const filterDiv = document.createElement("div");
    filterDiv.className = "graph-filter";

    // Relation type dropdown
    const relLabel = document.createElement("label");
    relLabel.textContent = "Relation: ";
    const relSelect = document.createElement("select");
    relSelect.id = "rel-select";
    relLabel.appendChild(relSelect);

    // Target entity dropdown
    const targetLabel = document.createElement("label");
    targetLabel.textContent = " Target: ";
    const targetSelect = document.createElement("select");
    targetSelect.id = "target-select";
    targetLabel.appendChild(targetSelect);

    // Filter button
    const filterBtn = document.createElement("button");
    filterBtn.textContent = "Filter";

    // Reset button
    const resetBtn = document.createElement("button");
    resetBtn.textContent = "Show All";

    // Association detail panel
    const detailPanel = document.createElement("div");
    detailPanel.className = "association-detail";

    filterDiv.appendChild(relLabel);
    filterDiv.appendChild(targetLabel);
    filterDiv.appendChild(filterBtn);
    filterDiv.appendChild(resetBtn);
    container.appendChild(filterDiv);
    container.appendChild(detailPanel);

    // Table display area
    const tableArea = document.createElement("div");
    tableArea.id = "filtered-table-area";
    container.appendChild(tableArea);

    function populateDropdowns() {
        relSelect.innerHTML = "";
        const types = graph.getRelationTypes();
        for (const t of types) {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            relSelect.appendChild(opt);
        }

        targetSelect.innerHTML = "";
        const ids = graph.getAllEntityIds();
        for (const id of ids) {
            const opt = document.createElement("option");
            opt.value = id;
            opt.textContent = id;
            targetSelect.appendChild(opt);
        }
    }

    function showAllTables() {
        tableArea.innerHTML = "";
        detailPanel.innerHTML = "";
        for (const t of tables) {
            const h3 = document.createElement("h3");
            h3.textContent = t.name;
            tableArea.appendChild(h3);
            const tableEl = createTable(t.data);
            addEntityClickHandlers(tableEl, t.data);
            tableArea.appendChild(tableEl);
        }
    }

    function addEntityClickHandlers(tableEl: HTMLElement, data: TableData) {
        const rows = tableEl.querySelectorAll("tbody tr");
        rows.forEach((tr, rowIdx) => {
            const firstCell = tr.querySelector("td");
            if (firstCell) {
                firstCell.style.cursor = "pointer";
                firstCell.style.textDecoration = "underline";
                firstCell.addEventListener("click", () => {
                    const entityId = data.rows[rowIdx]?.[0] ?? "";
                    showEntityAssociations(entityId);
                });
            }
        });
    }

    function showEntityAssociations(entityId: string) {
        const { outgoing, incoming } = graph.getAssociationsFor(entityId);
        detailPanel.innerHTML = `<h4>Associations for: ${entityId}</h4>`;

        if (outgoing.length > 0) {
            const outList = document.createElement("ul");
            for (const a of outgoing) {
                const li = document.createElement("li");
                li.innerHTML = `<strong>${a.relation}</strong> → <a href="#" class="entity-link" data-id="${a.target}">${a.target}</a>`;
                outList.appendChild(li);
            }
            detailPanel.appendChild(document.createTextNode("Outgoing:"));
            detailPanel.appendChild(outList);
        }

        if (incoming.length > 0) {
            const inList = document.createElement("ul");
            for (const a of incoming) {
                const inverse = graph.getInverse(a.relation) ?? `(inverse of ${a.relation})`;
                const li = document.createElement("li");
                li.innerHTML = `<strong>${inverse}</strong> ← <a href="#" class="entity-link" data-id="${a.source}">${a.source}</a>`;
                inList.appendChild(li);
            }
            detailPanel.appendChild(document.createTextNode("Incoming:"));
            detailPanel.appendChild(inList);
        }

        if (outgoing.length === 0 && incoming.length === 0) {
            detailPanel.appendChild(document.createTextNode("No associations found."));
        }

        // Make entity links clickable
        detailPanel.querySelectorAll(".entity-link").forEach(link => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                showEntityAssociations((link as HTMLElement).dataset.id!);
            });
        });
    }

    filterBtn.addEventListener("click", () => {
        const relation = relSelect.value;
        const target = targetSelect.value;
        if (!relation || !target) return;

        const matchingSources = graph.filterByRelation(relation, target);
        tableArea.innerHTML = "";
        detailPanel.innerHTML = "";

        for (const t of tables) {
            const nameColIdx = 0; // first column is entity ID
            const filteredRows = t.data.rows.filter(row => matchingSources.includes(row[nameColIdx] ?? ""));
            if (filteredRows.length === 0) continue;

            const filteredData: TableData = { headers: t.data.headers, types: t.data.types, rows: filteredRows };
            const h3 = document.createElement("h3");
            h3.textContent = `${t.name} (filtered: ${relation} → ${target})`;
            tableArea.appendChild(h3);
            const tableEl = createTable(filteredData);
            addEntityClickHandlers(tableEl, filteredData);
            tableArea.appendChild(tableEl);
        }

        if (tableArea.children.length === 0) {
            tableArea.textContent = "No entities match this filter.";
        }
    });

    resetBtn.addEventListener("click", showAllTables);

    // Initial render
    populateDropdowns();
    showAllTables();
}
