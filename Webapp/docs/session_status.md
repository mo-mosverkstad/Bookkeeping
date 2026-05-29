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
  - Standalone .md files loadable as diagram tabs
  - Source editor bidirectional sync works
  - TODO: labeled edges in flowchart (`-->|text|`), class diagram members merging,
    subgraphs, more Mermaid syntax coverage
- **Phase 19 (Semantic Layer)** — NOT STARTED
- **Phase 20 (Stable Identity)** — NOT STARTED
- **Phase 21 (Native Format)** — NOT STARTED

## Key Architecture Decisions Made Today

1. **All cells are "rich"** — no type selector, universal `$type{content}` embedding
2. **$type{content} syntax** with balanced braces (not backticks — backticks conflict with math grammar's left/right-skew identifiers)
3. **Diagrams are standalone files** (.md/.mmd) — not embedded in tables
4. **Graphs save as text syntax** (not JSON) via `serializeGraph()`
5. **Per-file dirty tracking** — content comparison, not global history position
6. **File System Access API** — `showOpenFilePicker` for handles, fallback to `<input type="file">`
7. **Source editor always "rich" mode** — no type dropdown
8. **Apply keeps cell active** — `editCell(silent=true)` avoids re-render
9. **cancelActive = auto-apply** — leaving a cell commits changes

## Test Status

383 tests pass (13 test files). Run: `npm test`

## Known Issues / Incomplete

- Flowchart `-->|label|` syntax not yet supported (pipe-delimited labels)
- Class diagram member lines don't merge into existing class defs
- No `$diagram{...}` embedding in rich cells yet (diagrams are standalone only)
- Sidebar resize was attempted but reverted (CSS issues)
- Some Biology test resource files lost introductory text during Phase 16 rectification
