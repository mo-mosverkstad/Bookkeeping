export interface ERDiagramAST { entities: EREntity[]; relations: ERRelation[]; }
export interface EREntity { name: string; }
export interface ERRelation { from: string; to: string; fromCard: string; toCard: string; label: string; }
