import type { WorkspaceView, WorkspaceData, ViewState, ToolbarAction } from "./workspace-view.ts";
import { parseDiagram } from "../cell-renderers/diagram/index.ts";
import type { SourceEditorView } from "../source-editor/source-editor-view.ts";

/**
 * DiagramView — renders a standalone diagram file (flowchart, sequence, etc.)
 * from its text source. Bidirectional sync with source editor.
 */
export class DiagramView implements WorkspaceView {
    private container: HTMLElement | null = null;
    private source: string;
    private sourceEditor: SourceEditorView | null = null;
    private name: string;

    constructor(name: string, source: string, sourceEditor?: SourceEditorView) {
        this.name = name;
        this.source = source;
        this.sourceEditor = sourceEditor ?? null;
    }

    mount(container: HTMLElement, _data: WorkspaceData, _state?: ViewState): void {
        this.container = container;
        container.style.overflow = "hidden";
        this.render();
        if (this.sourceEditor) {
            requestAnimationFrame(() => {
                this.sourceEditor!.setText(this.source);
                this.sourceEditor!.setOnCellApply((value: string) => {
                    this.source = value;
                    this.render();
                });
            });
        }
    }

    unmount(): ViewState {
        if (this.container) this.container.style.overflow = "";
        this.sourceEditor?.setOnCellApply(null);
        this.sourceEditor?.clear();
        return {};
    }

    update(_data: WorkspaceData): void {
        this.render();
    }

    getToolbarActions(): ToolbarAction[] { return []; }
    onToolbarAction(_id: string): void {}

    private render(): void {
        if (!this.container) return;
        this.container.innerHTML = "";
        try {
            const result = parseDiagram(this.source);
            const W = this.container.clientWidth || 800;
            const H = this.container.clientHeight || 600;
            const svg = result.render(W, H);
            // Wrap content in a pannable group
            const content = document.createElementNS("http://www.w3.org/2000/svg", "g");
            while (svg.firstChild) content.appendChild(svg.firstChild);
            svg.appendChild(content);

            let panX = 0, panY = 0, zoom = 1;
            let dragging = false, lastX = 0, lastY = 0;
            const apply = () => content.setAttribute("transform", `translate(${panX},${panY}) scale(${zoom})`);

            svg.style.cursor = "grab";
            svg.addEventListener("mousedown", (e) => { e.preventDefault(); dragging = true; lastX = e.clientX; lastY = e.clientY; svg.style.cursor = "grabbing"; });
            svg.addEventListener("mousemove", (e) => { if (!dragging) return; panX += e.clientX - lastX; panY += e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; apply(); });
            svg.addEventListener("mouseup", () => { dragging = false; svg.style.cursor = "grab"; });
            svg.addEventListener("mouseleave", () => { dragging = false; svg.style.cursor = "grab"; });
            svg.addEventListener("wheel", (e) => { e.preventDefault(); zoom = Math.max(0.2, Math.min(4, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); apply(); }, { passive: false });

            this.container.appendChild(svg);
        } catch (e) {
            const pre = document.createElement("pre");
            pre.className = "cell-error";
            pre.textContent = (e as Error).message;
            this.container.appendChild(pre);
        }
    }
}
