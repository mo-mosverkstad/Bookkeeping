import { el } from "./el.ts";
import type {
    ASTNode,
    BinaryExpressionNode,
    CallExpressionNode,
    ControlExpressionNode,
    IdentifierNode,
    SubscriptExpressionNode,
} from "../parser/types.ts";

const OPERATOR_PRECEDENCE: Record<string, number> = {
    "+": 0,
    "-": 0,
    "*": 1,
    "/": 1,
    "^": 2,
};

function getOperatorPrecedence(operator: string): number {
    return OPERATOR_PRECEDENCE[operator] ?? -1;
}

const GREEK: Record<string, string> = {
    a: "α", b: "β", g: "γ", d: "δ", e: "ε", z: "ζ", h: "η", q: "θ",
    i: "ι", k: "κ", l: "λ", m: "μ", n: "ν", x: "ξ", o: "ο", p: "π",
    r: "ρ", s: "σ", t: "τ", u: "υ", f: "φ", c: "χ", y: "ψ", w: "ω",
    A: "Α", B: "Β", G: "Γ", D: "Δ", E: "Ε", Z: "Ζ", H: "Η", Q: "Θ",
    I: "Ι", K: "Κ", L: "Λ", M: "Μ", N: "Ν", X: "Ξ", O: "Ο", P: "Π",
    R: "Ρ", S: "Σ", T: "Τ", U: "Υ", F: "Φ", C: "Χ", Y: "Ψ", W: "Ω",
};

export function render(node: ASTNode): HTMLElement {
    switch (node.type) {
        case "NumberLiteral":
            return el("span", "", [String(node.value)]);

        case "Identifier": {
            return renderIdentifier(node);
        }

        case "BinaryExpression":
            return renderBinary(node);

        case "UnaryExpression":
            return el("span", "", [node.operator, render(node.operand)]);

        case "CallExpression":
            return renderCall(node);

        case "ControlExpression":
            return renderControl(node);

        case "SubscriptExpression":
            return renderSubscript(node);

        default:
            throw new Error("Unknown node");
    }
}

function renderIdentifier(node: IdentifierNode): HTMLElement {
    const { name, prefix } = node;
    switch (prefix) {
        case "plain":
            return el("span", "ident-plain", [name]);
        case "left-skew":
            return el("span", "ident-left-skew", [name]);
        case "right-skew":
            return el("span", "ident-right-skew", [name]);
        case "greek": {
            const glyph = GREEK[name] ?? name;
            return el("span", "ident-greek", [glyph]);
        }
        case "greek-right": {
            const glyph = GREEK[name] ?? name;
            return el("span", "ident-greek-right", [glyph]);
        }
        default:
            return el("span", "", [name]);
    }
}

function renderBinary(node: BinaryExpressionNode): HTMLElement {
    const { operator, left, right } = node;

    let leftParen = false;
    let rightParen = false;

    if (left.type === "BinaryExpression" || left.type === "UnaryExpression") {
        leftParen = operator === "^"
            ? getOperatorPrecedence(operator) >= getOperatorPrecedence(left.operator)
            : getOperatorPrecedence(operator) > getOperatorPrecedence(left.operator);
    }
    if (right.type === "BinaryExpression" || right.type === "UnaryExpression") {
        rightParen = operator === "-" || operator === "/"
            ? getOperatorPrecedence(operator) >= getOperatorPrecedence(right.operator)
            : getOperatorPrecedence(operator) > getOperatorPrecedence(right.operator);
    }

    const lo = leftParen ? "(" : "";
    const lc = leftParen ? ")" : "";
    const ro = rightParen ? "(" : "";
    const rc = rightParen ? ")" : "";

    if (operator === "/") {
        return el("span", "fraction", [
            el("span", "top", [lo, render(left), lc]),
            el("span", "bottom", [ro, render(right), rc]),
        ]);
    }
    if (operator === "^") {
        return el("span", "", [lo, render(left), lc, el("sup", "", [ro, render(right), rc])]);
    }
    if (operator === "*") {
        return el("span", "", [lo, render(left), lc, ro, render(right), rc]);
    }
    return el("span", "", [lo, render(left), lc, ` ${operator} `, ro, render(right), rc]);
}

function renderSubscript(node: SubscriptExpressionNode): HTMLElement {
    return el("span", "", [render(node.base), el("sub", "", [render(node.subscript)])]);
}

function renderCall(node: CallExpressionNode): HTMLElement {
    return el("span", "", [
        render(node.callee),
        "(",
        ...interleave(node.args.map(render), ", "),
        ")",
    ]);
}

function renderControl(node: ControlExpressionNode): HTMLElement {
    const name = node.name.replace(/^\\/, "");
    switch (name) {
        case "sqrt":
            return el("span", "sqrt", [render(node.args[0])]);
        case "int":
            return renderIntegral(node);
        default:
            return el("span", "", [name, "(", ...interleave(node.args.map(render), ", "), ")"]);
    }
}

function renderIntegral(node: ControlExpressionNode): HTMLElement {
    const [from, to, body] = node.args;
    return el("span", "integral", [
        el("span", "opstack", [
            el("span", "top", [render(to)]),
            el("span", "op large-operator", ["\u222b"]),
            el("span", "bottom", [render(from)]),
        ]),
        el("span", "integral-body", [render(body)]),
    ]);
}

export function renderMath(ast: ASTNode): HTMLElement {
    return el("span", "native-math", [render(ast)]);
}

function interleave(arr: HTMLElement[], sep: string): (Node | string)[] {
    const result: (Node | string)[] = [];
    arr.forEach((item, i) => {
        if (i > 0) result.push(sep);
        result.push(item);
    });
    return result;
}
