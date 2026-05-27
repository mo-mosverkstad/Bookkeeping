import { describe, it, expect } from "vitest";
import { AssociationGraph } from "../../src/model/index.ts";

describe("AssociationGraph", () => {
    function makeGraph(): AssociationGraph {
        const g = new AssociationGraph();
        g.setVocabulary({ relations: [
            { name: "uses", inverse: "is-used-by", symmetric: false },
            { name: "equivalent-to", inverse: "equivalent-to", symmetric: true },
        ] });
        g.addAssociations(
            ["TheoremA", "TheoremB", "TheoremC"],
            ["uses:defX;uses:defY", "uses:defX", "uses:defZ"]
        );
        return g;
    }

    it("stores edges from association column", () => {
        const g = makeGraph();
        expect(g.getAllEdges()).toHaveLength(4);
    });

    it("filterByRelation finds sources pointing to target", () => {
        const g = makeGraph();
        const sources = g.filterByRelation("uses", "defX");
        expect(sources).toContain("TheoremA");
        expect(sources).toContain("TheoremB");
        expect(sources).not.toContain("TheoremC");
    });

    it("filterBySource finds targets from source", () => {
        const g = makeGraph();
        const targets = g.filterBySource("uses", "TheoremA");
        expect(targets).toContain("defX");
        expect(targets).toContain("defY");
    });

    it("getAssociationsFor returns outgoing and incoming", () => {
        const g = makeGraph();
        const { outgoing, incoming } = g.getAssociationsFor("defX");
        expect(outgoing).toHaveLength(0);
        expect(incoming).toHaveLength(2); // TheoremA and TheoremB use defX
    });

    it("getInverse returns inverse relation name", () => {
        const g = makeGraph();
        expect(g.getInverse("uses")).toBe("is-used-by");
        expect(g.getInverse("is-used-by")).toBe("uses");
    });

    it("getInverse returns same name for symmetric", () => {
        const g = makeGraph();
        expect(g.getInverse("equivalent-to")).toBe("equivalent-to");
    });

    it("getRelationTypes returns unique types", () => {
        const g = makeGraph();
        expect(g.getRelationTypes()).toEqual(["uses"]);
    });

    it("getAllEntityIds returns all unique IDs", () => {
        const g = makeGraph();
        const ids = g.getAllEntityIds();
        expect(ids).toContain("TheoremA");
        expect(ids).toContain("defX");
        expect(ids).toContain("defZ");
    });

    it("clear removes all edges", () => {
        const g = makeGraph();
        g.clear();
        expect(g.getAllEdges()).toHaveLength(0);
    });

    it("handles empty association cells", () => {
        const g = new AssociationGraph();
        g.addAssociations(["A", "B"], ["uses:X", ""]);
        expect(g.getAllEdges()).toHaveLength(1);
    });

    it("handles cross-file entity references", () => {
        const g = new AssociationGraph();
        g.addAssociations(["TheoremA"], ["uses:definitions:derivative"]);
        const targets = g.filterBySource("uses", "TheoremA");
        expect(targets).toContain("definitions:derivative");
    });
});
