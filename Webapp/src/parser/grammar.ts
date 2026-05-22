import { PEGParser } from "./PEGParser.ts";
import type { Grammar, ASTNode, NumberLiteralNode, IdentifierNode } from "./types.ts";

const grammar: Grammar = {
    Expression: {
        peg: { type: "rule", name: "Relational" },
    },

    // ── Relational — not chained (at most one relational operator) ───────────
    Relational: {
        peg: {
            type: "sequence",
            parts: [
                { type: "rule", name: "Additive" },
                {
                    type: "choice",
                    options: [
                        {
                            type: "sequence",
                            parts: [
                                { type: "rule", name: "RelationalOp" },
                                { type: "rule", name: "Additive" },
                            ],
                        },
                        { type: "sequence", parts: [] },
                    ],
                },
            ],
        },
        build([left, rest]: [ASTNode, any]): ASTNode {
            if (Array.isArray(rest) && rest.length === 0) return left;
            const [operator, right] = rest;
            return { type: "BinaryExpression", operator, left, right };
        },
    },

    RelationalOp: {
        peg: {
            type: "choice",
            options: [
                { type: "literal", value: "!=" },
                { type: "literal", value: "<=" },
                { type: "literal", value: ">=" },
                { type: "literal", value: "~=" },
                { type: "literal", value: ":=" },
                { type: "literal", value: "<<" },
                { type: "literal", value: ">>" },
                { type: "literal", value: "->" },
                { type: "literal", value: "<" },
                { type: "literal", value: ">" },
                { type: "literal", value: "=" },
                { type: "literal", value: "~" },
            ],
        },
    },

    // ── Additive ─────────────────────────────────────────────────────────────
    Additive: {
        peg: {
            type: "sequence",
            parts: [
                { type: "rule", name: "Multiplicative" },
                {
                    type: "repeat",
                    expr: {
                        type: "sequence",
                        parts: [
                            {
                                type: "choice",
                                options: [
                                    { type: "literal", value: "+" },
                                    { type: "literal", value: "-" },
                                ],
                            },
                            { type: "rule", name: "Multiplicative" },
                        ],
                    },
                },
            ],
        },

        build([left, rest]: [ASTNode, [string, ASTNode][]]): ASTNode {
            let node = left;
            for (const [operator, right] of rest) {
                node = { type: "BinaryExpression", operator, left: node, right };
            }
            return node;
        },
    },

    // ── Multiplicative — supports a*b, a/b, a\mod b, a.b, 2x, 2(x+1) ───────
    Multiplicative: {
        peg: {
            type: "sequence",
            parts: [
                { type: "rule", name: "Power" },
                {
                    type: "repeat",
                    expr: {
                        type: "choice",
                        options: [
                            // explicit *, /, \mod, \div, .
                            {
                                type: "sequence",
                                parts: [
                                    { type: "rule", name: "MultiplicativeOp" },
                                    { type: "rule", name: "Power" },
                                ],
                            },
                            // implicit multiplication
                            { type: "rule", name: "ImplicitPower" },
                        ],
                    },
                },
            ],
        },

        build([left, rest]: [ASTNode, any[]]): ASTNode {
            let node = left;
            for (const item of rest) {
                if (Array.isArray(item) && item.length === 2) {
                    const [operator, right] = item;
                    node = { type: "BinaryExpression", operator, left: node, right };
                } else {
                    node = { type: "BinaryExpression", operator: "*", left: node, right: item as ASTNode };
                }
            }
            return node;
        },
    },

    MultiplicativeOp: {
        peg: {
            type: "choice",
            options: [
                { type: "literal", value: "*" },
                { type: "literal", value: "/" },
                { type: "literal", value: "." },
                { type: "regex", regex: /^\\(mod|div)\b/, name: "multiplicative operator" },
            ],
        },
        build(node: any): string {
            if (typeof node === "string" && node.startsWith("\\")) {
                return node.slice(1);
            }
            return node;
        },
    },

    // ── ImplicitPower — like Power but starts from Postfix (no unary sign) ───
    ImplicitPower: {
        peg: {
            type: "sequence",
            parts: [
                { type: "rule", name: "Postfix" },
                {
                    type: "repeat",
                    expr: {
                        type: "sequence",
                        parts: [
                            { type: "literal", value: "^" },
                            { type: "rule", name: "Unary" },
                        ],
                    },
                },
            ],
        },

        build([left, rest]: [ASTNode, [string, ASTNode][]]): ASTNode {
            if (rest.length === 0) return left;
            let node = rest[rest.length - 1][1];
            for (let i = rest.length - 2; i >= 0; i--) {
                node = { type: "BinaryExpression", operator: "^", left: rest[i][1], right: node };
            }
            // SubSuperscript: if left is SubscriptExpression, combine
            if (left.type === "SubscriptExpression") {
                return {
                    type: "SubSuperscriptExpression",
                    base: left.base,
                    subscript: left.subscript,
                    superscript: node,
                };
            }
            return { type: "BinaryExpression", operator: "^", left, right: node };
        },
    },

    // ── Power ────────────────────────────────────────────────────────────────
    Power: {
        peg: {
            type: "sequence",
            parts: [
                { type: "rule", name: "Unary" },
                {
                    type: "repeat",
                    expr: {
                        type: "sequence",
                        parts: [
                            { type: "literal", value: "^" },
                            { type: "rule", name: "Unary" },
                        ],
                    },
                },
            ],
        },

        build([left, rest]: [ASTNode, [string, ASTNode][]]): ASTNode {
            if (rest.length === 0) return left;
            let node = rest[rest.length - 1][1];
            for (let i = rest.length - 2; i >= 0; i--) {
                node = { type: "BinaryExpression", operator: "^", left: rest[i][1], right: node };
            }
            if (left.type === "SubscriptExpression") {
                return {
                    type: "SubSuperscriptExpression",
                    base: left.base,
                    subscript: left.subscript,
                    superscript: node,
                };
            }
            return { type: "BinaryExpression", operator: "^", left, right: node };
        },
    },

    // ── Unary ────────────────────────────────────────────────────────────────
    Unary: {
        peg: {
            type: "choice",
            options: [
                {
                    type: "sequence",
                    parts: [
                        {
                            type: "choice",
                            options: [
                                { type: "literal", value: "-" },
                                { type: "literal", value: "+" },
                            ],
                        },
                        { type: "rule", name: "Unary" },
                    ],
                },
                { type: "rule", name: "Postfix" },
            ],
        },

        build(node: any): ASTNode {
            if (!Array.isArray(node)) return node;
            const [operator, operand] = node;
            return { type: "UnaryExpression", operator, operand };
        },
    },

    // ── Postfix — f(x), x{...}, x_i, x!, x', A[k] ──────────────────────────
    Postfix: {
        peg: {
            type: "sequence",
            parts: [
                { type: "rule", name: "Primary" },
                {
                    type: "repeat",
                    expr: {
                        type: "choice",
                        options: [
                            { type: "rule", name: "CallSuffix" },
                            { type: "rule", name: "ControlSuffix" },
                            { type: "rule", name: "SubscriptSuffix" },
                            { type: "rule", name: "FactorialSuffix" },
                            { type: "rule", name: "DerivativeSuffix" },
                            { type: "rule", name: "IndexSuffix" },
                        ],
                    },
                },
            ],
        },

        build([base, suffixes]: [ASTNode, any[]]): ASTNode {
            let node = base;
            for (const suffix of suffixes) {
                if (suffix.type === "call") {
                    node = { type: "CallExpression", callee: node, args: suffix.args };
                } else if (suffix.type === "control") {
                    if (node.type !== "Identifier") throw new Error("Control block requires identifier");
                    node = { type: "ControlExpression", name: node.name, args: suffix.args };
                } else if (suffix.type === "subscript") {
                    node = { type: "SubscriptExpression", base: node, subscript: suffix.subscript };
                } else if (suffix.type === "factorial") {
                    node = { type: "FactorialExpression", base: node };
                } else if (suffix.type === "derivative") {
                    node = { type: "Derivative", base: node, order: suffix.order };
                } else if (suffix.type === "index") {
                    node = { type: "IndexExpression", base: node, index: suffix.index };
                }
            }
            return node;
        },
    },

    CallSuffix: {
        peg: {
            type: "sequence",
            parts: [
                { type: "literal", value: "(" },
                { type: "rule", name: "ArgumentList" },
                { type: "literal", value: ")" },
            ],
        },
        build([_open, args]: [string, ASTNode[], string]) {
            return { type: "call", args };
        },
    },

    ControlSuffix: {
        peg: {
            type: "sequence",
            parts: [
                { type: "literal", value: "{" },
                { type: "rule", name: "ArgumentList" },
                { type: "literal", value: "}" },
            ],
        },
        build([_open, args]: [string, ASTNode[], string]) {
            return { type: "control", args };
        },
    },

    SubscriptSuffix: {
        peg: {
            type: "sequence",
            parts: [
                { type: "literal", value: "_" },
                { type: "rule", name: "Primary" },
            ],
        },
        build([_underscore, subscript]: [string, ASTNode]) {
            return { type: "subscript", subscript };
        },
    },

    FactorialSuffix: {
        peg: { type: "regex", regex: /^!(?!=)/, name: "!" },
        build(): any {
            return { type: "factorial" };
        },
    },

    DerivativeSuffix: {
        peg: { type: "regex", regex: /^'+/, name: "'" },
        build(value: string): any {
            return { type: "derivative", order: value.length };
        },
    },

    IndexSuffix: {
        peg: {
            type: "sequence",
            parts: [
                { type: "literal", value: "[" },
                { type: "rule", name: "Expression" },
                { type: "literal", value: "]" },
            ],
        },
        build([_open, index, _close]: [string, ASTNode, string]) {
            return { type: "index", index };
        },
    },

    ArgumentList: {
        peg: {
            type: "choice",
            options: [
                {
                    type: "sequence",
                    parts: [
                        { type: "rule", name: "Expression" },
                        {
                            type: "repeat",
                            expr: {
                                type: "sequence",
                                parts: [
                                    { type: "literal", value: "," },
                                    { type: "rule", name: "Expression" },
                                ],
                            },
                        },
                    ],
                },
                { type: "sequence", parts: [] },
            ],
        },

        build(node: any): ASTNode[] {
            if (Array.isArray(node) && node.length === 0) return [];
            const [first, rest] = node;
            const args = [first];
            for (const [, expr] of rest) args.push(expr);
            return args;
        },
    },

    // ── Primary ──────────────────────────────────────────────────────────────
    Primary: {
        peg: {
            type: "choice",
            options: [
                { type: "rule", name: "RolloutExpression" },
                { type: "rule", name: "Ellipsis" },
                { type: "rule", name: "AbsoluteValue" },
                { type: "rule", name: "BracketExpression" },
                { type: "rule", name: "Number" },
                { type: "rule", name: "Identifier" },
                { type: "rule", name: "ParenExpression" },
            ],
        },
    },

    // ── Rollout: +{...} or *{...} (atomic, no whitespace between op and brace)
    RolloutExpression: {
        peg: {
            type: "sequence",
            parts: [
                { type: "regex", regex: /^[+*]\{/, name: "rollout operator" },
                { type: "rule", name: "ArgumentList" },
                { type: "literal", value: "}" },
            ],
        },
        build([opener, args, _close]: [string, ASTNode[], string]): ASTNode {
            const name = opener[0]; // "+" or "*"
            return { type: "ControlExpression", name, args };
        },
    },

    Ellipsis: {
        peg: { type: "literal", value: "..." },
        build(): ASTNode {
            return { type: "Ellipsis" };
        },
    },

    AbsoluteValue: {
        peg: {
            type: "sequence",
            parts: [
                { type: "literal", value: "|" },
                { type: "rule", name: "Expression" },
                { type: "literal", value: "|" },
            ],
        },
        build([_open, expr, _close]: [string, ASTNode, string]): ASTNode {
            return { type: "AbsoluteValue", expr };
        },
    },

    // ── Bracket expression: [a] vector name, [a,b] row vector, [[a],[b]] matrix
    BracketExpression: {
        peg: {
            type: "sequence",
            parts: [
                { type: "literal", value: "[" },
                { type: "rule", name: "BracketContent" },
                { type: "literal", value: "]" },
            ],
        },
        build([_open, content, _close]: [string, any, string]): ASTNode {
            return content;
        },
    },

    BracketContent: {
        peg: {
            type: "choice",
            options: [
                // matrix: [[row], [row], ...]
                { type: "rule", name: "MatrixRows" },
                // row vector or single identifier: a,b,c or just a
                { type: "rule", name: "BracketList" },
            ],
        },
    },

    MatrixRows: {
        peg: {
            type: "sequence",
            parts: [
                { type: "rule", name: "MatrixRow" },
                {
                    type: "repeat",
                    expr: {
                        type: "sequence",
                        parts: [
                            { type: "literal", value: "," },
                            { type: "rule", name: "MatrixRow" },
                        ],
                    },
                },
            ],
        },
        build([first, rest]: [ASTNode[], [string, ASTNode[]][]]): ASTNode {
            const rows = [first];
            for (const [, row] of rest) rows.push(row);
            return { type: "Matrix", rows };
        },
    },

    MatrixRow: {
        peg: {
            type: "sequence",
            parts: [
                { type: "literal", value: "[" },
                { type: "rule", name: "ArgumentList" },
                { type: "literal", value: "]" },
            ],
        },
        build([_open, args, _close]: [string, ASTNode[], string]): ASTNode[] {
            return args;
        },
    },

    BracketList: {
        peg: {
            type: "sequence",
            parts: [
                { type: "rule", name: "Expression" },
                {
                    type: "repeat",
                    expr: {
                        type: "sequence",
                        parts: [
                            { type: "literal", value: "," },
                            { type: "rule", name: "Expression" },
                        ],
                    },
                },
            ],
        },
        build([first, rest]: [ASTNode, [string, ASTNode][]]): ASTNode {
            if (rest.length === 0 && first.type === "Identifier") {
                // single identifier → vector name decorator
                return { type: "VectorName", identifier: first };
            }
            // row vector
            const elements = [first];
            for (const [, expr] of rest) elements.push(expr);
            return { type: "Matrix", rows: [elements] };
        },
    },

    // ── Paren expression: grouping (expr) or column vector (a, b, c) ─────────
    ParenExpression: {
        peg: {
            type: "sequence",
            parts: [
                { type: "literal", value: "(" },
                { type: "rule", name: "Expression" },
                {
                    type: "choice",
                    options: [
                        // column vector: (a, b, c)
                        {
                            type: "sequence",
                            parts: [
                                {
                                    type: "repeat",
                                    expr: {
                                        type: "sequence",
                                        parts: [
                                            { type: "literal", value: "," },
                                            { type: "rule", name: "Expression" },
                                        ],
                                    },
                                },
                                { type: "literal", value: ")" },
                            ],
                        },
                    ],
                },
            ],
        },
        build([_open, first, tail]: [string, ASTNode, any]): ASTNode {
            const [commaExprs, _close] = tail;
            if (commaExprs.length === 0) {
                // simple grouping: (expr)
                return first;
            }
            // column vector: (a, b, c) → Matrix with each element as a row
            const elements = [first];
            for (const [, expr] of commaExprs) elements.push(expr);
            return { type: "Matrix", rows: elements.map((e: ASTNode) => [e]) };
        },
    },

    Number: {
        peg: {
            type: "regex",
            regex: /^([0-9]+(\.[0-9]*)?|\.[0-9]+)/,
            name: "number",
        },
        build(value: string): NumberLiteralNode {
            return { type: "NumberLiteral", value: Number(value) };
        },
    },

    // ── Identifier ───────────────────────────────────────────────────────────
    Identifier: {
        peg: {
            type: "choice",
            options: [
                { type: "rule", name: "BlackboardBoldIdentifier" },
                { type: "rule", name: "RightSkewGreekIdentifier" },
                { type: "rule", name: "GreekIdentifier" },
                { type: "rule", name: "RightSkewIdentifier" },
                { type: "rule", name: "LeftSkewIdentifier" },
                { type: "rule", name: "PlainIdentifier" },
            ],
        },
    },

    // blackboard bold: \\N, \\Z, \\R, etc.
    BlackboardBoldIdentifier: {
        peg: { type: "regex", regex: /^\\\\[A-Za-z]/, name: "blackboard bold identifier" },
        build(value: string): IdentifierNode {
            return { type: "Identifier", name: value.slice(2), prefix: "blackboard" };
        },
    },

    // plain Latin: a
    PlainIdentifier: {
        peg: { type: "regex", regex: /^[a-zA-Z]/, name: "identifier" },
        build(value: string): IdentifierNode {
            return { type: "Identifier", name: value, prefix: "plain" };
        },
    },

    // left-skew Latin: `a
    LeftSkewIdentifier: {
        peg: { type: "regex", regex: /^`[a-zA-Z]/, name: "left-skew identifier" },
        build(value: string): IdentifierNode {
            return { type: "Identifier", name: value.slice(1), prefix: "left-skew" };
        },
    },

    // right-skew Latin: `1a
    RightSkewIdentifier: {
        peg: { type: "regex", regex: /^`[0-9]+[a-zA-Z]/, name: "right-skew identifier" },
        build(value: string): IdentifierNode {
            return { type: "Identifier", name: value.replace(/^`[0-9]+/, ""), prefix: "right-skew" };
        },
    },

    // backslash identifier: \alpha, \sin, \int, etc.
    GreekIdentifier: {
        peg: { type: "regex", regex: /^\\[a-zA-Z][a-zA-Z0-9]*/, name: "backslash identifier" },
        build(value: string): IdentifierNode {
            return { type: "Identifier", name: value.slice(1), prefix: "greek" };
        },
    },

    // right-skew backslash: \1a, \1alpha
    RightSkewGreekIdentifier: {
        peg: { type: "regex", regex: /^\\[0-9]+[a-zA-Z][a-zA-Z0-9]*/, name: "right-skew backslash identifier" },
        build(value: string): IdentifierNode {
            return { type: "Identifier", name: value.replace(/^\\[0-9]+/, ""), prefix: "greek-right" };
        },
    },

    ImplicitFactor: {
        peg: {
            type: "choice",
            options: [
                { type: "rule", name: "Postfix" },
                {
                    type: "sequence",
                    parts: [
                        { type: "literal", value: "(" },
                        { type: "rule", name: "Expression" },
                        { type: "literal", value: ")" },
                    ],
                },
            ],
        },
        build(node: any): ASTNode {
            return Array.isArray(node) ? node[1] : node;
        },
    },
};

export const parser = new PEGParser(grammar, { skip: /^[ \t\r\n]+/ });
