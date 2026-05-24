import type { MathNode } from "../math/types.ts";

// ── Charge ────────────────────────────────────────────────────────────────────

export interface ChargeNode {
    type: "Charge";
    magnitude: number;   // default 1
    sign: "+" | "-";
}

// ── Isotope prefix ────────────────────────────────────────────────────────────

export interface IsotopeNode {
    type: "Isotope";
    mass: number;
    atomic?: number;
}

// ── Compound groups ───────────────────────────────────────────────────────────

export interface ElementGroup {
    type: "ElementGroup";
    isotope?: IsotopeNode;
    symbol: string;
    count: number;       // default 1
}

export interface ParenGroup {
    type: "ParenGroup";
    inner: GroupNode[];
    count: number;
}

export interface BracketGroup {
    type: "BracketGroup";
    inner: GroupNode[];
    count: number;
}

export type GroupNode = ElementGroup | ParenGroup | BracketGroup;

// ── Species ───────────────────────────────────────────────────────────────────

export type StateSymbol = "s" | "l" | "g" | "aq";

export interface CompoundNode {
    type: "Compound";
    groups: GroupNode[];
    state?: StateSymbol;
}

export interface ChargedSpeciesNode {
    type: "ChargedSpecies";
    compound: CompoundNode;
    charge: ChargeNode;
    state?: StateSymbol;
}

export type ParticleKind = "n" | "p" | "e-" | "e+" | "alpha" | "beta-" | "beta+" | "gamma";

export interface ParticleNode {
    type: "Particle";
    kind: ParticleKind;
}

export type SpeciesNode = CompoundNode | ChargedSpeciesNode | ParticleNode;

// ── Reaction ──────────────────────────────────────────────────────────────────

export interface ReactionTerm {
    coeff: number;       // default 1
    species: SpeciesNode;
}

export type ArrowType = "->" | "<->" | "<=>" | "-->";

export interface CondItemNode {
    key: string;
    value?: MathNode;    // absent = bare flag
}

export interface ConditionNode {
    type: "Condition";
    items: CondItemNode[];
}

export interface ReactionNode {
    type: "Reaction";
    lhs: ReactionTerm[];
    arrow: ArrowType;
    rhs: ReactionTerm[];
    conditions?: ConditionNode;
}

// ── Thermodynamic quantities ──────────────────────────────────────────────────

export type ThermoKey = "DeltaH" | "DeltaG" | "DeltaS" | "Ka" | "Ksp" | "Ea" | "Kb" | "Kw";

export interface ThermoNode {
    type: "Thermo";
    key: ThermoKey;
    value: MathNode;
}

// ── Structural formula ────────────────────────────────────────────────────────

export interface AtomDeclNode {
    type: "AtomDecl";
    label: string;
}

export type BondType = "single" | "double" | "triple" | "aromatic";

export interface BondDeclNode {
    type: "BondDecl";
    atom1: string;
    atom2: string;
    bondType: BondType;
}

export interface GroupDeclNode {
    type: "GroupDecl";
    atom: string;
    group: string;
}

// ── Program ───────────────────────────────────────────────────────────────────

export type ChemStatement = ReactionNode | ThermoNode | AtomDeclNode | BondDeclNode | GroupDeclNode;

export interface ChemistryProgram {
    type: "ChemistryProgram";
    statements: ChemStatement[];
}
