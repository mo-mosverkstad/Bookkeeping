import { renderMath } from "../math/render.ts";
import { svgEl, svgText } from "./el.ts";
import type {
    GeometryProgram, GeoStatement, GeoExpr,
    SegmentExpr, LineExpr, RayExpr, AngleExpr,
} from "./types.ts";

const W = 400, H = 300;
const PAD = 30;

// ── Coordinate system ─────────────────────────────────────────────────────────

type Pt = { x: number; y: number };

function mathToNum(node: unknown): number {
    if (!node) return NaN;
    const n = node as { type: string; value?: number };
    return n.type === "NumberLiteral" && n.value !== undefined ? n.value : NaN;
}

function buildPointMap(statements: GeoStatement[]): Map<string, Pt> {
    const explicit = new Map<string, Pt>();
    const allLabels = new Set<string>();

    for (const s of statements) {
        if (s.type === "PointDecl") {
            for (const lbl of s.labels) allLabels.add(lbl);
            if (s.coords && s.coordLabel) {
                const x = mathToNum(s.coords[0]);
                const y = mathToNum(s.coords[1]);
                if (!isNaN(x) && !isNaN(y)) explicit.set(s.coordLabel, { x, y });
            }
        }
        collectLabels(s, allLabels);
    }

    const pts = new Map<string, Pt>();
    if (explicit.size > 0) {
        const xs = [...explicit.values()].map(p => p.x);
        const ys = [...explicit.values()].map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
        const scale = Math.min((W - 2 * PAD) / rangeX, (H - 2 * PAD) / rangeY);
        for (const [lbl, p] of explicit) {
            pts.set(lbl, {
                x: PAD + (p.x - minX) * scale,
                y: H - PAD - (p.y - minY) * scale,
            });
        }
    }

    const remaining = [...allLabels].filter(l => !pts.has(l));
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - PAD;
    remaining.forEach((lbl, i) => {
        const angle = (2 * Math.PI * i) / remaining.length - Math.PI / 2;
        pts.set(lbl, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    });

    return pts;
}

function collectLabels(s: GeoStatement, set: Set<string>): void {
    switch (s.type) {
        case "Segment": case "Line": case "Ray": case "Arrow":
            set.add(s.a); set.add(s.b); break;
        case "Angle":
            set.add(s.a); set.add(s.vertex); set.add(s.b); break;
        case "Triangle":
            s.points.forEach(p => set.add(p)); break;
        case "Quadrilateral": case "Polygon":
            s.points.forEach(p => set.add(p)); break;
        case "Circle": case "Ellipse":
            s.circumPoints.forEach(p => set.add(p)); set.add(s.center); break;
        case "Arc":
            set.add(s.a); set.add(s.b); set.add(s.center); break;
        case "Parallel": case "Perpendicular":
            collectGeoExprLabels(s.left, set); collectGeoExprLabels(s.right, set); break;
        case "Intersection":
            collectGeoExprLabels(s.left, set); collectGeoExprLabels(s.right, set);
            set.add(s.result); break;
        case "Midpoint":
            set.add(s.label); set.add(s.segment.a); set.add(s.segment.b); break;
        case "Geodesic":
            set.add(s.a); set.add(s.b); break;
    }
}

function collectGeoExprLabels(e: GeoExpr, set: Set<string>): void {
    switch (e.type) {
        case "Segment": case "Line": case "Ray": set.add(e.a); set.add(e.b); break;
        case "Angle": set.add(e.a); set.add(e.vertex); set.add(e.b); break;
    }
}

// ── Drawing primitives ────────────────────────────────────────────────────────

function drawSegment(g: SVGElement, pts: Map<string, Pt>, s: SegmentExpr): void {
    const a = pts.get(s.a), b = pts.get(s.b);
    if (!a || !b) return;
    g.appendChild(svgEl("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "geo-segment" }));
    if (s.label) {
        const fo = svgEl("foreignObject", { x: (a.x + b.x) / 2 + 8, y: (a.y + b.y) / 2 - 18, width: 60, height: 20 });
        const span = document.createElement("span");
        span.className = "geo-math-label";
        span.appendChild(renderMath(s.label));
        fo.appendChild(span);
        g.appendChild(fo);
    }
}

function drawLine(g: SVGElement, pts: Map<string, Pt>, s: LineExpr): void {
    const a = pts.get(s.a), b = pts.get(s.b);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ext = Math.max(W, H);
    g.appendChild(svgEl("line", {
        x1: a.x - dx / len * ext, y1: a.y - dy / len * ext,
        x2: a.x + dx / len * ext, y2: a.y + dy / len * ext,
        class: "geo-line",
    }));
}

function drawRay(g: SVGElement, pts: Map<string, Pt>, s: RayExpr): void {
    const a = pts.get(s.a), b = pts.get(s.b);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ext = Math.max(W, H);
    g.appendChild(svgEl("line", {
        x1: a.x, y1: a.y,
        x2: a.x + dx / len * ext, y2: a.y + dy / len * ext,
        class: "geo-ray",
    }));
}

function drawArrow(g: SVGElement, pts: Map<string, Pt>, a: string, b: string): void {
    const pa = pts.get(a), pb = pts.get(b);
    if (!pa || !pb) return;
    g.appendChild(svgEl("line", {
        x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y,
        class: "geo-arrow", "marker-end": "url(#arrowhead)",
    }));
}

function drawAngle(g: SVGElement, pts: Map<string, Pt>, s: AngleExpr): void {
    const va = pts.get(s.a), vv = pts.get(s.vertex), vb = pts.get(s.b);
    if (!va || !vv || !vb) return;
    const r = 18;
    const a1 = Math.atan2(va.y - vv.y, va.x - vv.x);
    const a2 = Math.atan2(vb.y - vv.y, vb.x - vv.x);
    const x1 = vv.x + r * Math.cos(a1), y1 = vv.y + r * Math.sin(a1);
    const x2 = vv.x + r * Math.cos(a2), y2 = vv.y + r * Math.sin(a2);
    let diff = a2 - a1;
    while (diff < 0) diff += 2 * Math.PI;
    g.appendChild(svgEl("path", {
        d: `M ${x1} ${y1} A ${r} ${r} 0 ${diff > Math.PI ? 1 : 0} ${diff < Math.PI ? 0 : 1} ${x2} ${y2}`,
        class: "geo-angle-arc",
    }));
    if (s.value) {
        const am = (a1 + a2) / 2;
        const fo = svgEl("foreignObject", { x: vv.x + (r + 6) * Math.cos(am) - 15, y: vv.y + (r + 6) * Math.sin(am) - 10, width: 50, height: 20 });
        const span = document.createElement("span");
        span.className = "geo-math-label";
        span.appendChild(renderMath(s.value));
        fo.appendChild(span);
        g.appendChild(fo);
    }
}

function drawPolygon(g: SVGElement, pts: Map<string, Pt>, points: string[], cls: string): void {
    const coords = points.map(p => pts.get(p)).filter(Boolean) as Pt[];
    if (coords.length < 2) return;
    const d = coords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
    g.appendChild(svgEl("path", { d, class: cls }));
}

function drawCircle(g: SVGElement, pts: Map<string, Pt>, s: { circumPoints: string[]; center: string; radius?: unknown }): void {
    const c = pts.get(s.center);
    if (!c) return;
    const rv = mathToNum(s.radius);
    let r: number;
    if (!isNaN(rv)) {
        r = rv * 20;
    } else {
        const cp = pts.get(s.circumPoints[0]);
        if (!cp) return;
        const dx = cp.x - c.x, dy = cp.y - c.y;
        r = Math.sqrt(dx * dx + dy * dy);
    }
    g.appendChild(svgEl("circle", { cx: c.x, cy: c.y, r, class: "geo-circle" }));
}

function drawEllipse(g: SVGElement, pts: Map<string, Pt>, s: { circumPoints: string[]; center: string; majorAxis?: unknown; minorAxis?: unknown }): void {
    const c = pts.get(s.center);
    if (!c) return;
    const rx = !isNaN(mathToNum(s.majorAxis)) ? mathToNum(s.majorAxis) * 20 : 60;
    const ry = !isNaN(mathToNum(s.minorAxis)) ? mathToNum(s.minorAxis) * 20 : 40;
    g.appendChild(svgEl("ellipse", { cx: c.x, cy: c.y, rx, ry, class: "geo-ellipse" }));
}

function drawArc(g: SVGElement, pts: Map<string, Pt>, s: { a: string; b: string; center: string }): void {
    const pa = pts.get(s.a), pb = pts.get(s.b), pc = pts.get(s.center);
    if (!pa || !pb || !pc) return;
    const dx = pa.x - pc.x, dy = pa.y - pc.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    g.appendChild(svgEl("path", {
        d: `M ${pa.x} ${pa.y} A ${r} ${r} 0 0 1 ${pb.x} ${pb.y}`,
        class: "geo-arc",
    }));
}

function drawParallelMarks(g: SVGElement, pts: Map<string, Pt>, e: GeoExpr): void {
    if (e.type !== "Segment" && e.type !== "Line") return;
    const a = pts.get(e.a), b = pts.get(e.b);
    if (!a || !b) return;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len * 5, ny = dx / len * 5;
    g.appendChild(svgEl("line", { x1: mx - nx, y1: my - ny, x2: mx + nx, y2: my + ny, class: "geo-tick" }));
}

function drawPerpMark(g: SVGElement, pts: Map<string, Pt>, e1: GeoExpr, e2: GeoExpr): void {
    if ((e1.type !== "Line" && e1.type !== "Segment") ||
        (e2.type !== "Line" && e2.type !== "Segment")) return;
    const a = pts.get(e1.a), b = pts.get(e1.b);
    if (!a || !b) return;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const sz = 6;
    g.appendChild(svgEl("rect", { x: mx - sz / 2, y: my - sz / 2, width: sz, height: sz, class: "geo-perp-mark" }));
}

function drawPoints(g: SVGElement, pts: Map<string, Pt>): void {
    for (const [lbl, p] of pts) {
        g.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: 2.5, class: "geo-point" }));
        g.appendChild(svgText(p.x + 5, p.y - 5, lbl));
    }
}

function buildDefs(): SVGElement {
    const defs = svgEl("defs");
    const marker = svgEl("marker", { id: "arrowhead", markerWidth: "8", markerHeight: "6", refX: "8", refY: "3", orient: "auto" });
    marker.appendChild(svgEl("polygon", { points: "0 0, 8 3, 0 6", class: "geo-arrowhead" }));
    defs.appendChild(marker);
    return defs;
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderGeometry(program: GeometryProgram): HTMLElement {
    const pts = buildPointMap(program.statements);

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "geo-diagram", role: "img" }) as SVGSVGElement;
    svg.appendChild(buildDefs());

    const g = svgEl("g");

    for (const s of program.statements) {
        switch (s.type) {
            case "Segment":       drawSegment(g, pts, s); break;
            case "Line":          drawLine(g, pts, s); break;
            case "Ray":           drawRay(g, pts, s); break;
            case "Arrow":         drawArrow(g, pts, s.a, s.b); break;
            case "Angle":         drawAngle(g, pts, s); break;
            case "Triangle":      drawPolygon(g, pts, s.points, "geo-polygon"); break;
            case "Quadrilateral": drawPolygon(g, pts, s.points, "geo-polygon"); break;
            case "Polygon":       drawPolygon(g, pts, s.points, "geo-polygon"); break;
            case "Circle":        drawCircle(g, pts, s); break;
            case "Ellipse":       drawEllipse(g, pts, s); break;
            case "Arc":           drawArc(g, pts, s); break;
            case "Parallel":
                drawParallelMarks(g, pts, s.left);
                drawParallelMarks(g, pts, s.right);
                break;
            case "Perpendicular":
                drawPerpMark(g, pts, s.left, s.right);
                break;
            case "Intersection":
                if (pts.has(s.result)) {
                    const p = pts.get(s.result)!;
                    g.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: 3, class: "geo-point" }));
                    g.appendChild(svgText(p.x + 5, p.y - 5, s.result));
                }
                break;
            case "Midpoint": {
                const a = pts.get(s.segment.a), b = pts.get(s.segment.b);
                if (a && b) {
                    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                    pts.set(s.label, { x: mx, y: my });
                    g.appendChild(svgEl("circle", { cx: mx, cy: my, r: 2.5, class: "geo-point" }));
                    g.appendChild(svgText(mx + 5, my - 5, s.label));
                }
                break;
            }
            case "Geodesic": {
                const a = pts.get(s.a), b = pts.get(s.b);
                if (a && b) g.appendChild(svgEl("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "geo-geodesic" }));
                break;
            }
        }
    }

    drawPoints(g, pts);
    svg.appendChild(g);

    const wrapper = document.createElement("div");
    wrapper.className = "geo-wrapper";
    wrapper.appendChild(svg);
    return wrapper;
}
