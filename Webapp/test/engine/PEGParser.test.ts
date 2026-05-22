import { describe, it, expect } from "vitest";
import { PEGParser } from "../../src/engine/PEGParser.ts";
import type { Grammar } from "../../src/engine/types.ts";

describe("PEGParser — literal", () => {
    const g: Grammar = { Root: { peg: { type: "literal", value: "hello" } } };
    const p = new PEGParser(g);
    it("matches exact literal", () => { expect(p.parse("Root", "hello")).toBe("hello"); });
    it("throws on mismatch", () => { expect(() => p.parse("Root", "world")).toThrow(); });
    it("skips whitespace when configured", () => { const pw = new PEGParser(g, { skip: /^[ \t\r\n]+/ }); expect(pw.parse("Root", "  hello")).toBe("hello"); });
    it("does not skip without option", () => { expect(() => p.parse("Root", "  hello")).toThrow(); });
});

describe("PEGParser — regex", () => {
    const p = new PEGParser({ Root: { peg: { type: "regex", regex: /^[0-9]+/, name: "number" } } });
    it("matches digits", () => { expect(p.parse("Root", "42")).toBe("42"); });
    it("throws on non-digit", () => { expect(() => p.parse("Root", "abc")).toThrow(); });
});

describe("PEGParser — sequence", () => {
    const p = new PEGParser({ Root: { peg: { type: "sequence", parts: [{ type: "literal", value: "a" }, { type: "literal", value: "b" }] } } });
    it("matches both parts", () => { expect(p.parse("Root", "ab")).toEqual(["a", "b"]); });
    it("throws if part missing", () => { expect(() => p.parse("Root", "a")).toThrow(); });
});

describe("PEGParser — choice", () => {
    const p = new PEGParser({ Root: { peg: { type: "choice", options: [{ type: "literal", value: "x" }, { type: "literal", value: "y" }] } } });
    it("matches first", () => { expect(p.parse("Root", "x")).toBe("x"); });
    it("matches second", () => { expect(p.parse("Root", "y")).toBe("y"); });
    it("throws if none", () => { expect(() => p.parse("Root", "z")).toThrow(); });
});

describe("PEGParser — repeat", () => {
    const p = new PEGParser({ Root: { peg: { type: "repeat", expr: { type: "literal", value: "a" } } } });
    it("zero reps", () => { expect(p.parse("Root", "")).toEqual([]); });
    it("multiple reps", () => { expect(p.parse("Root", "aaa")).toEqual(["a", "a", "a"]); });
});

describe("PEGParser — rule reference", () => {
    const p = new PEGParser({ Root: { peg: { type: "rule", name: "Inner" } }, Inner: { peg: { type: "literal", value: "ok" } } });
    it("delegates", () => { expect(p.parse("Root", "ok")).toBe("ok"); });
    it("throws on unknown rule", () => { expect(() => new PEGParser({ Root: { peg: { type: "rule", name: "X" } } }).parse("Root", "")).toThrow(); });
});

describe("PEGParser — build", () => {
    const p = new PEGParser({ Root: { peg: { type: "regex", regex: /^[0-9]+/, name: "num" }, build: (v: string) => Number(v) } });
    it("applies transform", () => { expect(p.parse("Root", "99")).toBe(99); });
});

describe("PEGParser — error reporting", () => {
    const p = new PEGParser({ Root: { peg: { type: "literal", value: "abc" } } });
    it("error has position", () => { try { p.parse("Root", "xyz"); } catch (e) { expect((e as Error).message).toMatch(/1:1/); } });
    it("throws on trailing input", () => { expect(() => p.parse("Root", "abcXXX")).toThrow(); });
});
