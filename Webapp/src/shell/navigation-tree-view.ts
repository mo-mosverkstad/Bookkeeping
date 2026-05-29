/**
 * NavigationTreeView — left sidebar, directory-style hierarchy.
 *
 *   📁 Biochemistry Reference      ← document folder
 *       ▤ Glycolysis Compounds     ← section (table)
 *       ◈ Glycolysis Pathway       ← section (graph)
 *   📁 Mathematics Reference
 *       ▤ Calculus
 *       ▤ Linear Algebra
 *   📂 Standalone                  ← group for items not in any document
 *       ▤ theorems
 *       ◈ glycolysis-map
 */

import type { AppController } from "../controller/index.ts";
import type { WorkspaceController } from "../knowledge-pane/workspace-controller.ts";
import type { Document, TableBlock, GraphBlock } from "../model/Document.ts";

export class NavigationTreeView {
    private readonly container: HTMLElement;
    private readonly controller: AppController;
    private workspace: WorkspaceController | null = null;
    private collapsed = new Set<string>();

    constructor(container: HTMLElement, controller: AppController) {
        this.container = container;
        this.controller = controller;
    }

    setWorkspaceController(wc: WorkspaceController): void {
        this.workspace = wc;
    }

    refresh(): void {
        this.container.innerHTML = "";
        const kb = this.controller.getKnowledgeBase();

        // Track which tables/graphs belong to a document
        const docTableNames = new Set<string>();
        const docGraphFiles = new Set<string>();

        for (const doc of kb.documents) {
            this.renderFolder(doc, docTableNames, docGraphFiles);
        }

        // Collect standalone items
        const standaloneGraphs = kb.graphs.filter(g =>
            !docGraphFiles.has(g.sourceFile ?? g.name)
        );
        const standaloneTables = kb.tables.filter(t => !docTableNames.has(t.name));

        if (standaloneGraphs.length > 0 || standaloneTables.length > 0) {
            this.renderStandaloneGroup(standaloneGraphs, standaloneTables);
        }

        if (this.container.children.length === 0) {
            const empty = document.createElement("div");
            empty.className = "nav-tree-empty";
            empty.textContent = "No files loaded";
            this.container.appendChild(empty);
        }
    }

    // ── Folder (Document) ─────────────────────────────────────────────────────

    private renderFolder(
        doc: Document,
        docTableNames: Set<string>,
        docGraphFiles: Set<string>,
    ): void {
        const key = "doc:" + doc.name;
        const isCollapsed = this.collapsed.has(key);

        const folderEl = document.createElement("div");
        folderEl.className = "nav-folder";

        const header = this.makeFolderHeader(
            doc.name,
            isCollapsed,
            null,
            () => this.toggleCollapse(key, childrenEl),
        );
        folderEl.appendChild(header);

        const childrenEl = document.createElement("div");
        childrenEl.className = "nav-folder-children";
        childrenEl.hidden = isCollapsed;

        for (const section of doc.sections) {
            const kind = section.block.kind;
            const name = kind === "table"
                ? (section.block as TableBlock).table.name
                : (section.block as GraphBlock).graph.name;
            const item = this.makeLeaf(
                kind === "graph" ? "◈" : "▤",
                section.title,
                () => { this.workspace?.openTab(name); },
            );
            childrenEl.appendChild(item);

            if (kind === "table") {
                docTableNames.add((section.block as TableBlock).table.name);
            } else {
                const sf = (section.block as GraphBlock).graph.sourceFile;
                docGraphFiles.add(sf ?? (section.block as GraphBlock).graph.name);
            }
        }

        folderEl.appendChild(childrenEl);
        this.container.appendChild(folderEl);
    }

    // ── Standalone group ──────────────────────────────────────────────────────

    private renderStandaloneGroup(
        graphs: import("../model/Graph.ts").Graph[],
        tables: import("../model/Table.ts").Table[],
    ): void {
        const key = "standalone";
        const isCollapsed = this.collapsed.has(key);

        const folderEl = document.createElement("div");
        folderEl.className = "nav-folder nav-folder-standalone";

        const header = this.makeFolderHeader(
            "Standalone",
            isCollapsed,
            null,
            () => this.toggleCollapse(key, childrenEl),
        );
        folderEl.appendChild(header);

        const childrenEl = document.createElement("div");
        childrenEl.className = "nav-folder-children";
        childrenEl.hidden = isCollapsed;

        for (const graph of graphs) {
            childrenEl.appendChild(this.makeLeaf("◈", graph.name, () => {
                this.workspace?.openTab(graph.name);
            }));
        }
        for (const table of tables) {
            childrenEl.appendChild(this.makeLeaf("▤", table.name, () => {
                this.workspace?.openTab(table.name);
            }));
        }

        folderEl.appendChild(childrenEl);
        this.container.appendChild(folderEl);
    }

    // ── Collapse state ────────────────────────────────────────────────────────

    private toggleCollapse(key: string, childrenEl: HTMLElement): void {
        const nowCollapsed = !childrenEl.hidden;
        childrenEl.hidden = nowCollapsed;
        if (nowCollapsed) {
            this.collapsed.add(key);
        } else {
            this.collapsed.delete(key);
        }
        // Update the toggle arrow on the header
        const header = childrenEl.previousElementSibling as HTMLElement | null;
        const arrow = header?.querySelector(".nav-folder-arrow");
        if (arrow) arrow.textContent = nowCollapsed ? "▶" : "▼";
    }

    // ── DOM helpers ───────────────────────────────────────────────────────────

    private makeFolderHeader(
        label: string,
        collapsed: boolean,
        onLabelClick: (() => void) | null,
        onToggle: () => void,
    ): HTMLElement {
        const header = document.createElement("div");
        header.className = "nav-folder-header";

        const arrow = document.createElement("span");
        arrow.className = "nav-folder-arrow";
        arrow.textContent = collapsed ? "▶" : "▼";
        arrow.addEventListener("click", (e) => { e.stopPropagation(); onToggle(); });

        const icon = document.createElement("span");
        icon.className = "nav-folder-icon";
        icon.textContent = "📁";

        const labelEl = document.createElement("span");
        labelEl.className = "nav-folder-label";
        labelEl.textContent = label;
        if (onLabelClick) {
            labelEl.classList.add("nav-folder-label-link");
            labelEl.addEventListener("click", (e) => { e.stopPropagation(); onLabelClick(); });
        }

        header.appendChild(arrow);
        header.appendChild(icon);
        header.appendChild(labelEl);
        // Clicking the header row (not just arrow) also toggles
        header.addEventListener("click", onToggle);
        return header;
    }

    private makeLeaf(icon: string, label: string, onClick: () => void): HTMLElement {
        const item = document.createElement("div");
        item.className = "nav-leaf";

        const iconEl = document.createElement("span");
        iconEl.className = "nav-leaf-icon";
        iconEl.textContent = icon;

        const labelEl = document.createElement("span");
        labelEl.className = "nav-leaf-label";
        labelEl.textContent = label;

        item.appendChild(iconEl);
        item.appendChild(labelEl);
        item.addEventListener("click", onClick);
        return item;
    }
}
