export interface FlowchartAST {
    direction: "TD" | "TB" | "LR" | "RL" | "BT";
    statements: FlowStatement[];
}

export type FlowStatement = FlowNodeDef | FlowEdge | FlowSubgraph;

export interface FlowNodeDef {
    type: "node";
    id: string;
    label: string;
    shape: "rect" | "round" | "diamond" | "stadium" | "subroutine" | "circle" | "hex" | "default";
}

export interface FlowEdge {
    type: "edge";
    from: string;
    to: string;
    label: string;
    style: "solid" | "dotted" | "thick";
    arrow: "arrow" | "open" | "cross";
}

export interface FlowSubgraph {
    type: "subgraph";
    id: string;
    label: string;
    statements: FlowStatement[];
}
