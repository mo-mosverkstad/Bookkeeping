import { parseCSV } from "../data/csv.ts";
import { createTable } from "./table.ts";

export function initFileLoader(
    fileInput: HTMLInputElement,
    container: HTMLElement,
    errorEl: HTMLElement,
): void {
    function loadCSV(file: File) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = parseCSV(reader.result as string);
                container.innerHTML = "";
                container.appendChild(createTable(data));
                errorEl.textContent = "";
            } catch (e) { errorEl.textContent = (e as Error).message; }
        };
        reader.readAsText(file);
    }

    fileInput.addEventListener("change", () => { const f = fileInput.files?.[0]; if (f) loadCSV(f); });

    container.addEventListener("dragover", (e) => { e.preventDefault(); container.classList.add("drag-over"); });
    container.addEventListener("dragleave", () => { container.classList.remove("drag-over"); });
    container.addEventListener("drop", (e) => { e.preventDefault(); container.classList.remove("drag-over"); const f = e.dataTransfer?.files[0]; if (f) loadCSV(f); });
}
