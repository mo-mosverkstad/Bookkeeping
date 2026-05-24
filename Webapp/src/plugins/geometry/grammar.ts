/**
 * Geometry PEG grammar.
 *
 * Architecture principle (same as math/grammar.ts):
 *   - PEG rules parse ALL structure: names, argument lists, individual args.
 *   - build() functions ONLY assemble AST nodes from already-parsed data.
 *   - No string splitting, no regex matching, no re-parsing inside build().
 *
 * Grammar structure:
 *   Program      = Statement (\n Statement)*
 *   Statement    = AssignStatement | CallStatement | BlankOrComment
 *   AssignStatement = CallExpr "=" RhsValue
 *   CallStatement   = CallExpr
 *   CallExpr     = Name "(" ArgList ")"
 *   ArgList      = Arg ("," Arg)*  |  empty
 *   Arg          = PointGroup | CallExpr | MathExpr
 *   PointGroup   = "(" Label ("," Label)* ")"   -- for Circle((A,B,C),O)
 *   MathExpr     = everything up to , ) or end-of-line
 *
 * Math sub-expressions are parsed by the math plugin's parser inside
 * build() — but only for values that are semantically math (coordinates,
 * measurements, equations). The PEG grammar captures the raw text span
 * for those; build() calls mathParser.parse() on the already-isolated span.
 */

import { PEGParser } from "../../engine/PEGParser.ts";
import type { Grammar } from "../../engine/types.ts";
import { parser as mathParser } from "../math/grammar.ts";
import type { MathNode } from "../math/types.ts";
import type {
    GeometryProgram, GeoStatement, GeoExpr,
    SystemDeclNode, PointDeclNode,
    SegmentExpr, LineExpr, RayExpr, ArrowNode, AngleExpr,
    ParallelNode, PerpendicularNode, IntersectionNode, MidpointNode,
    EqualityNode,
    TriangleNode, QuadrilateralNode, PolygonNode,
    CircleNode, EllipseNode, ArcNode,
    PlaneNode, HyperplaneNode,
    AxisDeclNode, OriginDeclNode,
    GraphNode, GeodesicNode, CurvatureNode,
} from "./types.ts";

// ── Math delegation (only called in build, on already-isolated text) ──────────

function math(src: string): MathNode {
    return mathParser.parse("Expression", src.trim()) as MathNode;
}

// ── Parsed intermediate types (what the grammar produces before build) ────────

type ParsedCall = { name: string; args: ParsedArg[] };
type ParsedArg  = string | ParsedCall | string[];   // string = math expr, string[] = point group

// ── Build a GeoExpr from a ParsedCall (already fully parsed by PEG) ──────────

function geoExprFromCall(c: ParsedCall): GeoExpr {
    const a = c.args as string[];
    switch (c.name) {
        case "Segment": return { type: "Segment", a: a[0], b: a[1] } as SegmentExpr;
        case "Line":    return { type: "Line",    a: a[0], b: a[1] } as LineExpr;
        case "Ray":     return { type: "Ray",     a: a[0], b: a[1] } as RayExpr;
        case "Angle":   return { type: "Angle",   a: a[0], vertex: a[1], b: a[2] } as AngleExpr;
        default: throw new Error(`Unknown geo expression: ${c.name}`);
    }
}

// ── Statement builder (called from AssignStatement and CallStatement build) ───

function buildFromCall(c: ParsedCall): GeoStatement {
    const a = c.args;
    switch (c.name) {
        case "System":
            return { type: "SystemDecl", dimension: parseInt(a[0] as string), geometryType: a[1] as string } as SystemDeclNode;

        case "Point":
            return { type: "PointDecl", labels: a as string[] } as PointDeclNode;

        case "Axis":
            return { type: "AxisDecl", name: a[0] as string } as AxisDeclNode;

        case "Origin":
            return { type: "OriginDecl", label: a[0] as string } as OriginDeclNode;

        case "Segment":
            return { type: "Segment", a: a[0] as string, b: a[1] as string } as SegmentExpr;

        case "Line":
            return { type: "Line", a: a[0] as string, b: a[1] as string } as LineExpr;

        case "Ray":
            return { type: "Ray", a: a[0] as string, b: a[1] as string } as RayExpr;

        case "Arrow":
            return { type: "Arrow", a: a[0] as string, b: a[1] as string } as ArrowNode;

        case "Angle":
            return { type: "Angle", a: a[0] as string, vertex: a[1] as string, b: a[2] as string } as AngleExpr;

        case "Parallel":
            return { type: "Parallel", left: geoExprFromCall(a[0] as ParsedCall), right: geoExprFromCall(a[1] as ParsedCall) } as ParallelNode;

        case "Perpendicular":
            return { type: "Perpendicular", left: geoExprFromCall(a[0] as ParsedCall), right: geoExprFromCall(a[1] as ParsedCall) } as PerpendicularNode;

        case "Midpoint":
            return { type: "Midpoint", label: a[0] as string, segment: geoExprFromCall(a[1] as ParsedCall) as SegmentExpr } as MidpointNode;

        case "Triangle":
            return { type: "Triangle", points: [a[0] as string, a[1] as string, a[2] as string] } as TriangleNode;

        case "Quadrilateral":
            return { type: "Quadrilateral", points: [a[0] as string, a[1] as string, a[2] as string, a[3] as string] } as QuadrilateralNode;

        case "Polygon":
            return { type: "Polygon", points: a as string[] } as PolygonNode;

        case "Circle": case "Sphere": {
            const node: CircleNode = { type: "Circle", circumPoints: a[0] as string[], center: a[1] as string };
            if (a[2]) node.radius = math(a[2] as string);
            return node;
        }

        case "Ellipse": case "Ellipsoid": {
            const node: EllipseNode = { type: "Ellipse", circumPoints: a[0] as string[], center: a[1] as string };
            if (a[2]) node.majorAxis = math(a[2] as string);
            if (a[3]) node.minorAxis = math(a[3] as string);
            return node;
        }

        case "Arc":
            return { type: "Arc", a: a[0] as string, b: a[1] as string, center: a[2] as string } as ArcNode;

        case "Plane":
            // If first arg looks like a label (single uppercase letter), it's a point list
            if (/^[A-Z]'?$/.test((a[0] as string).trim()))
                return { type: "Plane", points: a as string[] } as PlaneNode;
            return { type: "Plane", equation: math(a[0] as string) } as PlaneNode;

        case "Hyperplane":
            return { type: "Hyperplane", equation: math(a[0] as string) } as HyperplaneNode;

        case "Geodesic":
            return { type: "Geodesic", a: a[0] as string, b: a[1] as string } as GeodesicNode;

        case "Curvature":
            // Curvature(K) — value comes from assignment rhs, handled in buildAssign
            return { type: "Curvature", label: a[0] as string, value: math("0") } as CurvatureNode;

        default:
            throw new Error(`Unknown geometry statement: ${c.name}`);
    }
}

function buildAssign(lhs: ParsedCall, rhs: string | ParsedCall): GeoStatement {
    // name=Graph(equation)
    if (typeof rhs !== "string" && rhs.name === "Graph")
        return { type: "Graph", name: lhs.name, equation: math(rhs.args[0] as string) } as GraphNode;

    // Intersection(...)=E
    if (lhs.name === "Intersection")
        return { type: "Intersection", left: geoExprFromCall(lhs.args[0] as ParsedCall), right: geoExprFromCall(lhs.args[1] as ParsedCall), result: rhs as string } as IntersectionNode;

    // Curvature(K)=value
    if (lhs.name === "Curvature")
        return { type: "Curvature", label: lhs.args[0] as string, value: math(rhs as string) } as CurvatureNode;

    // Axis(x')=expression
    if (lhs.name === "Axis")
        return { type: "AxisDecl", name: lhs.args[0] as string, expression: math(rhs as string) } as AxisDeclNode;

    // Point(A)=(x,y)  — rhs is a math expression like "(2,3)"
    if (lhs.name === "Point") {
        const coordSrc = (rhs as string).trim();
        const inner = coordSrc.startsWith("(") ? coordSrc.slice(1, coordSrc.lastIndexOf(")")) : coordSrc;
        // Split coords on top-level commas
        const coords: MathNode[] = [];
        let depth = 0, start = 0;
        for (let i = 0; i < inner.length; i++) {
            if (inner[i] === "(" || inner[i] === "[") depth++;
            else if (inner[i] === ")" || inner[i] === "]") depth--;
            else if (inner[i] === "," && depth === 0) {
                coords.push(math(inner.slice(start, i)));
                start = i + 1;
            }
        }
        coords.push(math(inner.slice(start)));
        return { type: "PointDecl", labels: lhs.args as string[], coordLabel: lhs.args[0] as string, coords } as PointDeclNode;
    }

    // Segment(A,B)=label
    if (lhs.name === "Segment")
        return { type: "Segment", a: lhs.args[0] as string, b: lhs.args[1] as string, label: math(rhs as string) } as SegmentExpr;

    // Angle(A,B,C)=value
    if (lhs.name === "Angle")
        return { type: "Angle", a: lhs.args[0] as string, vertex: lhs.args[1] as string, b: lhs.args[2] as string, value: math(rhs as string) } as AngleExpr;

    // Equality: Segment(A,B)=Segment(C,D)
    if (typeof rhs !== "string")
        return { type: "Equality", left: geoExprFromCall(lhs), right: geoExprFromCall(rhs) } as EqualityNode;

    throw new Error(`Unknown assignment: ${lhs.name}=...`);
}

// ── Grammar ───────────────────────────────────────────────────────────────────

const grammar: Grammar = {

    Program: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Statement" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "regex", regex: /^\r?\n/, name: "newline" },
                { type: "rule", name: "Statement" },
            ] } },
        ] },
        build([first, rest]: [GeoStatement | null, [string, GeoStatement | null][]]): GeometryProgram {
            const statements: GeoStatement[] = [];
            if (first !== null) statements.push(first);
            for (const [, s] of rest) if (s !== null) statements.push(s);
            return { type: "GeometryProgram", statements };
        },
    },

    Statement: {
        peg: { type: "choice", options: [
            { type: "rule", name: "AssignStatement" },
            { type: "rule", name: "CallStatement" },
            { type: "rule", name: "BlankOrComment" },
        ] },
    },

    // BlankOrComment: whitespace-only or comment lines — must match at least one char
    BlankOrComment: {
        peg: { type: "regex", regex: /^(?:#[^\n]*|\/\/[^\n]*|[ \t]+)/, name: "blank or comment" },
        build(): null { return null; },
    },

    // AssignStatement: CallExpr "=" RhsValue
    AssignStatement: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "CallExpr" },
            { type: "literal", value: "=" },
            { type: "rule", name: "RhsValue" },
        ] },
        build([lhs, , rhs]: [ParsedCall, string, string | ParsedCall]): GeoStatement {
            return buildAssign(lhs, rhs);
        },
    },

    CallStatement: {
        peg: { type: "rule", name: "CallExpr" },
        build(c: ParsedCall): GeoStatement {
            return buildFromCall(c);
        },
    },

    // CallExpr: Name "(" ArgList ")"
    CallExpr: {
        peg: { type: "sequence", parts: [
            { type: "regex", regex: /^[A-Za-z][A-Za-z0-9]*/, name: "name" },
            { type: "literal", value: "(" },
            { type: "rule", name: "ArgList" },
            { type: "literal", value: ")" },
        ] },
        build([name, , args]: [string, string, ParsedArg[]]): ParsedCall {
            return { name, args };
        },
    },

    // ArgList: Arg ("," Arg)*  |  empty
    ArgList: {
        peg: { type: "choice", options: [
            { type: "sequence", parts: [
                { type: "rule", name: "Arg" },
                { type: "repeat", expr: { type: "sequence", parts: [
                    { type: "literal", value: "," },
                    { type: "rule", name: "Arg" },
                ] } },
            ] },
            { type: "sequence", parts: [] },
        ] },
        build(node: any): ParsedArg[] {
            if (!Array.isArray(node) || node.length === 0) return [];
            const [first, rest] = node;
            const args: ParsedArg[] = [first];
            for (const [, arg] of rest) args.push(arg);
            return args;
        },
    },

    // Arg: PointGroup | CallExpr | MathArg
    // PointGroup tried first to handle Circle((A,B,C),O)
    // CallExpr tried second to handle nested calls like Parallel(Line(A,B),Line(C,D))
    // MathArg is the fallback for labels, numbers, and math expressions
    Arg: {
        peg: { type: "choice", options: [
            { type: "rule", name: "PointGroup" },
            { type: "rule", name: "CallExpr" },
            { type: "rule", name: "MathArg" },
        ] },
    },

    // PointGroup: "(" Label ("," Label)* ")"  — used in Circle((A,B,C),O)
    PointGroup: {
        peg: { type: "sequence", parts: [
            { type: "literal", value: "(" },
            { type: "regex", regex: /^[A-Z][A-Za-z0-9']*/, name: "label" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "literal", value: "," },
                { type: "regex", regex: /^[A-Z][A-Za-z0-9']*/, name: "label" },
            ] } },
            { type: "literal", value: ")" },
        ] },
        build([, first, rest]: [string, string, [string, string][], string]): string[] {
            const labels = [first];
            for (const [, lbl] of rest) labels.push(lbl);
            return labels;
        },
    },

    // MathArg: everything up to the next top-level "," or ")" or end-of-line
    // This captures labels (single letters), numbers, and math expressions
    MathArg: {
        peg: { type: "regex", regex: /^[^,)\n\r]+/, name: "argument" },
        build(v: string): string { return v.trim(); },
    },

    // RhsValue: either a CallExpr (Graph(...), equality) or a raw value string
    RhsValue: {
        peg: { type: "choice", options: [
            { type: "rule", name: "CallExpr" },
            { type: "rule", name: "RhsRaw" },
        ] },
    },

    // RhsRaw: everything up to end-of-line
    RhsRaw: {
        peg: { type: "regex", regex: /^[^\n\r]+/, name: "value" },
        build(v: string): string { return v.trim(); },
    },
};

// ── Exported parser and entry point ──────────────────────────────────────────

export const parser = new PEGParser(grammar, {
    skip: /^[ \t]+/,  // spaces and tabs only — newlines are statement separators
});

export function parseGeometry(source: string): GeometryProgram {
    const normalised = source
        .split(/\r?\n/)
        .map(l => l.trimEnd())
        .filter(l => l.trim().length > 0)  // drop truly empty lines
        .join("\n");
    if (!normalised) return { type: "GeometryProgram", statements: [] };
    return parser.parse("Program", normalised) as GeometryProgram;
}
