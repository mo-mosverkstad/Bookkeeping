import { TypedValue } from "./TypedValue.ts";

export class GraphNode {
    readonly id: string;
    readonly properties: Map<string, TypedValue>;

    constructor(id: string, properties?: Map<string, TypedValue>) {
        this.id = id;
        this.properties = properties ?? new Map();
    }

    get label(): string {
        return this.properties.get("label")?.value ?? this.id;
    }

    get type(): string {
        return this.properties.get("type")?.value ?? "";
    }
}
