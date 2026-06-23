// ── Math AST node types ───────────────────────────────────────────────────────

export interface NumberLiteralNode { type: "NumberLiteral"; value: number; }

export interface IdentifierNode {
    type: "Identifier";
    name: string;
    prefix: "plain" | "left-skew" | "right-skew" | "greek" | "greek-right" | "blackboard";
}

export interface BinaryExpressionNode { type: "BinaryExpression"; operator: string; left: MathNode; right: MathNode; }
export interface UnaryExpressionNode { type: "UnaryExpression"; operator: string; operand: MathNode; }
export interface CallExpressionNode { type: "CallExpression"; callee: MathNode; args: MathNode[]; }
export interface ControlExpressionNode { type: "ControlExpression"; name: string; args: MathNode[]; }
export interface SubscriptExpressionNode { type: "SubscriptExpression"; base: MathNode; subscript: MathNode; }
export interface SubSuperscriptExpressionNode { type: "SubSuperscriptExpression"; base: MathNode; subscript: MathNode; superscript: MathNode; }
export interface VectorNameNode { type: "VectorName"; identifier: MathNode; }
export interface MatrixNode { type: "Matrix"; rows: MathNode[][]; }
export interface IndexExpressionNode { type: "IndexExpression"; base: MathNode; index: MathNode; }
export interface AbsoluteValueNode { type: "AbsoluteValue"; expr: MathNode; }
export interface FactorialExpressionNode { type: "FactorialExpression"; base: MathNode; }
export interface DerivativeNode { type: "Derivative"; base: MathNode; order: number; }
export interface EllipsisNode { type: "Ellipsis"; }
export interface PiecewiseNode { type: "Piecewise"; cases: { expr: MathNode; condition: MathNode }[]; }

export interface SetNode { type: "Set"; elements: MathNode[]; }
export interface TextLiteralNode { type: "TextLiteral"; text: string; }
export interface TupleNode { type: "Tuple"; elements: MathNode[]; }

export type MathNode =
    | NumberLiteralNode | IdentifierNode | BinaryExpressionNode | UnaryExpressionNode
    | CallExpressionNode | ControlExpressionNode | SubscriptExpressionNode
    | SubSuperscriptExpressionNode | VectorNameNode | MatrixNode | IndexExpressionNode
    | AbsoluteValueNode | FactorialExpressionNode | DerivativeNode | EllipsisNode | PiecewiseNode | SetNode | TextLiteralNode | TupleNode;
