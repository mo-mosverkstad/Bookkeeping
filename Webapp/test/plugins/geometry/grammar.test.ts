import { describe, it, expect } from "vitest";
import { parseGeometry } from "../../src/plugins/geometry/grammar.ts";

describe("parseGeometry — System", () => {
    it("parses System(2,Euclidean)", () => {
        const p = parseGeometry("System(2,Euclidean)");
        expect(p.statements[0]).toMatchObject({ type: "SystemDecl", dimension: 2, geometryType: "Euclidean" });
    });
    it("parses System(3,Euclidean)", () => {
        const p = parseGeometry("System(3,Euclidean)");
        expect(p.statements[0]).toMatchObject({ type: "SystemDecl", dimension: 3 });
    });
});

describe("parseGeometry — Point", () => {
    it("parses Point(A,B,C)", () => {
        const p = parseGeometry("Point(A,B,C)");
        expect(p.statements[0]).toMatchObject({ type: "PointDecl", labels: ["A", "B", "C"] });
    });
    it("parses Point(A)=(2,3) with numeric coords", () => {
        const p = parseGeometry("Point(A)=(2,3)");
        const s = p.statements[0] as any;
        expect(s.type).toBe("PointDecl");
        expect(s.coordLabel).toBe("A");
        expect(s.coords[0]).toMatchObject({ type: "NumberLiteral", value: 2 });
        expect(s.coords[1]).toMatchObject({ type: "NumberLiteral", value: 3 });
    });
});

describe("parseGeometry — Primitives", () => {
    it("parses Segment(A,B)", () => {
        const p = parseGeometry("Segment(A,B)");
        expect(p.statements[0]).toMatchObject({ type: "Segment", a: "A", b: "B" });
    });
    it("parses Segment(A,B)=5 with label", () => {
        const p = parseGeometry("Segment(A,B)=5");
        const s = p.statements[0] as any;
        expect(s.label).toMatchObject({ type: "NumberLiteral", value: 5 });
    });
    it("parses Line(A,B)", () => {
        const p = parseGeometry("Line(A,B)");
        expect(p.statements[0]).toMatchObject({ type: "Line", a: "A", b: "B" });
    });
    it("parses Ray(A,B)", () => {
        const p = parseGeometry("Ray(A,B)");
        expect(p.statements[0]).toMatchObject({ type: "Ray", a: "A", b: "B" });
    });
    it("parses Arrow(A,B)", () => {
        const p = parseGeometry("Arrow(A,B)");
        expect(p.statements[0]).toMatchObject({ type: "Arrow", a: "A", b: "B" });
    });
});

describe("parseGeometry — Angle", () => {
    it("parses Angle(A,B,C)", () => {
        const p = parseGeometry("Angle(A,B,C)");
        expect(p.statements[0]).toMatchObject({ type: "Angle", a: "A", vertex: "B", b: "C" });
    });
    it("parses Angle(A,B,C)=30 with value", () => {
        const p = parseGeometry("Angle(A,B,C)=30");
        const s = p.statements[0] as any;
        expect(s.value).toMatchObject({ type: "NumberLiteral", value: 30 });
    });
});

describe("parseGeometry — Relations", () => {
    it("parses Parallel(Line(A,B),Line(C,D))", () => {
        const p = parseGeometry("Parallel(Line(A,B),Line(C,D))");
        expect(p.statements[0]).toMatchObject({
            type: "Parallel",
            left: { type: "Line", a: "A", b: "B" },
            right: { type: "Line", a: "C", b: "D" },
        });
    });
    it("parses Perpendicular(Line(A,B),Line(C,D))", () => {
        const p = parseGeometry("Perpendicular(Line(A,B),Line(C,D))");
        expect(p.statements[0]).toMatchObject({ type: "Perpendicular" });
    });
    it("parses Intersection(Line(A,B),Line(C,D))=E", () => {
        const p = parseGeometry("Intersection(Line(A,B),Line(C,D))=E");
        expect(p.statements[0]).toMatchObject({ type: "Intersection", result: "E" });
    });
    it("parses Midpoint(M,Segment(A,B))", () => {
        const p = parseGeometry("Midpoint(M,Segment(A,B))");
        expect(p.statements[0]).toMatchObject({ type: "Midpoint", label: "M" });
    });
});

describe("parseGeometry — Polygons", () => {
    it("parses Triangle(A,B,C)", () => {
        const p = parseGeometry("Triangle(A,B,C)");
        expect(p.statements[0]).toMatchObject({ type: "Triangle", points: ["A", "B", "C"] });
    });
    it("parses Quadrilateral(A,B,C,D)", () => {
        const p = parseGeometry("Quadrilateral(A,B,C,D)");
        expect(p.statements[0]).toMatchObject({ type: "Quadrilateral", points: ["A", "B", "C", "D"] });
    });
    it("parses Polygon(A,B,C,D,E)", () => {
        const p = parseGeometry("Polygon(A,B,C,D,E)");
        expect(p.statements[0]).toMatchObject({ type: "Polygon", points: ["A", "B", "C", "D", "E"] });
    });
});

describe("parseGeometry — Circle / Ellipse / Arc", () => {
    it("parses Circle((A,B,C),O)", () => {
        const p = parseGeometry("Circle((A,B,C),O)");
        expect(p.statements[0]).toMatchObject({ type: "Circle", circumPoints: ["A", "B", "C"], center: "O" });
    });
    it("parses Circle((A,B,C),O,4) with radius", () => {
        const p = parseGeometry("Circle((A,B,C),O,4)");
        const s = p.statements[0] as any;
        expect(s.radius).toMatchObject({ type: "NumberLiteral", value: 4 });
    });
    it("parses Ellipse((A,B,C),O,5,3)", () => {
        const p = parseGeometry("Ellipse((A,B,C),O,5,3)");
        const s = p.statements[0] as any;
        expect(s.type).toBe("Ellipse");
        expect(s.majorAxis).toMatchObject({ type: "NumberLiteral", value: 5 });
        expect(s.minorAxis).toMatchObject({ type: "NumberLiteral", value: 3 });
    });
    it("parses Arc(A,B,O)", () => {
        const p = parseGeometry("Arc(A,B,O)");
        expect(p.statements[0]).toMatchObject({ type: "Arc", a: "A", b: "B", center: "O" });
    });
});

describe("parseGeometry — Coordinate system constructs", () => {
    it("parses Axis(x)", () => {
        const p = parseGeometry("Axis(x)");
        expect(p.statements[0]).toMatchObject({ type: "AxisDecl", name: "x" });
    });
    it("parses Origin(O)", () => {
        const p = parseGeometry("Origin(O)");
        expect(p.statements[0]).toMatchObject({ type: "OriginDecl", label: "O" });
    });
    it("parses Plane(A,B,C)", () => {
        const p = parseGeometry("Plane(A,B,C)");
        expect(p.statements[0]).toMatchObject({ type: "Plane", points: ["A", "B", "C"] });
    });
    it("parses Geodesic(A,B)", () => {
        const p = parseGeometry("Geodesic(A,B)");
        expect(p.statements[0]).toMatchObject({ type: "Geodesic", a: "A", b: "B" });
    });
});

describe("parseGeometry — multi-statement program", () => {
    it("parses a right triangle program", () => {
        const src = `Point(A,B,C)
Point(A)=(0,0)
Point(B)=(3,0)
Point(C)=(0,4)
Triangle(A,B,C)
Perpendicular(Line(A,B),Line(A,C))`;
        const p = parseGeometry(src);
        expect(p.statements).toHaveLength(6);
        expect(p.statements[0].type).toBe("PointDecl");
        expect(p.statements[4].type).toBe("Triangle");
        expect(p.statements[5].type).toBe("Perpendicular");
    });

    it("ignores blank lines and comments", () => {
        const src = `# comment
Point(A,B)
// another comment

Segment(A,B)`;
        const p = parseGeometry(src);
        expect(p.statements).toHaveLength(2);
    });
});
