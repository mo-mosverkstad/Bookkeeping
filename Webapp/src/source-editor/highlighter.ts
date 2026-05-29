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

export type SyntaxType = "math" | "chemistry" | "geometry" | "physics" | "table-source" | "graph-source" | "text" | "rich";

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
    "rich":         [], // handled specially by highlightRich
};

// ── Highlighter ───────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightWithRules(text: string, rules: TokenRule[]): string {
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
        if (!matched) { out += escapeHtml(text[pos]); pos++; }
    }
    return out;
}

const EMBED_TAG_TO_RULES: Record<string, TokenRule[]> = {
    "math": MATH_RULES,
    "chem": CHEMISTRY_RULES,
    "geom": GEOMETRY_RULES,
    "phys": PHYSICS_RULES,
};

function highlightRich(text: string): string {
    // Match embedding tags: $math{...}, $chem{...}, $geom{...}, $phys{...}
    const re = /\$(math|chem|geom|phys)\{/g;
    let out = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
        // Plain text before this embedding
        if (match.index > lastIndex) {
            out += escapeHtml(text.slice(lastIndex, match.index));
        }
        // Find balanced closing brace
        let depth = 1, i = match.index + match[0].length;
        while (i < text.length && depth > 0) {
            if (text[i] === "{") depth++;
            else if (text[i] === "}") depth--;
            if (depth > 0) i++;
        }
        if (depth !== 0) { out += escapeHtml(match[0]); lastIndex = match.index + match[0].length; continue; }

        const tag = match[1];
        const content = text.slice(match.index + match[0].length, i);
        // Tag: $math{
        out += `<span class="hl-embed-tag">${escapeHtml("$" + tag + "{")}</span>`;
        // Content highlighted
        const rules = EMBED_TAG_TO_RULES[tag] || [];
        out += highlightWithRules(content, rules);
        // Closing brace
        out += `<span class="hl-embed-tag">}</span>`;
        lastIndex = i + 1;
        re.lastIndex = lastIndex;
    }

    if (lastIndex < text.length) {
        out += escapeHtml(text.slice(lastIndex));
    }

    return out;
}

/**
 * Tokenise `text` using the rules for `syntaxType` and return highlighted HTML.
 * Each token is wrapped in <span class="hl-{name}">. Unmatched characters are
 * emitted as escaped plain text.
 */
export function highlight(text: string, syntaxType: SyntaxType): string {
    if (syntaxType === "rich") return highlightRich(text);
    const rules = RULES[syntaxType];
    return highlightWithRules(text, rules);
}
