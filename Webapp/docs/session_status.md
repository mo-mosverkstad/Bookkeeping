# Session Status — 2026-05-30

## Quick Context

Read these files to reconstruct full context:
1. `docs/study.md` — phase definitions and plans (Phases 18-21 planned)
2. `docs/history.md` — what was done (Phases 1-18)
3. `docs/codebase_analysis.md` — how the code works
4. `docs/syntax_manual.md` — rich cell embedding syntax ($math{}, $chem{}, etc.)

## Current State

- **Phase 17 (File System Access)** — COMPLETE
- **Phase 18 (Diagram Grammars)** — IN PROGRESS (mostly complete)
  - 7 diagram types implemented: flowchart, sequence, class, state, ER, gantt, pie
  - All parse and render to SVG with proper graph layout
  - `.diagram` file extension (replaces `.md` and `.graph.json`)
  - `.doc.json` integration via `graph_flowchart`, `graph_sequence`, etc.
  - `control.json` integration via `"view": "diagram"`
  - Sugiyama layered layout with crossing minimization
  - Ring layout for cyclic graphs
  - Cubic bezier edge routing with back-edge exterior routing
  - Pan/zoom on all diagram views
  - Source editor bidirectional sync
  - TODO: labeled edges in flowchart (`-->|text|`), class diagram members merging,
    subgraphs, more Mermaid syntax coverage
- **Phase 19 (Semantic Layer)** — NOT STARTED
- **Phase 20 (Stable Identity)** — NOT STARTED
- **Phase 21 (Native Format)** — NOT STARTED

## Test Status

383 tests pass (13 test files). Run: `npm test`

## Key Architecture Decisions

1. **`.diagram` file extension** — NOT `.md` (not markdown), NOT `.graph.json` (not JSON)
2. **Diagrams save their own text syntax** — Mermaid-compatible, human-readable
3. **`.doc.json` block types are per-diagram-kind** — `graph_flowchart`, `graph_sequence`, etc.
4. **`control.json` uses `"view": "diagram"`** with `"file": "name.diagram"`
5. **Shared `graph-utils.ts`** — Tarjan SCC + back-edge detection reused across renderers
6. **Sugiyama layout** — longest-path ranking, barycenter ordering, iterative median positioning
7. **Ring layout** — for graphs where ≥50% of nodes form a cycle
8. **Draw order: nodes behind, edges on top** — arrowheads always visible
9. **`nodeIntersect`** — computes exact edge-node border intersection for arrow placement
10. **`[*]` splitting** — start/end states rendered as separate visual nodes
