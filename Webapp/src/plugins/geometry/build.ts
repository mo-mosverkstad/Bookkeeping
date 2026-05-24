/**
 * Geometry build helpers.
 *
 * These functions are called from the PEG grammar's build() callbacks.
 * They interpret the raw strings captured by the PEG rules and produce
 * typed GeoStatement AST nodes.
 *
 * Separation rationale: the math plugin's build logic is simple enough
 * to be inline in grammar.ts. The geometry build logic is substantially
 * larger (30+ statement types, embedded math parsing, nested arg splitting)
 * so it lives in its own module, mirroring the principle that each concern
 * has its own file.
 */

import { parser as mathParser } from "../math/grammar.ts";
import type { MathNode } from "../math/types.ts";
import type {
    GeoStatement, GeoExpr,
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

// ── Low-level string helpers ──────────────────────────────────────────────────

/** Delegate a raw source string to the math parser. */
export function parseMath(src: string): MathNode {
    return mathParser.parse("Expression", src.trim()) as MathNode;
}

/** Split on top-level commas, respecting nested parens and brackets. */
export function splitArgs(src: string): string[] {
    const args: string[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i < src.length; i++) {
        if (src[i] === "(" || src[i] === "[") depth++;
        else if (src[i] === ")" || src[i] === "]") depth--;
        else if (src[i] === "," && depth === 0) {
            args.push(src.slice(start, i).trim());
            start = i + 1;
        }
    }
    const last = src.slice(start).trim();
    if (last) args.push(last);
    return args;
}

/** Extract the function name from "Name(...)". */
export function callNameOf(raw: string): string {
    const p = raw.indexOf("(");
    return p === -1 ? raw.trim() : raw.slice(0, p).trim();
}

/** Extract the content between the outermost parens of "Name(content)". */
export function innerOf(raw: string): string {
    return raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")"));
}

/** Parse a GeoExpr sub-expression (Segment/Line/Ray/Angle) from a raw string. */
export function parseGeoExpr(src: string): GeoExpr {
    src = src.trim();
    const name = callNameOf(src);
    const args = splitArgs(innerOf(src));
    switch (name) {
        case "Segment": return { type: "Segment", a: args[0], b: args[1] } as SegmentExpr;
        case "Line":    return { type: "Line",    a: args[0], b: args[1] } as LineExpr;
        case "Ray":     return { type: "Ray",     a: args[0], b: args[1] } as RayExpr;
        case "Angle":   return { type: "Angle",   a: args[0], vertex: args[1], b: args[2] } as AngleExpr;
        default: throw new Error(`Unknown geo expression: ${name}`);
    }
}

// ── Statement builders ────────────────────────────────────────────────────────

/** Build a GeoStatement from a plain call "Name(args)". */
export function buildCall(raw: string): GeoStatement {
    const name = callNameOf(raw);
    const inner = innerOf(raw);
    const args = splitArgs(inner);

    switch (name) {
        case "System":
            return { type: "SystemDecl", dimension: parseInt(args[0]), geometryType: args[1] } as SystemDeclNode;
        case "Point":
            return { type: "PointDecl", labels: args } as PointDeclNode;
        case "Axis":
            return { type: "AxisDecl", name: inner.trim() } as AxisDeclNode;
        case "Origin":
            return { type: "OriginDecl", label: inner.trim() } as OriginDeclNode;
        case "Segment":
            return { type: "Segment", a: args[0], b: args[1] } as SegmentExpr;
        case "Line":
            return { type: "Line", a: args[0], b: args[1] } as LineExpr;
        case "Ray":
            return { type: "Ray", a: args[0], b: args[1] } as RayExpr;
        case "Arrow":
            return { type: "Arrow", a: args[0], b: args[1] } as ArrowNode;
        case "Angle":
            return { type: "Angle", a: args[0], vertex: args[1], b: args[2] } as AngleExpr;
        case "Parallel":
            return { type: "Parallel", left: parseGeoExpr(args[0]), right: parseGeoExpr(args[1]) } as ParallelNode;
        case "Perpendicular":
            return { type: "Perpendicular", left: parseGeoExpr(args[0]), right: parseGeoExpr(args[1]) } as PerpendicularNode;
        case "Midpoint":
            return { type: "Midpoint", label: args[0], segment: parseGeoExpr(args[1]) as SegmentExpr } as MidpointNode;
        case "Triangle":
            return { type: "Triangle", points: [args[0], args[1], args[2]] } as TriangleNode;
        case "Quadrilateral":
            return { type: "Quadrilateral", points: [args[0], args[1], args[2], args[3]] } as QuadrilateralNode;
        case "Polygon":
            return { type: "Polygon", points: args } as PolygonNode;
        case "Circle": case "Sphere": {
            const cpSrc = args[0].startsWith("(") ? args[0].slice(1, args[0].lastIndexOf(")")) : args[0];
            const node: CircleNode = { type: "Circle", circumPoints: splitArgs(cpSrc), center: args[1] };
            if (args[2]) node.radius = parseMath(args[2]);
            return node;
        }
        case "Ellipse": case "Ellipsoid": {
            const cpSrc = args[0].startsWith("(") ? args[0].slice(1, args[0].lastIndexOf(")")) : args[0];
            const node: EllipseNode = { type: "Ellipse", circumPoints: splitArgs(cpSrc), center: args[1] };
            if (args[2]) node.majorAxis = parseMath(args[2]);
            if (args[3]) node.minorAxis = parseMath(args[3]);
            return node;
        }
        case "Arc":
            return { type: "Arc", a: args[0], b: args[1], center: args[2] } as ArcNode;
        case "Plane":
            if (!/^[A-Z]'?$/.test(args[0]))
                return { type: "Plane", equation: parseMath(inner) } as PlaneNode;
            return { type: "Plane", points: args } as PlaneNode;
        case "Hyperplane":
            return { type: "Hyperplane", equation: parseMath(inner) } as HyperplaneNode;
        case "Geodesic":
            return { type: "Geodesic", a: args[0], b: args[1] } as GeodesicNode;
        default:
            throw new Error(`Unknown geometry statement: ${name}`);
    }
}

/** Build a GeoStatement from an assignment "lhs=rhs". */
export function buildAssign(lhs: string, rhs: string): GeoStatement {
    const name = callNameOf(lhs);
    const inner = innerOf(lhs);
    const args = splitArgs(inner);

    if (callNameOf(rhs) === "Graph")
        return { type: "Graph", name: lhs, equation: parseMath(innerOf(rhs)) } as GraphNode;

    if (name === "Intersection")
        return { type: "Intersection", left: parseGeoExpr(args[0]), right: parseGeoExpr(args[1]), result: rhs } as IntersectionNode;

    if (name === "Curvature")
        return { type: "Curvature", label: inner.trim(), value: parseMath(rhs) } as CurvatureNode;

    if (name === "Axis")
        return { type: "AxisDecl", name: inner.trim(), expression: parseMath(rhs) } as AxisDeclNode;

    if (name === "Point") {
        const coordSrc = rhs.startsWith("(") ? rhs.slice(1, rhs.lastIndexOf(")")) : rhs;
        return { type: "PointDecl", labels: args, coordLabel: args[0], coords: splitArgs(coordSrc).map(parseMath) } as PointDeclNode;
    }

    if (name === "Segment")
        return { type: "Segment", a: args[0], b: args[1], label: parseMath(rhs) } as SegmentExpr;

    if (name === "Angle")
        return { type: "Angle", a: args[0], vertex: args[1], b: args[2], value: parseMath(rhs) } as AngleExpr;

    if (name === "Segment" || name === "Angle" || name === "Line")
        return { type: "Equality", left: parseGeoExpr(lhs), right: parseGeoExpr(rhs) } as EqualityNode;

    throw new Error(`Unknown assignment: ${lhs}=${rhs}`);
}
