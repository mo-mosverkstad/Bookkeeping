/** Generic table data — format-agnostic, plugin-agnostic. */
export interface TableData {
    headers: string[];
    types: string[];
    rows: string[][];
}
