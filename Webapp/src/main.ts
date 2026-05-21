type PEGExpression =
    | LiteralExpression
    | RegexExpression
    | SequenceExpression
    | ChoiceExpression
    | RepeatExpression
    | RuleReferenceExpression;

interface LiteralExpression {
    type: "literal";
    value: string;
}

interface RegexExpression {
    type: "regex";
    regex: RegExp;
    name?: string;
}

interface SequenceExpression {
    type: "sequence";
    parts: PEGExpression[];
}

interface ChoiceExpression {
    type: "choice";
    options: PEGExpression[];
}

interface RepeatExpression {
    type: "repeat";
    expr: PEGExpression;
}

interface RuleReferenceExpression {
    type: "rule";
    name: string;
}

interface MatchSuccess<T = unknown> {
    success: true;
    position: number;
    node: T;
}

interface MatchFailure {
    success: false;
    position: number;
}

type MatchResult<T = unknown> = MatchSuccess<T> | MatchFailure;

interface ParseErrorInfo {
    position: number;
    expected: Set<string>;
    found: string | null;
}

interface PEGRule {
    peg: PEGExpression;
    build?: (node: any) => any;
}

interface PEGParserOptions {
    skip?: RegExp;
}

type Grammar = Record<string, PEGRule>;

interface NumberLiteralNode {
    type: "NumberLiteral";
    value: number;
}

interface BinaryExpressionNode {
    type: "BinaryExpression";
    operator: string;
    left: ASTNode;
    right: ASTNode;
}

interface UnaryExpressionNode {
    type: "UnaryExpression";
    operator: string;
    operand: ASTNode;
}

interface IdentifierNode {
    type: "Identifier";
    name: string;
}

interface CallExpressionNode {
    type: "CallExpression";
    callee: ASTNode;
    args: ASTNode[];
}

interface ControlExpressionNode {
    type: "ControlExpression";
    name: string;
    args: ASTNode[];
}

interface SubscriptExpressionNode {
    type: "SubscriptExpression";
    base: ASTNode;
    subscript: ASTNode;
}

type ASTNode =
    | NumberLiteralNode
    | IdentifierNode
    | BinaryExpressionNode
    | UnaryExpressionNode
    | CallExpressionNode
    | ControlExpressionNode
    | SubscriptExpressionNode;

class PEGParser {
    private grammar: Grammar;
    private skipPattern?: RegExp;
    private inputString: string = "";
    private lineStarts: number[] = [];

    private bestError: ParseErrorInfo = {
        position: 0,
        expected: new Set<string>(),
        found: null,
    };

    constructor(grammar: Grammar, options: PEGParserOptions = {}) {
        this.grammar = grammar;
        this.skipPattern = options.skip;
    }

    parse(startRule: string, inputString: string): unknown {
        this.inputString = inputString;

        this.lineStarts = this.computeLineStarts(inputString);

        this.bestError = {
            position: 0,
            expected: new Set<string>(),
            found: null,
        };

        const result = this.matchRule(startRule, 0);

        if (!result.success) {
            throw new Error(this.formatError());
        }

        const finalPosition = this.skip(result.position);
        if (finalPosition < inputString.length) {
            this.recordFailure(result.position, "EOF");

            throw new Error(this.formatError());
        }

        return result.node;
    }

    private computeLineStarts(inputString: string): number[] {
        const starts: number[] = [0];

        for (let i = 0; i < inputString.length; i++) {
            if (inputString[i] === "\n") {
                starts.push(i + 1);
            }
        }

        return starts;
    }

    private getLineColumn(position: number): {
        line: number;
        column: number;
    } {
        let line = 0;

        while (
            line + 1 < this.lineStarts.length &&
            this.lineStarts[line + 1] <= position
        ) {
            line++;
        }

        return {
            line: line + 1,
            column: position - this.lineStarts[line] + 1,
        };
    }

    private getLineText(lineNumber: number): string {
        const lines = this.inputString.split("\n");

        return lines[lineNumber - 1] || "";
    }

    private recordFailure(position: number, expected: string): void {
        if (position > this.bestError.position) {
            this.bestError.position = position;

            this.bestError.expected = new Set([expected]);

            this.bestError.found = this.inputString[position] || "EOF";
        } else if (position === this.bestError.position) {
            this.bestError.expected.add(expected);
        }
    }

    private formatError(): string {
        const error = this.bestError;

        const { line, column } = this.getLineColumn(error.position);

        const lineText = this.getLineText(line);

        const expected = [...error.expected].join(", ");

        const caretLine = this.makeCaret(column, 1);

        return [
            `error: unexpected '${error.found}'`,
            ` --> inputString:${line}:${column}`,
            `  |`,
            `${line} | ${lineText}`,
            `  | ${caretLine}`,
            `  |`,
            `  = expected: ${expected}`,
        ].join("\n");
    }

    private makeCaret(column: number, length: number = 1): string {
        return " ".repeat(column - 1) + "^".repeat(length);
    }

    private matchRule(ruleName: string, position: number): MatchResult {
        const rule = this.grammar[ruleName];
        if (!rule) {
            throw new Error(`Unknown rule: ${ruleName}`);
        }

        const result = this.match(rule.peg, position);

        if (!result.success) {
            return result;
        }

        let node = result.node;

        if (rule.build) {
            node = rule.build(node);
        }

        return {
            success: true,
            position: result.position,
            node,
        };
    }

    private match(expr: PEGExpression, position: number): MatchResult<any> {
        switch (expr.type) {
            case "literal":
                return this.matchLiteral(expr, position);

            case "regex":
                return this.matchRegex(expr, position);

            case "sequence":
                return this.matchSequence(expr, position);

            case "choice":
                return this.matchChoice(expr, position);

            case "repeat":
                return this.matchRepeat(expr, position);

            case "rule":
                return this.matchRule(expr.name, position);

            default:
                throw new Error(`Unknown PEG node`);
        }
    }

    private matchLiteral(
        expr: LiteralExpression,
        position: number
    ): MatchResult<string> {
        position = this.skip(position);
        if (this.inputString.startsWith(expr.value, position)) {
            return {
                success: true,
                position: position + expr.value.length,
                node: expr.value,
            };
        }

        this.recordFailure(position, `"${expr.value}"`);

        return {
            success: false,
            position,
        };
    }

    private matchRegex(
        expr: RegexExpression,
        position: number
    ): MatchResult<string> {
        position = this.skip(position);
        const slice = this.inputString.slice(position);
        const match = slice.match(expr.regex);
        if (!match || match.index !== 0) {
            this.recordFailure(position, expr.name || "pattern");
            return {
                success: false,
                position,
            };
        }
        return {
            success: true,
            position: position + match[0].length,
            node: match[0],
        };
    }

    private matchSequence(
        expr: SequenceExpression,
        position: number
    ): MatchResult<any[]> {
        const values: any[] = [];
        let current = position;
        for (const part of expr.parts) {
            const result = this.match(part, current);
            if (!result.success) {
                return result;
            }
            values.push(result.node);
            current = result.position;
        }
        return {
            success: true,
            position: current,
            node: values,
        };
    }

    private matchChoice(expr: ChoiceExpression, position: number): MatchResult {
        for (const option of expr.options) {
            const result = this.match(option, position);
            if (result.success) {
                return result;
            }
        }
        return {
            success: false,
            position,
        };
    }

    private matchRepeat(
        expr: RepeatExpression,
        position: number
    ): MatchResult<any[]> {
        const values: any[] = [];
        let current = position;
        while (true) {
            const result = this.match(expr.expr, current);
            if (!result.success) {
                break;
            }
            if (result.position === current) {
                break;
            }
            values.push(result.node);
            current = result.position;
        }
        return {
            success: true,
            position: current,
            node: values,
        };
    }

    private skip(position: number): number {
        if (!this.skipPattern) {
            return position;
        }
        while (position < this.inputString.length) {
            const slice = this.inputString.slice(position);
            this.skipPattern.lastIndex = 0;
            const match = this.skipPattern.exec(slice);
            if (!match || match.index !== 0 || match[0].length === 0) {
                break;
            }
            position += match[0].length;
        }

        return position;
    }
}

/* =========================
   Grammar
========================= */
const grammar: Grammar = {
    Expression: {
        peg: {
            type: "rule",
            name: "Additive",
        },
    },

    /* =========================
     Additive
  ========================= */

    Additive: {
        peg: {
            type: "sequence",
            parts: [
                {
                    type: "rule",
                    name: "Multiplicative",
                },
                {
                    type: "repeat",
                    expr: {
                        type: "sequence",
                        parts: [
                            {
                                type: "choice",
                                options: [
                                    {
                                        type: "literal",
                                        value: "+",
                                    },
                                    {
                                        type: "literal",
                                        value: "-",
                                    },
                                ],
                            },
                            {
                                type: "rule",
                                name: "Multiplicative",
                            },
                        ],
                    },
                },
            ],
        },

        build([left, rest]: [ASTNode, [string, ASTNode][]]): ASTNode {
            let node = left;

            for (const [operator, right] of rest) {
                node = {
                    type: "BinaryExpression",
                    operator,
                    left: node,
                    right,
                };
            }

            return node;
        },
    },

    ImplicitFactor: {
        peg: {
            type: "choice",
            options: [
                //
                // postfix-able things
                //
                {
                    type: "rule",
                    name: "Postfix",
                },

                //
                // parenthesized expressions
                //
                {
                    type: "sequence",
                    parts: [
                        {
                            type: "literal",
                            value: "(",
                        },

                        {
                            type: "rule",
                            name: "Expression",
                        },

                        {
                            type: "literal",
                            value: ")",
                        },
                    ],
                },
            ],
        },

        build(node: any): ASTNode {
            if (Array.isArray(node)) {
                return node[1];
            }

            return node;
        },
    },

    /* =========================
     Multiplicative
     supports:
       a*b
       a/b
       2x
       2(x+1)
       sin(x)y
  ========================= */

    Multiplicative: {
        peg: {
            type: "sequence",
            parts: [
                {
                    type: "rule",
                    name: "Power",
                },

                {
                    type: "repeat",
                    expr: {
                        type: "choice",
                        options: [
                            //
                            // explicit multiplication/division
                            //
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

                                    {
                                        type: "rule",
                                        name: "Power",
                                    },
                                ],
                            },

                            //
                            // implicit multiplication
                            //
                            {
                                type: "rule",
                                name: "ImplicitFactor",
                            },
                        ],
                    },
                },
            ],
        },

        build([left, rest]: [ASTNode, any[]]): ASTNode {
            let node = left;

            for (const item of rest) {
                //
                // explicit
                //
                if (Array.isArray(item) && item.length === 2) {
                    const [operator, right] = item;

                    node = {
                        type: "BinaryExpression",
                        operator,
                        left: node,
                        right,
                    };

                    continue;
                }

                //
                // implicit
                //
                node = {
                    type: "BinaryExpression",
                    operator: "*",
                    left: node,
                    right: item as ASTNode,
                };
            }

            return node;
        },
    },

    /* =========================
     Power
  ========================= */

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
            if (rest.length === 0) {
                return left;
            }

            let node = rest[rest.length - 1][1];

            for (let i = rest.length - 2; i >= 0; i--) {
                node = {
                    type: "BinaryExpression",
                    operator: "^",
                    left: rest[i][1],
                    right: node,
                };
            }

            return {
                type: "BinaryExpression",
                operator: "^",
                left,
                right: node,
            };
        },
    },

    /* =========================
     Unary
  ========================= */

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
                                {
                                    type: "literal",
                                    value: "-",
                                },
                                {
                                    type: "literal",
                                    value: "+",
                                },
                            ],
                        },
                        {
                            type: "rule",
                            name: "Unary",
                        },
                    ],
                },

                {
                    type: "rule",
                    name: "Postfix",
                },
            ],
        },

        build(node: any): ASTNode {
            if (!Array.isArray(node)) {
                return node;
            }

            const [operator, operand] = node;

            return {
                type: "UnaryExpression",
                operator,
                operand,
            };
        },
    },

    /* =========================
     Postfix
     supports:
       f(x)
       g(x)(y)
  ========================= */

    Postfix: {
        peg: {
            type: "sequence",
            parts: [
                {
                    type: "rule",
                    name: "Primary",
                },

                {
                    type: "repeat",
                    expr: {
                        type: "choice",
                        options: [
                            {
                                type: "rule",
                                name: "CallSuffix",
                            },
                            {
                                type: "rule",
                                name: "ControlSuffix",
                            },
                            {
                                type: "rule",
                                name: "SubscriptSuffix",
                            },
                        ],
                    },
                },
            ],
        },

        build([base, suffixes]: [ASTNode, any[]]): ASTNode {
            let node = base;

            for (const suffix of suffixes) {
                //
                // function call
                //
                if (suffix.type === "call") {
                    node = {
                        type: "CallExpression",
                        callee: node,
                        args: suffix.args,
                    };

                    continue;
                }
                if (suffix.type === "control") {
                    //
                    // IMPORTANT:
                    // control blocks require an identifier/callee name
                    //
                    if (node.type !== "Identifier") {
                        throw new Error("Control block requires identifier");
                    }

                    node = {
                        type: "ControlExpression",
                        name: node.name,
                        args: suffix.args,
                    };

                    continue;
                }

                //
                // subscript
                //
                if (suffix.type === "subscript") {
                    node = {
                        type: "SubscriptExpression",
                        base: node,
                        subscript: suffix.subscript,
                    };

                    continue;
                }
            }

            return node;
        },
    },

    /* =========================
     Function call suffix
  ========================= */

    CallSuffix: {
        peg: {
            type: "sequence",
            parts: [
                {
                    type: "literal",
                    value: "(",
                },

                {
                    type: "rule",
                    name: "ArgumentList",
                },

                {
                    type: "literal",
                    value: ")",
                },
            ],
        },

        build([_, args]: [string, ASTNode[], string]) {
            return {
                type: "call",
                args,
            };
        },
    },

    ControlSuffix: {
        peg: {
            type: "sequence",
            parts: [
                {
                    type: "literal",
                    value: "{",
                },

                {
                    type: "rule",
                    name: "ArgumentList",
                },

                {
                    type: "literal",
                    value: "}",
                },
            ],
        },

        build([_, args]: [string, ASTNode[], string]) {
            return {
                type: "control",
                args,
            };
        },
    },

    /* =========================
     Arguments
  ========================= */

    ArgumentList: {
        peg: {
            type: "choice",
            options: [
                // non-empty
                {
                    type: "sequence",
                    parts: [
                        {
                            type: "rule",
                            name: "Expression",
                        },

                        {
                            type: "repeat",
                            expr: {
                                type: "sequence",
                                parts: [
                                    {
                                        type: "literal",
                                        value: ",",
                                    },

                                    {
                                        type: "rule",
                                        name: "Expression",
                                    },
                                ],
                            },
                        },
                    ],
                },

                // empty
                {
                    type: "sequence",
                    parts: [],
                },
            ],
        },

        build(node: any): ASTNode[] {
            // empty argument list
            if (Array.isArray(node) && node.length === 0) {
                return [];
            }

            const [first, rest] = node;

            const args = [first];

            for (const [, expr] of rest) {
                args.push(expr);
            }

            return args;
        },
    },

    /* =========================
     Primary
  ========================= */

    Primary: {
        peg: {
            type: "choice",
            options: [
                {
                    type: "rule",
                    name: "Number",
                },

                {
                    type: "rule",
                    name: "Identifier",
                },

                {
                    type: "sequence",
                    parts: [
                        {
                            type: "literal",
                            value: "(",
                        },

                        {
                            type: "rule",
                            name: "Expression",
                        },

                        {
                            type: "literal",
                            value: ")",
                        },
                    ],
                },
            ],
        },

        build(node: any): ASTNode {
            if (Array.isArray(node)) {
                return node[1];
            }

            return node;
        },
    },

    /* =========================
     Number
  ========================= */

    Number: {
        peg: {
            type: "regex",
            regex: /^([0-9]+(\.[0-9]*)?|\.[0-9]+)/,
            name: "number",
        },

        build(value: string): NumberLiteralNode {
            return {
                type: "NumberLiteral",
                value: Number(value),
            };
        },
    },

    /* =========================
     Identifier
  ========================= */

    Identifier: {
        peg: {
            type: "choice",
            options: [
                {
                    type: "rule",
                    name: "EscapedIdentifier",
                },

                {
                    type: "rule",
                    name: "PlainIdentifier",
                },
            ],
        },
    },

    PlainIdentifier: {
        peg: {
            type: "regex",
            regex: /^[a-zA-Z]/,
            name: "identifier",
        },

        build(value: string): IdentifierNode {
            return {
                type: "Identifier",
                name: value,
            };
        },
    },

    EscapedIdentifier: {
        peg: {
            type: "regex",
            regex: /^\\[a-zA-Z][a-zA-Z0-9]*/,
            name: "escaped identifier",
        },

        build(value: string): IdentifierNode {
            return {
                type: "Identifier",
                name: value,
            };
        },
    },
    SubscriptSuffix: {
        peg: {
            type: "sequence",
            parts: [
                {
                    type: "literal",
                    value: "_",
                },

                {
                    type: "rule",
                    name: "Primary",
                },
            ],
        },

        build([_, subscript]: [string, ASTNode]) {
            return {
                type: "subscript",
                subscript,
            };
        },
    },
};

/* =========================
   Usage
========================= */

const parser = new PEGParser(grammar, {
    skip: /^[ \t\r\n]+/,
});

// const ast = parser.parse("Expression", "\\int{2, 3, 3x^2^3*\\dx}");
const ast = parser.parse("Expression", "\\int{2, 3, f(x)y(z)*\\dx}");

console.log(ast);

console.log(JSON.stringify(ast, null, 2));

// Other stuff:

function el(tag: string, className?: string, children: (Node | string)[] = []) {
    const node = document.createElement(tag);
    if (className) node.className = className;

    for (const child of children) {
        node.appendChild(
            typeof child === "string" ? document.createTextNode(child) : child
        );
    }

    return node;
}

function render(node: ASTNode): HTMLElement {
    switch (node.type) {
        case "NumberLiteral":
            return el("span", "", [String(node.value)]);

        case "Identifier":
            const name = node.name.startsWith("\\")
                ? node.name.slice(1)
                : node.name;
            return el("span", "", [name]);

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

const OPERATOR_PRECEDENCE: Record<string, number> = {
    "+": 0,
    "-": 0,
    "*": 1,
    "/": 1,
    "^": 2,
};

function getOperatorPrecedence(operator: string): number {
    let result = OPERATOR_PRECEDENCE[operator];
    if (!result) return -1;
    return OPERATOR_PRECEDENCE[operator];
}

function renderBinary(node: BinaryExpressionNode): HTMLElement {
    const { operator, left, right } = node;

    let leftParenthesis = false;
    let rightParenthesis = false;

    if (left.type == "BinaryExpression" || left.type == "UnaryExpression") {
        if (operator == "^") {
            leftParenthesis =
                getOperatorPrecedence(operator) >=
                getOperatorPrecedence(left.operator);
        } else {
            leftParenthesis =
                getOperatorPrecedence(operator) >
                getOperatorPrecedence(left.operator);
        }
    }
    if (right.type == "BinaryExpression" || right.type == "UnaryExpression") {
        if (operator == "-" || operator == "/") {
            rightParenthesis =
                getOperatorPrecedence(operator) >=
                getOperatorPrecedence(right.operator);
        } else {
            rightParenthesis =
                getOperatorPrecedence(operator) >
                getOperatorPrecedence(right.operator);
        }
    }

    const leftopen = leftParenthesis ? "(" : "";
    const leftclose = leftParenthesis ? ")" : "";
    const rightopen = rightParenthesis ? "(" : "";
    const rightclose = rightParenthesis ? ")" : "";

    console.log(operator, left, right, leftParenthesis, rightParenthesis);

    // FRACTION
    if (operator === "/") {
        return el("span", "fraction", [
            el("span", "top", [leftopen, render(left), leftclose]),
            el("span", "bottom", [rightopen, render(right), rightclose]),
        ]);
    }

    // POWER
    if (operator === "^") {
        return el("span", "", [
            leftopen,
            render(left),
            leftclose,
            el("sup", "", [rightopen, render(right), rightclose]),
        ]);
    }

    // MULTIPLICATION (implicit clean)
    if (operator === "*") {
        return el("span", "", [
            leftopen,
            render(left),
            leftclose,
            rightopen,
            render(right),
            rightclose,
        ]);
    }

    // DEFAULT (+, -)
    return el("span", "", [
        leftopen,
        render(left),
        leftclose,
        ` ${operator} `,
        rightopen,
        render(right),
        rightclose,
    ]);
}

function renderSubscript(node: SubscriptExpressionNode): HTMLElement {
    return el("span", "", [
        render(node.base),
        el("sub", "", [render(node.subscript)]),
    ]);
}

function renderCall(node: CallExpressionNode): HTMLElement {
    return el("span", "", [
        render(node.callee),
        "(",
        ...interleave(node.args.map(render), ", "),
        ")",
    ]);
}

function interleave(arr: Node[], sep: string): (Node | string)[] {
    const result: (Node | string)[] = [];
    arr.forEach((item, i) => {
        if (i > 0) result.push(sep);
        result.push(item);
    });
    return result;
}

function renderControl(node: ControlExpressionNode): HTMLElement {
    const name = node.name.replace(/^\\/, "");

    switch (name) {
        case "sqrt":
            return el("span", "sqrt", [render(node.args[0])]);

        case "int":
            return renderIntegral(node);

        default:
            return el("span", "", [
                name,
                "(",
                ...interleave(node.args.map(render), ", "),
                ")",
            ]);
    }
}

function renderIntegral(node: ControlExpressionNode): HTMLElement {
    const [from, to, body] = node.args;

    return el("span", "opstack", [
        el("span", "top", [render(to)]),
        el("span", "op large-operator", ["∫"]),
        el("span", "bottom", [render(from)]),
        render(body),
    ]);
}

function renderMath(ast: ASTNode): HTMLElement {
    return el("span", "native-math", [render(ast)]);
}

window.addEventListener("load", function () {
    const inputElement = document.getElementById("input");
    const resultElement = document.getElementById("result");
    const errorElement = this.document.getElementById("error-message");
    const buttonElement = document.getElementById("render");
    if (!inputElement || !resultElement || !buttonElement) {
        throw new Error("Missing DOM elements");
    }

    buttonElement.addEventListener("click", function () {
        const parseInput = (inputElement as HTMLInputElement).value;

        try {
            const ast = parser.parse("Expression", parseInput);

            resultElement.innerHTML = "";
            resultElement.appendChild(renderMath(ast));

            errorElement.innerText = "";
        } catch (e) {
            errorElement.innerText = (e as Error).message;
            resultElement.innerHTML = "";
        }
    });

    buttonElement.addEventListener("click", function () {
        const parseInput = (inputElement as HTMLInputElement).value;

        try {
            const ast = parser.parse("Expression", parseInput);

            resultElement.innerHTML = "";
            console.log(JSON.stringify(ast, null, 2));
            resultElement.appendChild(renderMath(ast as ASTNode));

            errorElement.innerText = "";
        } catch (e) {
            errorElement.innerText = (e as Error).message;
            resultElement.innerHTML = "";
        }
    });

    // Test injection
    (inputElement as HTMLInputElement).value = "-2*(3+5)*4e^x^2";
    buttonElement.click();
});
