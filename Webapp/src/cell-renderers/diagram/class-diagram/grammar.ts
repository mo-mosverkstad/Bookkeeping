import { PEGParser } from "../../../engine/PEGParser.ts";
import type { Grammar } from "../../../engine/types.ts";
import type { ClassDiagramAST, ClassDef, ClassRelation } from "./types.ts";

const grammar: Grammar = {
    Diagram: {
        peg: { type: "sequence", parts: [
            { type: "regex", regex: /^classDiagram/, name: "keyword" },
            { type: "rule", name: "Statements" },
        ] },
        build([, stmts]: [string, (ClassDef | ClassRelation)[]]): ClassDiagramAST {
            const classes: ClassDef[] = [];
            const relations: ClassRelation[] = [];
            const classMap = new Map<string, ClassDef>();
            for (const s of stmts) {
                if (!s) continue;
                if ("members" in s) { classMap.set(s.name, s); classes.push(s); }
                else relations.push(s);
            }
            // Ensure all referenced classes exist
            for (const r of relations) {
                for (const name of [r.from, r.to]) {
                    if (!classMap.has(name)) { const c = { name, members: [], methods: [] }; classMap.set(name, c); classes.push(c); }
                }
            }
            return { classes, relations };
        },
    },
    Statements: { peg: { type: "repeat", expr: { type: "rule", name: "Statement" } } },
    Statement: { peg: { type: "choice", options: [{ type: "rule", name: "Relation" }, { type: "rule", name: "MemberLine" }, { type: "rule", name: "BlankLine" }] } },
    BlankLine: { peg: { type: "regex", regex: /^[\t ]*/, name: "blank" }, build(): null { return null as any; } },
    Relation: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "ClassName" },
            { type: "rule", name: "RelArrow" },
            { type: "rule", name: "ClassName" },
            { type: "rule", name: "OptLabel" },
        ] },
        build([from, type, to, label]: [string, string, string, string]): ClassRelation {
            return { from, to, type: type as ClassRelation["type"], label };
        },
    },
    MemberLine: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "ClassName" },
            { type: "literal", value: ":" },
            { type: "regex", regex: /^[^\n]*/, name: "member" },
        ] },
        build([name, , member]: [string, string, string]): ClassDef {
            const m = member.trim();
            const isMethod = m.includes("(");
            return { name, members: isMethod ? [] : [m], methods: isMethod ? [m] : [] };
        },
    },
    ClassName: { peg: { type: "regex", regex: /^[A-Za-z][A-Za-z0-9_]*/, name: "class name" } },
    RelArrow: {
        peg: { type: "regex", regex: /^(<\|--|--\|>|\*--|\*--|o--|--o|-->|<--|\.\.>|<\.\.)/, name: "relation" },
        build(v: string): string {
            if (v.includes("|")) return "inheritance";
            if (v.includes("*")) return "composition";
            if (v.includes("o")) return "aggregation";
            if (v.includes("..")) return "dependency";
            return "association";
        },
    },
    OptLabel: { peg: { type: "regex", regex: /^([^\n]*)/, name: "label" }, build(v: string): string { return v.replace(/^[\s:]*/, "").trim(); } },
};

const parser = new PEGParser(grammar, { skip: /^([ \t]+|\r?\n)+/ });
export function parseClassDiagram(source: string): ClassDiagramAST { return parser.parse("Diagram", source) as ClassDiagramAST; }
