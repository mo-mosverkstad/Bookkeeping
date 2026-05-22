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
        const node = parse("`1T") as any;
        expect(node.prefix).toBe("right-skew");
        expect(node.name).toBe("T");
    });

    it("right-skew Greek tried before plain Greek (no prefix theft)", () => {
        const node = parse("\\1a") as any;
        expect(node.prefix).toBe("greek-right");
        expect(node.name).toBe("a");
    });

    it("blackboard bold identifier", () => {
        const node = parse("\\\\R") as any;
        expect(node.type).toBe("Identifier");
        expect(node.name).toBe("R");
        expect(node.prefix).toBe("blackboard");
    });

    it("multi-letter backslash identifier", () => {
        expect(parse("\\sin")).toMatchObject(id("sin", "greek"));
    });

    it("multi-letter backslash identifier with digits", () => {
        expect(parse("\\ha")).toMatchObject(id("ha", "greek"));
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

    it("dot product", () => {
        expect(parse("u.v")).toMatchObject(bin(".", id("u"), id("v")));
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
        expect(node.type).toBe("BinaryExpression");
        expect(node.operator).toBe("*");
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

describe("Postfix — factorial", () => {
    it("simple factorial", () => {
        const node = parse("n!") as any;
        expect(node.type).toBe("FactorialExpression");
        expect(node.base).toMatchObject(id("n"));
    });

    it("factorial does not consume !=", () => {
        const node = parse("x != y") as any;
        expect(node.type).toBe("BinaryExpression");
        expect(node.operator).toBe("!=");
    });

    it("factorial on expression: (n+1)!", () => {
        const node = parse("(n+1)!") as any;
        expect(node.type).toBe("FactorialExpression");
        expect(node.base).toMatchObject(bin("+", id("n"), num(1)));
    });
});

describe("Postfix — derivative", () => {
    it("single prime", () => {
        const node = parse("f'") as any;
        expect(node.type).toBe("Derivative");
        expect(node.base).toMatchObject(id("f"));
        expect(node.order).toBe(1);
    });

    it("double prime", () => {
        const node = parse("f''") as any;
        expect(node.type).toBe("Derivative");
        expect(node.order).toBe(2);
    });

    it("derivative with call: f'(x)", () => {
        const node = parse("f'(x)") as any;
        expect(node.type).toBe("CallExpression");
        expect(node.callee.type).toBe("Derivative");
        expect(node.callee.order).toBe(1);
    });
});

describe("Postfix — index expression", () => {
    it("A[k] parses as IndexExpression", () => {
        const node = parse("A[k]") as any;
        expect(node.type).toBe("IndexExpression");
        expect(node.base).toMatchObject(id("A"));
        expect(node.index).toMatchObject(id("k"));
    });

    it("A[0] with numeric index", () => {
        const node = parse("A[0]") as any;
        expect(node.type).toBe("IndexExpression");
        expect(node.index).toMatchObject(num(0));
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
        expect(parse("a+b*c^d")).toMatchObject(
            bin("+", id("a"), bin("*", id("b"), bin("^", id("c"), id("d"))))
        );
    });

    it("unary is inside power: -a^2 = (-a)^2", () => {
        expect(parse("-a^2")).toMatchObject(
            bin("^", unary("-", id("a")), num(2))
        );
    });
});

// ── Relational ────────────────────────────────────────────────────────────────

describe("Relational operators", () => {
    it("equals", () => {
        expect(parse("a = b")).toMatchObject(bin("=", id("a"), id("b")));
    });

    it("not equal", () => {
        expect(parse("a != b")).toMatchObject(bin("!=", id("a"), id("b")));
    });

    it("less than or equal", () => {
        expect(parse("a <= b")).toMatchObject(bin("<=", id("a"), id("b")));
    });

    it("greater than or equal", () => {
        expect(parse("a >= b")).toMatchObject(bin(">=", id("a"), id("b")));
    });

    it("approximately equal", () => {
        expect(parse("a ~= b")).toMatchObject(bin("~=", id("a"), id("b")));
    });

    it("defined as", () => {
        expect(parse("a := b")).toMatchObject(bin(":=", id("a"), id("b")));
    });

    it("proportional", () => {
        expect(parse("a ~ b")).toMatchObject(bin("~", id("a"), id("b")));
    });

    it("much less than", () => {
        expect(parse("a << b")).toMatchObject(bin("<<", id("a"), id("b")));
    });

    it("much greater than", () => {
        expect(parse("a >> b")).toMatchObject(bin(">>", id("a"), id("b")));
    });

    it("approaching / arrow", () => {
        expect(parse("x -> a")).toMatchObject(bin("->", id("x"), id("a")));
    });

    it("less than", () => {
        expect(parse("a < b")).toMatchObject(bin("<", id("a"), id("b")));
    });

    it("greater than", () => {
        expect(parse("a > b")).toMatchObject(bin(">", id("a"), id("b")));
    });

    it("relational has lower precedence than additive", () => {
        expect(parse("a + 1 = b")).toMatchObject(
            bin("=", bin("+", id("a"), num(1)), id("b"))
        );
    });

    it("-> tried before >", () => {
        expect(parse("x -> y")).toMatchObject(bin("->", id("x"), id("y")));
    });

    it("<< tried before <", () => {
        expect(parse("a << b")).toMatchObject(bin("<<", id("a"), id("b")));
    });

    it("~= tried before ~", () => {
        expect(parse("a ~= b")).toMatchObject(bin("~=", id("a"), id("b")));
    });
});

// ── SubSuperscript ────────────────────────────────────────────────────────────

describe("SubSuperscript", () => {
    it("x_i^2 produces SubSuperscriptExpression", () => {
        const node = parse("x_i^2") as any;
        expect(node.type).toBe("SubSuperscriptExpression");
        expect(node.base).toMatchObject(id("x"));
        expect(node.subscript).toMatchObject(id("i"));
        expect(node.superscript).toMatchObject(num(2));
    });

    it("(x_i)^2 also produces SubSuperscriptExpression (parens unwrap)", () => {
        const node = parse("(x_i)^2") as any;
        expect(node.type).toBe("SubSuperscriptExpression");
        expect(node.base).toMatchObject(id("x"));
        expect(node.subscript).toMatchObject(id("i"));
        expect(node.superscript).toMatchObject(num(2));
    });
});

// ── Vector name decorator ─────────────────────────────────────────────────────

describe("Vector name decorator [a]", () => {
    it("[a] produces VectorName", () => {
        const node = parse("[a]") as any;
        expect(node.type).toBe("VectorName");
        expect(node.identifier).toMatchObject(id("a"));
    });

    it("[a] with skewed identifier", () => {
        const node = parse("[`1T]") as any;
        expect(node.type).toBe("VectorName");
        expect(node.identifier).toMatchObject(id("T", "right-skew"));
    });
});

// ── Matrix / vector literals ──────────────────────────────────────────────────

describe("Matrix and vector literals", () => {
    it("[a, b, c] produces row vector (1×3 Matrix)", () => {
        const node = parse("[a, b, c]") as any;
        expect(node.type).toBe("Matrix");
        expect(node.rows).toHaveLength(1);
        expect(node.rows[0]).toHaveLength(3);
    });

    it("[[a, b], [c, d]] produces 2×2 matrix", () => {
        const node = parse("[[a, b], [c, d]]") as any;
        expect(node.type).toBe("Matrix");
        expect(node.rows).toHaveLength(2);
        expect(node.rows[0]).toHaveLength(2);
        expect(node.rows[1]).toHaveLength(2);
    });

    it("(a, b, c) produces column vector (3×1 Matrix)", () => {
        const node = parse("(a, b, c)") as any;
        expect(node.type).toBe("Matrix");
        expect(node.rows).toHaveLength(3);
        expect(node.rows[0]).toHaveLength(1);
    });

    it("(a) is grouping, not a 1×1 vector", () => {
        const node = parse("(a)") as any;
        expect(node.type).toBe("Identifier");
    });
});

// ── Absolute value ────────────────────────────────────────────────────────────

describe("Absolute value", () => {
    it("|x| produces AbsoluteValue", () => {
        const node = parse("|x|") as any;
        expect(node.type).toBe("AbsoluteValue");
        expect(node.expr).toMatchObject(id("x"));
    });

    it("|a+b| wraps expression", () => {
        const node = parse("|a+b|") as any;
        expect(node.type).toBe("AbsoluteValue");
        expect(node.expr.type).toBe("BinaryExpression");
    });
});

// ── Rollout expressions ───────────────────────────────────────────────────────

describe("Rollout expressions", () => {
    it("+{k=0, n, A[k]} produces ControlExpression with name +", () => {
        const node = parse("+{k=0, n, A[k]}") as any;
        expect(node.type).toBe("ControlExpression");
        expect(node.name).toBe("+");
        expect(node.args).toHaveLength(3);
        // first arg is k=0 (relational expression)
        expect(node.args[0].type).toBe("BinaryExpression");
        expect(node.args[0].operator).toBe("=");
    });

    it("*{k=0, n, A[k]} produces ControlExpression with name *", () => {
        const node = parse("*{k=0, n, A[k]}") as any;
        expect(node.type).toBe("ControlExpression");
        expect(node.name).toBe("*");
    });
});

// ── Ellipsis ──────────────────────────────────────────────────────────────────

describe("Ellipsis", () => {
    it("... produces EllipsisNode", () => {
        const node = parse("...") as any;
        expect(node.type).toBe("Ellipsis");
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
