import { el } from "./el.ts";
import type {
    ASTNode,
    BinaryExpressionNode,
    CallExpressionNode,
    ControlExpressionNode,
    IdentifierNode,
    SubscriptExpressionNode,
    SubSuperscriptExpressionNode,
    VectorNameNode,
    MatrixNode,
    IndexExpressionNode,
    AbsoluteValueNode,
    FactorialExpressionNode,
    DerivativeNode,
    PiecewiseNode,
} from "../parser/types.ts";

// ── Operator precedence for parenthesisation ─────────────────────────────────

const OPERATOR_PRECEDENCE: Record<string, number> = {
    "=": -2, "!=": -2, "<=": -2, ">=": -2, "~=": -2, ":=": -2,
    "~": -2, "<<": -2, ">>": -2, "->": -2,
    "sub": -2, "supset": -2, "sube": -2, "supe": -2,
    "in": -2, "notin": -2, "divides": -2, "ndivides": -2,
    "cong": -2, "parallel": -2, "perp": -2, "sim": -2,
    "+": 0, "-": 0,
    "*": 1, "/": 1, ".": 1, "mod": 1, "div": 1,
    "^": 2,
};

function getOperatorPrecedence(operator: string): number {
    return OPERATOR_PRECEDENCE[operator] ?? -1;
}

// ── Glyph lookup table ───────────────────────────────────────────────────────

const GLYPH_TABLE: Record<string, string> = {
    // Greek single-letter
    a: "α", b: "β", g: "γ", d: "δ", e: "ε", z: "ζ", h: "η", q: "θ",
    i: "ι", k: "κ", l: "λ", m: "μ", n: "ν", x: "ξ", o: "ο", p: "π",
    r: "ρ", s: "σ", t: "τ", u: "υ", f: "φ", c: "χ", y: "ψ", w: "ω",
    A: "Α", B: "Β", G: "Γ", D: "Δ", E: "Ε", Z: "Ζ", H: "Η", Q: "Θ",
    I: "Ι", K: "Κ", L: "Λ", M: "Μ", N: "Ν", X: "Ξ", O: "Ο", P: "Π",
    R: "Ρ", S: "Σ", T: "Τ", U: "Υ", F: "Φ", C: "Χ", Y: "Ψ", W: "Ω",

    // Hebrew
    ha: "ℵ", hb: "ℶ", hg: "ℷ", hd: "ℸ",

    // Operators and symbols
    pm: "±", mp: "∓", inf: "∞",
    nabla: "∇", partial: "∂",
    union: "∪", inter: "∩", diff: "∖",
    cross: "×", comp: "∁", empty: "∅", pow: "𝒫",
    sub: "⊂", supset: "⊃", sube: "⊆", supe: "⊇",
    psub: "⊊", psupset: "⊋", symdiff: "△",
    and: "∧", or: "∨", not: "¬",
    imp: "⟹", iff: "⟺",
    all: "∀", ex: "∃", nex: "∄",
    circ: "∘", oplus: "⊕", otimes: "⊗",
    had: "⊙", kron: "⊗",
    mapsto: "↦",
    parallel: "∥", perp: "⊥", sim: "∼",
    angle: "∠", tri: "△",
    divides: "∣", ndivides: "∤", cong: "≅",
    given: "∣",
    mod: "mod", div: "÷",
    infimum: "inf", supremum: "sup",
    limsup: "lim sup", liminf: "lim inf",
    oint: "∮", iint: "∬", iiint: "∭",
    in: "∈", notin: "∉",
    Id: "𝐈", "0": "𝟎",
};

const BLACKBOARD_TABLE: Record<string, string> = {
    N: "ℕ", Z: "ℤ", Q: "ℚ", R: "ℝ", C: "ℂ",
    H: "ℍ", P: "ℙ", U: "𝕌", d: "∂",
};

const RELATIONAL_SYMBOL: Record<string, string> = {
    "=": "=", "!=": "≠", "<=": "≤", ">=": "≥",
    "~=": "≈", ":=": "≡", "~": "∝",
    "<<": "≪", ">>": "≫", "->": "→",
    "<": "<", ">": ">",
    sub: "⊂", supset: "⊃", sube: "⊆", supe: "⊇",
    in: "∈", notin: "∉",
    divides: "∣", ndivides: "∤", cong: "≅",
    parallel: "∥", perp: "⊥", sim: "∼",
};

function resolveGlyph(name: string): string {
    return GLYPH_TABLE[name] ?? name;
}

// ── Main render dispatch ─────────────────────────────────────────────────────

export function render(node: ASTNode): HTMLElement {
    switch (node.type) {
        case "NumberLiteral":
            return el("span", "", [String(node.value)]);
        case "Identifier":
            return renderIdentifier(node);
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
        case "SubSuperscriptExpression":
            return renderSubSuperscript(node);
        case "VectorName":
            return renderVectorName(node);
        case "Matrix":
            return renderMatrix(node);
        case "IndexExpression":
            return renderIndex(node);
        case "AbsoluteValue":
            return renderAbsoluteValue(node);
        case "FactorialExpression":
            return renderFactorial(node);
        case "Derivative":
            return renderDerivative(node);
        case "Ellipsis":
            return el("span", "", ["…"]);
        case "Piecewise":
            return renderPiecewise(node);
        default:
            throw new Error("Unknown node");
    }
}

// ── Identifier ───────────────────────────────────────────────────────────────

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
            const glyph = resolveGlyph(name);
            return el("span", "ident-greek", [glyph]);
        }
        case "greek-right": {
            const glyph = resolveGlyph(name);
            return el("span", "ident-greek-right", [glyph]);
        }
        case "blackboard": {
            const glyph = BLACKBOARD_TABLE[name] ?? name;
            return el("span", "ident-blackboard", [glyph]);
        }
        default:
            return el("span", "", [name]);
    }
}

// ── Binary expression ────────────────────────────────────────────────────────

// ── Multiplication sign visibility ───────────────────────────────────────────

/**
 * Determines whether an explicit × sign is needed between two operands.
 *
 * The rule: show × only when the left operand ENDS with a digit and the right
 * operand STARTS with a digit. This is the only case where juxtaposition is
 * ambiguous (e.g., "23" looks like twenty-three, not 2×3).
 *
 * In all other cases, juxtaposition is visually unambiguous:
 *   2x      — number then letter, clearly multiplication
 *   x2      — letter then number, clearly multiplication
 *   (a+b)3  — paren then number, clearly multiplication
 *   2(a+b)  — number then paren, clearly multiplication
 *   xy      — two letters, clearly multiplication
 */
function needsExplicitMultiplySign(
    left: ASTNode,
    right: ASTNode,
    leftParen: boolean,
    rightParen: boolean,
): boolean {
    return endsWithDigit(left, leftParen) && startsWithDigit(right, rightParen);
}

/** Does this node's rendered form start with a digit? */
function startsWithDigit(node: ASTNode, parenthesised: boolean): boolean {
    if (parenthesised) return false; // starts with "("
    switch (node.type) {
        case "NumberLiteral": return true;
        case "Identifier": return false;
        case "UnaryExpression": return false; // starts with - or +
        case "BinaryExpression": {
            // Would the left child be parenthesised by this binary node?
            const childParen = wouldParenLeft(node);
            return startsWithDigit(node.left, childParen);
        }
        case "CallExpression": return startsWithDigit(node.callee, false);
        case "SubscriptExpression": return startsWithDigit(node.base, false);
        case "SubSuperscriptExpression": return startsWithDigit(node.base, false);
        case "FactorialExpression": return startsWithDigit(node.base, false);
        case "Derivative": return startsWithDigit(node.base, false);
        case "IndexExpression": return startsWithDigit(node.base, false);
        default: return false; // AbsoluteValue starts with |, Matrix with [, etc.
    }
}

/** Does this node's rendered form end with a digit? */
function endsWithDigit(node: ASTNode, parenthesised: boolean): boolean {
    if (parenthesised) return false; // ends with ")"
    switch (node.type) {
        case "NumberLiteral": return true;
        case "Identifier": return false;
        case "UnaryExpression": return endsWithDigit(node.operand, false);
        case "BinaryExpression": {
            if (node.operator === "^") return false; // ends with </sup>
            if (node.operator === "/") return false; // ends with fraction bottom
            // Would the right child be parenthesised by this binary node?
            const childParen = wouldParenRight(node);
            return endsWithDigit(node.right, childParen);
        }
        case "CallExpression": return false; // ends with ")"
        case "ControlExpression": return false;
        case "SubscriptExpression": return false; // ends with </sub>
        case "SubSuperscriptExpression": return false; // ends with scripts
        case "FactorialExpression": return false; // ends with "!"
        case "Derivative": return false; // ends with prime ′
        case "IndexExpression": return false; // ends with subscript
        case "AbsoluteValue": return false; // ends with |
        default: return false;
    }
}

/** Would renderBinary parenthesise the left child of this node? */
function wouldParenLeft(node: BinaryExpressionNode): boolean {
    const { operator, left } = node;
    if (left.type === "BinaryExpression" || left.type === "UnaryExpression") {
        return operator === "^"
            ? getOperatorPrecedence(operator) >= getOperatorPrecedence(left.operator)
            : getOperatorPrecedence(operator) > getOperatorPrecedence(left.operator);
    }
    return false;
}

/** Would renderBinary parenthesise the right child of this node? */
function wouldParenRight(node: BinaryExpressionNode): boolean {
    const { operator, right } = node;
    if (right.type === "BinaryExpression" || right.type === "UnaryExpression") {
        return operator === "-" || operator === "/"
            ? getOperatorPrecedence(operator) >= getOperatorPrecedence(right.operator)
            : getOperatorPrecedence(operator) > getOperatorPrecedence(right.operator);
    }
    return false;
}

// ── Binary expression ────────────────────────────────────────────────────────

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
        const showSign = needsExplicitMultiplySign(left, right, leftParen, rightParen);
        if (showSign) {
            return el("span", "", [lo, render(left), lc, " × ", ro, render(right), rc]);
        }
        return el("span", "", [lo, render(left), lc, ro, render(right), rc]);
    }
    if (operator === ".") {
        return el("span", "", [lo, render(left), lc, " · ", ro, render(right), rc]);
    }
    if (operator === "mod") {
        return el("span", "", [lo, render(left), lc, " mod ", ro, render(right), rc]);
    }
    if (operator === "div") {
        return el("span", "", [lo, render(left), lc, " ÷ ", ro, render(right), rc]);
    }
    // Relational operators
    const relSymbol = RELATIONAL_SYMBOL[operator];
    if (relSymbol) {
        return el("span", "", [lo, render(left), lc, ` ${relSymbol} `, ro, render(right), rc]);
    }
    return el("span", "", [lo, render(left), lc, ` ${operator} `, ro, render(right), rc]);
}

// ── Subscript ────────────────────────────────────────────────────────────────

function renderSubscript(node: SubscriptExpressionNode): HTMLElement {
    return el("span", "", [render(node.base), el("sub", "", [render(node.subscript)])]);
}

// ── SubSuperscript ───────────────────────────────────────────────────────────

function renderSubSuperscript(node: SubSuperscriptExpressionNode): HTMLElement {
    return el("span", "subsuperscript", [
        render(node.base),
        el("span", "scripts", [
            el("sup", "", [render(node.superscript)]),
            el("sub", "", [render(node.subscript)]),
        ]),
    ]);
}

// ── Call ──────────────────────────────────────────────────────────────────────

function renderCall(node: CallExpressionNode): HTMLElement {
    return el("span", "", [
        render(node.callee),
        "(",
        ...interleave(node.args.map(render), ", "),
        ")",
    ]);
}

// ── Control expressions ──────────────────────────────────────────────────────

function renderControl(node: ControlExpressionNode): HTMLElement {
    const name = node.name;
    switch (name) {
        case "sqrt":
            return el("span", "sqrt", [render(node.args[0])]);
        case "int":
            return renderIntegral(node, "∫");
        case "oint":
            return renderIntegral(node, "∮");
        case "iint":
            return renderIntegral(node, "∬");
        case "iiint":
            return renderIntegral(node, "∭");
        case "S":
            return renderBigOperator(node, "Σ");
        case "P":
            return renderBigOperator(node, "Π");
        case "lim":
            return renderLim(node);
        case "floor":
            return el("span", "", ["⌊", render(node.args[0]), "⌋"]);
        case "ceil":
            return el("span", "", ["⌈", render(node.args[0]), "⌉"]);
        case "bar":
            return el("span", "overline", [render(node.args[0])]);
        case "hat":
            return el("span", "hat", [render(node.args[0])]);
        case "tilde":
            return el("span", "tilde", [render(node.args[0])]);
        case "ul":
            return el("span", "underline", [render(node.args[0])]);
        case "cancel":
            return el("span", "cancel", [render(node.args[0])]);
        case "inner":
            return el("span", "", ["⟨", ...interleave(node.args.map(render), ", "), "⟩"]);
        case "binom":
            return renderBinom(node);
        case "eval":
            return renderEval(node);
        case "ubrace":
            return renderUnderbrace(node);
        case "obrace":
            return renderOverbrace(node);
        case "piecewise":
            return renderPiecewiseControl(node);
        case "+":
        case "*":
            return renderRollout(node);
        case "arc":
            return el("span", "arc", [render(node.args[0])]);
        default:
            return el("span", "", [resolveGlyph(name), "(", ...interleave(node.args.map(render), ", "), ")"]);
    }
}

function renderIntegral(node: ControlExpressionNode, symbol: string): HTMLElement {
    const [from, to, body] = node.args;
    return el("span", "integral", [
        el("span", "opstack", [
            el("span", "top", [render(to)]),
            el("span", "op large-operator", [symbol]),
            el("span", "bottom", [render(from)]),
        ]),
        el("span", "integral-body", [render(body)]),
    ]);
}

function renderBigOperator(node: ControlExpressionNode, symbol: string): HTMLElement {
    const [from, to, body] = node.args;
    return el("span", "integral", [
        el("span", "opstack", [
            el("span", "top", [render(to)]),
            el("span", "op large-operator", [symbol]),
            el("span", "bottom", [render(from)]),
        ]),
        el("span", "integral-body", [render(body)]),
    ]);
}

function renderLim(node: ControlExpressionNode): HTMLElement {
    const [approach, body] = node.args;
    return el("span", "integral", [
        el("span", "opstack", [
            el("span", "top", [""]),
            el("span", "op", ["lim"]),
            el("span", "bottom", [render(approach)]),
        ]),
        el("span", "integral-body", [render(body)]),
    ]);
}

function renderBinom(node: ControlExpressionNode): HTMLElement {
    const [n, r] = node.args;
    return el("span", "", [
        "(",
        el("span", "fraction", [
            el("span", "top", [render(n)]),
            el("span", "bottom", [render(r)]),
        ]),
        ")",
    ]);
}

function renderEval(node: ControlExpressionNode): HTMLElement {
    const [expr, bound] = node.args;
    return el("span", "", [
        render(expr),
        el("span", "eval-bar", ["|"]),
        el("sub", "", [render(bound)]),
    ]);
}

function renderUnderbrace(node: ControlExpressionNode): HTMLElement {
    const [expr, label] = node.args;
    return el("span", "underbrace", [
        el("span", "ubrace-content", [render(expr)]),
        el("span", "ubrace-label", [render(label)]),
    ]);
}

function renderOverbrace(node: ControlExpressionNode): HTMLElement {
    const [expr, label] = node.args;
    return el("span", "overbrace", [
        el("span", "obrace-label", [render(label)]),
        el("span", "obrace-content", [render(expr)]),
    ]);
}

function renderRollout(node: ControlExpressionNode): HTMLElement {
    const symbol = node.name === "+" ? "Σ" : "Π";
    const [from, to, body] = node.args;
    return el("span", "integral", [
        el("span", "opstack", [
            el("span", "top", [render(to)]),
            el("span", "op large-operator", [symbol]),
            el("span", "bottom", [render(from)]),
        ]),
        el("span", "integral-body", [render(body)]),
    ]);
}

function renderPiecewiseControl(node: ControlExpressionNode): HTMLElement {
    // \piecewise{expr, cond; expr, cond; ...}
    // args come as pairs: [expr1, cond1, expr2, cond2, ...]
    // Actually with the PiecewiseArgList, the ControlSuffix uses regular ArgumentList
    // We need to handle this as semicolon-separated pairs
    // For now, treat args as flat list of pairs
    const cases: { expr: ASTNode; condition: ASTNode }[] = [];
    for (let i = 0; i + 1 < node.args.length; i += 2) {
        cases.push({ expr: node.args[i], condition: node.args[i + 1] });
    }
    return renderPiecewise({ type: "Piecewise", cases });
}

// ── Vector name ──────────────────────────────────────────────────────────────

function renderVectorName(node: VectorNameNode): HTMLElement {
    return el("span", "vector-name", [
        render(node.identifier),
        el("span", "vector-arrow", ["⃗"]),
    ]);
}

// ── Matrix ───────────────────────────────────────────────────────────────────

function renderMatrix(node: MatrixNode): HTMLElement {
    const rowElements = node.rows.map(row =>
        el("span", "matrix-row", row.map(cell => el("span", "matrix-cell", [render(cell)])))
    );
    return el("span", "matrix", rowElements);
}

// ── Index expression ─────────────────────────────────────────────────────────

function renderIndex(node: IndexExpressionNode): HTMLElement {
    return el("span", "", [render(node.base), el("sub", "", [render(node.index)])]);
}

// ── Absolute value / norm ────────────────────────────────────────────────────

function renderAbsoluteValue(node: AbsoluteValueNode): HTMLElement {
    const inner = node.expr;
    if (inner.type === "VectorName" || inner.type === "Matrix") {
        return el("span", "", ["‖", render(inner), "‖"]);
    }
    return el("span", "", ["|", render(inner), "|"]);
}

// ── Factorial ────────────────────────────────────────────────────────────────

function renderFactorial(node: FactorialExpressionNode): HTMLElement {
    return el("span", "", [render(node.base), "!"]);
}

// ── Derivative ───────────────────────────────────────────────────────────────

function renderDerivative(node: DerivativeNode): HTMLElement {
    const primes = "′".repeat(node.order);
    return el("span", "", [render(node.base), primes]);
}

// ── Piecewise ────────────────────────────────────────────────────────────────

function renderPiecewise(node: PiecewiseNode): HTMLElement {
    const rows = node.cases.map(c =>
        el("span", "piecewise-row", [
            el("span", "piecewise-expr", [render(c.expr)]),
            el("span", "piecewise-cond", [render(c.condition)]),
        ])
    );
    return el("span", "piecewise", rows);
}

// ── Public entry point ───────────────────────────────────────────────────────

export function renderMath(ast: ASTNode): HTMLElement {
    return el("span", "native-math", [render(ast)]);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function interleave(arr: HTMLElement[], sep: string): (Node | string)[] {
    const result: (Node | string)[] = [];
    arr.forEach((item, i) => {
        if (i > 0) result.push(sep);
        result.push(item);
    });
    return result;
}
