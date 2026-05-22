/**
 * Plugin interface — every syntax renderer must conform to this.
 * A plugin is self-contained: it owns its grammar, AST types, and renderer.
 */
export interface Plugin {
    type_id: string;
    version: string;
    parse(text: string): unknown;
    render(ast: unknown): HTMLElement;
}
