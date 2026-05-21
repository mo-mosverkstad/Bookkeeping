import { describe, it, expect } from "vitest";
import { PEGParser } from "../../src/parser/PEGParser.ts";
import type { Grammar } from "../../src/parser/types.ts";

// Minimal grammars used only in this file to test the engine primitives.

describe("PEGParser — literal", () => {
    const g: Grammar = {
        Root: { peg: { type: "literal", value: "hello" } },
    };
    const p = new PEGParser(g);

    it("matches exact literal", () => {
        expect(p.parse("Root", "hello")).toBe("hello");
    });

    it("throws on mismatch", () => {
        expect(() => p.parse("Root", "world")).toThrow();
    });

    it("skips leading whitespace when skip option is configured", () => {
        const gWithSkip: Grammar = {
            Root: { peg: { type: "literal", value: "hello" } },
        };
        const pWithSkip = new PEGParser(gWithSkip, { skip: /^[ \t\r\n]+/ });
        expect(pWithSkip.parse("Root", "  hello")).toBe("hello");
    });

    it("does not skip whitespace without skip option", () => {
        expect(() => p.parse("Root", "  hello")).toThrow();
    });
});

describe("PEGParser — regex", () => {
    const g: Grammar = {
        Root: {
            peg: { type: "regex", regex: /^[0-9]+/, name: "number" },
        },
    };
    const p = new PEGParser(g);

    it("matches digits", () => {
        expect(p.parse("Root", "42")).toBe("42");
    });

    it("throws on non-digit", () => {
        expect(() => p.parse("Root", "abc")).toThrow();
    });
});

describe("PEGParser — sequence", () => {
    const g: Grammar = {
        Root: {
            peg: {
                type: "sequence",
                parts: [
                    { type: "literal", value: "a" },
                    { type: "literal", value: "b" },
                ],
            },
        },
    };
    const p = new PEGParser(g);

    it("matches both parts in order", () => {
        expect(p.parse("Root", "ab")).toEqual(["a", "b"]);
    });

    it("throws if second part missing", () => {
        expect(() => p.parse("Root", "a")).toThrow();
    });
});

describe("PEGParser — choice", () => {
    const g: Grammar = {
        Root: {
            peg: {
                type: "choice",
                options: [
                    { type: "literal", value: "x" },
                    { type: "literal", value: "y" },
                ],
            },
        },
    };
    const p = new PEGParser(g);

    it("matches first option", () => {
        expect(p.parse("Root", "x")).toBe("x");
    });

    it("matches second option", () => {
        expect(p.parse("Root", "y")).toBe("y");
    });

    it("throws if no option matches", () => {
        expect(() => p.parse("Root", "z")).toThrow();
    });
});

describe("PEGParser — repeat", () => {
    const g: Grammar = {
        Root: {
            peg: {
                type: "repeat",
                expr: { type: "literal", value: "a" },
            },
        },
    };
    const p = new PEGParser(g);

    it("matches zero repetitions", () => {
        expect(p.parse("Root", "")).toEqual([]);
    });

    it("matches multiple repetitions", () => {
        expect(p.parse("Root", "aaa")).toEqual(["a", "a", "a"]);
    });
});

describe("PEGParser — rule reference", () => {
    const g: Grammar = {
        Root: { peg: { type: "rule", name: "Inner" } },
        Inner: { peg: { type: "literal", value: "ok" } },
    };
    const p = new PEGParser(g);

    it("delegates to referenced rule", () => {
        expect(p.parse("Root", "ok")).toBe("ok");
    });

    it("throws on unknown rule", () => {
        const bad: Grammar = {
            Root: { peg: { type: "rule", name: "Missing" } },
        };
        expect(() => new PEGParser(bad).parse("Root", "x")).toThrow("Unknown rule");
    });
});

describe("PEGParser — build function", () => {
    const g: Grammar = {
        Root: {
            peg: { type: "regex", regex: /^[0-9]+/, name: "number" },
            build: (v: string) => Number(v),
        },
    };
    const p = new PEGParser(g);

    it("applies build transform to result", () => {
        expect(p.parse("Root", "99")).toBe(99);
    });
});

describe("PEGParser — error reporting", () => {
    const g: Grammar = {
        Root: { peg: { type: "literal", value: "abc" } },
    };
    const p = new PEGParser(g);

    it("error message contains line and column", () => {
        try {
            p.parse("Root", "xyz");
        } catch (e) {
            expect((e as Error).message).toMatch(/1:1/);
        }
    });

    it("throws on unconsumed trailing input", () => {
        expect(() => p.parse("Root", "abcXXX")).toThrow();
    });
});
