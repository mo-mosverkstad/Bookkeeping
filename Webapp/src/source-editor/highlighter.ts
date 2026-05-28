/**
 * Syntax highlighter for the source code editor.
 *
 * Uses the overlay technique: a transparent <textarea> sits over a <pre>
 * that contains the highlighted HTML. The <pre> mirrors the textarea content
 * with token spans applied.
 *
 * Each syntax type provides a list of TokenRule objects. Rules are tried in
 * order; the first match wins. Unmatched text is emitted as plain text.
 */

export interface TokenRule {
    name: string;   // CSS class suffix: "keyword", "operator", "string", etc.
    pattern: RegExp; // must have the 'y' (sticky) flag
}

export type SyntaxType = "math" | "chemistry" | "geometry" | "physics" | "table-source" | "graph-source" | "text";

// ── Token rule sets per syntax ────────────────────────────────────────────────

const MATH_RULES: TokenRule[] = [
    { name: "comment",  pattern: /\/\/[^\n]*/y },
    { name: "control",  pattern: /\\[a-zA-Z][a-zA-Z0-9]*/y },
    { name: "number",   pattern: /[0-9]+(\.[0-9]*)?/y },
    { name: "operator", pattern: /[+\-*/^=<>!~:.|]/y },
    { name: "bracket",  pattern: /[()[\]{}]/y },
    { name: "ident",    pattern: /[a-zA-Z_][a-zA-Z0-9_]*/y },
];

const CHEMISTRY_RULES: TokenRule[] = [
    { name: "comment",  pattern: /\/\/[^\n]*/y },
    { name: "keyword",  pattern: /\b(Reaction|cond|DeltaH|DeltaG|DeltaS|Ka|Atom|Bond|Group|Ion)\b/y },
    { name: "element",  pattern: /[A-Z][a-z]?/y },
    { name: "number",   pattern: /[0-9]+(\.[0-9]*)?/y },
    { name: "arrow",    pattern: /<=>|<->|-->|->/y },
    { name: "operator", pattern: /[+\-*/^=()[\]{}|]/y },
];

const GEOMETRY_RULES: TokenRule[] = [
    { name: "comment",  pattern: /#[^\n]*/y },
    { name: "keyword",  pattern: /\b(System|Point|Segment|Line|Ray|Arrow|Angle|Parallel|Perpendicular|Intersection|Midpoint|Triangle|Quadrilateral|Polygon|Circle|Ellipse|Arc|Plane|Hyperplane|Axis|Origin|Graph|Geodesic|Curvature)\b/y },
    { name: "number",   pattern: /[0-9]+(\.[0-9]*)?/y },
    { name: "operator", pattern: /[=(),]/y },
    { name: "ident",    pattern: /[A-Za-z][A-Za-z0-9_]*/y },
];

const PHYSICS_RULES: TokenRule[] = [
    { name: "comment",  pattern: /#[^\n]*/y },
    { name: "keyword",  pattern: /\b(Body|Force|Velocity|Acceleration|AngularVelocity|AngularAcceleration|Torque|Fixed|Roller|Contact|String|Spring|Damper|Frame|Inertial|EOM|mass|moment)\b/y },
    { name: "control",  pattern: /\\[a-zA-Z][a-zA-Z0-9]*/y },
    { name: "number",   pattern: /[0-9]+(\.[0-9]*)?/y },
    { name: "operator", pattern: /[=(),]/y },
    { name: "ident",    pattern: /[A-Za-z][A-Za-z0-9_]*/y },
];

const TABLE_SOURCE_RULES: TokenRule[] = [
    { name: "comment",  pattern: /#[^\n]*/y },
    { name: "directive", pattern: /@(table|columns|types)\b/y },
    { name: "type-id",  pattern: /\b(text|math|chemistry|geometry|physics)\b/y },
    { name: "sep",      pattern: /\|/y },
    { name: "colon",    pattern: /:/y },
    { name: "comma",    pattern: /,/y },
    { name: "ident",    pattern: /[A-Za-z][A-Za-z0-9_ -]*/y },
];

const GRAPH_SOURCE_RULES: TokenRule[] = [
    { name: "comment",  pattern: /#[^\n]*/y },
    { name: "directive", pattern: /@(graph|view)\b/y },
    { name: "keyword",  pattern: /\b(node|edge|style)\b/y },
    { name: "view-type", pattern: /\b(flow|spatial|relation|sequence)\b/y },
    { name: "arrow",    pattern: /->/y },
    { name: "string",   pattern: /"[^"]*"/y },
    { name: "ident",    pattern: /[A-Za-z][A-Za-z0-9_-]*/y },
];

const RULES: Record<SyntaxType, TokenRule[]> = {
    "math":         MATH_RULES,
    "chemistry":    CHEMISTRY_RULES,
    "geometry":     GEOMETRY_RULES,
    "physics":      PHYSICS_RULES,
    "table-source": TABLE_SOURCE_RULES,
    "graph-source": GRAPH_SOURCE_RULES,
    "text":         [],
};

// ── Highlighter ───────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Tokenise `text` using the rules for `syntaxType` and return highlighted HTML.
 * Each token is wrapped in <span class="hl-{name}">. Unmatched characters are
 * emitted as escaped plain text.
 */
export function highlight(text: string, syntaxType: SyntaxType): string {
    const rules = RULES[syntaxType];
    if (rules.length === 0) return escapeHtml(text);

    let pos = 0;
    let out = "";

    while (pos < text.length) {
        let matched = false;
        for (const rule of rules) {
            rule.pattern.lastIndex = pos;
            const m = rule.pattern.exec(text);
            if (m && m.index === pos) {
                out += `<span class="hl-${rule.name}">${escapeHtml(m[0])}</span>`;
                pos += m[0].length;
                matched = true;
                break;
            }
        }
        if (!matched) {
            // Emit one character as plain text
            out += escapeHtml(text[pos]);
            pos++;
        }
    }

    return out;
}
