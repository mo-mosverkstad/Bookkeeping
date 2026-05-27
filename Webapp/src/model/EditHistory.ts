import type { Row } from "./Row.ts";
import type { GraphNode } from "./GraphNode.ts";
import type { GraphEdge } from "./GraphEdge.ts";

export type EditAction =
    | { type: "cell"; tableIdx: number; rowIdx: number; colIdx: number; oldValue: string; newValue: string }
    | { type: "addRow"; tableIdx: number; row: Row }
    | { type: "deleteRow"; tableIdx: number; rowIdx: number; row: Row }
    | { type: "moveRow"; tableIdx: number; fromIdx: number; toIdx: number }
    | { type: "addNode"; graphIdx: number; node: GraphNode }
    | { type: "removeNode"; graphIdx: number; nodeId: string; node: GraphNode }
    | { type: "addEdge"; graphIdx: number; edge: GraphEdge }
    | { type: "removeEdge"; graphIdx: number; edgeId: string; edge: GraphEdge };

export class EditHistory {
    private past: EditAction[] = [];
    private future: EditAction[] = [];

    push(action: EditAction): void {
        this.past.push(action);
        this.future = [];
    }

    undo(): EditAction | undefined {
        const action = this.past.pop();
        if (action) this.future.push(action);
        return action;
    }

    redo(): EditAction | undefined {
        const action = this.future.pop();
        if (action) this.past.push(action);
        return action;
    }

    canUndo(): boolean { return this.past.length > 0; }
    canRedo(): boolean { return this.future.length > 0; }
    clear(): void { this.past = []; this.future = []; }
}
