export type PEGExpression =
    | LiteralExpression
    | RegexExpression
    | SequenceExpression
    | ChoiceExpression
    | RepeatExpression
    | RuleReferenceExpression;

export interface LiteralExpression {
    type: "literal";
    value: string;
}

export interface RegexExpression {
    type: "regex";
    regex: RegExp;
    name?: string;
}

export interface SequenceExpression {
    type: "sequence";
    parts: PEGExpression[];
}

export interface ChoiceExpression {
    type: "choice";
    options: PEGExpression[];
}

export interface RepeatExpression {
    type: "repeat";
    expr: PEGExpression;
}

export interface RuleReferenceExpression {
    type: "rule";
    name: string;
}

export interface MatchSuccess<T = unknown> {
    success: true;
    position: number;
    node: T;
}

export interface MatchFailure {
    success: false;
    position: number;
}

export type MatchResult<T = unknown> = MatchSuccess<T> | MatchFailure;

export interface ParseErrorInfo {
    position: number;
    expected: Set<string>;
    found: string | null;
}

export interface PEGRule {
    peg: PEGExpression;
    build?: (node: any) => any;
}

export interface PEGParserOptions {
    skip?: RegExp;
}

export type Grammar = Record<string, PEGRule>;

// ── AST nodes ────────────────────────────────────────────────────────────────

export interface NumberLiteralNode {
    type: "NumberLiteral";
    value: number;
}

export interface BinaryExpressionNode {
    type: "BinaryExpression";
    operator: string;
    left: ASTNode;
    right: ASTNode;
}

export interface UnaryExpressionNode {
    type: "UnaryExpression";
    operator: string;
    operand: ASTNode;
}

export interface IdentifierNode {
    type: "Identifier";
    name: string;
    prefix: "plain" | "left-skew" | "right-skew" | "greek" | "greek-right" | "blackboard";
}

export interface CallExpressionNode {
    type: "CallExpression";
    callee: ASTNode;
    args: ASTNode[];
}

export interface ControlExpressionNode {
    type: "ControlExpression";
    name: string;
    args: ASTNode[];
}

export interface SubscriptExpressionNode {
    type: "SubscriptExpression";
    base: ASTNode;
    subscript: ASTNode;
}

export interface SubSuperscriptExpressionNode {
    type: "SubSuperscriptExpression";
    base: ASTNode;
    subscript: ASTNode;
    superscript: ASTNode;
}

export interface VectorNameNode {
    type: "VectorName";
    identifier: ASTNode;
}

export interface MatrixNode {
    type: "Matrix";
    rows: ASTNode[][];
}

export interface IndexExpressionNode {
    type: "IndexExpression";
    base: ASTNode;
    index: ASTNode;
}

export interface AbsoluteValueNode {
    type: "AbsoluteValue";
    expr: ASTNode;
}

export interface FactorialExpressionNode {
    type: "FactorialExpression";
    base: ASTNode;
}

export interface DerivativeNode {
    type: "Derivative";
    base: ASTNode;
    order: number;
}

export interface EllipsisNode {
    type: "Ellipsis";
}

export interface PiecewiseNode {
    type: "Piecewise";
    cases: { expr: ASTNode; condition: ASTNode }[];
}

export type ASTNode =
    | NumberLiteralNode
    | IdentifierNode
    | BinaryExpressionNode
    | UnaryExpressionNode
    | CallExpressionNode
    | ControlExpressionNode
    | SubscriptExpressionNode
    | SubSuperscriptExpressionNode
    | VectorNameNode
    | MatrixNode
    | IndexExpressionNode
    | AbsoluteValueNode
    | FactorialExpressionNode
    | DerivativeNode
    | EllipsisNode
    | PiecewiseNode;
