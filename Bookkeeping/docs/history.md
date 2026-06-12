# History

This document records all development activity, decisions, and changes
across phases.

---

## Project inception — 2026-06-12

- Decision: Port Bookkeeping Webapp to native C/C++
- Existing code: basic graphics library with Rect, Circle, Renderer,
  Collision, Transform, Color, World structs
- Created documentation structure: workflow.md, study.md,
  codebase_analysis.md, demos.md, environment_setup.md, history.md,
  testing.md
- Defined porting strategy in study.md
- Defined phased plan (10 phases)

---

## Phase 1 — Graphics library foundation — 2026-06-12

**Added:**
- Arena allocator (`src/core/arena.h`)
- Color type (`src/core/color.h`)
- Fixed-point definitions (`src/core/fixed.h`)
- Shape primitives: Rect, Ellipse, Line, Polyline, Polygon, Text (`src/graphics/elements/`)
- Element tagged union with factory functions
- Layout engine: Coordinate, LinearH, LinearV, Grid (`src/graphics/layout/`)
- RenderBackend interface + render_tree traversal (`src/graphics/backend/`)
- SoftwareBackend for headless pixel-level testing
- SDL2Backend for windowed rendering
- Test harness (`test/test.h`) with ASSERT macros + BENCH timing
- 45 tests covering arena, layout, rendering, integration, benchmarks

**Decisions:**
- Use virtual dispatch only for backend (visitor pattern)
- POD structs for shapes — no inheritance
- TextStyle flags bit-packed into uint8_t
- SoftwareBackend validates rendering correctness via pixel assertions
- Replaced old Renderer/Collision/World code with new graphics lib

---

## Phase 1 Extension — ScrollLayout, hit testing, text measurement, clipping — 2026-06-12

**Added:**
- ScrollLayout type (`LAYOUT_SCROLL`) with scroll offset and content size tracking
- Hit testing: `hit_test_surface()` (topmost) and `hit_test_deep()` (all overlapping)
- Text measurement hook with default mock implementation
- Scissor-rect clipping in both SoftwareBackend and SDL2Backend
- `src/demo.h` — interactive demo (scroll + click + shapes)
- `main.cpp` simplified to just call `run_demo()`
- 22 new tests: scroll (5), hit testing (7), text measurement (5), clipping (5)

**Decisions:**
- Text measurement uses a pluggable hook (function pointer) — default mock, replaceable with stb_truetype/SDL2_ttf later
- Hit testing accounts for scroll offsets
- Demo kept as a separate header for future reuse/customer demos
- Clipping implemented at pixel level in SoftwareBackend, via SDL API in SDL2Backend

---

## Phase 2 — Table model + CSV parser — 2026-06-12

**Added:**
- Arena-backed string type (`src/core/str.h`)
- Table model: Table, Row, Cell, Column (`src/core/model/table.h/.cpp`)
- CSV parser + serializer (`src/core/parser/csv.h/.cpp`)
- 23 tests: string operations, table CRUD, CSV parsing edge cases, round-trip, benchmark

**Decisions:**
- Strings are pointer+length, arena-allocated with null terminator for C compat
- Table rows stored as contiguous array (memmove for insert/remove/move)
- CSV parser handles RFC-4180 quoting, normalizes \r\n at parse time
- Pre-allocate row_capacity to avoid reallocation

---

(Further entries added as phases are completed)

---

## Phase 1 Refactoring — Clean OOP, UI builder, platform abstraction — 2026-06-12

**Added:**
- React-like fluent UI builder (`src/graphics/ui.h`)
- Platform abstraction (`src/platform/platform.h` + `sdl2_platform.cpp`)
- One-file-per-shape structure in `src/graphics/elements/`
- Methods on LayoutNode (compute, render, hit_surface, hit_deep)
- 27 new UI tests (`test/test_ui.cpp`)
- Demo rewritten with clean fluent API, no platform-specific code

**Decisions:**
- struct methods = zero cost (same assembly as free functions)
- virtual only at platform boundary (RenderBackend, PlatformWindow)
- UI builder uses rvalue overload for chaining temporaries
- Old free-function API kept as wrappers for backward compat with 102 existing tests
- Counter demo fixed: only dispatches on click within counter node (hit-test gated)
- Segfault fix: print hit results before dispatch (avoids dangling pointers after arena reset)

**Bug fixed:**
- Counter incrementing on any click → gated by hit-test checking for "counter" id in deep hit
- Segfault on repeated clicks → deep hit results printed before VirtualLayout arena reset


---

## Phase 3 — Table rendering — 2026-06-12

**Added:**
- `src/app/table_view.h` — Table model → visual grid renderer
- SDL2_ttf integration for real font rendering (DejaVu Sans)
- 18 table view tests (structure, rendering, hit testing, scroll isolation, benchmark)
- Demo shows 5-row × 4-column table with scrollable data

**Decisions:**
- Table rendered as header HStack + data rows in ScrollLayout
- Column widths derived from text measurement
- Scroll isolation via hit-test: wheel only affects hovered scroll node
- SDL2_ttf linked for actual glyph rendering (replaces placeholder rects)

**Bugs fixed:**
- Mouse wheel scrolling all scroll views simultaneously → gated by deepest scroll node hit-test


---

## Phase 4 — Math expression parser + renderer — 2026-06-12

**Added:**
- Math AST types, recursive descent parser, LayoutNode renderer
- 50 tests covering all expression types, precedence, complex formulas
- Benchmark: 100 complex parses in ~35μs

**Decisions:**
- Parser is header-only (all inline in math_parser.h) for zero linking overhead
- Division always produces MATH_FRACTION (stacked rendering, no inline ÷)
- Implicit multiplication detected by next char being `(`, identifier start, or `"`
- Greek identifiers via `\name` prefix, stored with style=3
- Renderer uses 70% font size for subscripts/superscripts
- Arena allocated — all nodes from a single arena, no per-node free


---

## Phase 5 — Cell editing + undo/redo — 2026-06-12

**Added:**
- `src/app/edit_history.h` — EditHistory (push/undo/redo, fixed-capacity)
- `src/app/table_editor.h` — TableEditor (edit buffer, cursor, commit/cancel, undo/redo, selection, multi-cell ops)
- 23 tests for history, selection, and editor operations
- Demo wired: click cells to edit, type, Enter to commit, Escape to cancel, Ctrl+Z/Y

**Decisions:**
- Edit buffer is 512 bytes on stack (no heap in hot path)
- History capacity pre-allocated in arena (no malloc during editing)
- Selection uses flat array with linear search (sufficient for <512 cells)
- Demo shows editing state in terminal (printf) since text cursor rendering needs Phase 1 text improvements

**Bug fixed:**
- Arena too small at -O2 caused segfault in tests → increased arena sizes


---

## Phase 6 — Renderers + proper math — 2026-06-12

**Added:**
- Chemistry, physics, geometry, rich text renderers
- 34 renderer tests
- Proper math rendering with baseline offsets (y_offset on LayoutNode)
- DejaVu Math TeX Gyre font loaded in SDL2 backend
- Font style (italic) applied via TTF_SetFontStyle
- Multiline text rendering (split on \n)
- Demo shows rich text with math/chem/physics embeddings
- Environment setup documentation for all platforms

**Decisions:**
- Chemistry rendered as plain text (formulas like "H2O" are readable as-is)
- Physics/Geometry delegate to math renderer (same notation)
- Rich text uses VStack of HStack lines (like the Webapp)
- y_offset applied in render() and hit_surface()/hit_deep() for consistency
- Math font: DejaVu Math TeX Gyre (has √, Greek, etc.) — fallback to STIX, then DejaVu Sans
- Surrogate text approach replaced with proper structural rendering

**Bug fixed:**
- UTF-8 symbols (√, →) not rendering → ensured math font loaded, ASCII fallback for chem arrows
- Previous "scrambled ASCII" was from many tiny text nodes → redesigned renderer with proper structure + y_offset


---

## Phase 7 — Graph model + diagram rendering — 2026-06-12

**Added:**
- `src/core/model/graph.h` — Graph data structure
- `src/app/graph_view.h` — Graph visual renderer
- 14 tests (model + rendering + hit testing)
- Demo shows flowchart: Start → Process → Decision? → End (with loop)

**Decisions:**
- Grid layout for simplicity (force-directed can be added later)
- Edge lines shortened to node border (avoids overlapping node fill)
- Nodes as CoordinateLayout children (pre-positioned by layout_grid)
- Edges as Element lines on root (rendered behind nodes due to draw order)
