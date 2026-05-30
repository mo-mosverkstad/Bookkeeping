/**
 * Tarjan's SCC algorithm — finds all strongly-connected components.
 * Returns SCCs with size > 1 (i.e. actual cycles).
 * Each SCC is an array of node ids.
 */
export function findCycles(
    nodeIds: string[],
    edges: { from: string; to: string }[],
): string[][] {
    const out = new Map<string, string[]>();
    for (const id of nodeIds) out.set(id, []);
    for (const e of edges) {
        if (out.has(e.from) && out.has(e.to)) out.get(e.from)!.push(e.to);
    }

    const index   = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];
    let counter = 0;

    function strongconnect(v: string): void {
        index.set(v, counter);
        lowlink.set(v, counter);
        counter++;
        stack.push(v);
        onStack.add(v);

        for (const w of (out.get(v) ?? [])) {
            if (!index.has(w)) {
                strongconnect(w);
                lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
            } else if (onStack.has(w)) {
                lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
            }
        }

        if (lowlink.get(v) === index.get(v)) {
            const scc: string[] = [];
            let w: string;
            do {
                w = stack.pop()!;
                onStack.delete(w);
                scc.push(w);
            } while (w !== v);
            if (scc.length > 1) sccs.push(scc);
        }
    }

    for (const id of nodeIds) {
        if (!index.has(id)) strongconnect(id);
    }

    return sccs;
}

/**
 * Detect back-edges in a directed graph using Tarjan SCC.
 * Returns a Set of "from->to" strings representing edges that form cycles.
 */
export function findBackEdges(
    nodeIds: string[],
    edges: { from: string; to: string }[],
): Set<string> {
    const sccs = findCycles(nodeIds, edges);
    const cycleNodes = new Set<string>();
    for (const scc of sccs) for (const id of scc) cycleNodes.add(id);

    const backEdges = new Set<string>();
    // An edge is a back-edge if both endpoints are in the same SCC
    // and removing it would break the cycle. Use DFS ordering to identify.
    // Simpler: for each SCC, find edges that point "backward" in DFS order.
    // Approximation: for each SCC, pick one edge to break (the one whose
    // target has the lowest DFS discovery time within the SCC).
    const adj = new Map<string, string[]>();
    for (const id of nodeIds) adj.set(id, []);
    for (const e of edges) adj.get(e.from)?.push(e.to);

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const id of nodeIds) color.set(id, WHITE);

    function dfs(u: string): void {
        color.set(u, GRAY);
        for (const v of adj.get(u) ?? []) {
            if (color.get(v) === GRAY) {
                backEdges.add(`${u}->${v}`);
            } else if (color.get(v) === WHITE) {
                dfs(v);
            }
        }
        color.set(u, BLACK);
    }
    for (const id of nodeIds) if (color.get(id) === WHITE) dfs(id);

    return backEdges;
}
