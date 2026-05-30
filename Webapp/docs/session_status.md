# Session Status — 2026-05-30

## Quick Context

Read these files to reconstruct full context:
1. `docs/study.md` — phase definitions and plans (Phases 18-21 planned)
2. `docs/history.md` — what was done (Phases 1-18)
3. `docs/codebase_analysis.md` — how the code works
4. `docs/syntax_manual.md` — rich cell embedding syntax ($math{}, $chem{}, etc.)

## Current State

- **Phase 17 (File System Access)** — COMPLETE
- **Phase 18 (Diagram Grammars)** — IN PROGRESS
  - 7 diagram types implemented: flowchart, sequence, class, state, ER, gantt, pie
  - All parse and render to SVG
  - **NEW: `.diagram` file extension** replaces `.md` and `.graph.json`
  - **NEW: `.doc.json` integration** via `graph_flowchart`, `graph_sequence`, etc. block types
  - **NEW: `control.json` integration** via `"view": "diagram"` entries
  - Diagrams save their own Mermaid-compatible text syntax directly (not JSON)
  - Source editor bidirectional sync works
  - TODO: labeled edges in flowchart (`-->|text|`), class diagram members merging,
    subgraphs, more Mermaid syntax coverage
- **Phase 19 (Semantic Layer)** — NOT STARTED
- **Phase 20 (Stable Identity)** — NOT STARTED
- **Phase 21 (Native Format)** — NOT STARTED

## Key Architecture Decisions Made Today

1. **Diagrams use `.diagram` file extension** — NOT `.md` (they are not markdown)
2. **Diagrams save their own text syntax** — NOT converted to `.graph.json`
3. **`.graph.json` is removed** — replaced by `.diagram` files with Mermaid-compatible syntax
4. **`.doc.json` block types are per-diagram-kind** — `graph_flowchart`, `graph_sequence`,
   `graph_class`, `graph_state`, `graph_er`, `graph_gantt`, `graph_pie`
5. **`control.json` uses `"view": "diagram"`** with `"file": "name.diagram"`
6. **`DiagramView` is the sole view for diagram files** — renders directly from text source
7. **`DiagramBlock` added to Document model** — `{ kind: "diagram", file, source, diagramType }`
8. **`Graph` model + `FlowDiagramView` remain** for CSV-based graph entries in control.json
   (flow/spatial/relation/sequence from CSV nodes+edges), but are no longer the file format

## File Format Examples

### .diagram file (raw text, Mermaid-compatible syntax):
```
flowchart TD
    A[Start] --> B{Decision}
    B --> C[OK]
    B --> D[Fail]
```

### .doc.json section referencing a diagram:
```json
{
  "id": "login-flow",
  "title": "Login Flow",
  "block": {
    "type": "graph_flowchart",
    "file": "login-flow.diagram",
    "labelStyle": "default"
  }
}
```

### control.json entry for a diagram:
```json
{
  "id": "glycolysis-map",
  "view": "diagram",
  "file": "glycolysis.diagram"
}
```

## Test Status

383 tests pass (13 test files). Run: `npm test`

## Known Issues / Incomplete

- Flowchart `-->|label|` syntax not yet supported (pipe-delimited labels)
- Class diagram member lines don't merge into existing class defs
- No `$diagram{...}` embedding in rich cells yet (diagrams are standalone only)
- Sidebar resize was attempted but reverted (CSS issues)
- Some Biology test resource files lost introductory text during Phase 16 rectification
- `Graph` model + `FlowDiagramView` still exist for CSV-based control.json entries
  (flow/spatial/relation/sequence from CSV nodes+edges) — may be removed in future
