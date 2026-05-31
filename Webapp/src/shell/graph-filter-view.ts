import type { Association } from "../model/index.ts";
import type { AppController } from "../controller/index.ts";

/**
 * Graph Filter View — renders filter controls and association detail panel.
 */
export class GraphFilterView {

    private relSelect: HTMLSelectElement;
    private targetSelect: HTMLSelectElement;
    private detailPanel: HTMLElement;
    private controller: AppController;

    constructor(container: HTMLElement, controller: AppController) {

        this.controller = controller;

        const filterDiv = document.createElement("div");
        filterDiv.className = "graph-filter";

        const relLabel = document.createElement("label");
        relLabel.textContent = "Rel: ";
        this.relSelect = document.createElement("select");
        relLabel.appendChild(this.relSelect);

        const targetLabel = document.createElement("label");
        targetLabel.textContent = "Target: ";
        this.targetSelect = document.createElement("select");
        targetLabel.appendChild(this.targetSelect);

        const filterBtn = document.createElement("button");
        filterBtn.textContent = "Filter";
        filterBtn.addEventListener("click", () => {
            const rel = this.relSelect.value;
            const target = this.targetSelect.value;
            if (rel && target) this.controller.filterByRelation(rel, target);
        });

        const resetBtn = document.createElement("button");
        resetBtn.textContent = "All";
        resetBtn.addEventListener("click", () => this.controller.showAll());

        filterDiv.appendChild(relLabel);
        filterDiv.appendChild(targetLabel);
        filterDiv.appendChild(filterBtn);
        filterDiv.appendChild(resetBtn);
        container.appendChild(filterDiv);

        // Floating detail panel appended to body so it overlays the workspace
        this.detailPanel = document.createElement("div");
        this.detailPanel.className = "association-detail";
        document.body.appendChild(this.detailPanel);

        // Close on outside click
        document.addEventListener("click", (e) => {
            if (!this.detailPanel.contains(e.target as Node)) this.detailPanel.innerHTML = "";
        });
    }

    getDetailPanel(): HTMLElement { return this.detailPanel; }

    updateDropdowns(relationTypes: string[], entityIds: string[]): void {
        this.relSelect.innerHTML = "";
        for (const t of relationTypes) {
            const opt = document.createElement("option");
            opt.value = t; opt.textContent = t;
            this.relSelect.appendChild(opt);
        }
        this.targetSelect.innerHTML = "";
        for (const id of entityIds) {
            const opt = document.createElement("option");
            opt.value = id; opt.textContent = id;
            this.targetSelect.appendChild(opt);
        }
    }

    showEntityAssociations(entityId: string): void {
        const { outgoing, incoming } = this.controller.getAssociationsFor(entityId);
        this.detailPanel.innerHTML = `<h4>Associations for: ${entityId}</h4>`;

        if (outgoing.length > 0) {
            this.detailPanel.appendChild(document.createTextNode("Outgoing:"));
            this.detailPanel.appendChild(this.buildList(outgoing, "out"));
        }
        if (incoming.length > 0) {
            this.detailPanel.appendChild(document.createTextNode("Incoming:"));
            this.detailPanel.appendChild(this.buildList(incoming, "in"));
        }
        if (outgoing.length === 0 && incoming.length === 0) {
            this.detailPanel.appendChild(document.createTextNode("No associations found."));
        }
    }

    private buildList(assocs: Association[], direction: "out" | "in"): HTMLElement {
        const ul = document.createElement("ul");
        for (const a of assocs) {
            const li = document.createElement("li");
            if (direction === "out") {
                const link = this.entityLink(a.target);
                li.innerHTML = `<strong>${a.relation}</strong> → `;
                li.appendChild(link);
            } else {
                const inverse = this.controller.getInverse(a.relation) ?? `(inverse of ${a.relation})`;
                const link = this.entityLink(a.source);
                li.innerHTML = `<strong>${inverse}</strong> ← `;
                li.appendChild(link);
            }
            ul.appendChild(li);
        }
        return ul;
    }

    private entityLink(entityId: string): HTMLElement {
        const a = document.createElement("a");
        a.href = "#";
        a.className = "entity-link";
        a.textContent = entityId;
        a.addEventListener("click", (e) => { e.preventDefault(); this.showEntityAssociations(entityId); });
        return a;
    }
}
