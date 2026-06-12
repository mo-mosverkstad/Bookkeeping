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
