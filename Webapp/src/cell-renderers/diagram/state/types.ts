export interface StateDiagramAST { states: StateDef[]; transitions: StateTransition[]; }
export interface StateDef { id: string; label: string; }
export interface StateTransition { from: string; to: string; label: string; }
