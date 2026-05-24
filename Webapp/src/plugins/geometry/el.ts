const SVG_NS = "http://www.w3.org/2000/svg";

/** Create an SVG element with optional attributes. */
export function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
    const el = document.createElementNS(SVG_NS, tag) as SVGElement;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
}

/** Create an SVG text element. */
export function svgText(x: number, y: number, content: string, cls = "geo-label"): SVGElement {
    const t = svgEl("text", { x, y, class: cls });
    t.textContent = content;
    return t;
}
