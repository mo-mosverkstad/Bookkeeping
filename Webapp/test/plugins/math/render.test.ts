import { describe, it, expect } from "vitest";
import { renderMath } from "../../../src/cell-renderers/math/render.ts";
import { parser } from "../../../src/cell-renderers/math/grammar.ts";
import type { MathNode } from "../../../src/cell-renderers/math/types.ts";

function renderInput(input: string): HTMLElement { return renderMath(parser.parse("Expression", input) as MathNode); }
function html(input: string): string { return renderInput(input).innerHTML; }
function query(input: string, sel: string) { return renderInput(input).querySelector(sel); }

describe("Renderer — NumberLiteral", () => {
    it("renders integer", () => { expect(html("42")).toContain("42"); });
    it("renders decimal", () => { expect(html("3.14")).toContain("3.14"); });
});

describe("Renderer — Identifier", () => {
    it("plain has ident-plain", () => { expect(query("x", ".ident-plain")).not.toBeNull(); });
    it("left-skew has ident-left-skew", () => { expect(query("`a", ".ident-left-skew")).not.toBeNull(); });
    it("right-skew has ident-right-skew", () => { expect(query("`1T", ".ident-right-skew")).not.toBeNull(); });
    it("Greek renders glyph", () => { expect(html("\\a")).toContain("α"); });
    it("Greek has ident-greek", () => { expect(query("\\a", ".ident-greek")).not.toBeNull(); });
    it("right-skew Greek", () => { const el = query("\\1b", ".ident-greek-right"); expect(el).not.toBeNull(); expect(el!.textContent).toBe("β"); });
    it("blackboard bold glyph", () => { expect(html("\\\\R")).toContain("ℝ"); });
    it("blackboard bold class", () => { expect(query("\\\\R", ".ident-blackboard")).not.toBeNull(); });
    it("Hebrew \\ha renders ℵ", () => { expect(html("\\ha")).toContain("ℵ"); });
    it("multi-letter \\sin renders sin", () => { expect(html("\\sin")).toContain("sin"); });
});

describe("Renderer — fraction", () => {
    it("renders .fraction", () => { expect(query("a/b", ".fraction")).not.toBeNull(); });
    it("has .top and .bottom", () => { const el = renderInput("a/b"); expect(el.querySelector(".fraction .top")).not.toBeNull(); expect(el.querySelector(".fraction .bottom")).not.toBeNull(); });
    it("numerator correct", () => { expect(query("a/b", ".fraction .top")!.textContent).toBe("a"); });
    it("denominator correct", () => { expect(query("a/b", ".fraction .bottom")!.textContent).toBe("b"); });
});

describe("Renderer — power", () => {
    it("renders <sup>", () => { expect(query("x^2", "sup")).not.toBeNull(); });
    it("superscript text", () => { expect(query("x^2", "sup")!.textContent).toBe("2"); });
    it("nested <sup> for x^2^3", () => { expect(renderInput("x^2^3").querySelectorAll("sup").length).toBe(2); });
});

describe("Renderer — additive", () => {
    it("+ text", () => { expect(html("a+b")).toContain("+"); });
    it("- text", () => { expect(html("a-b")).toContain("-"); });
});

describe("Renderer — dot product", () => {
    it("renders ·", () => { expect(html("u.v")).toContain("·"); });
});

describe("Renderer — relational", () => {
    it("!= → ≠", () => { expect(html("a != b")).toContain("≠"); });
    it("<= → ≤", () => { expect(html("a <= b")).toContain("≤"); });
    it(">= → ≥", () => { expect(html("a >= b")).toContain("≥"); });
    it("-> → →", () => { expect(html("x -> a")).toContain("→"); });
    it("= → =", () => { expect(html("a = b")).toContain("="); });
});

describe("Renderer — unary", () => {
    it("negation", () => { expect(html("-x")).toContain("-"); });
});

describe("Renderer — subscript", () => {
    it("renders <sub>", () => { expect(query("x_i", "sub")).not.toBeNull(); });
    it("subscript text", () => { expect(query("x_i", "sub")!.textContent).toBe("i"); });
});

describe("Renderer — SubSuperscript", () => {
    it("x_i^2 has .subsuperscript", () => { expect(query("x_i^2", ".subsuperscript")).not.toBeNull(); });
    it("x_i^2 has .scripts with sup and sub", () => { const el = renderInput("x_i^2"); const s = el.querySelector(".scripts"); expect(s).not.toBeNull(); expect(s!.querySelector("sup")).not.toBeNull(); expect(s!.querySelector("sub")).not.toBeNull(); });
});

describe("Renderer — call", () => {
    it("renders callee", () => { expect(html("f(x)")).toContain("f"); });
    it("renders parens", () => { expect(html("f(x)")).toContain("("); expect(html("f(x)")).toContain(")"); });
});

describe("Renderer — integral", () => {
    it("renders .integral", () => { expect(query("\\int{0, 1, x}", ".integral")).not.toBeNull(); });
    it("renders .opstack", () => { expect(query("\\int{0, 1, x}", ".integral .opstack")).not.toBeNull(); });
    it("body beside sign (not inside opstack)", () => { const el = renderInput("\\int{0, 1, x}"); expect(el.querySelector(".opstack .integral-body")).toBeNull(); expect(el.querySelector(".integral-body")).not.toBeNull(); });
    it("∫ present", () => { expect(html("\\int{0, 1, x}")).toContain("∫"); });
    it("lower bound", () => { expect(query("\\int{0, 1, x}", ".opstack .bottom")!.textContent).toBe("0"); });
    it("upper bound", () => { expect(query("\\int{0, 1, x}", ".opstack .top")!.textContent).toBe("1"); });
    it("body content", () => { expect(query("\\int{0, 1, x}", ".integral-body")!.textContent).toBe("x"); });
});

describe("Renderer — sqrt", () => {
    it("renders .sqrt", () => { expect(query("\\sqrt{x}", ".sqrt")).not.toBeNull(); });
    it("content correct", () => { expect(query("\\sqrt{x}", ".sqrt")!.textContent).toBe("x"); });
});

describe("Renderer — floor/ceil", () => {
    it("floor ⌊⌋", () => { const h = html("\\floor{x}"); expect(h).toContain("⌊"); expect(h).toContain("⌋"); });
    it("ceil ⌈⌉", () => { const h = html("\\ceil{x}"); expect(h).toContain("⌈"); expect(h).toContain("⌉"); });
});

describe("Renderer — inner product", () => {
    it("⟨⟩", () => { const h = html("\\inner{x, y}"); expect(h).toContain("⟨"); expect(h).toContain("⟩"); });
});

describe("Renderer — big operators", () => {
    it("\\S renders Σ", () => { expect(html("\\S{k=0, n, k}")).toContain("Σ"); });
    it("\\S has .integral", () => { expect(query("\\S{k=0, n, k}", ".integral")).not.toBeNull(); });
});

describe("Renderer — lim", () => {
    it("renders lim", () => { expect(html("\\lim{x, f(x)}")).toContain("lim"); });
});

describe("Renderer — vector name", () => {
    it("[a] has .vector-name", () => { expect(query("[a]", ".vector-name")).not.toBeNull(); });
    it("[a] has arrow", () => { expect(html("[a]")).toContain("⃗"); });
});

describe("Renderer — matrix", () => {
    it("has .matrix", () => { expect(query("[[a, b], [c, d]]", ".matrix")).not.toBeNull(); });
    it("correct rows", () => { expect(renderInput("[[a, b], [c, d]]").querySelectorAll(".matrix-row").length).toBe(2); });
    it("correct cells", () => { expect(renderInput("[[a, b], [c, d]]").querySelectorAll(".matrix-cell").length).toBe(4); });
    it("parenthesized tuple is not matrix", () => { expect(query("(a, b, c)", ".matrix")).toBeNull(); });
});

describe("Renderer — absolute value/norm", () => {
    it("|x| has |", () => { expect(html("|x|")).toContain("|"); });
    it("|[a]| has ‖", () => { expect(html("|[a]|")).toContain("‖"); });
});

describe("Renderer — factorial", () => {
    it("n! has !", () => { expect(html("n!")).toContain("!"); });
});

describe("Renderer — derivative", () => {
    it("f' has ′", () => { expect(html("f'")).toContain("′"); });
    it("f'' has two ′", () => { expect((html("f''").match(/′/g) || []).length).toBe(2); });
});

describe("Renderer — ellipsis", () => {
    it("... renders …", () => { expect(html("...")).toContain("…"); });
});

describe("Renderer — multiply sign", () => {
    it("2*3 shows ×", () => { expect(html("2*3")).toContain("×"); });
    it("42*7 shows ×", () => { expect(html("42*7")).toContain("×"); });
    it("2*x hides", () => { expect(html("2*x")).not.toContain("×"); });
    it("x*y hides", () => { expect(html("x*y")).not.toContain("×"); });
    it("x*2 hides", () => { expect(html("x*2")).not.toContain("×"); });
    it("(a+b)*3 hides", () => { expect(html("(a+b)*3")).not.toContain("×"); });
    it("2*(a+b) hides", () => { expect(html("2*(a+b)")).not.toContain("×"); });
    it("(a+b)*(c+d) hides", () => { expect(html("(a+b)*(c+d)")).not.toContain("×"); });
    it("(a+b)*x hides", () => { expect(html("(a+b)*x")).not.toContain("×"); });
    it("2*f(x) hides", () => { expect(html("2*f(x)")).not.toContain("×"); });
    it("2x implicit hides", () => { expect(html("2x")).not.toContain("×"); });
});

describe("Renderer — parenthesisation", () => {
    it("(a+b)*c has (", () => { expect(html("(a+b)*c")).toContain("("); });
    it("a+b*c no extra parens", () => { expect((html("a+b*c").match(/\(/g) || []).length).toBe(0); });
    it("-2*x has parens", () => { expect(html("-2*x")).toContain("("); });
});

describe("renderMath", () => {
    it("wraps in .native-math", () => { expect(renderMath(parser.parse("Expression", "x") as MathNode).className).toBe("native-math"); });
});
