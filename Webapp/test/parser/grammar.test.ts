import { describe, it, expect } from "vitest";
import { parser } from "../../src/parser/grammar.ts";
import type { ASTNode } from "../../src/parser/types.ts";

function parse(input: string): ASTNode {
    return parser.parse("Expression", input) as ASTNode;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function num(value: number) {
    return { type: "NumberLiteral", value };
}

function id(name: string, prefix = "plain") {
    return { type: "Identifier", name, prefix };
}

function bin(operator: string, left: object, right: object) {
    return { type: "BinaryExpression", operator, left, right };
}

function unary(operator: string, operand: object) {
    return { type: "UnaryExpression", operator, operand };
}

function call(callee: object, args: object[]) {
    return { type: "CallExpression", callee, args };
}

function control(name: string, args: object[]) {
    return { type: "ControlExpression", name, args };
}

function subscript(base: object, sub: object) {
    return { type: "SubscriptExpression", base, subscript: sub };
}

// ── Numbers ───────────────────────────────────────────────────────────────────

describe("Number literals", () => {
    it("parses integer", () => {
        expect(parse("42")).toMatchObject(num(42));
    });

    it("parses decimal", () => {
        expect(parse("3.14")).toMatchObject(num(3.14));
    });

    it("parses leading-dot decimal", () => {
        expect(parse(".5")).toMatchObject(num(0.5));
    });
});

// ── Identifiers ───────────────────────────────────────────────────────────────

describe("Identifiers", () => {
    it("plain Latin", () => {
        expect(parse("x")).toMatchObject(id("x", "plain"));
    });

    it("left-skew Latin", () => {
        expect(parse("`a")).toMatchObject(id("a", "left-skew"));
    });

    it("right-skew Latin", () => {
        expect(parse("`1T")).toMatchObject(id("T", "right-skew"));
    });

    it("Greek upright", () => {
        expect(parse("\\a")).toMatchObject(id("a", "greek"));
    });

    it("Greek right-skew", () => {
        expect(parse("\\1b")).toMatchObject(id("b", "greek-right"));
    });

    it("right-skew tried before left-skew (no prefix theft)", () => {
        // `1T must parse as right-skew, not left-skew(`1`) + plain(T)
        const node = parse("`1T") as any;
        expect(node.prefix).toBe("right-skew");
        expect(node.name).toBe("T");
    });

    it("right-skew Greek tried before plain Greek (no prefix theft)", () => {
        const node = parse("\\1a") as any;
        expect(node.prefix).toBe("greek-right");
        expect(node.name).toBe("a");
    });
});

// ── Additive ──────────────────────────────────────────────────────────────────

describe("Additive", () => {
    it("addition", () => {
        expect(parse("a+b")).toMatchObject(bin("+", id("a"), id("b")));
    });

    it("subtraction", () => {
        expect(parse("a-b")).toMatchObject(bin("-", id("a"), id("b")));
    });

    it("left-associative chain", () => {
        expect(parse("a+b+c")).toMatchObject(
            bin("+", bin("+", id("a"), id("b")), id("c"))
        );
    });

    it("whitespace ignored", () => {
        expect(parse("a + b")).toMatchObject(bin("+", id("a"), id("b")));
    });
});

// ── Multiplicative ────────────────────────────────────────────────────────────

describe("Multiplicative", () => {
    it("explicit multiply", () => {
        expect(parse("a*b")).toMatchObject(bin("*", id("a"), id("b")));
    });

    it("division", () => {
        expect(parse("a/b")).toMatchObject(bin("/", id("a"), id("b")));
    });

    it("implicit multiplication: 2x", () => {
        expect(parse("2x")).toMatchObject(bin("*", num(2), id("x")));
    });

    it("implicit multiplication: sin(x)y", () => {
        expect(parse("f(x)y")).toMatchObject(
            bin("*", call(id("f"), [id("x")]), id("y"))
        );
    });

    it("higher precedence than additive", () => {
        expect(parse("a+b*c")).toMatchObject(
            bin("+", id("a"), bin("*", id("b"), id("c")))
        );
    });

    // Regression: implicit multiplication must not steal unary signs (Issue 2)
    it("regression: (3+5) not parsed as 3*(+5)", () => {
        const node = parse("2*(3+5)") as any;
        expect(node.right.type).toBe("BinaryExpression");
        expect(node.right.operator).toBe("+");
        expect(node.right.left).toMatchObject(num(3));
        expect(node.right.right).toMatchObject(num(5));
    });

    it("regression: -2*(3+5)*4e^x^2 full composite", () => {
        const node = parse("-2*(3+5)*4e^x^2") as any;
        // top level: * of (-2*(3+5)*4) and e^(x^2)
        expect(node.type).toBe("BinaryExpression");
        expect(node.operator).toBe("*");
        // right side must be e^(x^2), not (e^x)^2
        expect(node.right.type).toBe("BinaryExpression");
        expect(node.right.operator).toBe("^");
        expect(node.right.left).toMatchObject(id("e"));
        expect(node.right.right.operator).toBe("^");
    });
});

// ── Power ─────────────────────────────────────────────────────────────────────

describe("Power", () => {
    it("basic exponentiation", () => {
        expect(parse("x^2")).toMatchObject(bin("^", id("x"), num(2)));
    });

    it("right-associative: x^2^3 = x^(2^3)", () => {
        expect(parse("x^2^3")).toMatchObject(
            bin("^", id("x"), bin("^", num(2), num(3)))
        );
    });

    it("right-associative chain: a^b^c^d", () => {
        expect(parse("a^b^c^d")).toMatchObject(
            bin("^", id("a"), bin("^", id("b"), bin("^", id("c"), id("d"))))
        );
    });
});

// ── Unary ─────────────────────────────────────────────────────────────────────

describe("Unary", () => {
    it("negation", () => {
        expect(parse("-x")).toMatchObject(unary("-", id("x")));
    });

    it("unary plus", () => {
        expect(parse("+x")).toMatchObject(unary("+", id("x")));
    });

    it("double negation", () => {
        expect(parse("--x")).toMatchObject(unary("-", unary("-", id("x"))));
    });
});

// ── Postfix ───────────────────────────────────────────────────────────────────

describe("Postfix — function call", () => {
    it("no-arg call", () => {
        expect(parse("f()")).toMatchObject(call(id("f"), []));
    });

    it("single-arg call", () => {
        expect(parse("f(x)")).toMatchObject(call(id("f"), [id("x")]));
    });

    it("multi-arg call", () => {
        expect(parse("f(x,y)")).toMatchObject(
            call(id("f"), [id("x"), id("y")])
        );
    });

    it("chained calls: g(x)(y)", () => {
        expect(parse("g(x)(y)")).toMatchObject(
            call(call(id("g"), [id("x")]), [id("y")])
        );
    });
});

describe("Postfix — subscript", () => {
    it("simple subscript", () => {
        expect(parse("x_i")).toMatchObject(subscript(id("x"), id("i")));
    });

    it("numeric subscript", () => {
        expect(parse("x_0")).toMatchObject(subscript(id("x"), num(0)));
    });
});

describe("Postfix — control expression", () => {
    it("\\int with three args", () => {
        expect(parse("\\int{0, 1, x}")).toMatchObject(
            control("int", [num(0), num(1), id("x")])
        );
    });

    it("\\sqrt with one arg", () => {
        expect(parse("\\sqrt{x}")).toMatchObject(
            control("sqrt", [id("x")])
        );
    });

    it("generic control expression", () => {
        expect(parse("\\foo{a, b}")).toMatchObject(
            control("foo", [id("a"), id("b")])
        );
    });
});

// ── Grouping ──────────────────────────────────────────────────────────────────

describe("Grouping parentheses", () => {
    it("unwraps single expression", () => {
        expect(parse("(x)")).toMatchObject(id("x"));
    });

    it("changes precedence", () => {
        expect(parse("(a+b)*c")).toMatchObject(
            bin("*", bin("+", id("a"), id("b")), id("c"))
        );
    });
});

// ── Operator precedence ───────────────────────────────────────────────────────

describe("Operator precedence", () => {
    it("^ > * > +", () => {
        // a + b * c ^ d  =  a + (b * (c ^ d))
        expect(parse("a+b*c^d")).toMatchObject(
            bin("+", id("a"), bin("*", id("b"), bin("^", id("c"), id("d"))))
        );
    });

    it("unary is inside power: -a^2 = (-a)^2", () => {
        // Power → Unary (^ Unary)* so -a is parsed as Unary first,
        // then ^2 is applied to it, giving (-a)^2 not -(a^2)
        expect(parse("-a^2")).toMatchObject(
            bin("^", unary("-", id("a")), num(2))
        );
    });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe("Parse errors", () => {
    it("throws on empty input", () => {
        expect(() => parse("")).toThrow();
    });

    it("throws on unmatched paren", () => {
        expect(() => parse("(a+b")).toThrow();
    });

    it("throws on trailing garbage", () => {
        expect(() => parse("a + @")).toThrow();
    });

    it("error message contains position info", () => {
        try {
            parse("a + @");
        } catch (e) {
            expect((e as Error).message).toMatch(/-->/);
        }
    });
});
