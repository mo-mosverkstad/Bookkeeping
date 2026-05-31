import { PEGParser } from "../../engine/PEGParser.ts";
import type { Grammar } from "../../engine/types.ts";
import type { MathNode, NumberLiteralNode, IdentifierNode } from "./types.ts";

const grammar: Grammar = {
    Expression: { peg: { type: "rule", name: "Logical" } },

    Logical: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Relational" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "rule", name: "LogicalOp" },
                { type: "rule", name: "Relational" },
            ] } },
        ] },
        build([left, rest]: [MathNode, [string, MathNode][]]): MathNode {
            let node = left;
            for (const [operator, right] of rest) node = { type: "BinaryExpression", operator, left: node, right };
            return node;
        },
    },

    LogicalOp: {
        peg: { type: "regex", regex: /^\\(and|or|implies|iff)\b/, name: "logical operator" },
        build(v: string): string { return v.slice(1); },
    },

    Relational: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "SetOp" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "rule", name: "RelationalOp" },
                { type: "rule", name: "SetOp" },
            ] } },
        ] },
        build([left, rest]: [MathNode, [string, MathNode][]]): MathNode {
            let node = left;
            for (const [operator, right] of rest) node = { type: "BinaryExpression", operator, left: node, right };
            return node;
        },
    },

    RelationalOp: { peg: { type: "choice", options: [
        { type: "literal", value: "!=" }, { type: "literal", value: "<=" },
        { type: "literal", value: ">=" }, { type: "literal", value: "~=" },
        { type: "literal", value: ":=" }, { type: "literal", value: "<<" },
        { type: "literal", value: ">>" }, { type: "literal", value: "->" },
        { type: "literal", value: "<" },  { type: "literal", value: ">" },
        { type: "literal", value: "=" },  { type: "literal", value: "~" },
        { type: "regex", regex: /^\\(in|notin|subset|supset)\b/, name: "set relation" },
    ] }, build(v: string): string { return typeof v === "string" && v.startsWith("\\") ? v.slice(1) : v; } },

    SetOp: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Additive" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "rule", name: "SetOperator" },
                { type: "rule", name: "Additive" },
            ] } },
        ] },
        build([left, rest]: [MathNode, [string, MathNode][]]): MathNode {
            let node = left;
            for (const [operator, right] of rest) node = { type: "BinaryExpression", operator, left: node, right };
            return node;
        },
    },

    SetOperator: {
        peg: { type: "regex", regex: /^\\(union|inter|setminus)\b/, name: "set operator" },
        build(v: string): string { return v.slice(1); },
    },

    Additive: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Multiplicative" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "choice", options: [{ type: "literal", value: "+" }, { type: "literal", value: "-" }] },
                { type: "rule", name: "Multiplicative" },
            ] } },
        ] },
        build([left, rest]: [MathNode, [string, MathNode][]]): MathNode {
            let node = left;
            for (const [operator, right] of rest) node = { type: "BinaryExpression", operator, left: node, right };
            return node;
        },
    },

    Multiplicative: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Power" },
            { type: "repeat", expr: { type: "choice", options: [
                { type: "sequence", parts: [{ type: "rule", name: "MultiplicativeOp" }, { type: "rule", name: "Power" }] },
                { type: "rule", name: "ImplicitPower" },
            ] } },
        ] },
        build([left, rest]: [MathNode, any[]]): MathNode {
            let node = left;
            for (const item of rest) {
                if (Array.isArray(item) && item.length === 2) {
                    const [operator, right] = item;
                    node = { type: "BinaryExpression", operator, left: node, right };
                } else {
                    node = { type: "BinaryExpression", operator: "*", left: node, right: item as MathNode };
                }
            }
            return node;
        },
    },

    MultiplicativeOp: {
        peg: { type: "choice", options: [
            { type: "literal", value: "*" }, { type: "literal", value: "/" },
            { type: "literal", value: "." },
            { type: "regex", regex: /^\\(mod|div|cross|oring|tensor)\b/, name: "multiplicative operator" },
        ] },
        build(node: any): string {
            return typeof node === "string" && node.startsWith("\\") ? node.slice(1) : node;
        },
    },

    ImplicitPower: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Postfix" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "literal", value: "^" }, { type: "rule", name: "Unary" },
            ] } },
        ] },
        build([left, rest]: [MathNode, [string, MathNode][]]): MathNode {
            if (rest.length === 0) return left;
            let node = rest[rest.length - 1][1];
            for (let i = rest.length - 2; i >= 0; i--) node = { type: "BinaryExpression", operator: "^", left: rest[i][1], right: node };
            if (left.type === "SubscriptExpression") return { type: "SubSuperscriptExpression", base: left.base, subscript: left.subscript, superscript: node };
            return { type: "BinaryExpression", operator: "^", left, right: node };
        },
    },

    Power: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Unary" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "literal", value: "^" }, { type: "rule", name: "Unary" },
            ] } },
        ] },
        build([left, rest]: [MathNode, [string, MathNode][]]): MathNode {
            if (rest.length === 0) return left;
            let node = rest[rest.length - 1][1];
            for (let i = rest.length - 2; i >= 0; i--) node = { type: "BinaryExpression", operator: "^", left: rest[i][1], right: node };
            if (left.type === "SubscriptExpression") return { type: "SubSuperscriptExpression", base: left.base, subscript: left.subscript, superscript: node };
            return { type: "BinaryExpression", operator: "^", left, right: node };
        },
    },

    Unary: {
        peg: { type: "choice", options: [
            { type: "sequence", parts: [
                { type: "choice", options: [
                    { type: "literal", value: "-" }, { type: "literal", value: "+" },
                    { type: "regex", regex: /^\\not\b/, name: "\\not" },
                ] },
                { type: "rule", name: "Unary" },
            ] },
            { type: "rule", name: "Postfix" },
        ] },
        build(node: any): MathNode {
            if (!Array.isArray(node)) return node;
            const op = typeof node[0] === "string" && node[0].startsWith("\\") ? node[0].slice(1) : node[0];
            return { type: "UnaryExpression", operator: op, operand: node[1] };
        },
    },

    Postfix: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Primary" },
            { type: "repeat", expr: { type: "choice", options: [
                { type: "rule", name: "CallSuffix" }, { type: "rule", name: "ControlSuffix" },
                { type: "rule", name: "SubscriptSuffix" }, { type: "rule", name: "FactorialSuffix" },
                { type: "rule", name: "DerivativeSuffix" }, { type: "rule", name: "IndexSuffix" },
            ] } },
        ] },
        build([base, suffixes]: [MathNode, any[]]): MathNode {
            let node = base;
            for (const s of suffixes) {
                if (s.type === "call") node = { type: "CallExpression", callee: node, args: s.args };
                else if (s.type === "control") { if (node.type !== "Identifier") throw new Error("Control block requires identifier"); node = { type: "ControlExpression", name: node.name, args: s.args }; }
                else if (s.type === "subscript") node = { type: "SubscriptExpression", base: node, subscript: s.subscript };
                else if (s.type === "factorial") node = { type: "FactorialExpression", base: node };
                else if (s.type === "derivative") node = { type: "Derivative", base: node, order: s.order };
                else if (s.type === "index") node = { type: "IndexExpression", base: node, index: s.index };
            }
            return node;
        },
    },

    CallSuffix: { peg: { type: "sequence", parts: [{ type: "literal", value: "(" }, { type: "rule", name: "ArgumentList" }, { type: "literal", value: ")" }] }, build([, args]: any) { return { type: "call", args }; } },
    ControlSuffix: { peg: { type: "sequence", parts: [{ type: "literal", value: "{" }, { type: "rule", name: "ArgumentList" }, { type: "literal", value: "}" }] }, build([, args]: any) { return { type: "control", args }; } },
    SubscriptSuffix: { peg: { type: "sequence", parts: [{ type: "literal", value: "_" }, { type: "rule", name: "Primary" }] }, build([, subscript]: any) { return { type: "subscript", subscript }; } },
    FactorialSuffix: { peg: { type: "regex", regex: /^!(?!=)/, name: "!" }, build() { return { type: "factorial" }; } },
    DerivativeSuffix: { peg: { type: "regex", regex: /^'+/, name: "'" }, build(v: string) { return { type: "derivative", order: v.length }; } },
    IndexSuffix: { peg: { type: "sequence", parts: [{ type: "literal", value: "[" }, { type: "rule", name: "Expression" }, { type: "literal", value: "]" }] }, build([, index]: any) { return { type: "index", index }; } },

    ArgumentList: {
        peg: { type: "choice", options: [
            { type: "sequence", parts: [{ type: "rule", name: "Expression" }, { type: "repeat", expr: { type: "sequence", parts: [{ type: "literal", value: "," }, { type: "rule", name: "Expression" }] } }] },
            { type: "sequence", parts: [] },
        ] },
        build(node: any): MathNode[] { if (Array.isArray(node) && node.length === 0) return []; const [first, rest] = node; const args = [first]; for (const [, expr] of rest) args.push(expr); return args; },
    },

    Primary: { peg: { type: "choice", options: [
        { type: "rule", name: "CasesExpression" }, { type: "rule", name: "RolloutExpression" },
        { type: "rule", name: "Ellipsis" }, { type: "rule", name: "AbsoluteValue" },
        { type: "rule", name: "BracketExpression" }, { type: "rule", name: "Number" },
        { type: "rule", name: "Identifier" }, { type: "rule", name: "ParenExpression" },
    ] } },

    CasesExpression: {
        peg: { type: "sequence", parts: [
            { type: "regex", regex: /^\\cases\{/, name: "\\cases{" },
            { type: "rule", name: "CaseBranch" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "literal", value: "," }, { type: "rule", name: "CaseBranch" },
            ] } },
            { type: "literal", value: "}" },
        ] },
        build([, first, rest]: [string, any, [string, any][]]): MathNode {
            const cases = [first]; for (const [, b] of rest) cases.push(b);
            return { type: "Piecewise", cases };
        },
    },

    CaseBranch: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "CaseCondition" },
            { type: "literal", value: ":" },
            { type: "rule", name: "Expression" },
        ] },
        build([condition, , expr]: [MathNode, string, MathNode]) { return { condition, expr }; },
    },

    CaseCondition: {
        peg: { type: "choice", options: [
            { type: "regex", regex: /^_/, name: "default" },
            { type: "sequence", parts: [
                { type: "literal", value: "(" },
                { type: "rule", name: "Expression" },
                { type: "repeat", expr: { type: "sequence", parts: [{ type: "literal", value: "," }, { type: "rule", name: "Expression" }] } },
                { type: "literal", value: ")" },
            ] },
            { type: "rule", name: "Expression" },
        ] },
        build(node: any): MathNode {
            if (node === "_") return { type: "Identifier", name: "_", prefix: "plain" } as IdentifierNode;
            if (!Array.isArray(node)) return node;
            const [, first, rest] = node;
            if (rest.length === 0) return first;
            const conditions = [first]; for (const [, e] of rest) conditions.push(e);
            return { type: "Matrix", rows: [conditions] };
        },
    },

    RolloutExpression: {
        peg: { type: "sequence", parts: [{ type: "regex", regex: /^[+*]\{/, name: "rollout" }, { type: "rule", name: "ArgumentList" }, { type: "literal", value: "}" }] },
        build([opener, args]: [string, MathNode[]]): MathNode { return { type: "ControlExpression", name: opener[0], args }; },
    },

    Ellipsis: { peg: { type: "literal", value: "..." }, build(): MathNode { return { type: "Ellipsis" }; } },

    AbsoluteValue: {
        peg: { type: "sequence", parts: [{ type: "literal", value: "|" }, { type: "rule", name: "Expression" }, { type: "literal", value: "|" }] },
        build([, expr]: [string, MathNode]): MathNode { return { type: "AbsoluteValue", expr }; },
    },

    BracketExpression: {
        peg: { type: "sequence", parts: [{ type: "literal", value: "[" }, { type: "rule", name: "BracketContent" }, { type: "literal", value: "]" }] },
        build([, content]: [string, MathNode]): MathNode { return content; },
    },

    BracketContent: { peg: { type: "choice", options: [{ type: "rule", name: "MatrixRows" }, { type: "rule", name: "BracketList" }] } },

    MatrixRows: {
        peg: { type: "sequence", parts: [{ type: "rule", name: "MatrixRow" }, { type: "repeat", expr: { type: "sequence", parts: [{ type: "literal", value: "," }, { type: "rule", name: "MatrixRow" }] } }] },
        build([first, rest]: [MathNode[], [string, MathNode[]][]]): MathNode { const rows = [first]; for (const [, r] of rest) rows.push(r); return { type: "Matrix", rows }; },
    },

    MatrixRow: {
        peg: { type: "sequence", parts: [{ type: "literal", value: "[" }, { type: "rule", name: "ArgumentList" }, { type: "literal", value: "]" }] },
        build([, args]: [string, MathNode[]]): MathNode[] { return args; },
    },

    BracketList: {
        peg: { type: "sequence", parts: [{ type: "rule", name: "Expression" }, { type: "repeat", expr: { type: "sequence", parts: [{ type: "literal", value: "," }, { type: "rule", name: "Expression" }] } }] },
        build([first, rest]: [MathNode, [string, MathNode][]]): MathNode {
            if (rest.length === 0 && first.type === "Identifier") return { type: "VectorName", identifier: first };
            const elements = [first]; for (const [, e] of rest) elements.push(e);
            return { type: "Matrix", rows: [elements] };
        },
    },

    ParenExpression: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "(" }, { type: "rule", name: "Expression" },
            { type: "choice", options: [{ type: "sequence", parts: [{ type: "repeat", expr: { type: "sequence", parts: [{ type: "literal", value: "," }, { type: "rule", name: "Expression" }] } }, { type: "literal", value: ")" }] }] },
        ] },
        build([, first, tail]: [string, MathNode, any]): MathNode {
            const [commaExprs] = tail;
            if (commaExprs.length === 0) return first;
            const elements = [first]; for (const [, expr] of commaExprs) elements.push(expr);
            return { type: "Matrix", rows: elements.map((e: MathNode) => [e]) };
        },
    },

    Number: { peg: { type: "regex", regex: /^([0-9]+(\.[0-9]*)?|\.[0-9]+)/, name: "number" }, build(v: string): NumberLiteralNode { return { type: "NumberLiteral", value: Number(v) }; } },

    Identifier: { peg: { type: "choice", options: [
        { type: "rule", name: "BlackboardBoldIdentifier" }, { type: "rule", name: "RightSkewGreekIdentifier" },
        { type: "rule", name: "GreekIdentifier" }, { type: "rule", name: "RightSkewIdentifier" },
        { type: "rule", name: "LeftSkewIdentifier" }, { type: "rule", name: "PlainIdentifier" },
    ] } },

    BlackboardBoldIdentifier: { peg: { type: "regex", regex: /^\\\\[A-Za-z]/, name: "blackboard bold" }, build(v: string): IdentifierNode { return { type: "Identifier", name: v.slice(2), prefix: "blackboard" }; } },
    RightSkewGreekIdentifier: { peg: { type: "regex", regex: /^\\[0-9]+[a-zA-Z][a-zA-Z0-9]*/, name: "right-skew backslash" }, build(v: string): IdentifierNode { return { type: "Identifier", name: v.replace(/^\\[0-9]+/, ""), prefix: "greek-right" }; } },
    GreekIdentifier: { peg: { type: "regex", regex: /^\\[a-zA-Z][a-zA-Z0-9]*/, name: "backslash identifier" }, build(v: string): IdentifierNode { return { type: "Identifier", name: v.slice(1), prefix: "greek" }; } },
    RightSkewIdentifier: { peg: { type: "regex", regex: /^`[0-9]+[a-zA-Z]/, name: "right-skew" }, build(v: string): IdentifierNode { return { type: "Identifier", name: v.replace(/^`[0-9]+/, ""), prefix: "right-skew" }; } },
    LeftSkewIdentifier: { peg: { type: "regex", regex: /^`[a-zA-Z]/, name: "left-skew" }, build(v: string): IdentifierNode { return { type: "Identifier", name: v.slice(1), prefix: "left-skew" }; } },
    PlainIdentifier: { peg: { type: "regex", regex: /^[a-zA-Z]/, name: "identifier" }, build(v: string): IdentifierNode { return { type: "Identifier", name: v, prefix: "plain" }; } },
};

export const parser = new PEGParser(grammar, { skip: /^[ \t\r\n]+/ });
