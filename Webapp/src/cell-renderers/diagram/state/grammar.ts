import { PEGParser } from "../../../engine/PEGParser.ts";
import type { Grammar } from "../../../engine/types.ts";
import type { StateDiagramAST, StateTransition } from "./types.ts";

const grammar: Grammar = {
    Diagram: {
        peg: { type: "sequence", parts: [
            { type: "regex", regex: /^stateDiagram(-v2)?/, name: "keyword" },
            { type: "regex", regex: /^(\r?\n)*/, name: "nl" },
            { type: "rule", name: "Transitions" },
        ] },
        build([, , transitions]: [string, string, StateTransition[]]): StateDiagramAST {
            const stateSet = new Set<string>();
            for (const t of transitions) { stateSet.add(t.from); stateSet.add(t.to); }
            return { states: [...stateSet].map(id => ({ id, label: id === "[*]" ? "●" : id })), transitions };
        },
    },
    Transitions: { peg: { type: "repeat", expr: { type: "rule", name: "TransitionLine" } } },
    TransitionLine: { peg: { type: "sequence", parts: [
        { type: "regex", regex: /^(\r?\n)*/, name: "nl" },
        { type: "rule", name: "Transition" },
    ] }, build([, t]: [string, StateTransition]): StateTransition { return t; } },
    Transition: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "StateId" },
            { type: "literal", value: "-->" },
            { type: "rule", name: "StateId" },
            { type: "rule", name: "OptLabel" },
        ] },
        build([from, , to, label]: [string, string, string, string]): StateTransition {
            return { from, to, label };
        },
    },
    StateId: { peg: { type: "regex", regex: /^\[\*\]|^[a-zA-Z][a-zA-Z0-9_]*/, name: "state" } },
    OptLabel: { peg: { type: "regex", regex: /^:[^\n]*|^/, name: "label" }, build(v: string): string { return v.replace(/^[\s:]*/, "").trim(); } },
};

const parser = new PEGParser(grammar, { skip: /^[ \t]+/ });
export function parseStateDiagram(source: string): StateDiagramAST { return parser.parse("Diagram", source) as StateDiagramAST; }
