import { describe, it, expect } from "vitest";
import { AppController } from "../../src/controller/index.ts";
import { GraphFilterView } from "../../src/view/graph-filter-view.ts";

function makeSetup() {
    const ctrl = new AppController();
    const container = document.createElement("div");
    const view = new GraphFilterView(container, ctrl);

    // Register view BEFORE loading CSV so refreshViews() populates dropdowns
    ctrl.setGraphFilterView(view);

    const csv = "Name,Statement,_associations\ntext,text,text\nTheoremA,stmt1,uses:defX\nTheoremB,stmt2,uses:defY";
    ctrl.loadCSV("theorems.csv", csv);

    return { ctrl, container, view };
}

describe("GraphFilterView", () => {
    it("renders relation dropdown after loading CSV with associations", () => {
        const { container } = makeSetup();
        const select = container.querySelector("select") as HTMLSelectElement;
        expect(select).not.toBeNull();
        expect(select.options.length).toBeGreaterThan(0);
        expect(select.options[0].value).toBe("uses");
    });

    it("renders target dropdown with entity IDs", () => {
        const { container } = makeSetup();
        const selects = container.querySelectorAll("select");
        expect(selects.length).toBe(2);
        const targetSelect = selects[1] as HTMLSelectElement;
        expect(targetSelect.options.length).toBeGreaterThan(0);
    });

    it("updateDropdowns populates both dropdowns", () => {
        const { container, view } = makeSetup();
        view.updateDropdowns(["proves", "uses"], ["EntityA", "EntityB", "EntityC"]);
        const selects = container.querySelectorAll("select");
        expect((selects[0] as HTMLSelectElement).options.length).toBe(2);
        expect((selects[1] as HTMLSelectElement).options.length).toBe(3);
    });

    it("showEntityAssociations populates detail panel", () => {
        const { view } = makeSetup();
        view.showEntityAssociations("TheoremA");
        const panel = view.getDetailPanel();
        expect(panel.textContent).toContain("TheoremA");
        expect(panel.textContent).toContain("uses");
        expect(panel.textContent).toContain("defX");
    });

    it("showEntityAssociations shows no-associations message for unknown entity", () => {
        const { view } = makeSetup();
        view.showEntityAssociations("nonexistent");
        const panel = view.getDetailPanel();
        expect(panel.textContent).toContain("No associations found");
    });
});
