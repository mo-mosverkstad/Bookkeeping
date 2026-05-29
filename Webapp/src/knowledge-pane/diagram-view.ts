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
            this.container.appendChild(svg);
        } catch (e) {
            const pre = document.createElement("pre");
            pre.className = "cell-error";
            pre.textContent = (e as Error).message;
            this.container.appendChild(pre);
        }
    }
}
