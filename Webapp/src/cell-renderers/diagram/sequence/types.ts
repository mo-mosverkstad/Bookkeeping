export interface SequenceAST {
    participants: string[];
    messages: SeqMessage[];
}
export interface SeqMessage {
    from: string;
    to: string;
    label: string;
    arrow: "solid" | "dashed" | "cross" | "open";
}
