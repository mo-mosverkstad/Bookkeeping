import { describe, it, expect } from "vitest";
import { render, renderMath } from "../../src/render/render.ts";
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

// ── Binary — addition/subtraction ─────────────────────────────────────────────

describe("Renderer — additive operators", () => {
    it("addition renders + operator text", () => {
        expect(html("a+b")).toContain("+");
    });

    it("subtraction renders - operator text", () => {
        expect(html("a-b")).toContain("-");
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

    // Regression: body must be beside the sign, not inside opstack (Issue 3)
    it("regression: body is .integral-body sibling, not child of opstack", () => {
        const el = renderInput("\\int{0, 1, x}");
        const opstack = el.querySelector(".opstack")!;
        const body = el.querySelector(".integral-body");
        expect(body).not.toBeNull();
        // integral-body must NOT be inside opstack
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

// ── Parenthesisation ──────────────────────────────────────────────────────────

describe("Renderer — automatic parenthesisation", () => {
    it("(a+b)*c wraps a+b in parens", () => {
        expect(html("(a+b)*c")).toContain("(");
    });

    it("a+b*c does NOT wrap b*c in parens", () => {
        // multiplication is higher precedence, no parens needed on right
        const h = html("a+b*c");
        // count parens — should be zero since no grouping needed
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
