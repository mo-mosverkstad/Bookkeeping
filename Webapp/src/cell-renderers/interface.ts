/**
 * CellRenderer interface — every cell syntax renderer must conform to this.
 * A CellRenderer is self-contained: it owns its grammar, AST types, and renderer.
 * Cell renderers are used exclusively inside the Knowledge Pane to render
 * the content of individual table cells or graph node property values.
 */
export interface CellRenderer {
    type_id: string;
    version: string;
    parse(text: string): unknown;
    render(ast: unknown): HTMLElement;
}

/** @deprecated Use CellRenderer instead. */
export type Plugin = CellRenderer;
