import { describe, it, expect } from "vitest";
import { AssociationGraph } from "../../src/data/graph.ts";
import { initGraphFilter } from "../../src/ui/graph-filter.ts";
import type { TableData } from "../../src/data/types.ts";

describe("Graph Filter UI", () => {
    function setup() {
        const graph = new AssociationGraph();
        graph.setVocabulary({ relations: [{ name: "uses", inverse: "is-used-by", symmetric: false }] });
        graph.addAssociations(["TheoremA", "TheoremB"], ["uses:defX", "uses:defY"]);

        const tables: { name: string; data: TableData }[] = [
            { name: "theorems", data: { headers: ["Name", "Statement"], types: ["text", "text"], rows: [["TheoremA", "stmt1"], ["TheoremB", "stmt2"]] } },
        ];

        const container = document.createElement("div");
        initGraphFilter(container, graph, tables);
        return { container, graph, tables };
    }

    it("renders relation dropdown", () => {
        const { container } = setup();
        const select = container.querySelector("#rel-select") as HTMLSelectElement;
        expect(select).not.toBeNull();
        expect(select.options.length).toBe(1);
        expect(select.options[0].value).toBe("uses");
    });

    it("renders target dropdown with all entity IDs", () => {
        const { container } = setup();
        const select = container.querySelector("#target-select") as HTMLSelectElement;
        expect(select).not.toBeNull();
        expect(select.options.length).toBeGreaterThanOrEqual(2);
    });

    it("renders tables initially", () => {
        const { container } = setup();
        expect(container.querySelector("table")).not.toBeNull();
    });

    it("filter button filters rows", () => {
        const { container } = setup();
        const relSelect = container.querySelector("#rel-select") as HTMLSelectElement;
        const targetSelect = container.querySelector("#target-select") as HTMLSelectElement;
        relSelect.value = "uses";
        targetSelect.value = "defX";

        const filterBtn = container.querySelector("button")!;
        filterBtn.click();

        const rows = container.querySelectorAll("tbody tr");
        expect(rows.length).toBe(1);
        expect(rows[0].querySelector("td")!.textContent).toBe("TheoremA");
    });

    it("entity click shows associations", () => {
        const { container } = setup();
        const firstCell = container.querySelector("tbody tr td") as HTMLElement;
        firstCell.click();

        const detail = container.querySelector(".association-detail")!;
        expect(detail.textContent).toContain("TheoremA");
        expect(detail.textContent).toContain("uses");
        expect(detail.textContent).toContain("defX");
    });
});
