import type { MathNode } from "../math/types.ts";

// ── Geometry sub-expressions (used inside relations) ──────────────────────────

export interface SegmentExpr { type: "Segment"; a: string; b: string; label?: MathNode; }
export interface LineExpr    { type: "Line";    a: string; b: string; }
export interface RayExpr     { type: "Ray";     a: string; b: string; }
export interface AngleExpr   { type: "Angle";   a: string; vertex: string; b: string; value?: MathNode; }
export type GeoExpr = SegmentExpr | LineExpr | RayExpr | AngleExpr;

// ── Top-level statement nodes ─────────────────────────────────────────────────

export interface SystemDeclNode    { type: "SystemDecl";    dimension: number; geometryType: string; }
export interface PointDeclNode     { type: "PointDecl";     labels: string[]; coordLabel?: string; coords?: MathNode[]; }
export interface ArrowNode         { type: "Arrow";         a: string; b: string; }
export interface ParallelNode      { type: "Parallel";      left: GeoExpr; right: GeoExpr; }
export interface PerpendicularNode { type: "Perpendicular"; left: GeoExpr; right: GeoExpr; }
export interface IntersectionNode  { type: "Intersection";  left: GeoExpr; right: GeoExpr; result: string; }
export interface MidpointNode      { type: "Midpoint";      label: string; segment: SegmentExpr; }
export interface EqualityNode      { type: "Equality";      left: GeoExpr; right: GeoExpr; }
export interface TriangleNode      { type: "Triangle";      points: [string, string, string]; }
export interface QuadrilateralNode { type: "Quadrilateral"; points: [string, string, string, string]; }
export interface PolygonNode       { type: "Polygon";       points: string[]; }
export interface CircleNode        { type: "Circle";        circumPoints: string[]; center: string; radius?: MathNode; }
export interface EllipseNode       { type: "Ellipse";       circumPoints: string[]; center: string; majorAxis?: MathNode; minorAxis?: MathNode; }
export interface ArcNode           { type: "Arc";           a: string; b: string; center: string; }
export interface PlaneNode         { type: "Plane";         points?: string[]; equation?: MathNode; }
export interface HyperplaneNode    { type: "Hyperplane";    equation: MathNode; }
export interface AxisDeclNode      { type: "AxisDecl";      name: string; expression?: MathNode; }
export interface OriginDeclNode    { type: "OriginDecl";    label: string; }
export interface GraphNode         { type: "Graph";         name: string; equation: MathNode; }
export interface GeodesicNode      { type: "Geodesic";      a: string; b: string; }
export interface CurvatureNode     { type: "Curvature";     label: string; value: MathNode; }

export type GeoStatement =
    | SystemDeclNode | PointDeclNode
    | SegmentExpr | LineExpr | RayExpr | ArrowNode | AngleExpr
    | ParallelNode | PerpendicularNode | IntersectionNode | MidpointNode
    | EqualityNode
    | TriangleNode | QuadrilateralNode | PolygonNode
    | CircleNode | EllipseNode | ArcNode
    | PlaneNode | HyperplaneNode
    | AxisDeclNode | OriginDeclNode
    | GraphNode | GeodesicNode | CurvatureNode;

export interface GeometryProgram {
    type: "GeometryProgram";
    statements: GeoStatement[];
}
