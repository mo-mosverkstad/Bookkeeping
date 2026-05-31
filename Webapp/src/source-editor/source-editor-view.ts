/**
 * SourceEditorView — document-level source code editor panel.
 *
 * Features:
 *   - Syntax highlighting (overlay technique: transparent textarea over <pre>)
 *   - Focus-state border: blue (2px) when focused, thin black (1px) when not
 *   - Local undo/redo stack independent of global EditHistory
 *   - Reactive parsing (300ms debounce); "Parse & Compile" button as fallback
 *   - Apply button commits parsed result to the model via controller
 *   - Collapsible panel
 */

import type { AppController } from "../controller/index.ts";
import { highlight } from "./highlighter.ts";
import type { SyntaxType } from "./highlighter.ts";
import { renderCell } from "../cell-renderers/registry.ts";

// ── Local undo/redo stack ─────────────────────────────────────────────────────

interface TextSnapshot {
    text: string;
    selStart: number;
    selEnd: number;
}

class LocalHistory {
    private past: TextSnapshot[] = [];
    private future: TextSnapshot[] = [];
    private readonly maxSize = 200;

    push(snap: TextSnapshot): void {
        this.past.push(snap);
        if (this.past.length > this.maxSize) this.past.shift();
        this.future = [];
    }

    undo(current: TextSnapshot): TextSnapshot | null {
        if (this.past.length === 0) return null;
        this.future.push(current);
        return this.past.pop()!;
    }

    redo(current: TextSnapshot): TextSnapshot | null {
        if (this.future.length === 0) return null;
        this.past.push(current);
        return this.future.pop()!;
    }

    clear(): void { this.past = []; this.future = []; }
}

// ── SourceEditorView ──────────────────────────────────────────────────────────

export class SourceEditorView {

    private panel: HTMLElement;
    private textarea: HTMLTextAreaElement;
    private highlight: HTMLPreElement;
    private typeSelect: HTMLSelectElement;
    private preview: HTMLElement;
    private errorEl: HTMLElement;
    private applyBtn: HTMLButtonElement;
    private parseBtn: HTMLButtonElement;
    private toggleBtn: HTMLButtonElement;
    private collapsed = false;
    private localHistory = new LocalHistory();
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private lastSnapshot: TextSnapshot = { text: "", selStart: 0, selEnd: 0 };
    /** Set to true while the editor textarea is focused — suppresses global undo/redo */
    private _focused = false;
    private onCellApply: ((value: string, type: string) => void) | null = null;

    get focused(): boolean { return this._focused; }

    constructor(_controller: AppController, container: HTMLElement) {

        this.panel = this.build(container);
        this.textarea = this.panel.querySelector(".se-textarea") as HTMLTextAreaElement;
        this.highlight = this.panel.querySelector(".se-highlight") as HTMLPreElement;
        this.typeSelect = this.panel.querySelector(".se-type-select") as HTMLSelectElement;
        this.preview = this.panel.querySelector(".se-preview") as HTMLElement;
        this.errorEl = this.panel.querySelector(".se-error") as HTMLElement;
        this.applyBtn = this.panel.querySelector(".se-apply") as HTMLButtonElement;
        this.parseBtn = this.panel.querySelector(".se-parse") as HTMLButtonElement;
        this.toggleBtn = this.panel.querySelector(".se-toggle") as HTMLButtonElement;
        this.wire();
    }

    // ── DOM construction ──────────────────────────────────────────────────────

    private build(container: HTMLElement): HTMLElement {
        const panel = document.createElement("div");
        panel.id = "source-editor";
        panel.className = "source-editor";

        // Header row
        const header = document.createElement("div");
        header.className = "se-header";

        const label = document.createElement("span");
        label.className = "se-label";
        label.textContent = "Source Editor";

        this.toggleBtn = document.createElement("button");
        this.toggleBtn.className = "se-toggle";
        this.toggleBtn.textContent = "▾";
        this.toggleBtn.title = "Collapse/expand";

        const typeLabel = document.createElement("label");
        typeLabel.className = "se-type-label";
        typeLabel.textContent = "Syntax:";

        this.typeSelect = document.createElement("select");
        this.typeSelect.className = "se-type-select";
        (["math", "chemistry", "geometry", "physics", "table-source", "graph-source", "text", "rich"] as SyntaxType[])
            .forEach(t => {
                const opt = document.createElement("option");
                opt.value = t; opt.textContent = t;
                this.typeSelect.appendChild(opt);
            });

        this.parseBtn = document.createElement("button");
        this.parseBtn.className = "se-parse";
        this.parseBtn.textContent = "Parse";
        this.parseBtn.title = "Parse & compile (manual trigger)";

        this.applyBtn = document.createElement("button");
        this.applyBtn.className = "se-apply";
        this.applyBtn.textContent = "Apply";
        this.applyBtn.title = "Apply parsed result to the active model";

        header.appendChild(label);
        header.appendChild(this.parseBtn);
        header.appendChild(this.applyBtn);
        header.appendChild(this.toggleBtn);

        // Body: editor + preview side by side
        const body = document.createElement("div");
        body.className = "se-body";

        // Editor pane (overlay: highlight pre + textarea)
        const editorPane = document.createElement("div");
        editorPane.className = "se-editor-pane";

        this.highlight = document.createElement("pre");
        this.highlight.className = "se-highlight";
        this.highlight.setAttribute("aria-hidden", "true");

        this.textarea = document.createElement("textarea");
        this.textarea.className = "se-textarea";
        this.textarea.spellcheck = false;
        this.textarea.placeholder = "Type source here...";

        editorPane.appendChild(this.highlight);
        editorPane.appendChild(this.textarea);

        // Preview pane
        const previewPane = document.createElement("div");
        previewPane.className = "se-preview-pane";

        this.preview = document.createElement("div");
        this.preview.className = "se-preview";

        this.errorEl = document.createElement("pre");
        this.errorEl.className = "se-error";

        previewPane.appendChild(this.preview);
        previewPane.appendChild(this.errorEl);

        body.appendChild(editorPane);
        body.appendChild(previewPane);

        panel.appendChild(header);
        panel.appendChild(body);
        container.appendChild(panel);

        return panel;
    }

    // ── Event wiring ──────────────────────────────────────────────────────────

    private wire(): void {
        // Focus state
        this.textarea.addEventListener("focus", () => {
            this._focused = true;
            this.panel.classList.add("se-focused");
            // Push current state as baseline for local undo
            this.lastSnapshot = this.snapshot();
        });

        this.textarea.addEventListener("blur", () => {
            this._focused = false;
            this.panel.classList.remove("se-focused");
        });

        // Input: update highlight + debounced parse
        this.textarea.addEventListener("input", () => {
            this.syncHighlight();
            this.scheduleParse();
        });

        // Scroll sync between textarea and highlight pre
        this.textarea.addEventListener("scroll", () => {
            this.highlight.scrollTop  = this.textarea.scrollTop;
            this.highlight.scrollLeft = this.textarea.scrollLeft;
        });

        // Local undo/redo — intercept before global handler sees it
        this.textarea.addEventListener("keydown", (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === "z" && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.localUndo();
                } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.localRedo();
                }
                return;
            }
            // Alt+Enter: Apply
            if (e.key === "Enter" && e.altKey) {
                e.preventDefault();
                this.apply();
                return;
            }
            // Enter without modifier: newline (rich is multi-line)
        }, true);

        // Push snapshot on every meaningful change for local undo
        this.textarea.addEventListener("keyup", () => {
            const snap = this.snapshot();
            if (snap.text !== this.lastSnapshot.text) {
                this.localHistory.push(this.lastSnapshot);
                this.lastSnapshot = snap;
            }
        });

        // Type selector change: re-highlight and re-parse

        // Manual parse button
        this.parseBtn.addEventListener("click", () => this.parse());

        // Apply button
        this.applyBtn.addEventListener("click", () => this.apply());

        // Toggle collapse
        this.toggleBtn.addEventListener("click", () => this.toggleCollapse());
    }

    // ── Local undo/redo ───────────────────────────────────────────────────────

    private snapshot(): TextSnapshot {
        return {
            text: this.textarea.value,
            selStart: this.textarea.selectionStart,
            selEnd: this.textarea.selectionEnd,
        };
    }

    private restore(snap: TextSnapshot): void {
        this.textarea.value = snap.text;
        this.textarea.setSelectionRange(snap.selStart, snap.selEnd);
        this.syncHighlight();
        this.scheduleParse();
    }

    private localUndo(): void {
        const prev = this.localHistory.undo(this.snapshot());
        if (prev) { this.lastSnapshot = prev; this.restore(prev); }
    }

    private localRedo(): void {
        const next = this.localHistory.redo(this.snapshot());
        if (next) { this.lastSnapshot = next; this.restore(next); }
    }

    // ── Highlight sync ────────────────────────────────────────────────────────

    private syncHighlight(): void {
        const type: SyntaxType = "rich";
        const html = highlight(this.textarea.value, type);
        // Append a trailing newline so the pre height matches the textarea
        this.highlight.innerHTML = html + "\n";
    }

    // ── Parsing ───────────────────────────────────────────────────────────────

    private scheduleParse(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => { this.debounceTimer = null; this.parse(); }, 300);
    }

    private parse(): void {
        const type: SyntaxType = "rich";
        const text = this.textarea.value.trim();
        this.errorEl.textContent = "";
        this.preview.innerHTML = "";

        if (!text) return;

        try {
            const result = this.parseSource(type, text);
            this.preview.appendChild(result);
        } catch (e) {
            this.errorEl.textContent = (e as Error).message;
        }
    }

    private parseSource(type: SyntaxType, text: string): HTMLElement {
        if (type === "math" || type === "chemistry" || type === "geometry" || type === "physics" || type === "text" || type === "rich") {
            return renderCell(type, text);
        }
        const div = document.createElement("div");
        div.style.cssText = "color:#64748b;font-size:0.88em;padding:8px;";
        div.textContent = `[${type} parser not yet implemented — Apply will be available once the grammar is defined]`;
        return div;
    }

    // ── Apply ─────────────────────────────────────────────────────────────────

    private apply(): void {
        const text = this.textarea.value.trim();
        if (!text) return;

        this.errorEl.textContent = "";

        if (this.onCellApply) {
            this.onCellApply(text, "rich");
        } else {
            this.errorEl.textContent = "No active cell — click a cell first, then edit here and Apply.";
            return;
        }

        this.localHistory.clear();
        this.lastSnapshot = this.snapshot();
    }

    // ── Collapse ──────────────────────────────────────────────────────────────

    private toggleCollapse(): void {
        this.collapsed = !this.collapsed;
        const body = this.panel.querySelector(".se-body") as HTMLElement;
        body.hidden = this.collapsed;
        this.toggleBtn.textContent = this.collapsed ? "▸" : "▾";
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** Load text into the editor (e.g. from the active cell or model). */
    setText(text: string, _type?: SyntaxType): void {
        this.textarea.value = text;
        this.localHistory.clear();
        this.lastSnapshot = this.snapshot();
        this.syncHighlight();
        this.scheduleParse();
    }

    /** Focus the textarea (called after cell activation). */
    focusTextarea(): void {
        this.textarea.focus();
        this.textarea.select();
    }

    /** Get current text value (used by TableView.commitActive). */
    getValue(): string {
        return this.textarea.value;
    }

    /** Clear the editor (called when a cell edit is committed or cancelled). */
    clear(): void {
        this.textarea.value = "";
        this.localHistory.clear();
        this.lastSnapshot = this.snapshot();
        this.syncHighlight();
        this.preview.innerHTML = "";
        this.errorEl.textContent = "";
    }

    /** Register a callback for when Apply is pressed on a cell-level type. */
    setOnCellApply(cb: ((value: string, type: string) => void) | null): void {
        this.onCellApply = cb;
    }
}
