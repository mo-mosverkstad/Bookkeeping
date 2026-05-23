import type { AppController } from "../controller/index.ts";
import type { SearchHit, NeighbourHit } from "../search/index.ts";

/**
 * Search View — Phase 7.
 * Renders the search bar (text + identifier search) and results panel.
 * Also renders the graph neighbourhood panel triggered from entity clicks.
 */
export class SearchView {
    private container: HTMLElement;
    private controller: AppController;
    private resultsPanel: HTMLElement;
    private neighbourPanel: HTMLElement;

    constructor(container: HTMLElement, controller: AppController) {
        this.container = container;
        this.controller = controller;

        // ── Search bar ────────────────────────────────────────────────────────
        const bar = document.createElement("div");
        bar.className = "search-bar";

        const textInput = document.createElement("input");
        textInput.type = "text";
        textInput.id = "search-input";
        textInput.placeholder = "Search text cells…";
        textInput.className = "search-input";

        const textBtn = document.createElement("button");
        textBtn.textContent = "Search";
        textBtn.className = "search-btn";

        const identInput = document.createElement("input");
        identInput.type = "text";
        identInput.id = "search-ident-input";
        identInput.placeholder = "Find symbol (e.g. int, ha, p)…";
        identInput.className = "search-input";

        const identBtn = document.createElement("button");
        identBtn.textContent = "Find Symbol";
        identBtn.className = "search-btn";

        const clearBtn = document.createElement("button");
        clearBtn.textContent = "Clear";
        clearBtn.className = "search-btn search-btn-clear";

        bar.appendChild(textInput);
        bar.appendChild(textBtn);
        bar.appendChild(identInput);
        bar.appendChild(identBtn);
        bar.appendChild(clearBtn);
        container.appendChild(bar);

        // ── Results panel ─────────────────────────────────────────────────────
        this.resultsPanel = document.createElement("div");
        this.resultsPanel.className = "search-results";
        this.resultsPanel.hidden = true;
        container.appendChild(this.resultsPanel);

        // ── Neighbourhood panel ───────────────────────────────────────────────
        this.neighbourPanel = document.createElement("div");
        this.neighbourPanel.className = "neighbourhood-panel";
        this.neighbourPanel.hidden = true;
        container.appendChild(this.neighbourPanel);

        // ── Event handlers ────────────────────────────────────────────────────
        textBtn.addEventListener("click", () => {
            const q = textInput.value.trim();
            if (q) this.showTextResults(controller.searchText(q));
        });

        textInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") textBtn.click();
        });

        identBtn.addEventListener("click", () => {
            const q = identInput.value.trim();
            if (q) this.showTextResults(controller.searchByIdentifier(q));
        });

        identInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") identBtn.click();
        });

        clearBtn.addEventListener("click", () => {
            textInput.value = "";
            identInput.value = "";
            this.resultsPanel.hidden = true;
            this.resultsPanel.innerHTML = "";
            this.neighbourPanel.hidden = true;
            this.neighbourPanel.innerHTML = "";
        });
    }

    showTextResults(hits: SearchHit[]): void {
        this.resultsPanel.innerHTML = "";
        this.resultsPanel.hidden = false;

        if (hits.length === 0) {
            this.resultsPanel.textContent = "No results found.";
            return;
        }

        const header = document.createElement("div");
        header.className = "search-results-header";
        header.textContent = `${hits.length} result${hits.length === 1 ? "" : "s"}`;
        this.resultsPanel.appendChild(header);

        const list = document.createElement("ul");
        list.className = "search-results-list";

        for (const hit of hits) {
            const li = document.createElement("li");
            li.className = "search-result-item";

            // Highlight matched portion for text search
            let valueHtml: string;
            if (hit.matchStart < hit.matchEnd && hit.matchEnd <= hit.value.length) {
                const before = escapeHtml(hit.value.slice(0, hit.matchStart));
                const match  = escapeHtml(hit.value.slice(hit.matchStart, hit.matchEnd));
                const after  = escapeHtml(hit.value.slice(hit.matchEnd));
                valueHtml = `${before}<mark>${match}</mark>${after}`;
            } else {
                valueHtml = escapeHtml(hit.value);
            }

            li.innerHTML =
                `<span class="search-result-location">${escapeHtml(hit.tableName)} › ` +
                `<strong>${escapeHtml(hit.entityId)}</strong> › ` +
                `${escapeHtml(hit.colName)}</span>` +
                `<span class="search-result-value">${valueHtml}</span>`;

            // Click → show neighbourhood
            li.style.cursor = "pointer";
            li.addEventListener("click", () => this.showNeighbourhood(hit.entityId));

            list.appendChild(li);
        }

        this.resultsPanel.appendChild(list);
    }

    showNeighbourhood(entityId: string): void {
        const hits = this.controller.getNeighbourhood(entityId, 2);
        this.neighbourPanel.innerHTML = "";
        this.neighbourPanel.hidden = false;

        const header = document.createElement("div");
        header.className = "neighbourhood-header";
        header.textContent = `Neighbourhood of "${entityId}" (up to 2 hops)`;
        this.neighbourPanel.appendChild(header);

        if (hits.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = "No connected entities found.";
            this.neighbourPanel.appendChild(empty);
            return;
        }

        const list = document.createElement("ul");
        list.className = "neighbourhood-list";

        for (const hit of hits) {
            const li = document.createElement("li");
            li.className = "neighbourhood-item";
            const arrow = hit.direction === "outgoing" ? "→" : "←";
            li.innerHTML =
                `<span class="neighbourhood-hops">hop ${hit.hops}</span> ` +
                `<span class="neighbourhood-relation">${escapeHtml(hit.relation)}</span> ` +
                `${arrow} ` +
                `<strong>${escapeHtml(hit.entityId)}</strong>` +
                (hit.tableName ? ` <span class="neighbourhood-table">(${escapeHtml(hit.tableName)})</span>` : "");
            li.style.cursor = "pointer";
            li.addEventListener("click", () => this.showNeighbourhood(hit.entityId));
            list.appendChild(li);
        }

        this.neighbourPanel.appendChild(list);
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
