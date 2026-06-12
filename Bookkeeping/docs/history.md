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
