import { describe, it, expect } from "vitest";
import { renderMath } from "../../src/render/render.ts";
import { parser } from "../../src/parser/grammar.ts";
import type { ASTNode } from "../../src/parser/types.ts";

function renderInput(input: string): HTMLElement {
    const ast = parser.parse("Expression", input) as ASTNode;
    return renderMath(ast);
}

function html(input: string): string {
    return renderInput(input).innerHTML;
}

function query(input: string, selector: string): Element | null {
    return renderInput(input).querySelector(selector);
}

// ── Number ────────────────────────────────────────────────────────────────────

describe("Renderer — NumberLiteral", () => {
    it("renders integer as text", () => {
        expect(html("42")).toContain("42");
    });

    it("renders decimal", () => {
        expect(html("3.14")).toContain("3.14");
    });
});

// ── Identifier ────────────────────────────────────────────────────────────────

describe("Renderer — Identifier", () => {
    it("plain identifier has ident-plain class", () => {
        expect(query("x", ".ident-plain")).not.toBeNull();
    });

    it("left-skew identifier has ident-left-skew class", () => {
        expect(query("`a", ".ident-left-skew")).not.toBeNull();
    });

    it("right-skew identifier has ident-right-skew class", () => {
        expect(query("`1T", ".ident-right-skew")).not.toBeNull();
    });

    it("Greek identifier renders Greek glyph", () => {
        expect(html("\\a")).toContain("α");
    });

    it("Greek identifier has ident-greek class", () => {
        expect(query("\\a", ".ident-greek")).not.toBeNull();
    });

    it("right-skew Greek renders Greek glyph with ident-greek-right class", () => {
        const el = query("\\1b", ".ident-greek-right");
        expect(el).not.toBeNull();
        expect(el!.textContent).toBe("β");
    });

    it("blackboard bold renders correct glyph", () => {
        expect(html("\\\\R")).toContain("ℝ");
    });

    it("blackboard bold has ident-blackboard class", () => {
        expect(query("\\\\R", ".ident-blackboard")).not.toBeNull();
    });

    it("Hebrew identifier \\ha renders ℵ", () => {
        expect(html("\\ha")).toContain("ℵ");
    });

    it("multi-letter identifier \\sin renders as text sin", () => {
        expect(html("\\sin")).toContain("sin");
    });
});

// ── Binary — fraction ─────────────────────────────────────────────────────────

describe("Renderer — fraction", () => {
    it("division renders .fraction element", () => {
        expect(query("a/b", ".fraction")).not.toBeNull();
    });

    it("fraction has .top and .bottom children", () => {
        const el = renderInput("a/b");
        expect(el.querySelector(".fraction .top")).not.toBeNull();
        expect(el.querySelector(".fraction .bottom")).not.toBeNull();
    });

    it("numerator text is correct", () => {
        expect(query("a/b", ".fraction .top")!.textContent).toBe("a");
    });

    it("denominator text is correct", () => {
        expect(query("a/b", ".fraction .bottom")!.textContent).toBe("b");
    });
});

// ── Binary — power ────────────────────────────────────────────────────────────

describe("Renderer — power", () => {
    it("exponentiation renders <sup>", () => {
        expect(query("x^2", "sup")).not.toBeNull();
    });

    it("superscript text is correct", () => {
        expect(query("x^2", "sup")!.textContent).toBe("2");
    });

    it("right-associative: x^2^3 has nested <sup>", () => {
        const el = renderInput("x^2^3");
        const sups = el.querySelectorAll("sup");
        expect(sups.length).toBe(2);
    });
});

// ── Binary — additive ─────────────────────────────────────────────────────────

describe("Renderer — additive operators", () => {
    it("addition renders + operator text", () => {
        expect(html("a+b")).toContain("+");
    });

    it("subtraction renders - operator text", () => {
        expect(html("a-b")).toContain("-");
    });
});

// ── Binary — dot product ──────────────────────────────────────────────────────

describe("Renderer — dot product", () => {
    it("dot product renders centre dot ·", () => {
        expect(html("u.v")).toContain("·");
    });
});

// ── Relational operators ──────────────────────────────────────────────────────

describe("Renderer — relational operators", () => {
    it("!= renders ≠", () => {
        expect(html("a != b")).toContain("≠");
    });

    it("<= renders ≤", () => {
        expect(html("a <= b")).toContain("≤");
    });

    it(">= renders ≥", () => {
        expect(html("a >= b")).toContain("≥");
    });

    it("-> renders →", () => {
        expect(html("x -> a")).toContain("→");
    });

    it("= renders =", () => {
        expect(html("a = b")).toContain("=");
    });
});

// ── Unary ─────────────────────────────────────────────────────────────────────

describe("Renderer — unary", () => {
    it("negation renders - prefix", () => {
        expect(html("-x")).toContain("-");
    });
});

// ── Subscript ─────────────────────────────────────────────────────────────────

describe("Renderer — subscript", () => {
    it("renders <sub> element", () => {
        expect(query("x_i", "sub")).not.toBeNull();
    });

    it("subscript text is correct", () => {
        expect(query("x_i", "sub")!.textContent).toBe("i");
    });
});

// ── SubSuperscript ────────────────────────────────────────────────────────────

describe("Renderer — SubSuperscript", () => {
    it("x_i^2 renders .subsuperscript container", () => {
        expect(query("x_i^2", ".subsuperscript")).not.toBeNull();
    });

    it("x_i^2 has .scripts with sup and sub", () => {
        const el = renderInput("x_i^2");
        const scripts = el.querySelector(".scripts");
        expect(scripts).not.toBeNull();
        expect(scripts!.querySelector("sup")).not.toBeNull();
        expect(scripts!.querySelector("sub")).not.toBeNull();
    });
});

// ── Call expression ───────────────────────────────────────────────────────────

describe("Renderer — call expression", () => {
    it("renders callee name", () => {
        expect(html("f(x)")).toContain("f");
    });

    it("renders parentheses", () => {
        expect(html("f(x)")).toContain("(");
        expect(html("f(x)")).toContain(")");
    });
});

// ── Control — integral ────────────────────────────────────────────────────────

describe("Renderer — integral", () => {
    it("renders .integral container", () => {
        expect(query("\\int{0, 1, x}", ".integral")).not.toBeNull();
    });

    it("renders .opstack inside .integral", () => {
        expect(query("\\int{0, 1, x}", ".integral .opstack")).not.toBeNull();
    });

    it("regression: body is .integral-body sibling, not child of opstack", () => {
        const el = renderInput("\\int{0, 1, x}");
        const opstack = el.querySelector(".opstack")!;
        const body = el.querySelector(".integral-body");
        expect(body).not.toBeNull();
        expect(opstack.querySelector(".integral-body")).toBeNull();
    });

    it("integral symbol ∫ is present", () => {
        expect(html("\\int{0, 1, x}")).toContain("∫");
    });

    it("lower bound rendered in .bottom", () => {
        expect(query("\\int{0, 1, x}", ".opstack .bottom")!.textContent).toBe("0");
    });

    it("upper bound rendered in .top", () => {
        expect(query("\\int{0, 1, x}", ".opstack .top")!.textContent).toBe("1");
    });

    it("body rendered in .integral-body", () => {
        expect(query("\\int{0, 1, x}", ".integral-body")!.textContent).toBe("x");
    });
});

// ── Control — sqrt ────────────────────────────────────────────────────────────

describe("Renderer — sqrt", () => {
    it("renders .sqrt element", () => {
        expect(query("\\sqrt{x}", ".sqrt")).not.toBeNull();
    });

    it("sqrt content is correct", () => {
        expect(query("\\sqrt{x}", ".sqrt")!.textContent).toBe("x");
    });
});

// ── Control — floor/ceil ──────────────────────────────────────────────────────

describe("Renderer — floor and ceil", () => {
    it("floor renders ⌊ and ⌋", () => {
        const h = html("\\floor{x}");
        expect(h).toContain("⌊");
        expect(h).toContain("⌋");
    });

    it("ceil renders ⌈ and ⌉", () => {
        const h = html("\\ceil{x}");
        expect(h).toContain("⌈");
        expect(h).toContain("⌉");
    });
});

// ── Control — inner product ───────────────────────────────────────────────────

describe("Renderer — inner product", () => {
    it("\\inner{x, y} renders angle brackets", () => {
        const h = html("\\inner{x, y}");
        expect(h).toContain("⟨");
        expect(h).toContain("⟩");
    });
});

// ── Control — big operators ───────────────────────────────────────────────────

describe("Renderer — big operators", () => {
    it("\\S renders Σ", () => {
        expect(html("\\S{k=0, n, k}")).toContain("Σ");
    });

    it("\\S renders .integral container (same layout as integral)", () => {
        expect(query("\\S{k=0, n, k}", ".integral")).not.toBeNull();
    });
});

// ── Control — lim ─────────────────────────────────────────────────────────────

describe("Renderer — lim", () => {
    it("\\lim renders lim text", () => {
        expect(html("\\lim{x, f(x)}")).toContain("lim");
    });
});

// ── Vector name ───────────────────────────────────────────────────────────────

describe("Renderer — vector name", () => {
    it("[a] renders .vector-name", () => {
        expect(query("[a]", ".vector-name")).not.toBeNull();
    });

    it("[a] renders arrow ⃗", () => {
        expect(html("[a]")).toContain("⃗");
    });
});

// ── Matrix ────────────────────────────────────────────────────────────────────

describe("Renderer — matrix", () => {
    it("[[a, b], [c, d]] renders .matrix", () => {
        expect(query("[[a, b], [c, d]]", ".matrix")).not.toBeNull();
    });

    it("matrix has correct number of rows", () => {
        const el = renderInput("[[a, b], [c, d]]");
        const rows = el.querySelectorAll(".matrix-row");
        expect(rows.length).toBe(2);
    });

    it("matrix has correct number of cells", () => {
        const el = renderInput("[[a, b], [c, d]]");
        const cells = el.querySelectorAll(".matrix-cell");
        expect(cells.length).toBe(4);
    });
});

// ── Absolute value / norm ─────────────────────────────────────────────────────

describe("Renderer — absolute value and norm", () => {
    it("|x| renders | delimiters", () => {
        const h = html("|x|");
        expect(h).toContain("|");
    });

    it("|[a]| renders ‖ (norm)", () => {
        const h = html("|[a]|");
        expect(h).toContain("‖");
    });
});

// ── Factorial ─────────────────────────────────────────────────────────────────

describe("Renderer — factorial", () => {
    it("n! renders !", () => {
        expect(html("n!")).toContain("!");
    });
});

// ── Derivative ────────────────────────────────────────────────────────────────

describe("Renderer — derivative", () => {
    it("f' renders prime ′", () => {
        expect(html("f'")).toContain("′");
    });

    it("f'' renders two primes", () => {
        const h = html("f''");
        expect((h.match(/′/g) || []).length).toBe(2);
    });
});

// ── Ellipsis ──────────────────────────────────────────────────────────────────

describe("Renderer — ellipsis", () => {
    it("... renders …", () => {
        expect(html("...")).toContain("…");
    });
});

// ── Multiplication sign visibility ────────────────────────────────────────────

describe("Renderer — multiplication sign visibility", () => {
    // × shown: bare number adjacent to bare number
    it("2*3 shows × (digit-digit)", () => {
        expect(html("2*3")).toContain("×");
    });

    it("42*7 shows × (multi-digit)", () => {
        expect(html("42*7")).toContain("×");
    });

    // × hidden: number × identifier
    it("2*x hides sign (digit-letter)", () => {
        expect(html("2*x")).not.toContain("×");
    });

    // × hidden: identifier × identifier
    it("x*y hides sign (letter-letter)", () => {
        expect(html("x*y")).not.toContain("×");
    });

    // × hidden: identifier × number (letter then digit — unambiguous)
    it("x*2 hides sign (letter-digit)", () => {
        expect(html("x*2")).not.toContain("×");
    });

    // × hidden: parenthesised × number (paren then digit)
    it("(a+b)*3 hides sign (paren-digit)", () => {
        expect(html("(a+b)*3")).not.toContain("×");
    });

    // × hidden: number × parenthesised (digit then paren)
    it("2*(a+b) hides sign (digit-paren)", () => {
        expect(html("2*(a+b)")).not.toContain("×");
    });

    // × hidden: parenthesised × parenthesised
    it("(a+b)*(c+d) hides sign (paren-paren)", () => {
        expect(html("(a+b)*(c+d)")).not.toContain("×");
    });

    // × hidden: parenthesised × identifier
    it("(a+b)*x hides sign (paren-letter)", () => {
        expect(html("(a+b)*x")).not.toContain("×");
    });

    // × hidden: number × function call (digit then letter)
    it("2*f(x) hides sign (digit-call)", () => {
        expect(html("2*f(x)")).not.toContain("×");
    });

    // × hidden: implicit multiplication (2x)
    it("2x hides sign (implicit)", () => {
        expect(html("2x")).not.toContain("×");
    });

    // × hidden: identifier × parenthesised
    it("x*(a+b) hides sign (letter-paren)", () => {
        expect(html("x*(a+b)")).not.toContain("×");
    });
});

// ── Parenthesisation ──────────────────────────────────────────────────────────

describe("Renderer — automatic parenthesisation", () => {
    it("(a+b)*c wraps a+b in parens", () => {
        expect(html("(a+b)*c")).toContain("(");
    });

    it("a+b*c does NOT wrap b*c in parens", () => {
        const h = html("a+b*c");
        expect((h.match(/\(/g) || []).length).toBe(0);
    });

    it("unary inside multiply gets parens: -2*x", () => {
        expect(html("-2*x")).toContain("(");
    });
});

// ── renderMath wrapper ────────────────────────────────────────────────────────

describe("renderMath", () => {
    it("wraps output in .native-math", () => {
        const ast = parser.parse("Expression", "x") as ASTNode;
        const el = renderMath(ast);
        expect(el.className).toBe("native-math");
    });
});
