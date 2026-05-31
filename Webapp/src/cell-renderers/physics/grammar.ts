/**
 * Physics PEG grammar.
 *
 * Architecture:
 *   - Reuses the geometry parser for geometry base statements.
 *   - Adds physics-specific statement rules on top.
 *   - A PhysicsProgram is a sequence of lines, each parsed as either
 *     a physics statement or a geometry statement.
 *   - Same skip pattern as geometry: /^[ \t]+/ (newlines are separators).
 *   - build() receives already-parsed structured data — no re-parsing.
 *   - Math sub-expressions are isolated by MathArg/RhsRaw and parsed
 *     by mathParser.parse() inside build().
 */

import { PEGParser } from "../../engine/PEGParser.ts";
import type { Grammar } from "../../engine/types.ts";
import { parser as mathParser } from "../math/grammar.ts";
import { parseGeometry } from "../geometry/grammar.ts";
import type { MathNode } from "../math/types.ts";
import type {
    PhysicsProgram, PhysicsStatement,
    BodyDeclNode, ForceNode, VelocityNode, AngularNode,
    TorqueNode, ConstraintNode,
    FrameDeclNode, InertialDeclNode, EOMNode,
} from "./types.ts";

// ── Math delegation ───────────────────────────────────────────────────────────

function math(src: string): MathNode {
    return mathParser.parse("Expression", src.trim()) as MathNode;
}

// ── Physics-specific keyword set ──────────────────────────────────────────────

const PHYSICS_KEYWORDS = new Set([
    "Body", "Force", "Velocity", "Acceleration",
    "AngularVelocity", "AngularAcceleration", "Torque",
    "Fixed", "Roller", "Contact", "String", "Spring", "Damper",
    "Frame", "Inertial", "EOM",
]);

// ── Grammar ───────────────────────────────────────────────────────────────────

const grammar: Grammar = {

    Program: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "Statement" },
            { type: "repeat", expr: { type: "sequence", parts: [
                { type: "regex", regex: /^\r?\n/, name: "newline" },
                { type: "rule", name: "Statement" },
            ] } },
        ] },
        build([first, rest]: [PhysicsStatement | null, [string, PhysicsStatement | null][]]): PhysicsStatement[] {
            const stmts: PhysicsStatement[] = [];
            if (first !== null) stmts.push(first);
            for (const [, s] of rest) if (s !== null) stmts.push(s);
            return stmts;
        },
    },

    Statement: {
        peg: { type: "choice", options: [
            { type: "rule", name: "AssignStatement" },
            { type: "rule", name: "CallStatement" },
            { type: "rule", name: "BlankOrComment" },
        ] },
    },

    BlankOrComment: {
        peg: { type: "regex", regex: /^(?:#[^\n]*|\/\/[^\n]*|[ \t]+)/, name: "blank or comment" },
        build(): null { return null; },
    },

    AssignStatement: {
        peg: { type: "sequence", parts: [
            { type: "rule", name: "CallExpr" },
            { type: "literal", value: "=" },
            { type: "rule", name: "RhsRaw" },
        ] },
        build([call, , rhs]: [{ name: string; args: string[] }, string, string]): PhysicsStatement {
            return buildAssign(call, rhs.trim());
        },
    },

    CallStatement: {
        peg: { type: "rule", name: "CallExpr" },
        build(call: { name: string; args: string[] }): PhysicsStatement {
            return buildCall(call);
        },
    },

    CallExpr: {
        peg: { type: "sequence", parts: [
            { type: "regex", regex: /^[A-Za-z][A-Za-z0-9]*/, name: "name" },
            { type: "literal", value: "(" },
            { type: "rule", name: "ArgList" },
            { type: "literal", value: ")" },
        ] },
        build([name, , args]: [string, string, string[]]): { name: string; args: string[] } {
            return { name, args };
        },
    },

    ArgList: {
        peg: { type: "choice", options: [
            { type: "sequence", parts: [
                { type: "rule", name: "Arg" },
                { type: "repeat", expr: { type: "sequence", parts: [
                    { type: "literal", value: "," },
                    { type: "rule", name: "Arg" },
                ] } },
            ] },
            { type: "sequence", parts: [] },
        ] },
        build(node: any): string[] {
            if (!Array.isArray(node) || node.length === 0) return [];
            const [first, rest] = node;
            const args: string[] = [first];
            for (const [, arg] of rest) args.push(arg);
            return args;
        },
    },

    // Arg: everything up to the next top-level comma or closing paren
    Arg: {
        peg: { type: "regex", regex: /^[^,)\n\r]+/, name: "argument" },
        build(v: string): string { return v.trim(); },
    },

    RhsRaw: {
        peg: { type: "regex", regex: /^[^\n\r]+/, name: "value" },
        build(v: string): string { return v.trim(); },
    },
};

// ── Build helpers ─────────────────────────────────────────────────────────────

function buildCall(call: { name: string; args: string[] }): PhysicsStatement {
    const { name, args } = call;
    switch (name) {
        case "Body":
            return { type: "BodyDecl", name: args[0] } as BodyDeclNode;

        case "Force":
            return { type: "Force", name: args[0], point: args[1], direction: args[2] } as ForceNode;

        case "Velocity":
            return { type: "Velocity", name: args[0], point: args[1], direction: args[2] } as VelocityNode;

        case "Acceleration":
            return { type: "Acceleration", name: args[0], point: args[1], direction: args[2] } as VelocityNode;

        case "AngularVelocity":
            return { type: "AngularVelocity", name: args[0], body: args[1] } as AngularNode;

        case "AngularAcceleration":
            return { type: "AngularAcceleration", name: args[0], body: args[1] } as AngularNode;

        case "Torque":
            return { type: "Torque", name: args[0], body: args[1], pivot: args[2] } as TorqueNode;

        case "Fixed":
            return { type: "Fixed", a: args[0] } as ConstraintNode;

        case "Roller":
            return { type: "Roller", a: args[0], direction: args[1] } as ConstraintNode;

        case "Contact":
            return { type: "Contact", a: args[0], b: args[1] } as ConstraintNode;

        case "String":
            return { type: "String", a: args[0], b: args[1] } as ConstraintNode;

        case "Spring":
            return { type: "Spring", a: args[0], b: args[1] } as ConstraintNode;

        case "Damper":
            return { type: "Damper", a: args[0], b: args[1] } as ConstraintNode;

        case "Frame":
            return { type: "FrameDecl", name: args[0], origin: args[1], axes: args.slice(2) } as FrameDeclNode;

        case "Inertial":
            return { type: "InertialDecl", frame: args[0] } as InertialDeclNode;

        case "EOM":
            return { type: "EOM", equation: math(args[0]) } as EOMNode;

        default:
            throw new Error(`Unknown physics statement: ${name}`);
    }
}

function buildAssign(call: { name: string; args: string[] }, rhs: string): PhysicsStatement {
    const { name, args } = call;
    switch (name) {
        case "Body": {
            // Body(B1)=mass(m)  or  Body(B1)=mass(m),moment(I)
            // rhs is "mass(m)" or "mass(m),moment(I)"
            const node: BodyDeclNode = { type: "BodyDecl", name: args[0] };
            const massMatch = rhs.match(/mass\(([^)]+)\)/);
            const momentMatch = rhs.match(/moment\(([^)]+)\)/);
            if (massMatch) node.mass = math(massMatch[1]);
            if (momentMatch) node.moment = math(momentMatch[1]);
            return node;
        }
        case "Force":
            return { type: "Force", name: args[0], point: args[1], direction: args[2], magnitude: math(rhs) } as ForceNode;

        case "Velocity":
            return { type: "Velocity", name: args[0], point: args[1], direction: args[2], value: math(rhs) } as VelocityNode;

        case "Acceleration":
            return { type: "Acceleration", name: args[0], point: args[1], direction: args[2], value: math(rhs) } as VelocityNode;

        case "AngularVelocity":
            return { type: "AngularVelocity", name: args[0], body: args[1], value: math(rhs) } as AngularNode;

        case "AngularAcceleration":
            return { type: "AngularAcceleration", name: args[0], body: args[1], value: math(rhs) } as AngularNode;

        case "Torque":
            return { type: "Torque", name: args[0], body: args[1], pivot: args[2], value: math(rhs) } as TorqueNode;

        case "Spring":
            return { type: "Spring", a: args[0], b: args[1], value: math(rhs) } as ConstraintNode;

        case "Damper":
            return { type: "Damper", a: args[0], b: args[1], value: math(rhs) } as ConstraintNode;

        default:
            throw new Error(`Unknown physics assignment: ${name}=...`);
    }
}

// ── Parser instance ───────────────────────────────────────────────────────────

export const parser = new PEGParser(grammar, { skip: /^[ \t]+/ });

// ── Public entry point ────────────────────────────────────────────────────────

export function parsePhysics(source: string): PhysicsProgram {
    const lines = source.split(/\r?\n/).map(l => l.trimEnd());

    const geoLines: string[] = [];
    const physLines: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        const keyword = trimmed.match(/^([A-Za-z][A-Za-z0-9]*)\s*[=(]/)?.[1] ?? "";
        if (PHYSICS_KEYWORDS.has(keyword)) {
            physLines.push(line);
        } else {
            geoLines.push(line);
        }
    }

    // Filter out blank lines that were left as placeholders, then join
    const geoSource = geoLines.filter(l => l.trim()).join("\n");
    const physSource = physLines.filter(l => l.trim()).join("\n");

    const geoStatements = geoSource ? parseGeometry(geoSource).statements : [];
    const physStatements: PhysicsStatement[] = physSource
        ? (parser.parse("Program", physSource) as PhysicsStatement[])
        : [];

    return { type: "PhysicsProgram", geoStatements, physStatements };
}
