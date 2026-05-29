import { PEGParser } from "../../../engine/PEGParser.ts";
import type { Grammar } from "../../../engine/types.ts";
import type { ERDiagramAST, ERRelation } from "./types.ts";

const grammar: Grammar = {
    Diagram: {
        peg: { type: "sequence", parts: [
            { type: "regex", regex: /^erDiagram/, name: "keyword" },
            { type: "rule", name: "Relations" },
        ] },
        build([, rels]: [string, ERRelation[]]): ERDiagramAST {
            const entities = new Set<string>();
            for (const r of rels) { entities.add(r.from); entities.add(r.to); }
            return { entities: [...entities].map(name => ({ name })), relations: rels };
        },
    },
    Relations: { peg: { type: "repeat", expr: { type: "rule", name: "Relation" } } },
    Relation: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "EntityName" },
            { type: "rule", name: "Cardinality" },
            { type: "rule", name: "EntityName" },
            { type: "literal", value: ":" },
            { type: "rule", name: "Label" },
        ] },
        build([from, card, to, , label]: [string, { fromCard: string; toCard: string }, string, string, string]): ERRelation {
            return { from, to, fromCard: card.fromCard, toCard: card.toCard, label: label.trim() };
        },
    },
    EntityName: { peg: { type: "regex", regex: /^[A-Z][A-Z0-9_-]*/, name: "entity" } },
    Cardinality: {
        peg: { type: "regex", regex: /^(\|\|--|--\|\||o\{--|--o\{|\}\|--|--\}\||\|o--|--\|o|\|\|\.\.|\.\.\|\|)/, name: "cardinality" },
        build(v: string): { fromCard: string; toCard: string } {
            return { fromCard: v.slice(0, 2), toCard: v.slice(-2) };
        },
    },
    Label: { peg: { type: "regex", regex: /^[^\n]*/, name: "label" } },
};

const parser = new PEGParser(grammar, { skip: /^([ \t]+|\r?\n)+/ });
export function parseERDiagram(source: string): ERDiagramAST { return parser.parse("Diagram", source) as ERDiagramAST; }
