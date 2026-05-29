import { PEGParser } from "../../../engine/PEGParser.ts";
import type { Grammar } from "../../../engine/types.ts";
import type { SequenceAST, SeqMessage } from "./types.ts";

const grammar: Grammar = {
    Diagram: {
        peg: { type: "sequence", parts: [
            { type: "regex", regex: /^sequenceDiagram/, name: "keyword" },
            { type: "rule", name: "Statements" },
        ] },
        build([, stmts]: [string, SeqMessage[]]): SequenceAST {
            const participants = new Set<string>();
            for (const m of stmts) { participants.add(m.from); participants.add(m.to); }
            return { participants: [...participants], messages: stmts };
        },
    },
    Statements: {
        peg: { type: "repeat", expr: { type: "rule", name: "Message" } },
    },
    Message: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Participant" },
            { type: "rule", name: "Arrow" },
            { type: "rule", name: "Participant" },
            { type: "literal", value: ":" },
            { type: "rule", name: "Label" },
        ] },
        build([from, arrow, to, , label]: [string, string, string, string, string]): SeqMessage {
            const style = arrow.includes("--") ? "dashed" : arrow.includes("x") ? "cross" : arrow.includes(")") ? "open" : "solid";
            return { from, to, label: label.trim(), arrow: style };
        },
    },
    Participant: { peg: { type: "regex", regex: /^[a-zA-Z][a-zA-Z0-9_ ]*[a-zA-Z0-9_]|^[a-zA-Z]/, name: "participant" } },
    Arrow: { peg: { type: "regex", regex: /^(->>|-->>|-x|--x|-\)|--\))/, name: "arrow" } },
    Label: { peg: { type: "regex", regex: /^[^\n]*/, name: "label" } },
};

const parser = new PEGParser(grammar, { skip: /^([ \t]+|\r?\n)+/ });

export function parseSequence(source: string): SequenceAST {
    return parser.parse("Diagram", source) as SequenceAST;
}
