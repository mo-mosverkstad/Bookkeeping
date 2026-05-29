import { describe, it, expect } from "vitest";
import { getPlugin, renderCell } from "../../src/cell-renderers/registry.ts";

// ── Plugin Registry ───────────────────────────────────────────────────────────

describe("Plugin Registry", () => {
    it("math plugin",     () => { expect(getPlugin("math").type_id).toBe("math"); });
    it("text plugin",     () => { expect(getPlugin("text").type_id).toBe("text"); });
    it("geometry plugin", () => { expect(getPlugin("geometry").type_id).toBe("geometry"); });
    it("physics plugin",  () => { expect(getPlugin("physics").type_id).toBe("physics"); });
    it("fallback",        () => { expect(getPlugin("unknown").type_id).toBe("rich"); });
    it("renderCell math",     () => { expect(renderCell("math", "x^2").querySelector("sup")).not.toBeNull(); });
    it("renderCell text",     () => { expect(renderCell("text", "hello").textContent).toBe("hello"); });
    it("renderCell error",    () => { expect(renderCell("math", "@@@").className).toBe("cell-error"); });
    it("renderCell geometry", () => { expect(renderCell("geometry", "Point(A,B)\nSegment(A,B)").querySelector("svg")).not.toBeNull(); });
    it("renderCell physics",  () => { expect(renderCell("physics", "Point(A)\nPoint(A)=(0,0)\nFixed(A)").querySelector("svg")).not.toBeNull(); });
});

// ── Geometry grammar tests ────────────────────────────────────────────────────

const geo = getPlugin("geometry");
const gp  = (src: string): any => geo.parse(src) as any;

describe("Geometry — System", () => {
    it("System(2,Euclidean)", () => { expect(gp("System(2,Euclidean)").statements[0]).toMatchObject({ type: "SystemDecl", dimension: 2, geometryType: "Euclidean" }); });
    it("System(3,Euclidean)", () => { expect(gp("System(3,Euclidean)").statements[0]).toMatchObject({ type: "SystemDecl", dimension: 3 }); });
});

describe("Geometry — Point", () => {
    it("Point(A,B,C)", () => { expect(gp("Point(A,B,C)").statements[0]).toMatchObject({ type: "PointDecl", labels: ["A","B","C"] }); });
    it("Point(A)=(2,3)", () => {
        const s = gp("Point(A)=(2,3)").statements[0];
        expect(s.type).toBe("PointDecl");
        expect(s.coordLabel).toBe("A");
        expect(s.coords[0]).toMatchObject({ type: "NumberLiteral", value: 2 });
        expect(s.coords[1]).toMatchObject({ type: "NumberLiteral", value: 3 });
    });
});

describe("Geometry — Primitives", () => {
    it("Segment(A,B)",    () => { expect(gp("Segment(A,B)").statements[0]).toMatchObject({ type: "Segment", a: "A", b: "B" }); });
    it("Segment(A,B)=5", () => { expect(gp("Segment(A,B)=5").statements[0].label).toMatchObject({ type: "NumberLiteral", value: 5 }); });
    it("Line(A,B)",       () => { expect(gp("Line(A,B)").statements[0]).toMatchObject({ type: "Line", a: "A", b: "B" }); });
    it("Ray(A,B)",        () => { expect(gp("Ray(A,B)").statements[0]).toMatchObject({ type: "Ray", a: "A", b: "B" }); });
    it("Arrow(A,B)",      () => { expect(gp("Arrow(A,B)").statements[0]).toMatchObject({ type: "Arrow", a: "A", b: "B" }); });
});

describe("Geometry — Angle", () => {
    it("Angle(A,B,C)",    () => { expect(gp("Angle(A,B,C)").statements[0]).toMatchObject({ type: "Angle", a: "A", vertex: "B", b: "C" }); });
    it("Angle(A,B,C)=30", () => { expect(gp("Angle(A,B,C)=30").statements[0].value).toMatchObject({ type: "NumberLiteral", value: 30 }); });
});

describe("Geometry — Relations", () => {
    it("Parallel(Line(A,B),Line(C,D))", () => {
        expect(gp("Parallel(Line(A,B),Line(C,D))").statements[0]).toMatchObject({ type: "Parallel", left: { type: "Line", a: "A", b: "B" }, right: { type: "Line", a: "C", b: "D" } });
    });
    it("Perpendicular(Line(A,B),Line(C,D))", () => { expect(gp("Perpendicular(Line(A,B),Line(C,D))").statements[0]).toMatchObject({ type: "Perpendicular" }); });
    it("Intersection(Line(A,B),Line(C,D))=E", () => { expect(gp("Intersection(Line(A,B),Line(C,D))=E").statements[0]).toMatchObject({ type: "Intersection", result: "E" }); });
    it("Midpoint(M,Segment(A,B))", () => { expect(gp("Midpoint(M,Segment(A,B))").statements[0]).toMatchObject({ type: "Midpoint", label: "M" }); });
});

describe("Geometry — Polygons", () => {
    it("Triangle(A,B,C)",        () => { expect(gp("Triangle(A,B,C)").statements[0]).toMatchObject({ type: "Triangle", points: ["A","B","C"] }); });
    it("Quadrilateral(A,B,C,D)", () => { expect(gp("Quadrilateral(A,B,C,D)").statements[0]).toMatchObject({ type: "Quadrilateral", points: ["A","B","C","D"] }); });
    it("Polygon(A,B,C,D,E)",     () => { expect(gp("Polygon(A,B,C,D,E)").statements[0]).toMatchObject({ type: "Polygon", points: ["A","B","C","D","E"] }); });
});

describe("Geometry — Circle / Ellipse / Arc", () => {
    it("Circle((A,B,C),O)",     () => { expect(gp("Circle((A,B,C),O)").statements[0]).toMatchObject({ type: "Circle", circumPoints: ["A","B","C"], center: "O" }); });
    it("Circle((A,B,C),O,4)",   () => { expect(gp("Circle((A,B,C),O,4)").statements[0].radius).toMatchObject({ type: "NumberLiteral", value: 4 }); });
    it("Ellipse((A,B,C),O,5,3)", () => {
        const s = gp("Ellipse((A,B,C),O,5,3)").statements[0];
        expect(s.type).toBe("Ellipse");
        expect(s.majorAxis).toMatchObject({ type: "NumberLiteral", value: 5 });
        expect(s.minorAxis).toMatchObject({ type: "NumberLiteral", value: 3 });
    });
    it("Arc(A,B,O)", () => { expect(gp("Arc(A,B,O)").statements[0]).toMatchObject({ type: "Arc", a: "A", b: "B", center: "O" }); });
});

describe("Geometry — Coordinate constructs", () => {
    it("Axis(x)",     () => { expect(gp("Axis(x)").statements[0]).toMatchObject({ type: "AxisDecl", name: "x" }); });
    it("Origin(O)",   () => { expect(gp("Origin(O)").statements[0]).toMatchObject({ type: "OriginDecl", label: "O" }); });
    it("Plane(A,B,C)",  () => { expect(gp("Plane(A,B,C)").statements[0]).toMatchObject({ type: "Plane", points: ["A","B","C"] }); });
    it("Geodesic(A,B)", () => { expect(gp("Geodesic(A,B)").statements[0]).toMatchObject({ type: "Geodesic", a: "A", b: "B" }); });
});

describe("Geometry — multi-statement", () => {
    it("right triangle program", () => {
        const p = gp("Point(A,B,C)\nPoint(A)=(0,0)\nPoint(B)=(3,0)\nPoint(C)=(0,4)\nTriangle(A,B,C)\nPerpendicular(Line(A,B),Line(A,C))");
        expect(p.statements).toHaveLength(6);
        expect(p.statements[4].type).toBe("Triangle");
        expect(p.statements[5].type).toBe("Perpendicular");
    });
    it("ignores comment lines", () => {
        expect(gp("# comment\nPoint(A,B)\n// another\nSegment(A,B)").statements).toHaveLength(2);
    });
});

describe("Geometry — render", () => {
    it("segment → SVG",  () => { expect(geo.render(gp("Point(A,B)\nSegment(A,B)")).querySelector("svg")).not.toBeNull(); });
    it("triangle → SVG", () => { expect(geo.render(gp("Point(A,B,C)\nTriangle(A,B,C)")).querySelector("svg")).not.toBeNull(); });
    it("circle → SVG",   () => { expect(geo.render(gp("Point(A,B,C,O)\nCircle((A,B,C),O)")).querySelector("svg")).not.toBeNull(); });
});

// ── Physics grammar tests ─────────────────────────────────────────────────────
// Canonical location: test/plugins/physics/grammar.test.ts
// Hosted here for the same WSL DrvFs reason as geometry above.

const phys = getPlugin("physics");
const pp   = (src: string): any => phys.parse(src) as any;

describe("Physics — Body", () => {
    it("Body(B1)",                   () => { expect(pp("Body(B1)").physStatements[0]).toMatchObject({ type: "BodyDecl", name: "B1" }); });
    it("Body(B1)=mass(m)",           () => { expect(pp("Body(B1)=mass(m)").physStatements[0].mass).toBeDefined(); });
    it("Body(B1)=mass(m),moment(I)", () => {
        const s = pp("Body(B1)=mass(m),moment(I)").physStatements[0];
        expect(s.mass).toBeDefined();
        expect(s.moment).toBeDefined();
    });
});

describe("Physics — Force", () => {
    it("Force(F1,A,\\d)",    () => { expect(pp("Force(F1,A,\\d)").physStatements[0]).toMatchObject({ type: "Force", name: "F1", point: "A", direction: "\\d" }); });
    it("Force(F1,A,\\d)=mg", () => { expect(pp("Force(F1,A,\\d)=mg").physStatements[0].magnitude).toBeDefined(); });
});

describe("Physics — Velocity / Acceleration", () => {
    it("Velocity(v,A,\\r)",        () => { expect(pp("Velocity(v,A,\\r)").physStatements[0]).toMatchObject({ type: "Velocity", name: "v", point: "A" }); });
    it("Acceleration(a,A,\\r)=a0", () => {
        const s = pp("Acceleration(a,A,\\r)=a0").physStatements[0];
        expect(s.type).toBe("Acceleration");
        expect(s.value).toBeDefined();
    });
});

describe("Physics — Constraints", () => {
    it("Fixed(A)",      () => { expect(pp("Fixed(A)").physStatements[0]).toMatchObject({ type: "Fixed", a: "A" }); });
    it("Roller(A,\\u)", () => { expect(pp("Roller(A,\\u)").physStatements[0]).toMatchObject({ type: "Roller", a: "A", direction: "\\u" }); });
    it("Spring(A,B)=k", () => {
        const s = pp("Spring(A,B)=k").physStatements[0];
        expect(s.type).toBe("Spring");
        expect(s.a).toBe("A"); expect(s.b).toBe("B");
        expect(s.value).toBeDefined();
    });
    it("Damper(A,B)=c", () => { expect(pp("Damper(A,B)=c").physStatements[0]).toMatchObject({ type: "Damper", a: "A", b: "B" }); });
    it("String(A,B)",   () => { expect(pp("String(A,B)").physStatements[0]).toMatchObject({ type: "String", a: "A", b: "B" }); });
    it("Contact(A,B)",  () => { expect(pp("Contact(A,B)").physStatements[0]).toMatchObject({ type: "Contact", a: "A", b: "B" }); });
});

describe("Physics — EOM", () => {
    it("EOM(m*a)", () => {
        const s = pp("EOM(m*a)").physStatements[0];
        expect(s.type).toBe("EOM");
        expect(s.equation).toBeDefined();
    });
});

describe("Physics — mixed geo + physics", () => {
    it("separates statements", () => {
        const p = pp("Point(A,B)\nPoint(A)=(0,0)\nSegment(A,B)\nBody(B1)=mass(m)\nForce(W,A,\\d)=mg\nFixed(B)");
        expect(p.geoStatements.length).toBeGreaterThan(0);
        expect(p.physStatements).toHaveLength(3);
        expect(p.physStatements[0].type).toBe("BodyDecl");
        expect(p.physStatements[1].type).toBe("Force");
        expect(p.physStatements[2].type).toBe("Fixed");
    });
});

describe("Physics — render", () => {
    it("free-body diagram → SVG", () => { expect(phys.render(pp("Point(A)\nPoint(A)=(1,1)\nFixed(A)\nForce(W,A,\\d)=mg")).querySelector("svg")).not.toBeNull(); });
    it("spring-mass → SVG",       () => { expect(phys.render(pp("Point(A,B)\nPoint(A)=(0,1)\nPoint(B)=(3,1)\nFixed(A)\nSpring(A,B)=k")).querySelector("svg")).not.toBeNull(); });
});
