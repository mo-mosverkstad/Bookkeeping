import { parseCSV } from "../data/csv.ts";
import { AssociationGraph } from "../data/graph.ts";
import type { TableData } from "../data/types.ts";
import { initGraphFilter } from "./graph-filter.ts";

const ASSOCIATION_COLUMN = "_associations";

/**
 * File loader — supports loading multiple CSV files.
 * Builds an association graph from all loaded tables.
 */
export function initFileLoader(
    fileInput: HTMLInputElement,
    container: HTMLElement,
    errorEl: HTMLElement,
): void {
    const graph = new AssociationGraph();
    const tables: { name: string; data: TableData }[] = [];

    function loadFile(file: File) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = parseCSV(reader.result as string);
                const name = file.name.replace(/\.csv$/, "");
                tables.push({ name, data });

                // Extract associations from _associations column if present
                const assocColIdx = data.headers.indexOf(ASSOCIATION_COLUMN);
                if (assocColIdx !== -1) {
                    const entityIds = data.rows.map(row => row[0] ?? "");
                    const assocCol = data.rows.map(row => row[assocColIdx] ?? "");
                    graph.addAssociations(entityIds, assocCol);
                }

                rebuildUI();
                errorEl.textContent = "";
            } catch (e) {
                errorEl.textContent = (e as Error).message;
            }
        };
        reader.readAsText(file);
    }

    function rebuildUI() {
        container.innerHTML = "";
        initGraphFilter(container, graph, tables);
    }

    // File picker — supports multiple files
    fileInput.addEventListener("change", () => {
        const files = fileInput.files;
        if (!files) return;
        for (let i = 0; i < files.length; i++) loadFile(files[i]);
    });

    // Drag and drop
    container.addEventListener("dragover", (e) => { e.preventDefault(); container.classList.add("drag-over"); });
    container.addEventListener("dragleave", () => { container.classList.remove("drag-over"); });
    container.addEventListener("drop", (e) => {
        e.preventDefault();
        container.classList.remove("drag-over");
        const files = e.dataTransfer?.files;
        if (!files) return;
        for (let i = 0; i < files.length; i++) loadFile(files[i]);
    });
}
