import { PEGParser } from "./PEGParser.ts";
import type { Grammar, ASTNode, NumberLiteralNode, IdentifierNode } from "./types.ts";

const grammar: Grammar = {
    Expression: {
        peg: { type: "rule", name: "Additive" },
    },

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

    /* Multiplicative — supports a*b, a/b, 2x, 2(x+1), sin(x)y */
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
                            // explicit * or /
                            {
                                type: "sequence",
                                parts: [
                                    {
                                        type: "choice",
                                        options: [
                                            { type: "literal", value: "*" },
                                            { type: "literal", value: "/" },
                                        ],
                                    },
                                    { type: "rule", name: "Power" },
                                ],
                            },
                            // implicit multiplication — uses ImplicitPower to avoid
                            // stealing a leading +/- that belongs to Additive
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

    /* ImplicitPower — like Power but starts from Postfix (no unary sign),
       so implicit multiplication cannot steal a leading +/- from Additive. */
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
            return { type: "BinaryExpression", operator: "^", left, right: node };
        },
    },

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
            return { type: "BinaryExpression", operator: "^", left, right: node };
        },
    },

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

    /* Postfix — supports f(x), g(x)(y) */
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

    Primary: {
        peg: {
            type: "choice",
            options: [
                { type: "rule", name: "Number" },
                { type: "rule", name: "Identifier" },
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

    Identifier: {
        peg: {
            type: "choice",
            options: [
                { type: "rule", name: "RightSkewGreekIdentifier" },
                { type: "rule", name: "GreekIdentifier" },
                { type: "rule", name: "RightSkewIdentifier" },
                { type: "rule", name: "LeftSkewIdentifier" },
                { type: "rule", name: "PlainIdentifier" },
            ],
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

    // upright Greek: \a = alpha, \b = beta, etc.
    GreekIdentifier: {
        peg: { type: "regex", regex: /^\\[a-zA-Z][a-zA-Z0-9]*/, name: "greek identifier" },
        build(value: string): IdentifierNode {
            return { type: "Identifier", name: value.slice(1), prefix: "greek" };
        },
    },

    // right-skew Greek: \1a
    RightSkewGreekIdentifier: {
        peg: { type: "regex", regex: /^\\[0-9]+[a-zA-Z][a-zA-Z0-9]*/, name: "right-skew greek identifier" },
        build(value: string): IdentifierNode {
            return { type: "Identifier", name: value.replace(/^\\[0-9]+/, ""), prefix: "greek-right" };
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
