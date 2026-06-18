/**
 * Search engine — Phase 7.
 *
 * Provides:
 *   - Full-text search across all plain-text cell values
 *   - Structural search: find entities whose math cells contain a given identifier
 *   - Graph neighbourhood: all entities within N hops of a given entity
 *   - Cross-table join: entities from two tables linked by a shared relation
 */

import type { KnowledgeBase } from "../model/index.ts";
import { parser } from "../cell-renderers/math/grammar.ts";
import type { MathNode } from "../cell-renderers/math/types.ts";

// ── Result types ──────────────────────────────────────────────────────────────

export interface SearchHit {
    tableIdx: number;
    tableName: string;
    rowIdx: number;
    entityId: string;
    colIdx: number;
    colName: string;
    value: string;
    /** Matched substring start index within value (for text search). */
    matchStart: number;
    matchEnd: number;
}

export interface NeighbourHit {
    entityId: string;
    tableName: string;
    relation: string;
    direction: "outgoing" | "incoming";
    hops: number;
}

export interface JoinHit {
    leftEntityId: string;
    rightEntityId: string;
    relation: string;
}

// ── Full-text search ──────────────────────────────────────────────────────────

/**
 * Search all text-type cell values across all loaded tables.
 * Returns every cell whose value contains the query string (case-insensitive).
 */
export function searchText(kb: KnowledgeBase, query: string): SearchHit[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const hits: SearchHit[] = [];

    kb.tables.forEach((table, tableIdx) => {
        table.rows.forEach((row, rowIdx) => {
            table.columns.forEach((col, colIdx) => {
                if (col.typeId !== "text" && col.typeId !== "plain" && col.typeId !== "plaintext") return;
                const value = table.getCellValue(rowIdx, colIdx);
                const lower = value.toLowerCase();
                const idx = lower.indexOf(q);
                if (idx === -1) return;
                hits.push({
                    tableIdx, tableName: table.name,
                    rowIdx, entityId: row.entityId,
                    colIdx, colName: col.name,
                    value,
                    matchStart: idx, matchEnd: idx + q.length,
                });
            });
        });
    });

    return hits;
}

// ── Structural search ─────────────────────────────────────────────────────────

/**
 * Find all entities whose math cells contain a specific identifier name.
 * Parses each math cell's source text and walks the AST looking for
 * IdentifierNode with the given raw name.
 *
 * Example: searchByIdentifier(kb, "int") finds all cells containing \\int.
 */
export function searchByIdentifier(kb: KnowledgeBase, identifierName: string): SearchHit[] {
    if (!identifierName.trim()) return [];
    const hits: SearchHit[] = [];

    kb.tables.forEach((table, tableIdx) => {
        table.rows.forEach((row, rowIdx) => {
            table.columns.forEach((col, colIdx) => {
                if (col.typeId !== "math") return;
                const value = table.getCellValue(rowIdx, colIdx);
                if (!value.trim()) return;
                try {
                    const ast = parser.parse("Expression", value) as MathNode;
                    if (astContainsIdentifier(ast, identifierName)) {
                        hits.push({
                            tableIdx, tableName: table.name,
                            rowIdx, entityId: row.entityId,
                            colIdx, colName: col.name,
                            value,
                            matchStart: 0, matchEnd: value.length,
                        });
                    }
                } catch {
                    // unparseable cell — skip
                }
            });
        });
    });

    return hits;
}

function astContainsIdentifier(node: MathNode, name: string): boolean {
    switch (node.type) {
        case "Identifier": return node.name === name;
        case "NumberLiteral": case "Ellipsis": return false;
        case "BinaryExpression": return astContainsIdentifier(node.left, name) || astContainsIdentifier(node.right, name);
        case "UnaryExpression": return astContainsIdentifier(node.operand, name);
        case "CallExpression": return astContainsIdentifier(node.callee, name) || node.args.some(a => astContainsIdentifier(a, name));
        case "ControlExpression": return node.name === name || node.args.some(a => astContainsIdentifier(a, name));
        case "SubscriptExpression": return astContainsIdentifier(node.base, name) || astContainsIdentifier(node.subscript, name);
        case "SubSuperscriptExpression": return astContainsIdentifier(node.base, name) || astContainsIdentifier(node.subscript, name) || astContainsIdentifier(node.superscript, name);
        case "VectorName": return astContainsIdentifier(node.identifier, name);
        case "Matrix": return node.rows.some(r => r.some(c => astContainsIdentifier(c, name)));
        case "IndexExpression": return astContainsIdentifier(node.base, name) || astContainsIdentifier(node.index, name);
        case "AbsoluteValue": return astContainsIdentifier(node.expr, name);
        case "FactorialExpression": return astContainsIdentifier(node.base, name);
        case "Derivative": return astContainsIdentifier(node.base, name);
        case "Piecewise": return node.cases.some(c => astContainsIdentifier(c.expr, name) || astContainsIdentifier(c.condition, name));
    }
    return false;
}

// ── Graph neighbourhood ───────────────────────────────────────────────────────

/**
 * Return all entities within `maxHops` hops of `startEntityId` in the graph.
 * Traverses both outgoing and incoming edges.
 */
export function getNeighbourhood(kb: KnowledgeBase, startEntityId: string, maxHops: number): NeighbourHit[] {
    const visited = new Set<string>([startEntityId]);
    const hits: NeighbourHit[] = [];
    const queue: { entityId: string; hops: number }[] = [{ entityId: startEntityId, hops: 0 }];

    // Build a lookup: entityId → tableName
    const entityTable = new Map<string, string>();
    for (const table of kb.tables) {
        for (const row of table.rows) {
            entityTable.set(row.entityId, table.name);
        }
    }

    while (queue.length > 0) {
        const { entityId, hops } = queue.shift()!;
        if (hops >= maxHops) continue;

        const { outgoing, incoming } = kb.graph.getAssociationsFor(entityId);

        for (const edge of outgoing) {
            if (!visited.has(edge.target)) {
                visited.add(edge.target);
                hits.push({
                    entityId: edge.target,
                    tableName: entityTable.get(edge.target) ?? "",
                    relation: edge.relation,
                    direction: "outgoing",
                    hops: hops + 1,
                });
                queue.push({ entityId: edge.target, hops: hops + 1 });
            }
        }

        for (const edge of incoming) {
            if (!visited.has(edge.source)) {
                visited.add(edge.source);
                const inverse = kb.graph.getInverse(edge.relation) ?? edge.relation;
                hits.push({
                    entityId: edge.source,
                    tableName: entityTable.get(edge.source) ?? "",
                    relation: inverse,
                    direction: "incoming",
                    hops: hops + 1,
                });
                queue.push({ entityId: edge.source, hops: hops + 1 });
            }
        }
    }

    return hits;
}

// ── Cross-table join ──────────────────────────────────────────────────────────

/**
 * Find all pairs of entities from two tables connected by a given relation type.
 * leftTableIdx → rightTableIdx via relation.
 */
export function crossTableJoin(
    kb: KnowledgeBase,
    leftTableIdx: number,
    rightTableIdx: number,
    relation: string,
): JoinHit[] {
    const leftTable = kb.tables[leftTableIdx];
    const rightTable = kb.tables[rightTableIdx];
    if (!leftTable || !rightTable) return [];

    const rightIds = new Set(rightTable.rows.map(r => r.entityId));
    const hits: JoinHit[] = [];

    for (const row of leftTable.rows) {
        const targets = kb.graph.filterBySource(relation, row.entityId);
        for (const target of targets) {
            if (rightIds.has(target)) {
                hits.push({ leftEntityId: row.entityId, rightEntityId: target, relation });
            }
        }
    }

    return hits;
}
