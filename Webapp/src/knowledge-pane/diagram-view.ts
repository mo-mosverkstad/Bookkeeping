import type { WorkspaceView, WorkspaceData, ViewState, ToolbarAction } from "./workspace-view.ts";
import { parseDiagram } from "../cell-renderers/diagram/index.ts";
import type { AppController } from "../controller/index.ts";

/**
 * DiagramView — renders a standalone diagram file (flowchart, sequence, etc.)
 * from its text source. Bidirectional sync with source editor.
 * Supports global undo/redo via controller.editDiagram().
 */
export class DiagramView implements WorkspaceView {
    private container: HTMLElement | null = null;
    private source: string;
    private controller: AppController | null = null;
    private name: string;
    private panX = 0;
    private panY = 0;
    private zoom = 1;
    private contentGroup: SVGGElement | null = null;

    constructor(name: string, source: string, controller?: AppController) {
        this.name = name;
        this.source = source;
        this.controller = controller ?? null;
    }

    private editorPane: HTMLTextAreaElement | null = null;
    private renderPane: HTMLElement | null = null;

    mount(container: HTMLElement, _data: WorkspaceData, _state?: ViewState): void {
        this.container = container;
        container.style.overflow = "hidden";
        container.style.display = "flex";

        const left = document.createElement("div");
        left.className = "diagram-split-editor";
        this.editorPane = document.createElement("textarea");
        this.editorPane.className = "diagram-editor-textarea";
        this.editorPane.spellcheck = false;
        this.editorPane.value = this.source;
        left.appendChild(this.editorPane);

        const right = document.createElement("div");
        right.className = "diagram-split-output";
        this.renderPane = right;

        container.appendChild(left);
        container.appendChild(right);

        this.render();
        this.controller?.registerDiagramCallback(
            this.name,
            (src) => { this.source = src; if (this.editorPane) this.editorPane.value = src; this.render(); },
            () => this.source,
        );

        this.editorPane.addEventListener("input", () => {
            const oldSource = this.source;
            this.source = this.editorPane!.value;
            this.render();
            this.controller?.editDiagram(this.name, oldSource, this.source);
        });
    }

    unmount(): ViewState {
        if (this.container) { this.container.style.overflow = ""; this.container.style.display = ""; }
        this.controller?.unregisterDiagramCallback(this.name);
        this.editorPane = null;
        this.renderPane = null;
        this.contentGroup = null;
        return {};
    }

    update(_data: WorkspaceData): void {
        this.render();
    }

    getToolbarActions(): ToolbarAction[] { return []; }
    onToolbarAction(_id: string): void {}

    private doZoom(id: string): void {
        if (id === "zoom-in") {
            this.zoom = Math.min(4, this.zoom * 1.25);
        } else if (id === "zoom-out") {
            this.zoom = Math.max(0.25, this.zoom * 0.8);
        } else if (id === "zoom-reset") {
            this.zoom = 1; this.panX = 0; this.panY = 0;
        }
        this.applyTransform();
    }

    private applyTransform(): void {
        if (this.contentGroup) {
            this.contentGroup.setAttribute("transform", `translate(${this.panX},${this.panY}) scale(${this.zoom})`);
        }
    }

    private render(): void {
        const target = this.renderPane ?? this.container;
        if (!target) return;
        target.innerHTML = "";
        target.style.overflow = "hidden";
        target.style.position = "relative";
        this.contentGroup = null;
        try {
            const result = parseDiagram(this.source);
            const W = target.clientWidth || 800;
            const H = target.clientHeight || 600;
            const svg = result.render(W, H);
            svg.setAttribute("width", String(W));
            svg.setAttribute("height", String(H));
            svg.style.display = "block";
            const content = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
            while (svg.firstChild) content.appendChild(svg.firstChild);
            svg.appendChild(content);
            this.contentGroup = content;
            this.applyTransform();

            let dragging = false, lastX = 0, lastY = 0;
            svg.style.cursor = "grab";
            svg.addEventListener("mousedown", (e) => { e.preventDefault(); dragging = true; lastX = e.clientX; lastY = e.clientY; svg.style.cursor = "grabbing"; });
            svg.addEventListener("mousemove", (e) => { if (!dragging) return; this.panX += e.clientX - lastX; this.panY += e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; this.applyTransform(); });
            svg.addEventListener("mouseup", () => { dragging = false; svg.style.cursor = "grab"; });
            svg.addEventListener("mouseleave", () => { dragging = false; svg.style.cursor = "grab"; });
            svg.addEventListener("wheel", (e) => {
                e.preventDefault();
                this.zoom = Math.max(0.25, Math.min(4, this.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
                this.applyTransform();
            }, { passive: false });

            target.appendChild(svg);

            // Floating zoom controls at bottom-right
            const controls = document.createElement("div");
            controls.className = "diagram-zoom-controls";
            for (const [id, label] of [["zoom-in", "+"], ["zoom-out", "\u2212"], ["zoom-reset", "\u27F2"]] as const) {
                const btn = document.createElement("button");
                btn.textContent = label;
                btn.title = id === "zoom-in" ? "Zoom in" : id === "zoom-out" ? "Zoom out" : "Reset";
                btn.addEventListener("click", () => this.doZoom(id));
                controls.appendChild(btn);
            }
            target.appendChild(controls);
        } catch (e) {
            const pre = document.createElement("pre");
            pre.className = "cell-error";
            pre.textContent = (e as Error).message;
            target.appendChild(pre);
        }
    }
}
