import { TypedValue } from "./TypedValue.ts";

export class GraphEdge {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly properties: Map<string, TypedValue>;

    constructor(id: string, from: string, to: string, properties?: Map<string, TypedValue>) {
        this.id = id;
        this.from = from;
        this.to = to;
        this.properties = properties ?? new Map();
    }

    get type(): string {
        return this.properties.get("type")?.value ?? "";
    }

    get label(): string {
        return this.properties.get("label")?.value ?? "";
    }
}
