import { PEGParser } from "../engine/PEGParser.ts";
import type { Grammar } from "../engine/types.ts";
import type { TableData } from "./types.ts";

const csvGrammar: Grammar = {
    File: {
        peg: { type: "sequence", parts: [{ type: "rule", name: "Row" }, { type: "repeat", expr: { type: "sequence", parts: [{ type: "rule", name: "LineEnding" }, { type: "rule", name: "Row" }] } }] },
        build([first, rest]: [string[], [string, string[]][]]): string[][] { const rows = [first]; for (const [, r] of rest) rows.push(r); return rows; },
    },
    Row: {
        peg: { type: "sequence", parts: [{ type: "rule", name: "Field" }, { type: "repeat", expr: { type: "sequence", parts: [{ type: "regex", regex: /^,/, name: "," }, { type: "rule", name: "Field" }] } }] },
        build([first, rest]: [string, [string, string][]]): string[] { const fields = [first]; for (const [, f] of rest) fields.push(f); return fields; },
    },
    Field: { peg: { type: "choice", options: [{ type: "rule", name: "QuotedField" }, { type: "rule", name: "UnquotedField" }] } },
    QuotedField: {
        peg: { type: "sequence", parts: [{ type: "regex", regex: /^"/, name: "quote" }, { type: "rule", name: "QuotedContent" }, { type: "regex", regex: /^"/, name: "quote" }] },
        build([, content]: [string, string]): string { return content; },
    },
    QuotedContent: {
        peg: { type: "repeat", expr: { type: "choice", options: [{ type: "rule", name: "EscapedQuote" }, { type: "rule", name: "QuotedChar" }] } },
        build(parts: string[]): string { return parts.join(""); },
    },
    EscapedQuote: { peg: { type: "regex", regex: /^""/, name: "escaped quote" }, build(): string { return '"'; } },
    QuotedChar: { peg: { type: "regex", regex: /^[^"]/, name: "char" } },
    UnquotedField: { peg: { type: "regex", regex: /^[^,\r\n]*/, name: "field" } },
    LineEnding: { peg: { type: "regex", regex: /^\r?\n/, name: "newline" } },
};

const csvParser = new PEGParser(csvGrammar);

export function parseCSV(text: string): TableData {
    const trimmed = text.replace(/\r?\n$/, "");
    if (!trimmed) throw new Error("CSV must have at least a header row and a types row");
    const rows = csvParser.parse("File", trimmed) as string[][];
    if (rows.length < 2) throw new Error("CSV must have at least a header row and a types row");
    return { headers: rows[0], types: rows[1], rows: rows.slice(2) };
}
