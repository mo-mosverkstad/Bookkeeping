import { describe, it, expect } from "vitest";
import { parser } from "../../../src/cell-renderers/math/grammar.ts";
import type { MathNode } from "../../../src/cell-renderers/math/types.ts";

function parse(input: string): MathNode { return parser.parse("Expression", input) as MathNode; }
function num(value: number) { return { type: "NumberLiteral", value }; }
function id(name: string, prefix = "plain") { return { type: "Identifier", name, prefix }; }
function bin(op: string, left: object, right: object) { return { type: "BinaryExpression", operator: op, left, right }; }
function frac(numerator: object, denominator: object) { return { type: "FractionExpression", numerator, denominator }; }
function unary(op: string, operand: object) { return { type: "UnaryExpression", operator: op, operand }; }
function call(callee: object, args: object[]) { return { type: "CallExpression", callee, args }; }
function control(name: string, args: object[]) { return { type: "ControlExpression", name, args }; }
function subscript(base: object, sub: object) { return { type: "SubscriptExpression", base, subscript: sub }; }

describe("Number literals", () => {
    it("parses integer", () => { expect(parse("42")).toMatchObject(num(42)); });
    it("parses decimal", () => { expect(parse("3.14")).toMatchObject(num(3.14)); });
    it("parses leading-dot decimal", () => { expect(parse(".5")).toMatchObject(num(0.5)); });
});

describe("Identifiers", () => {
    it("plain Latin", () => { expect(parse("x")).toMatchObject(id("x")); });
    it("left-skew Latin", () => { expect(parse("`a")).toMatchObject(id("a", "left-skew")); });
    it("right-skew Latin", () => { expect(parse("`1T")).toMatchObject(id("T", "right-skew")); });
    it("Greek upright", () => { expect(parse("\\a")).toMatchObject(id("a", "greek")); });
    it("Greek right-skew", () => { expect(parse("\\1b")).toMatchObject(id("b", "greek-right")); });
    it("right-skew before left-skew", () => { const n = parse("`1T") as any; expect(n.prefix).toBe("right-skew"); });
    it("right-skew Greek before plain Greek", () => { const n = parse("\\1a") as any; expect(n.prefix).toBe("greek-right"); });
    it("blackboard bold", () => { const n = parse("\\\\R") as any; expect(n.prefix).toBe("blackboard"); expect(n.name).toBe("R"); });
    it("multi-letter backslash", () => { expect(parse("\\sin")).toMatchObject(id("sin", "greek")); });
    it("multi-letter with digits", () => { expect(parse("\\ha")).toMatchObject(id("ha", "greek")); });
});

describe("Additive", () => {
    it("addition", () => { expect(parse("a+b")).toMatchObject(bin("+", id("a"), id("b"))); });
    it("subtraction", () => { expect(parse("a-b")).toMatchObject(bin("-", id("a"), id("b"))); });
    it("left-associative chain", () => { expect(parse("a+b+c")).toMatchObject(bin("+", bin("+", id("a"), id("b")), id("c"))); });
    it("whitespace ignored", () => { expect(parse("a + b")).toMatchObject(bin("+", id("a"), id("b"))); });
});

describe("Multiplicative", () => {
    it("explicit multiply", () => { expect(parse("a*b")).toMatchObject(bin("*", id("a"), id("b"))); });
    it("division", () => { expect(parse("a/b")).toMatchObject(frac(id("a"), id("b"))); });
    it("division binds tighter than multiply on the right", () => { expect(parse("a*b/c")).toMatchObject(bin("*", id("a"), frac(id("b"), id("c")))); });
    it("parenthesized product can be numerator", () => { expect(parse("(a*b)/c")).toMatchObject(frac(bin("*", id("a"), id("b")), id("c"))); });
    it("implicit product can include fraction", () => { expect(parse("2x/y")).toMatchObject(bin("*", num(2), frac(id("x"), id("y")))); });
    it("implicit 2x", () => { expect(parse("2x")).toMatchObject(bin("*", num(2), id("x"))); });
    it("implicit f(x)y", () => { expect(parse("f(x)y")).toMatchObject(bin("*", call(id("f"), [id("x")]), id("y"))); });
    it("higher precedence than additive", () => { expect(parse("a+b*c")).toMatchObject(bin("+", id("a"), bin("*", id("b"), id("c")))); });
    it("dot product", () => { expect(parse("u.v")).toMatchObject(bin(".", id("u"), id("v"))); });
    it("regression: (3+5) not 3*(+5)", () => { const n = parse("2*(3+5)") as any; expect(n.right.operator).toBe("+"); });
    it("regression: -2*(3+5)*4e^x^2", () => { const n = parse("-2*(3+5)*4e^x^2") as any; expect(n.operator).toBe("*"); expect(n.right.operator).toBe("^"); });
});

describe("Power", () => {
    it("basic", () => { expect(parse("x^2")).toMatchObject(bin("^", id("x"), num(2))); });
    it("right-associative x^2^3", () => { expect(parse("x^2^3")).toMatchObject(bin("^", id("x"), bin("^", num(2), num(3)))); });
    it("right-associative chain a^b^c^d", () => { expect(parse("a^b^c^d")).toMatchObject(bin("^", id("a"), bin("^", id("b"), bin("^", id("c"), id("d"))))); });
});

describe("Unary", () => {
    it("negation", () => { expect(parse("-x")).toMatchObject(unary("-", id("x"))); });
    it("unary plus", () => { expect(parse("+x")).toMatchObject(unary("+", id("x"))); });
    it("double negation", () => { expect(parse("--x")).toMatchObject(unary("-", unary("-", id("x")))); });
});

describe("Postfix — function call", () => {
    it("no-arg", () => { expect(parse("f()")).toMatchObject(call(id("f"), [])); });
    it("single-arg", () => { expect(parse("f(x)")).toMatchObject(call(id("f"), [id("x")])); });
    it("multi-arg", () => { expect(parse("f(x,y)")).toMatchObject(call(id("f"), [id("x"), id("y")])); });
    it("chained g(x)(y)", () => { expect(parse("g(x)(y)")).toMatchObject(call(call(id("g"), [id("x")]), [id("y")])); });
});

describe("Postfix — subscript", () => {
    it("simple", () => { expect(parse("x_i")).toMatchObject(subscript(id("x"), id("i"))); });
    it("numeric", () => { expect(parse("x_0")).toMatchObject(subscript(id("x"), num(0))); });
});

describe("Postfix — control", () => {
    it("\\int with three args", () => { expect(parse("\\int{0, 1, x}")).toMatchObject(control("int", [num(0), num(1), id("x")])); });
    it("\\sqrt with one arg", () => { expect(parse("\\sqrt{x}")).toMatchObject(control("sqrt", [id("x")])); });
    it("generic", () => { expect(parse("\\foo{a, b}")).toMatchObject(control("foo", [id("a"), id("b")])); });
});

describe("Postfix — factorial", () => {
    it("simple", () => { const n = parse("n!") as any; expect(n.type).toBe("FactorialExpression"); expect(n.base).toMatchObject(id("n")); });
    it("does not consume !=", () => { expect((parse("x != y") as any).operator).toBe("!="); });
    it("on group (n+1)!", () => { const n = parse("(n+1)!") as any; expect(n.type).toBe("FactorialExpression"); });
});

describe("Postfix — derivative", () => {
    it("single prime", () => { const n = parse("f'") as any; expect(n.type).toBe("Derivative"); expect(n.order).toBe(1); });
    it("double prime", () => { const n = parse("f''") as any; expect(n.order).toBe(2); });
    it("derivative with call f'(x)", () => { const n = parse("f'(x)") as any; expect(n.type).toBe("CallExpression"); expect(n.callee.type).toBe("Derivative"); });
});

describe("Postfix — index", () => {
    it("A[k]", () => { const n = parse("A[k]") as any; expect(n.type).toBe("IndexExpression"); expect(n.base).toMatchObject(id("A")); });
    it("A[0]", () => { const n = parse("A[0]") as any; expect(n.index).toMatchObject(num(0)); });
});

describe("Grouping", () => {
    it("unwraps (x)", () => { expect(parse("(x)")).toMatchObject(id("x")); });
    it("changes precedence", () => { expect(parse("(a+b)*c")).toMatchObject(bin("*", bin("+", id("a"), id("b")), id("c"))); });
});

describe("Operator precedence", () => {
    it("^ > * > +", () => { expect(parse("a+b*c^d")).toMatchObject(bin("+", id("a"), bin("*", id("b"), bin("^", id("c"), id("d"))))); });
    it("unary inside power: -a^2 = (-a)^2", () => { expect(parse("-a^2")).toMatchObject(bin("^", unary("-", id("a")), num(2))); });
});

describe("Relational operators", () => {
    it("=", () => { expect(parse("a = b")).toMatchObject(bin("=", id("a"), id("b"))); });
    it("!=", () => { expect(parse("a != b")).toMatchObject(bin("!=", id("a"), id("b"))); });
    it("<=", () => { expect(parse("a <= b")).toMatchObject(bin("<=", id("a"), id("b"))); });
    it(">=", () => { expect(parse("a >= b")).toMatchObject(bin(">=", id("a"), id("b"))); });
    it("~=", () => { expect(parse("a ~= b")).toMatchObject(bin("~=", id("a"), id("b"))); });
    it(":=", () => { expect(parse("a := b")).toMatchObject(bin(":=", id("a"), id("b"))); });
    it("~", () => { expect(parse("a ~ b")).toMatchObject(bin("~", id("a"), id("b"))); });
    it("<<", () => { expect(parse("a << b")).toMatchObject(bin("<<", id("a"), id("b"))); });
    it(">>", () => { expect(parse("a >> b")).toMatchObject(bin(">>", id("a"), id("b"))); });
    it("->", () => { expect(parse("x -> a")).toMatchObject(bin("->", id("x"), id("a"))); });
    it("<", () => { expect(parse("a < b")).toMatchObject(bin("<", id("a"), id("b"))); });
    it(">", () => { expect(parse("a > b")).toMatchObject(bin(">", id("a"), id("b"))); });
    it("lower precedence than additive", () => { expect(parse("a+1=b")).toMatchObject(bin("=", bin("+", id("a"), num(1)), id("b"))); });
    it("-> before >", () => { expect((parse("x -> y") as any).operator).toBe("->"); });
    it("<< before <", () => { expect((parse("a << b") as any).operator).toBe("<<"); });
    it("~= before ~", () => { expect((parse("a ~= b") as any).operator).toBe("~="); });
    it("chained: a = b -> c = d", () => {
        const n = parse("a = b -> c = d") as any;
        // Left-associative: ((a = b) -> c) = d — but more usefully:
        // The outermost operator should be "=" (last in chain)
        expect(n.type).toBe("BinaryExpression");
        // The chain folds left: ((a=b) -> (c)) = d ... actually let's check structure
        // a = b -> c = d  =>  (((a = b) -> c) = d)
        expect(n.operator).toBe("=");
    });
    it("implication with equations: f(x)=x^n -> f'(x)=n*x^(n-1)", () => {
        // This must not throw — the key regression test
        const n = parse("f(x) = x^n -> f'(x) = n*x^(n-1)") as any;
        expect(n.type).toBe("BinaryExpression");
    });
});

describe("SubSuperscript", () => {
    it("x_i^2 produces SubSuperscriptExpression", () => { const n = parse("x_i^2") as any; expect(n.type).toBe("SubSuperscriptExpression"); expect(n.base).toMatchObject(id("x")); expect(n.subscript).toMatchObject(id("i")); expect(n.superscript).toMatchObject(num(2)); });
    it("(x_i)^2 also produces SubSuperscriptExpression", () => { const n = parse("(x_i)^2") as any; expect(n.type).toBe("SubSuperscriptExpression"); });
});

describe("Vector name [a]", () => {
    it("[a] produces VectorName", () => { const n = parse("[a]") as any; expect(n.type).toBe("VectorName"); expect(n.identifier).toMatchObject(id("a")); });
    it("[`1T] with skewed id", () => { const n = parse("[`1T]") as any; expect(n.type).toBe("VectorName"); });
});

describe("Matrix and vector literals", () => {
    it("[a, b, c] row vector", () => { const n = parse("[a, b, c]") as any; expect(n.type).toBe("Matrix"); expect(n.rows).toHaveLength(1); expect(n.rows[0]).toHaveLength(3); });
    it("[[a, b], [c, d]] 2x2 matrix", () => { const n = parse("[[a, b], [c, d]]") as any; expect(n.type).toBe("Matrix"); expect(n.rows).toHaveLength(2); });
    it("(a, b, c) is tuple, not vector", () => { const n = parse("(a, b, c)") as any; expect(n.type).toBe("Tuple"); expect(n.elements).toHaveLength(3); });
    it("(a) is grouping", () => { expect((parse("(a)") as any).type).toBe("Identifier"); });
});

describe("Absolute value", () => {
    it("|x|", () => { const n = parse("|x|") as any; expect(n.type).toBe("AbsoluteValue"); expect(n.expr).toMatchObject(id("x")); });
    it("|a+b|", () => { const n = parse("|a+b|") as any; expect(n.expr.type).toBe("BinaryExpression"); });
});

describe("Rollout expressions", () => {
    it("+{k=0, n, A[k]}", () => { const n = parse("+{k=0, n, A[k]}") as any; expect(n.type).toBe("ControlExpression"); expect(n.name).toBe("+"); expect(n.args).toHaveLength(3); expect(n.args[0].operator).toBe("="); });
    it("*{k=0, n, A[k]}", () => { const n = parse("*{k=0, n, A[k]}") as any; expect(n.name).toBe("*"); });
});

describe("Ellipsis", () => {
    it("...", () => { expect((parse("...") as any).type).toBe("Ellipsis"); });
});

describe("Parse errors", () => {
    it("empty input", () => { expect(() => parse("")).toThrow(); });
    it("unmatched paren", () => { expect(() => parse("(a+b")).toThrow(); });
    it("trailing garbage", () => { expect(() => parse("a + @")).toThrow(); });
    it("error has position", () => { try { parse("a + @"); } catch (e) { expect((e as Error).message).toMatch(/-->/); } });
});
