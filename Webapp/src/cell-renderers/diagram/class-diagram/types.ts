export interface ClassDiagramAST { classes: ClassDef[]; relations: ClassRelation[]; }
export interface ClassDef { name: string; members: string[]; methods: string[]; }
export interface ClassRelation { from: string; to: string; type: "inheritance" | "composition" | "aggregation" | "association" | "dependency" | "realization"; label: string; }
