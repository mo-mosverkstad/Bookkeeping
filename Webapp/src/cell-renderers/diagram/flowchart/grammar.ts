import { PEGParser } from "../../../engine/PEGParser.ts";
import type { Grammar } from "../../../engine/types.ts";
import type { FlowchartAST, FlowStatement, FlowNodeDef, FlowEdge } from "./types.ts";

const grammar: Grammar = {
    Flowchart: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Header" },
            { type: "rule", name: "Statements" },
        ] },
        build([header, statements]: [string, FlowStatement[]]): FlowchartAST {
            return { direction: header as FlowchartAST["direction"], statements };
        },
    },

    Header: {
        peg: { type: "sequence", parts: [
            { type: "regex", regex: /^(flowchart|graph)/, name: "keyword" },
            { type: "rule", name: "Direction" },
        ] },
        build([, dir]: [string, string]): string { return dir; },
    },

    Direction: {
        peg: { type: "regex", regex: /^(TD|TB|LR|RL|BT)/, name: "direction" },
        build(v: string): string { return v === "TB" ? "TD" : v; },
    },

    Statements: {
        peg: { type: "repeat", expr: { type: "rule", name: "Statement" } },
        build(stmts: (FlowStatement | null)[]): FlowStatement[] {
            return stmts.filter(s => s !== null) as FlowStatement[];
        },
    },

    Statement: {
        peg: { type: "choice", options: [
            { type: "rule", name: "EdgeChain" },
            { type: "rule", name: "NodeDef" },
            { type: "rule", name: "BlankLine" },
        ] },
    },

    BlankLine: {
        peg: { type: "regex", regex: /^[\t ]*/, name: "blank" },
        build(): null { return null; },
    },

    EdgeChain: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "NodeRef" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "rule", name: "Arrow" },
                { type: "rule", name: "NodeRef" },
            ] } },
        ] },
        build([first, rest]: [FlowNodeDef, [{ label: string; style: string; arrow: string }, FlowNodeDef][]]): FlowStatement | FlowStatement[] {
            if (rest.length === 0) return first;
            const stmts: FlowStatement[] = [];
            let prev = first;
            // Collect all node definitions
            stmts.push(first);
            for (const [arrow, node] of rest) {
                stmts.push(node);
                stmts.push({
                    type: "edge",
                    from: prev.id,
                    to: node.id,
                    label: arrow.label,
                    style: arrow.style as FlowEdge["style"],
                    arrow: arrow.arrow as FlowEdge["arrow"],
                });
                prev = node;
            }
            return stmts;
        },
    },

    NodeRef: {
        peg: { type: "choice", options: [
            { type: "rule", name: "NodeWithShape" },
            { type: "rule", name: "BareNode" },
        ] },
    },

    NodeWithShape: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Identifier" },
            { type: "rule", name: "ShapeContent" },
        ] },
        build([id, shape]: [string, { label: string; shape: string }]): FlowNodeDef {
            return { type: "node", id, label: shape.label, shape: shape.shape as FlowNodeDef["shape"] };
        },
    },

    BareNode: {
        peg: { type: "rule", name: "Identifier" },
        build(id: string): FlowNodeDef {
            return { type: "node", id, label: id, shape: "default" };
        },
    },

    Identifier: {
        peg: { type: "regex", regex: /^[a-zA-Z_][a-zA-Z0-9_-]*/, name: "identifier" },
    },

    ShapeContent: {
        peg: { type: "choice", options: [
            { type: "rule", name: "StadiumShape" },
            { type: "rule", name: "SubroutineShape" },
            { type: "rule", name: "CircleShape" },
            { type: "rule", name: "HexShape" },
            { type: "rule", name: "RectShape" },
            { type: "rule", name: "RoundShape" },
            { type: "rule", name: "DiamondShape" },
        ] },
    },

    RectShape: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "[" },
            { type: "regex", regex: /^[^\]]*/, name: "content" },
            { type: "literal", value: "]" },
        ] },
        build([, label]: [string, string]): { label: string; shape: string } {
            return { label, shape: "rect" };
        },
    },

    RoundShape: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "(" },
            { type: "regex", regex: /^[^)]*/, name: "content" },
            { type: "literal", value: ")" },
        ] },
        build([, label]: [string, string]): { label: string; shape: string } {
            return { label, shape: "round" };
        },
    },

    DiamondShape: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "{" },
            { type: "regex", regex: /^[^}]*/, name: "content" },
            { type: "literal", value: "}" },
        ] },
        build([, label]: [string, string]): { label: string; shape: string } {
            return { label, shape: "diamond" };
        },
    },

    StadiumShape: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "([" },
            { type: "regex", regex: /^[^\]]*/, name: "content" },
            { type: "literal", value: "])" },
        ] },
        build([, label]: [string, string]): { label: string; shape: string } {
            return { label, shape: "stadium" };
        },
    },

    SubroutineShape: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "[[" },
            { type: "regex", regex: /^[^\]]*/, name: "content" },
            { type: "literal", value: "]]" },
        ] },
        build([, label]: [string, string]): { label: string; shape: string } {
            return { label, shape: "subroutine" };
        },
    },

    CircleShape: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "((" },
            { type: "regex", regex: /^[^)]*/, name: "content" },
            { type: "literal", value: "))" },
        ] },
        build([, label]: [string, string]): { label: string; shape: string } {
            return { label, shape: "circle" };
        },
    },

    HexShape: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "{{" },
            { type: "regex", regex: /^[^}]*/, name: "content" },
            { type: "literal", value: "}}" },
        ] },
        build([, label]: [string, string]): { label: string; shape: string } {
            return { label, shape: "hex" };
        },
    },

    Arrow: {
        peg: { type: "choice", options: [
            { type: "rule", name: "LabeledArrow" },
            { type: "rule", name: "PlainArrow" },
        ] },
    },

    PlainArrow: {
        peg: { type: "regex", regex: /^(==>|===|-.->|-.-|-->|---)/, name: "arrow" },
        build(v: string): { label: string; style: string; arrow: string } {
            const style = v.includes("=") ? "thick" : v.includes(".") ? "dotted" : "solid";
            const arrow = v.endsWith(">") ? "arrow" : "open";
            return { label: "", style, arrow };
        },
    },

    LabeledArrow: {
        peg: { type: "sequence", parts: [
            { type: "regex", regex: /^--/, name: "start" },
            { type: "regex", regex: /^[^->\n]+/, name: "label" },
            { type: "regex", regex: /^-->/, name: "end" },
        ] },
        build([, label]: [string, string]): { label: string; style: string; arrow: string } {
            return { label: label.trim(), style: "solid", arrow: "arrow" };
        },
    },

    NodeDef: {
        peg: { type: "rule", name: "NodeRef" },
    },
};

export const flowchartParser = new PEGParser(grammar, { skip: /^([ \t]+|(\r?\n)+)/ });

export function parseFlowchart(source: string): FlowchartAST {
    const raw = flowchartParser.parse("Flowchart", source) as FlowchartAST;
    // Flatten edge chains (EdgeChain build returns arrays)
    const flat: FlowStatement[] = [];
    for (const s of raw.statements) {
        if (Array.isArray(s)) flat.push(...(s as FlowStatement[]));
        else flat.push(s);
    }
    // Deduplicate node definitions (keep first occurrence)
    const seen = new Set<string>();
    const deduped: FlowStatement[] = [];
    for (const s of flat) {
        if (s.type === "node") {
            if (seen.has(s.id)) continue;
            seen.add(s.id);
        }
        deduped.push(s);
    }
    return { direction: raw.direction, statements: deduped };
}
