import { describe, it, expect } from "vitest";
import { parseCSV } from "../../src/data/csv.ts";

describe("CSV Reader", () => {
    it("basic", () => { const d = parseCSV("A,B\ntext,math\nFoo,x^2\n"); expect(d.headers).toEqual(["A","B"]); expect(d.rows[0]).toEqual(["Foo","x^2"]); });
    it("quoted comma", () => { expect(parseCSV('A,B\ntext,text\n"hi, world",ok\n').rows[0][0]).toBe("hi, world"); });
    it("escaped quote", () => { expect(parseCSV('A,B\ntext,text\n"say ""hi""",ok\n').rows[0][0]).toBe('say "hi"'); });
    it("empty fields", () => { expect(parseCSV("A,B,C\ntext,text,text\n,mid,\n").rows[0]).toEqual(["","mid",""]); });
    it("CRLF", () => { expect(parseCSV("A,B\r\ntext,text\r\nfoo,bar\r\n").rows[0]).toEqual(["foo","bar"]); });
    it("too few rows", () => { expect(() => parseCSV("A,B\n")).toThrow(); });
    it("no data rows", () => { expect(parseCSV("A,B\ntext,math\n").rows).toHaveLength(0); });
    it("newline in quoted", () => { expect(parseCSV('A,B\ntext,text\n"l1\nl2",ok\n').rows[0][0]).toBe("l1\nl2"); });
});
