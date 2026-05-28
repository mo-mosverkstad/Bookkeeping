/**
 * Chemistry PEG grammar.
 *
 * Architecture principle (same as geometry/grammar.ts):
 *   - PEGParser rules parse ALL structure.
 *   - build() functions ONLY assemble AST nodes from already-parsed data.
 *   - No string splitting or re-parsing inside build().
 *
 * Skip pattern: spaces and tabs only — newlines are statement separators,
 * and no-whitespace rules (Count, State) are handled by making Element,
 * ParenGroup, BracketGroup atomic regexes that capture symbol+count in
 * one token, preventing skip from firing between them.
 *
 * Grammar:
 *   Program        = Statement (\n Statement)*
 *   Statement      = ThermoStmt | StructStmt | ReactionStmt | BlankOrComment
 *   ReactionStmt   = "Reaction(" Side Arrow Side ("," Conditions)? ")"
 *   Side           = Term ("+" Term)*
 *   Term           = Coeff? Species
 *   Species        = ChargedSpecies | Particle | BareCompound
 *   ChargedSpecies = "{" BareCompound "," Charge "}" State?
 *   BareCompound   = Group+ State?
 *   Group          = BracketGroup | ParenGroup | ElementGroup
 *   BracketGroup   = "[" Group+ "]" Count?
 *   ParenGroup     = "(" Group+ ")" Count?
 *   ElementGroup   = /^(\^[0-9]+(_[0-9]+)?)?[A-Z][a-z]*[0-9]* /  (atomic — no skip inside)
 *   State          = /^\((s|l|g|aq)\)/                            (atomic — no skip inside)
 *   Charge         = /^[0-9]*[+-]/                                (atomic — no skip inside)
 *   Coeff          = /^[0-9]+(?=[A-Z{\\^npe])/                   (lookahead — no skip)
 *   Arrow          = "<=>" | "<->" | "-->" | "->"
 *   Conditions     = "[" CondItem ("," CondItem)* "]"
 *   CondItem       = Identifier "=" MathRaw | Identifier
 *   ThermoStmt     = ThermoKey "=" MathRaw
 *   StructStmt     = AtomStmt | BondStmt | GroupStmt
 *   AtomStmt       = "Atom(" Label ")"
 *   BondStmt       = "Bond(" Label "," Label "," BondType ")"
 *   GroupStmt      = "Group(" Label "," FuncGroup ")"
 *   BlankOrComment = /^(?:#[^\n]*|\/\/[^\n]*|[ \t]+)/
 *
 * Note on Count/State/Charge atomicity:
 *   ElementGroup captures symbol+count as one regex token so the PEG skip
 *   pattern cannot fire between the element letter and its subscript digit.
 *   State and Charge are likewise single atomic regexes.
 *   ParenGroup/BracketGroup capture their closing ")" or "]" + count via
 *   a dedicated CountSuffix atomic regex.
 */

import { PEGParser } from "../../engine/PEGParser.ts";
import type { Grammar } from "../../engine/types.ts";
import { parser as mathParser } from "../math/grammar.ts";
import type { MathNode } from "../math/types.ts";
import type {
    ChemistryProgram, ChemStatement,
    ReactionNode, ReactionTerm, SpeciesNode,
    CompoundNode, ChargedSpeciesNode, ParticleNode,
    GroupNode, ElementGroup, ParenGroup, BracketGroup,
    IsotopeNode, ChargeNode, ConditionNode, CondItemNode,
    StateSymbol, ArrowType, ParticleKind,
    ThermoNode, ThermoKey,
    AtomDeclNode, BondDeclNode, BondType, GroupDeclNode,
} from "./types.ts";

// ── Math delegation ───────────────────────────────────────────────────────────

function math(src: string): MathNode {
    return mathParser.parse("Expression", src.trim()) as MathNode;
}

// ── Particle map ──────────────────────────────────────────────────────────────

const PARTICLE_REGEX = /^(\\a|\\b-|\\b\+|e-|e\+|n(?![a-zA-Z])|p(?![a-zA-Z]))/;

const PARTICLE_KIND: Record<string, ParticleKind> = {
    "\\a": "alpha", "\\b-": "beta-", "\\b+": "beta+", "\\g": "gamma",
    "e-": "e-", "e+": "e+", "n": "n", "p": "p",
};

// ── Grammar ───────────────────────────────────────────────────────────────────

const grammar: Grammar = {

    // ── Top level ─────────────────────────────────────────────────────────────

    Program: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Statement" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "regex", regex: /^\r?\n/, name: "newline" },
                { type: "rule", name: "Statement" },
            ] } },
        ] },
        build([first, rest]: [ChemStatement | null, [string, ChemStatement | null][]]): ChemistryProgram {
            const statements: ChemStatement[] = [];
            if (first !== null) statements.push(first);
            for (const [, s] of rest) if (s !== null) statements.push(s);
            return { type: "ChemistryProgram", statements };
        },
    },

    Statement: {
        peg: { type: "choice", options: [
            { type: "rule", name: "ThermoStmt" },
            { type: "rule", name: "StructStmt" },
            { type: "rule", name: "ReactionStmt" },
            { type: "rule", name: "BlankOrComment" },
        ] },
    },

    BlankOrComment: {
        peg: { type: "regex", regex: /^(?:#[^\n]*|\/\/[^\n]*|[ \t]+)/, name: "blank or comment" },
        build(): null { return null; },
    },

    // ── Reaction ──────────────────────────────────────────────────────────────

    ReactionStmt: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "Reaction(" },
            { type: "rule", name: "Side" },
            { type: "rule", name: "Arrow" },
            { type: "rule", name: "Side" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "literal", value: "," },
                { type: "rule", name: "Conditions" },
            ] } },
            { type: "literal", value: ")" },
        ] },
        build([, lhs, arrow, rhs, condParts]: [string, ReactionTerm[], ArrowType, ReactionTerm[], [string, ConditionNode][], string]): ReactionNode {
            const conditions = condParts.length > 0 ? condParts[0][1] : undefined;
            return { type: "Reaction", lhs, arrow, rhs, conditions };
        },
    },

    Arrow: {
        peg: { type: "choice", options: [
            { type: "literal", value: "<=>" },
            { type: "literal", value: "<->" },
            { type: "literal", value: "-->" },
            { type: "literal", value: "->" },
        ] },
        build(v: string): ArrowType { return v as ArrowType; },
    },

    Side: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Term" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "literal", value: "+" },
                { type: "rule", name: "Term" },
            ] } },
        ] },
        build([first, rest]: [ReactionTerm, [string, ReactionTerm][]]): ReactionTerm[] {
            const terms = [first];
            for (const [, t] of rest) terms.push(t);
            return terms;
        },
    },

    Term: {
        peg: { type: "sequence", parts: [
            // Coeff: integer immediately before a species-starting character, no skip
            { type: "regex", regex: /^[0-9]+(?=[A-Z{\\^npe])/, name: "coefficient" },
            { type: "rule", name: "Species" },
        ] },
        build([coeff, species]: [string, SpeciesNode]): ReactionTerm {
            return { coeff: coeff ? parseInt(coeff) : 1, species };
        },
    },

    // Term with optional coefficient — wrap Term to make coeff optional
    // The regex /^[0-9]+(?=[A-Z{\\^npe])/ will fail (return empty string via repeat)
    // if no digit present. Use a choice: CoeffTerm | BareTermNoCoeff
    // Actually: use repeat(0 or 1) via a choice trick — regex returns "" on no match
    // Simpler: make Coeff a choice of regex | empty-sequence
    // We handle this by making Term use a choice:

    // ── Species ───────────────────────────────────────────────────────────────

    Species: {
        peg: { type: "choice", options: [
            { type: "rule", name: "ChargedSpecies" },
            { type: "rule", name: "Particle" },
            { type: "rule", name: "BareCompound" },
        ] },
    },

    ChargedSpecies: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "{" },
            { type: "rule", name: "BareCompound" },
            { type: "literal", value: "," },
            { type: "rule", name: "Charge" },
            { type: "literal", value: "}" },
            // State is atomic regex — tried immediately after "}" with no skip
            { type: "regex", regex: /^\((s|l|g|aq)\)/, name: "state" },
        ] },
        build([, compound, , charge, , stateRaw]: [string, CompoundNode, string, ChargeNode, string, string]): ChargedSpeciesNode {
            const state = stateRaw ? stateRaw.slice(1, -1) as StateSymbol : undefined;
            return { type: "ChargedSpecies", compound, charge, state };
        },
    },

    // Particle: atomic regex — backslash particles and bare n/p/e-/e+
    Particle: {
        peg: { type: "regex", regex: PARTICLE_REGEX, name: "particle" },
        build(v: string): ParticleNode {
            return { type: "Particle", kind: PARTICLE_KIND[v] ?? v as ParticleKind };
        },
    },

    BareCompound: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Group" },
            { type: "repeat", expr: { type: "rule", name: "Group" } },
            // State: atomic regex immediately after last group
            { type: "regex", regex: /^\((s|l|g|aq)\)/, name: "state" },
        ] },
        build([first, rest, stateRaw]: [GroupNode, GroupNode[], string]): CompoundNode {
            const groups = [first, ...rest];
            const state = stateRaw ? stateRaw.slice(1, -1) as StateSymbol : undefined;
            return { type: "Compound", groups, state };
        },
    },

    // ── Groups ────────────────────────────────────────────────────────────────

    Group: {
        peg: { type: "choice", options: [
            { type: "rule", name: "BracketGroup" },
            { type: "rule", name: "ParenGroup" },
            { type: "rule", name: "ElementGroup" },
        ] },
    },

    // BracketGroup: "[" Group+ "]" Count?
    // The "]" and count are captured atomically to prevent skip between ] and digit
    BracketGroup: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "[" },
            { type: "rule", name: "Group" },
            { type: "repeat", expr: { type: "rule", name: "Group" } },
            // "]" + optional count as one atomic token
            { type: "regex", regex: /^\][0-9]*/, name: "closing bracket" },
        ] },
        build([, first, rest, closingRaw]: [string, GroupNode, GroupNode[], string]): BracketGroup {
            const inner = [first, ...rest];
            const countStr = closingRaw.slice(1); // strip "]"
            return { type: "BracketGroup", inner, count: countStr ? parseInt(countStr) : 1 };
        },
    },

    // ParenGroup: "(" Group+ ")" Count?
    // BUT must not match state symbols like (s), (l), (g), (aq).
    // State symbols are lowercase-only; element symbols are uppercase.
    // A ParenGroup always contains at least one Group which starts with
    // an uppercase letter, "[", or "^" — so the lookahead is implicit:
    // if the content starts with a lowercase state letter, Group will fail
    // and ParenGroup will fail, leaving State to match.
    ParenGroup: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "(" },
            { type: "rule", name: "Group" },
            { type: "repeat", expr: { type: "rule", name: "Group" } },
            // ")" + optional count as one atomic token
            { type: "regex", regex: /^\)[0-9]*/, name: "closing paren" },
        ] },
        build([, first, rest, closingRaw]: [string, GroupNode, GroupNode[], string]): ParenGroup {
            const inner = [first, ...rest];
            const countStr = closingRaw.slice(1); // strip ")"
            return { type: "ParenGroup", inner, count: countStr ? parseInt(countStr) : 1 };
        },
    },

    // ElementGroup: atomic regex capturing isotope prefix + symbol + count
    // Pattern: (^integer(_integer)?)? [A-Z][a-z]* [0-9]*
    // All in one token — no skip can fire inside.
    ElementGroup: {
        peg: { type: "regex", regex: /^(\^[0-9]+(_[0-9]+)?)?[A-Z][a-z]*[0-9]*/, name: "element" },
        build(v: string): ElementGroup {
            let rest = v;
            let isotope: IsotopeNode | undefined;
            // Parse isotope prefix if present
            const isoMatch = /^\^([0-9]+)(?:_([0-9]+))?/.exec(rest);
            if (isoMatch) {
                isotope = { type: "Isotope", mass: parseInt(isoMatch[1]), atomic: isoMatch[2] ? parseInt(isoMatch[2]) : undefined };
                rest = rest.slice(isoMatch[0].length);
            }
            // Parse element symbol
            const symMatch = /^[A-Z][a-z]*/.exec(rest)!;
            const symbol = symMatch[0];
            rest = rest.slice(symbol.length);
            // Parse count
            const count = rest ? parseInt(rest) : 1;
            const g: ElementGroup = { type: "ElementGroup", symbol, count };
            if (isotope) g.isotope = isotope;
            return g;
        },
    },

    // Charge: atomic regex — integer? followed by + or -
    Charge: {
        peg: { type: "regex", regex: /^[0-9]*[+-]/, name: "charge" },
        build(v: string): ChargeNode {
            const sign = v[v.length - 1] as "+" | "-";
            const magStr = v.slice(0, -1);
            return { type: "Charge", magnitude: magStr ? parseInt(magStr) : 1, sign };
        },
    },

    // ── Conditions ────────────────────────────────────────────────────────────

    Conditions: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "cond(" },
            { type: "rule", name: "CondItem" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "literal", value: "," },
                { type: "rule", name: "CondItem" },
            ] } },
            { type: "literal", value: ")" },
        ] },
        build([, first, rest]: [string, CondItemNode, [string, CondItemNode][], string]): ConditionNode {
            const items = [first];
            for (const [, item] of rest) items.push(item);
            return { type: "Condition", items };
        },
    },

    CondItem: {
        peg: { type: "choice", options: [
            // key=value — try first
            { type: "sequence", parts: [
                { type: "regex", regex: /^[A-Za-z][A-Za-z0-9]*/, name: "key" },
                { type: "literal", value: "=" },
                { type: "rule", name: "CondValue" },
            ] },
            // bare flag
            { type: "regex", regex: /^[A-Za-z][A-Za-z0-9]*/, name: "flag" },
        ] },
        build(node: any): CondItemNode {
            if (Array.isArray(node)) {
                const [key, , value] = node as [string, string, MathNode];
                return { key, value };
            }
            return { key: node as string };
        },
    },

    // CondValue: everything up to next top-level "," or ")"
    CondValue: {
        peg: { type: "regex", regex: /^[^,)]+/, name: "condition value" },
        build(v: string): MathNode { return math(v); },
    },

    // ── Thermodynamic statements ──────────────────────────────────────────────

    ThermoStmt: {
        peg: { type: "sequence", parts: [
            { type: "regex", regex: /^(?:DeltaH|DeltaG|DeltaS|Ka|Ksp|Ea|Kb|Kw)/, name: "thermo key" },
            { type: "literal", value: "=" },
            { type: "rule", name: "LineRest" },
        ] },
        build([key, , value]: [string, string, MathNode]): ThermoNode {
            return { type: "Thermo", key: key as ThermoKey, value };
        },
    },

    // ── Structural statements ─────────────────────────────────────────────────

    StructStmt: {
        peg: { type: "choice", options: [
            { type: "rule", name: "AtomStmt" },
            { type: "rule", name: "BondStmt" },
            { type: "rule", name: "GroupStmt" },
        ] },
    },

    AtomStmt: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "Atom(" },
            { type: "rule", name: "Label" },
            { type: "literal", value: ")" },
        ] },
        build([, label]: [string, string]): AtomDeclNode {
            return { type: "AtomDecl", label };
        },
    },

    BondStmt: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "Bond(" },
            { type: "rule", name: "Label" },
            { type: "literal", value: "," },
            { type: "rule", name: "Label" },
            { type: "literal", value: "," },
            { type: "rule", name: "BondTypeRule" },
            { type: "literal", value: ")" },
        ] },
        build([, atom1, , atom2, , bondType]: [string, string, string, string, string, BondType]): BondDeclNode {
            return { type: "BondDecl", atom1, atom2, bondType };
        },
    },

    GroupStmt: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "Group(" },
            { type: "rule", name: "Label" },
            { type: "literal", value: "," },
            { type: "rule", name: "FuncGroup" },
            { type: "literal", value: ")" },
        ] },
        build([, atom, , group]: [string, string, string, string]): GroupDeclNode {
            return { type: "GroupDecl", atom, group };
        },
    },

    // ── Shared terminals ──────────────────────────────────────────────────────

    Label: {
        peg: { type: "regex", regex: /^[A-Za-z][A-Za-z0-9]*/, name: "label" },
    },

    BondTypeRule: {
        peg: { type: "regex", regex: /^(?:single|double|triple|aromatic)/, name: "bond type" },
        build(v: string): BondType { return v as BondType; },
    },

    FuncGroup: {
        peg: { type: "regex", regex: /^[A-Z][A-Za-z0-9]*/, name: "functional group" },
    },

    // LineRest: rest of line — used for thermo values
    LineRest: {
        peg: { type: "regex", regex: /^[^\n\r]+/, name: "value" },
        build(v: string): MathNode { return math(v); },
    },
};

// ── Two issues to resolve with optional Coeff and optional State/Charge ───────
//
// 1. Term.Coeff is optional: the regex /^[0-9]+(?=[A-Z{\\^npe])/ will simply
//    fail if no digit is present. We handle this by making Term use a sequence
//    where Coeff is wrapped in a choice with an empty sequence (zero-width match).
//
// 2. BareCompound.State and ChargedSpecies.State are optional: the regex
//    /^\((s|l|g|aq)\)/ will fail if no state present. We handle this the same way.
//
// The grammar above uses these regexes directly in sequences. When a regex rule
// fails in a sequence, the whole sequence fails. To make them optional we need
// to wrap them in a choice with an empty sequence. The grammar is patched below.

// Patch Term to make Coeff optional
(grammar["Term"] as any).peg = { type: "sequence", parts: [
    { type: "choice", options: [
        { type: "regex", regex: /^[0-9]+(?=[A-Z{\\^npe])/, name: "coefficient" },
        { type: "sequence", parts: [] },  // empty = no coefficient
    ] },
    { type: "rule", name: "Species" },
] };
(grammar["Term"] as any).build = ([coeff, species]: [string | any[], SpeciesNode]): ReactionTerm => ({
    coeff: typeof coeff === "string" && coeff ? parseInt(coeff) : 1,
    species,
});

// Patch BareCompound to make State optional
(grammar["BareCompound"] as any).peg = { type: "sequence", parts: [
    { type: "rule", name: "Group" },
    { type: "repeat", expr: { type: "rule", name: "Group" } },
    { type: "choice", options: [
        { type: "regex", regex: /^\((s|l|g|aq)\)/, name: "state" },
        { type: "sequence", parts: [] },
    ] },
] };
(grammar["BareCompound"] as any).build = ([first, rest, stateRaw]: [GroupNode, GroupNode[], string | any[]]): CompoundNode => {
    const groups = [first, ...rest];
    const state = typeof stateRaw === "string" && stateRaw ? stateRaw.slice(1, -1) as StateSymbol : undefined;
    return { type: "Compound", groups, state };
};

// Patch ChargedSpecies to make State optional
(grammar["ChargedSpecies"] as any).peg = { type: "sequence", parts: [
    { type: "literal", value: "{" },
    { type: "rule", name: "BareCompound" },
    { type: "literal", value: "," },
    { type: "rule", name: "Charge" },
    { type: "literal", value: "}" },
    { type: "choice", options: [
        { type: "regex", regex: /^\((s|l|g|aq)\)/, name: "state" },
        { type: "sequence", parts: [] },
    ] },
] };
(grammar["ChargedSpecies"] as any).build = ([, compound, , charge, , stateRaw]: [string, CompoundNode, string, ChargeNode, string, string | any[]]): ChargedSpeciesNode => {
    const state = typeof stateRaw === "string" && stateRaw ? stateRaw.slice(1, -1) as StateSymbol : undefined;
    return { type: "ChargedSpecies", compound, charge, state };
};

// ── Parser instance ───────────────────────────────────────────────────────────

export const parser = new PEGParser(grammar, {
    skip: /^[ \t]+/,  // spaces and tabs only — newlines are statement separators
});

// ── Entry point ───────────────────────────────────────────────────────────────

export function parseChemistry(source: string): ChemistryProgram {
    const normalised = source
        .split(/\r?\n/)
        .map(l => l.trimEnd())
        .filter(l => l.trim().length > 0)
        .join("\n");
    if (!normalised) return { type: "ChemistryProgram", statements: [] };
    return parser.parse("Program", normalised) as ChemistryProgram;
}
