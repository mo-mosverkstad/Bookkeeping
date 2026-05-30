/**
 * DocumentView — renders a Document as an ordered sequence of sections.
 *
 * Each section shows either a TableView (for table blocks) or a
 * FlowDiagramView (for graph/chart blocks). Sections are stacked
 * vertically with a collapsible header.
 *
 * This is the primary view for .doc.json files. It implements WorkspaceView
 * so it can be registered in WorkspaceController like any other view.
 */

import type { WorkspaceView, WorkspaceData, ViewState, ToolbarAction } from "./workspace-view.ts";
import type { AppController } from "../controller/index.ts";
import type { SourceEditorView } from "../source-editor/source-editor-view.ts";
import { TableView } from "./table-view.ts";
import { FlowDiagramView } from "./flow-diagram-view.ts";
import { DiagramView } from "./diagram-view.ts";
import type { Document, Section } from "../model/Document.ts";

interface DocumentState {
    collapsedSections: string[];
    scrollTop: number;
}

interface MountedSection {
    section: Section;
    headerEl: HTMLElement;
    bodyEl: HTMLElement;
    view: TableView | FlowDiagramView | DiagramView;
}

export class DocumentView implements WorkspaceView {
    private readonly controller: AppController;
    private readonly sourceEditor: SourceEditorView | null;
    private container: HTMLElement | null = null;
    private doc: Document | null = null;
    private mounted: MountedSection[] = [];
    private collapsedSections = new Set<string>();

    constructor(controller: AppController, sourceEditor?: SourceEditorView) {
        this.controller = controller;
        this.sourceEditor = sourceEditor ?? null;
    }

    // ── WorkspaceView interface ───────────────────────────────────────────────

    mount(container: HTMLElement, data: WorkspaceData, savedState?: ViewState): void {
        this.container = container;
        this.doc = data.document ?? null;

        if (savedState) {
            const s = savedState as DocumentState;
            this.collapsedSections = new Set(s.collapsedSections ?? []);
        }

        this.render();

        if (savedState) {
            container.scrollTop = (savedState as DocumentState).scrollTop ?? 0;
        }
    }

    unmount(): ViewState {
        // Unmount all child views to let them save their own state
        for (const m of this.mounted) m.view.unmount();
        this.mounted = [];
        const state: DocumentState = {
            collapsedSections: [...this.collapsedSections],
            scrollTop: this.container?.scrollTop ?? 0,
        };
        return state;
    }

    update(data: WorkspaceData): void {
        this.doc = data.document ?? null;
        this.render();
    }

    getToolbarActions(): ToolbarAction[] {
        return [];
    }

    onToolbarAction(_id: string): void { /* no document-level toolbar actions yet */ }

    // ── Rendering ─────────────────────────────────────────────────────────────

    private render(): void {
        if (!this.container || !this.doc) return;
        this.container.innerHTML = "";
        this.mounted = [];

        const wrapper = document.createElement("div");
        wrapper.className = "document-view";

        // Document title
        const titleEl = document.createElement("h2");
        titleEl.className = "document-title";
        titleEl.textContent = this.doc.name;
        wrapper.appendChild(titleEl);

        for (const section of this.doc.sections) {
            const sectionEl = this.renderSection(section);
            wrapper.appendChild(sectionEl);
        }

        this.container.appendChild(wrapper);
    }

    private renderSection(section: Section): HTMLElement {
        const sectionEl = document.createElement("div");
        sectionEl.className = "document-section";
        sectionEl.dataset.sectionId = section.id;

        // Section header (collapsible)
        const header = document.createElement("div");
        header.className = "document-section-header";

        const toggle = document.createElement("span");
        toggle.className = "document-section-toggle";
        const isCollapsed = this.collapsedSections.has(section.id);
        toggle.textContent = isCollapsed ? "▶" : "▼";

        const titleEl = document.createElement("span");
        titleEl.className = "document-section-title";
        titleEl.textContent = section.title;

        header.appendChild(toggle);
        header.appendChild(titleEl);
        header.addEventListener("click", () => this.toggleSection(section.id, toggle, body));
        sectionEl.appendChild(header);

        // Section body
        const body = document.createElement("div");
        body.className = "document-section-body";
        body.hidden = isCollapsed;

        // Mount the appropriate child view into the body
        const childContainer = document.createElement("div");
        childContainer.className = "document-section-content";
        body.appendChild(childContainer);

        let view: TableView | FlowDiagramView | DiagramView;

        if (section.block.kind === "table") {
            const tv = new TableView(childContainer);
            tv.setController(this.controller);
            const handler = this.controller.getEntityClickHandler();
            if (handler) tv.setEntityClickHandler(handler);
            if (this.sourceEditor) tv.setSourceEditor(this.sourceEditor);
            tv.mount(childContainer, { table: section.block.table });
            view = tv;
        } else if (section.block.kind === "diagram") {
            const dv = new DiagramView(section.id, section.block.source, this.sourceEditor ?? undefined);
            dv.mount(childContainer, {});
            view = dv;
        } else {
            const graph = section.block.graph;
            const fv = new FlowDiagramView(graph.viewType, this.controller);
            fv.mount(childContainer, { graph });
            view = fv;
        }

        sectionEl.appendChild(body);

        this.mounted.push({ section, headerEl: header, bodyEl: body, view });
        return sectionEl;
    }

    private toggleSection(id: string, toggle: HTMLElement, body: HTMLElement): void {
        if (this.collapsedSections.has(id)) {
            this.collapsedSections.delete(id);
            body.hidden = false;
            toggle.textContent = "▼";
        } else {
            this.collapsedSections.add(id);
            body.hidden = true;
            toggle.textContent = "▶";
        }
    }
}
