import { describe, it, expect } from "vitest";
import { getPlugin, renderCell } from "../../src/plugins/registry.ts";
import { createTable } from "../../src/ui/table.ts";
import type { TableData } from "../../src/data/types.ts";

describe("Plugin Registry", () => {
    it("math plugin", () => { expect(getPlugin("math").type_id).toBe("math"); });
    it("text plugin", () => { expect(getPlugin("text").type_id).toBe("text"); });
    it("fallback", () => { expect(getPlugin("unknown").type_id).toBe("text"); });
    it("renderCell math", () => { expect(renderCell("math", "x^2").querySelector("sup")).not.toBeNull(); });
    it("renderCell text", () => { expect(renderCell("text", "hello").textContent).toBe("hello"); });
    it("renderCell error", () => { expect(renderCell("math", "@@@").className).toBe("cell-error"); });
});

describe("Table Component", () => {
    const data: TableData = { headers: ["Name","Formula"], types: ["text","math"], rows: [["Pyth","a^2+b^2=c^2"],["Area","A=\\p*r^2"],["Id","e^(\\p*\\i)+1=0"]] };
    it("creates table", () => { expect(createTable(data).querySelector("table")).not.toBeNull(); });
    it("header count", () => { expect(createTable(data).querySelectorAll("th").length).toBe(2); });
    it("row count", () => { expect(createTable(data).querySelectorAll("tbody tr").length).toBe(3); });
    it("text cell", () => { expect(createTable(data).querySelector("tbody tr td")!.textContent).toBe("Pyth"); });
    it("math cell", () => { expect(createTable(data).querySelector(".native-math")).not.toBeNull(); });
    it("error cell", () => { const d: TableData = { headers:["X"], types:["math"], rows:[["@@@"]] }; expect(createTable(d).querySelector(".cell-error")).not.toBeNull(); });
    it("sort asc", () => { const el = createTable(data); el.querySelector("th")!.click(); expect(el.querySelector("tbody tr td")!.textContent).toBe("Area"); });
    it("sort desc", () => { const el = createTable(data); el.querySelector("th")!.click(); el.querySelector("th")!.click(); expect(el.querySelector("tbody tr td")!.textContent).toBe("Pyth"); });
});
