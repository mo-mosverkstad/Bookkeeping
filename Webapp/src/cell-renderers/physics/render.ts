import { renderGeometry } from "../geometry/render.ts";
import { svgEl, svgText } from "../geometry/el.ts";
import { renderMath } from "../math/render.ts";
import type { PhysicsProgram } from "./types.ts";

// ── Viewport constants (must match geometry renderer) ─────────────────────────

const W = 400, H = 300, PAD = 30;

// ── Point coordinate lookup (re-derived from geo statements) ──────────────────

type Pt = { x: number; y: number };

function mathToNum(node: unknown): number {
    if (!node) return NaN;
    const n = node as { type: string; value?: number };
    return n.type === "NumberLiteral" && n.value !== undefined ? n.value : NaN;
}

function buildPointMap(geoStatements: any[]): Map<string, Pt> {
    const explicit = new Map<string, Pt>();
    const allLabels = new Set<string>();

    for (const s of geoStatements) {
        if (s.type === "PointDecl") {
            for (const lbl of s.labels) allLabels.add(lbl);
            if (s.coords && s.coordLabel) {
                const x = mathToNum(s.coords[0]), y = mathToNum(s.coords[1]);
                if (!isNaN(x) && !isNaN(y)) explicit.set(s.coordLabel, { x, y });
            }
        }
        collectGeoLabels(s, allLabels);
    }

    const pts = new Map<string, Pt>();
    if (explicit.size > 0) {
        const xs = [...explicit.values()].map(p => p.x);
        const ys = [...explicit.values()].map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const scale = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD) / (maxY - minY || 1));
        for (const [lbl, p] of explicit)
            pts.set(lbl, { x: PAD + (p.x - minX) * scale, y: H - PAD - (p.y - minY) * scale });
    }

    const remaining = [...allLabels].filter(l => !pts.has(l));
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - PAD;
    remaining.forEach((lbl, i) => {
        const angle = (2 * Math.PI * i) / remaining.length - Math.PI / 2;
        pts.set(lbl, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    });

    return pts;
}

function collectGeoLabels(s: any, set: Set<string>): void {
    if (!s) return;
    switch (s.type) {
        case "Segment": case "Line": case "Ray": case "Arrow":
            set.add(s.a); set.add(s.b); break;
        case "Triangle": case "Quadrilateral": case "Polygon":
            (s.points as string[]).forEach(p => set.add(p)); break;
        case "Circle": case "Ellipse":
            (s.circumPoints as string[]).forEach(p => set.add(p)); set.add(s.center); break;
    }
}

// ── Direction vector from identifier string ───────────────────────────────────

function directionVector(dir: string): { dx: number; dy: number } {
    const d = dir.trim();
    // Standard physics direction shorthands
    if (d === "\\d" || d === "down")  return { dx: 0,  dy: 1  };
    if (d === "\\u" || d === "up")    return { dx: 0,  dy: -1 };
    if (d === "\\r" || d === "right") return { dx: 1,  dy: 0  };
    if (d === "\\l" || d === "left")  return { dx: -1, dy: 0  };
    // Default: rightward
    return { dx: 1, dy: 0 };
}

// ── Drawing physics primitives ────────────────────────────────────────────────

const FORCE_LEN = 50;
const VECTOR_LEN = 40;

function drawForce(g: SVGElement, pts: Map<string, Pt>, s: any): void {
    const p = pts.get(s.point);
    if (!p) return;
    const { dx, dy } = directionVector(s.direction);
    const x2 = p.x + dx * FORCE_LEN, y2 = p.y + dy * FORCE_LEN;
    g.appendChild(svgEl("line", { x1: p.x, y1: p.y, x2, y2, class: "phys-force", "marker-end": "url(#force-arrow)" }));
    // Label
    const lx = p.x + dx * (FORCE_LEN + 8), ly = p.y + dy * (FORCE_LEN + 8);
    if (s.magnitude) {
        const fo = svgEl("foreignObject", { x: lx - 15, y: ly - 10, width: 50, height: 20 });
        const span = document.createElement("span");
        span.className = "geo-math-label";
        span.appendChild(renderMath(s.magnitude));
        fo.appendChild(span);
        g.appendChild(fo);
    } else {
        g.appendChild(svgText(lx, ly, s.name, "phys-label"));
    }
}

function drawVelocity(g: SVGElement, pts: Map<string, Pt>, s: any): void {
    const p = pts.get(s.point);
    if (!p) return;
    const { dx, dy } = directionVector(s.direction);
    const isAccel = s.type === "Acceleration";
    const x2 = p.x + dx * VECTOR_LEN, y2 = p.y + dy * VECTOR_LEN;
    const cls = isAccel ? "phys-accel" : "phys-velocity";
    const marker = isAccel ? "url(#accel-arrow)" : "url(#vel-arrow)";
    g.appendChild(svgEl("line", { x1: p.x, y1: p.y, x2, y2, class: cls, "marker-end": marker }));
    g.appendChild(svgText(x2 + dx * 6, y2 + dy * 6, s.name, "phys-label"));
}

function drawFixed(g: SVGElement, pts: Map<string, Pt>, s: any): void {
    const p = pts.get(s.a);
    if (!p) return;
    // Pin joint: small circle
    g.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: 5, class: "phys-pin" }));
    // Hatch lines below
    for (let i = -2; i <= 2; i++)
        g.appendChild(svgEl("line", { x1: p.x + i * 4 - 4, y1: p.y + 6, x2: p.x + i * 4, y2: p.y + 12, class: "phys-hatch" }));
    g.appendChild(svgEl("line", { x1: p.x - 10, y1: p.y + 6, x2: p.x + 10, y2: p.y + 6, class: "phys-hatch" }));
}

function drawRoller(g: SVGElement, pts: Map<string, Pt>, s: any): void {
    const p = pts.get(s.a);
    if (!p) return;
    // Roller: triangle + circle
    g.appendChild(svgEl("polygon", { points: `${p.x},${p.y} ${p.x - 8},${p.y + 12} ${p.x + 8},${p.y + 12}`, class: "phys-roller" }));
    g.appendChild(svgEl("circle", { cx: p.x, cy: p.y + 16, r: 4, class: "phys-roller" }));
}

function drawSpring(g: SVGElement, pts: Map<string, Pt>, s: any): void {
    const a = pts.get(s.a), b = pts.get(s.b);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const coils = 6, amp = 6;
    const pts2: string[] = [`${a.x},${a.y}`];
    for (let i = 1; i <= coils * 2; i++) {
        const t = i / (coils * 2);
        const side = i % 2 === 0 ? amp : -amp;
        pts2.push(`${a.x + dx * t + nx * side},${a.y + dy * t + ny * side}`);
    }
    pts2.push(`${b.x},${b.y}`);
    g.appendChild(svgEl("polyline", { points: pts2.join(" "), class: "phys-spring" }));
    if (s.value) {
        const mx = (a.x + b.x) / 2 + nx * 14, my = (a.y + b.y) / 2 + ny * 14;
        const fo = svgEl("foreignObject", { x: mx - 15, y: my - 10, width: 40, height: 20 });
        const span = document.createElement("span");
        span.className = "geo-math-label";
        span.appendChild(renderMath(s.value));
        fo.appendChild(span);
        g.appendChild(fo);
    }
}

function drawDamper(g: SVGElement, pts: Map<string, Pt>, s: any): void {
    const a = pts.get(s.a), b = pts.get(s.b);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // Line from a to midpoint, rectangle at midpoint, line to b
    g.appendChild(svgEl("line", { x1: a.x, y1: a.y, x2: mx - dx / len * 8, y2: my - dy / len * 8, class: "phys-damper" }));
    g.appendChild(svgEl("rect", { x: mx - 8, y: my - 5, width: 16, height: 10, class: "phys-damper-box", transform: `rotate(${Math.atan2(dy, dx) * 180 / Math.PI},${mx},${my})` }));
    g.appendChild(svgEl("line", { x1: mx + dx / len * 8, y1: my + dy / len * 8, x2: b.x, y2: b.y, class: "phys-damper" }));
}

function drawString(g: SVGElement, pts: Map<string, Pt>, s: any): void {
    const a = pts.get(s.a), b = pts.get(s.b);
    if (!a || !b) return;
    g.appendChild(svgEl("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "phys-string" }));
}

// ── SVG defs (markers) ────────────────────────────────────────────────────────

function buildPhysDefs(): SVGElement {
    const defs = svgEl("defs");

    const makeMarker = (id: string, cls: string) => {
        const m = svgEl("marker", { id, markerWidth: "8", markerHeight: "6", refX: "8", refY: "3", orient: "auto" });
        m.appendChild(svgEl("polygon", { points: "0 0, 8 3, 0 6", class: cls }));
        return m;
    };

    defs.appendChild(makeMarker("force-arrow",  "phys-force-head"));
    defs.appendChild(makeMarker("vel-arrow",    "phys-vel-head"));
    defs.appendChild(makeMarker("accel-arrow",  "phys-accel-head"));
    return defs;
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderPhysics(program: PhysicsProgram): HTMLElement {
    // Render geometry base layer first
    const geoWrapper = renderGeometry({ type: "GeometryProgram", statements: program.geoStatements });
    const geoSvg = geoWrapper.querySelector("svg")!;

    // Build point map from geo statements for physics overlay
    const pts = buildPointMap(program.geoStatements);

    // Add physics defs to the existing SVG
    geoSvg.insertBefore(buildPhysDefs(), geoSvg.firstChild);

    const g = svgEl("g");

    for (const s of program.physStatements) {
        switch (s.type) {
            case "Force":              drawForce(g, pts, s); break;
            case "Velocity":
            case "Acceleration":       drawVelocity(g, pts, s); break;
            case "Fixed":              drawFixed(g, pts, s); break;
            case "Roller":             drawRoller(g, pts, s); break;
            case "Spring":             drawSpring(g, pts, s); break;
            case "Damper":             drawDamper(g, pts, s); break;
            case "String":             drawString(g, pts, s); break;
            case "BodyDecl":
                // Body label at its point if a point with the same name exists
                if (pts.has(s.name)) {
                    const p = pts.get(s.name)!;
                    geoSvg.appendChild(svgText(p.x + 6, p.y - 6, s.name, "phys-body-label"));
                }
                break;
            // FrameDecl, InertialDecl, EOM, Torque, AngularVelocity,
            // AngularAcceleration — structural/annotation only, no drawing
        }
    }

    geoSvg.appendChild(g);
    return geoWrapper;
}
