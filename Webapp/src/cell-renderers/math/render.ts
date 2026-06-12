import { el } from "./el.ts";
import type { MathNode, BinaryExpressionNode, CallExpressionNode, ControlExpressionNode, IdentifierNode, SubscriptExpressionNode, SubSuperscriptExpressionNode, VectorNameNode, MatrixNode, IndexExpressionNode, AbsoluteValueNode, FactorialExpressionNode, DerivativeNode, PiecewiseNode, SetNode } from "./types.ts";

const OPERATOR_PRECEDENCE: Record<string, number> = { ",": -3, "=": -2, "!=": -2, "<=": -2, ">=": -2, "~=": -2, ":=": -2, "~": -2, "<<": -2, ">>": -2, "->": -2, "sub": -2, "supset": -2, "sube": -2, "supe": -2, "in": -2, "notin": -2, "divides": -2, "ndivides": -2, "cong": -2, "parallel": -2, "perp": -2, "sim": -2, "+": 0, "-": 0, "*": 1, "/": 1, ".": 1, "mod": 1, "div": 1, "^": 2 };
function getOperatorPrecedence(op: string): number { return OPERATOR_PRECEDENCE[op] ?? -1; }

const GLYPH_TABLE: Record<string, string> = { a:"α",b:"β",g:"γ",d:"δ",e:"ε",z:"ζ",h:"η",q:"θ",i:"ι",k:"κ",l:"λ",m:"μ",n:"ν",x:"ξ",o:"ο",p:"π",r:"ρ",s:"σ",t:"τ",u:"υ",f:"φ",c:"χ",y:"ψ",w:"ω",A:"Α",B:"Β",G:"Γ",D:"Δ",E:"Ε",Z:"Ζ",H:"Η",Q:"Θ",I:"Ι",K:"Κ",L:"Λ",M:"Μ",N:"Ν",X:"Ξ",O:"Ο",P:"Π",R:"Ρ",S:"Σ",T:"Τ",U:"Υ",F:"Φ",C:"Χ",Y:"Ψ",W:"Ω",ha:"ℵ",hb:"ℶ",hg:"ℷ",hd:"ℸ",pm:"±",mp:"∓",inf:"∞",nabla:"∇",partial:"∂",union:"∪",inter:"∩",diff:"∖",cross:"×",comp:"∁",empty:"∅",pow:"𝒫",sub:"⊂",supset:"⊃",sube:"⊆",supe:"⊇",psub:"⊊",psupset:"⊋",symdiff:"△",and:"∧",or:"∨",not:"¬",imp:"⟹",iff:"⟺",all:"∀",ex:"∃",nex:"∄",circ:"∘",oplus:"⊕",otimes:"⊗",had:"⊙",kron:"⊗",mapsto:"↦",parallel:"∥",perp:"⊥",sim:"∼",angle:"∠",tri:"△",divides:"∣",ndivides:"∤",cong:"≅",given:"∣",mod:"mod",div:"÷",infimum:"inf",supremum:"sup",limsup:"lim sup",liminf:"lim inf",oint:"∮",iint:"∬",iiint:"∭",in:"∈",notin:"∉",Id:"𝐈","0":"𝟎" };
const BLACKBOARD_TABLE: Record<string, string> = { N:"ℕ",Z:"ℤ",Q:"ℚ",R:"ℝ",C:"ℂ",H:"ℍ",P:"ℙ",U:"𝕌",d:"∂" };
const RELATIONAL_SYMBOL: Record<string, string> = { "=":"=","!=":"≠","<=":"≤",">=":"≥","~=":"≈",":=":"≡","~":"∝","<<":"≪",">>":"≫","->":"→","<":"<",">":">",sub:"⊂",supset:"⊃",sube:"⊆",supe:"⊇",in:"∈",notin:"∉",divides:"∣",ndivides:"∤",cong:"≅",parallel:"∥",perp:"⊥",sim:"∼" };
function resolveGlyph(name: string): string { return GLYPH_TABLE[name] ?? name; }

export function render(node: MathNode): HTMLElement {
    switch (node.type) {
        case "NumberLiteral": return el("span", "", [String(node.value)]);
        case "Identifier": return renderIdentifier(node);
        case "BinaryExpression": return renderBinary(node);
        case "UnaryExpression": return el("span", "", [node.operator, render(node.operand)]);
        case "CallExpression": return renderCall(node);
        case "ControlExpression": return renderControl(node);
        case "SubscriptExpression": return renderSubscript(node);
        case "SubSuperscriptExpression": return renderSubSuperscript(node);
        case "VectorName": return renderVectorName(node);
        case "Matrix": return renderMatrix(node);
        case "IndexExpression": return renderIndex(node);
        case "AbsoluteValue": return renderAbsoluteValue(node);
        case "FactorialExpression": return renderFactorial(node);
        case "Derivative": return renderDerivative(node);
        case "Ellipsis": return el("span", "", ["…"]);
        case "Piecewise": return renderPiecewise(node);
        case "Set": return renderSet(node);
        case "TextLiteral": return el("span", "math-text", [node.text]);
        default: throw new Error("Unknown node");
    }
}

function renderIdentifier(node: IdentifierNode): HTMLElement {
    const { name, prefix } = node;
    if (prefix === "blackboard") return el("span", "ident-blackboard", [BLACKBOARD_TABLE[name] ?? name]);
    if (prefix === "greek" || prefix === "greek-right") { const g = resolveGlyph(name); return el("span", `ident-${prefix}`, [g]); }
    return el("span", `ident-${prefix}`, [name]);
}

function needsExplicitMultiplySign(left: MathNode, right: MathNode, lp: boolean, rp: boolean): boolean {
    return endsWithDigit(left, lp) && startsWithDigit(right, rp);
}
function startsWithDigit(node: MathNode, paren: boolean): boolean {
    if (paren) return false;
    switch (node.type) { case "NumberLiteral": return true; case "BinaryExpression": return startsWithDigit(node.left, wouldParenLeft(node)); case "CallExpression": return startsWithDigit(node.callee, false); case "SubscriptExpression": return startsWithDigit(node.base, false); case "SubSuperscriptExpression": return startsWithDigit(node.base, false); case "FactorialExpression": return startsWithDigit(node.base, false); case "Derivative": return startsWithDigit(node.base, false); case "IndexExpression": return startsWithDigit(node.base, false); default: return false; }
}
function endsWithDigit(node: MathNode, paren: boolean): boolean {
    if (paren) return false;
    switch (node.type) { case "NumberLiteral": return true; case "UnaryExpression": return endsWithDigit(node.operand, false); case "BinaryExpression": if (node.operator === "^" || node.operator === "/") return false; return endsWithDigit(node.right, wouldParenRight(node)); default: return false; }
}
function wouldParenLeft(node: BinaryExpressionNode): boolean { const { operator, left } = node; if (left.type === "BinaryExpression" || left.type === "UnaryExpression") return operator === "^" ? getOperatorPrecedence(operator) >= getOperatorPrecedence(left.operator) : getOperatorPrecedence(operator) > getOperatorPrecedence(left.operator); return false; }
function wouldParenRight(node: BinaryExpressionNode): boolean { const { operator, right } = node; if (right.type === "BinaryExpression" || right.type === "UnaryExpression") return operator === "-" || operator === "/" ? getOperatorPrecedence(operator) >= getOperatorPrecedence(right.operator) : getOperatorPrecedence(operator) > getOperatorPrecedence(right.operator); return false; }

function renderBinary(node: BinaryExpressionNode): HTMLElement {
    const { operator, left, right } = node;
    let leftParen = false, rightParen = false;
    if (left.type === "BinaryExpression" || left.type === "UnaryExpression") leftParen = operator === "^" ? getOperatorPrecedence(operator) >= getOperatorPrecedence(left.operator) : getOperatorPrecedence(operator) > getOperatorPrecedence(left.operator);
    if (right.type === "BinaryExpression" || right.type === "UnaryExpression") rightParen = operator === "-" || operator === "/" ? getOperatorPrecedence(operator) >= getOperatorPrecedence(right.operator) : getOperatorPrecedence(operator) > getOperatorPrecedence(right.operator);
    const lo = leftParen ? "(" : "", lc = leftParen ? ")" : "", ro = rightParen ? "(" : "", rc = rightParen ? ")" : "";
    if (operator === "/") return el("span", "fraction", [el("span", "top", [lo, render(left), lc]), el("span", "bottom", [ro, render(right), rc])]);
    if (operator === "^") return el("span", "", [lo, render(left), lc, el("sup", "", [ro, render(right), rc])]);
    if (operator === "*") { if (needsExplicitMultiplySign(left, right, leftParen, rightParen)) return el("span", "", [lo, render(left), lc, " × ", ro, render(right), rc]); return el("span", "", [lo, render(left), lc, ro, render(right), rc]); }
    if (operator === ".") return el("span", "", [lo, render(left), lc, " · ", ro, render(right), rc]);
    if (operator === ",") return el("span", "", [render(left), ", ", render(right)]);
    if (operator === "mod") return el("span", "", [lo, render(left), lc, " mod ", ro, render(right), rc]);
    if (operator === "div") return el("span", "", [lo, render(left), lc, " ÷ ", ro, render(right), rc]);
    const rel = RELATIONAL_SYMBOL[operator]; if (rel) return el("span", "", [lo, render(left), lc, ` ${rel} `, ro, render(right), rc]);
    return el("span", "", [lo, render(left), lc, ` ${operator} `, ro, render(right), rc]);
}

function renderSubscript(node: SubscriptExpressionNode) { return el("span", "", [render(node.base), el("sub", "", [render(node.subscript)])]); }
function renderSubSuperscript(node: SubSuperscriptExpressionNode) { return el("span", "subsuperscript", [render(node.base), el("span", "scripts", [el("sup", "", [render(node.superscript)]), el("sub", "", [render(node.subscript)])])]); }
function renderCall(node: CallExpressionNode) { return el("span", "", [render(node.callee), "(", ...interleave(node.args.map(render), ", "), ")"]); }
function renderVectorName(node: VectorNameNode) { return el("span", "vector-name", [render(node.identifier), el("span", "vector-arrow", ["⃗"])]); }
function renderMatrix(node: MatrixNode) { return el("span", "matrix", node.rows.map(row => el("span", "matrix-row", row.map(cell => el("span", "matrix-cell", [render(cell)]))))); }
function renderIndex(node: IndexExpressionNode) { return el("span", "", [render(node.base), el("sub", "", [render(node.index)])]); }
function renderAbsoluteValue(node: AbsoluteValueNode) { return (node.expr.type === "VectorName" || node.expr.type === "Matrix") ? el("span", "", ["‖", render(node.expr), "‖"]) : el("span", "", ["|", render(node.expr), "|"]); }
function renderFactorial(node: FactorialExpressionNode) { return el("span", "", [render(node.base), "!"]); }
function renderDerivative(node: DerivativeNode) { return el("span", "", [render(node.base), "′".repeat(node.order)]); }
function renderPiecewise(node: PiecewiseNode) { return el("span", "piecewise", node.cases.map(c => el("span", "piecewise-row", [el("span", "piecewise-expr", [render(c.expr)]), el("span", "piecewise-cond", [render(c.condition)])]))); }
function renderSet(node: SetNode) { return el("span", "", ["{", ...interleave(node.elements.map(render), ", "), "}"]); }

function renderControl(node: ControlExpressionNode): HTMLElement {
    const name = node.name;
    switch (name) {
        case "sqrt": return el("span", "sqrt", [render(node.args[0])]);
        case "int": return renderIntegral(node, "∫");
        case "oint": return renderIntegral(node, "∮");
        case "iint": return renderIntegral(node, "∬");
        case "iiint": return renderIntegral(node, "∭");
        case "S": return renderBigOp(node, "Σ");
        case "P": return renderBigOp(node, "Π");
        case "lim": return el("span", "integral", [el("span", "opstack", [el("span", "top", [""]), el("span", "op", ["lim"]), el("span", "bottom", [render(node.args[0])])]), el("span", "integral-body", [render(node.args[1])])]);
        case "floor": return el("span", "", ["⌊", render(node.args[0]), "⌋"]);
        case "ceil": return el("span", "", ["⌈", render(node.args[0]), "⌉"]);
        case "bar": return el("span", "overline", [render(node.args[0])]);
        case "hat": return el("span", "hat", [render(node.args[0])]);
        case "tilde": return el("span", "tilde", [render(node.args[0])]);
        case "ul": return el("span", "underline", [render(node.args[0])]);
        case "cancel": return el("span", "cancel", [render(node.args[0])]);
        case "inner": return el("span", "", ["⟨", ...interleave(node.args.map(render), ", "), "⟩"]);
        case "binom": return el("span", "", ["(", el("span", "fraction", [el("span", "top", [render(node.args[0])]), el("span", "bottom", [render(node.args[1])])]), ")"]);
        case "eval": return el("span", "", [render(node.args[0]), el("span", "eval-bar", ["|"]), el("sub", "", [render(node.args[1])])]);
        case "ubrace": return el("span", "underbrace", [el("span", "ubrace-content", [render(node.args[0])]), el("span", "ubrace-label", [render(node.args[1])])]);
        case "obrace": return el("span", "overbrace", [el("span", "obrace-label", [render(node.args[1])]), el("span", "obrace-content", [render(node.args[0])])]);
        case "piecewise": { const cases: {expr:MathNode;condition:MathNode}[] = []; for (let i=0;i+1<node.args.length;i+=2) cases.push({expr:node.args[i],condition:node.args[i+1]}); return renderPiecewise({type:"Piecewise",cases}); }
        case "+": case "*": return renderBigOp(node, name === "+" ? "Σ" : "Π");
        default: return el("span", "", [resolveGlyph(name), "(", ...interleave(node.args.map(render), ", "), ")"]);
    }
}

function renderIntegral(node: ControlExpressionNode, sym: string) { return el("span", "integral", [el("span", "opstack", [el("span", "top", [render(node.args[1])]), el("span", "op large-operator", [sym]), el("span", "bottom", [render(node.args[0])])]), el("span", "integral-body", [render(node.args[2])])]); }
function renderBigOp(node: ControlExpressionNode, sym: string) { return el("span", "integral", [el("span", "opstack", [el("span", "top", [render(node.args[1])]), el("span", "op large-operator", [sym]), el("span", "bottom", [render(node.args[0])])]), el("span", "integral-body", [render(node.args[2])])]); }

export function renderMath(ast: MathNode): HTMLElement { return el("span", "native-math", [render(ast)]); }
function interleave(arr: HTMLElement[], sep: string): (Node | string)[] { const r: (Node|string)[] = []; arr.forEach((item, i) => { if (i > 0) r.push(sep); r.push(item); }); return r; }
