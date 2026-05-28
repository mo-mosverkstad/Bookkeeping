import type { MathNode } from "../math/types.ts";
import type { GeoStatement } from "../geometry/types.ts";

// ── Physics statement nodes ───────────────────────────────────────────────────

export interface BodyDeclNode {
    type: "BodyDecl";
    name: string;
    mass?: MathNode;
    moment?: MathNode;
}

export interface ForceNode {
    type: "Force";
    name: string;
    point: string;
    direction: string;   // raw identifier: \d, \u, \t, [v], etc.
    magnitude?: MathNode;
}

export interface VelocityNode {
    type: "Velocity" | "Acceleration";
    name: string;
    point: string;
    direction: string;
    value?: MathNode;
}

export interface AngularNode {
    type: "AngularVelocity" | "AngularAcceleration";
    name: string;
    body: string;
    value?: MathNode;
}

export interface TorqueNode {
    type: "Torque";
    name: string;
    body: string;
    pivot: string;
    value?: MathNode;
}

export type ConstraintType = "Fixed" | "Roller" | "Contact" | "String" | "Spring" | "Damper";

export interface ConstraintNode {
    type: ConstraintType;
    a: string;
    b?: string;          // absent for Fixed
    direction?: string;  // for Roller
    value?: MathNode;    // stiffness k or damping c
}

export interface FrameDeclNode {
    type: "FrameDecl";
    name: string;
    origin: string;
    axes: string[];
}

export interface InertialDeclNode {
    type: "InertialDecl";
    frame: string;
}

export interface EOMNode {
    type: "EOM";
    equation: MathNode;
}

export type PhysicsStatement =
    | BodyDeclNode | ForceNode | VelocityNode | AngularNode
    | TorqueNode | ConstraintNode | FrameDeclNode | InertialDeclNode | EOMNode;

export interface PhysicsProgram {
    type: "PhysicsProgram";
    geoStatements: GeoStatement[];    // geometry base layer
    physStatements: PhysicsStatement[];
}
