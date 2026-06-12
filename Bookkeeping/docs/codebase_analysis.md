# Codebase Analysis

This document explains the architecture, design decisions, and implementation
details of the Bookkeeping C/C++ port.

---

## Project overview

Native C/C++ port of the Bookkeeping Webapp. Replaces the browser runtime
with a custom graphics library and SDL2 backend. Core logic (parsers, models,
edit history) is ported directly; UI rendering is rebuilt using a shape/layout
abstraction with a visitor-pattern backend.

---

## Architecture

```
src/
├── core/           # Models, parsers, data structures (pure C, no graphics)
│   ├── model/      # Table, Row, Cell, Graph (arena-allocated)
│   ├── parser/     # PEG engine, CSV parser, math/chem/geom/phys parsers
│   └── search/     # Text search, graph traversal
├── graphics/       # Graphics library (interface + backend)
│   ├── elements/   # Rect, Ellipse, Line, Polyline, Polygon, Text
│   ├── layout/     # CoordinateLayout, LinearLayout, GridLayout, etc.
│   └── backend/    # SDL2Backend, SoftwareBackend (visitor implementations)
├── app/            # Application layer (table view, diagram view, editor)
└── platform/       # Platform abstraction (window, events, file I/O)
```

---

## Graphics library design

See `docs/study.md` for the full interface/backend architecture.

Key design points:
- Shapes are plain structs (POD where possible) — no virtual functions
- Layouts compute child positions in a single pass
- Backend uses visitor pattern — each backend implements rendering for each shape
- Text supports: multiline, font family/size/weight, italic, bold, underline,
  strikethrough, subscript, superscript, color, horizontal alignment
- Typography: FreeType or stb_truetype for glyph rasterization

---

## Performance techniques

1. **Bit packing** — Flags and small enums packed into integers
2. **Arena allocation** — No malloc in hot path; bump allocate from preallocated arenas
3. **Trig LUTs** — Precomputed sin/cos/tan at fixed angular resolution
4. **Fixed-point math** — 16.16 fixed point for coordinates and layout math

---

## Porting notes

### Phase 1 — Graphics library foundation (completed)

**Files added:**
- `src/core/arena.h` — Arena allocator (bump alloc, bulk free, typed helpers)
- `src/core/color.h` — RGBA color packed into 4 bytes
- `src/core/fixed.h` — Fixed-point math definitions and rationale
- `src/graphics/elements/shapes.h` — Rect, Ellipse, Line, Polyline, Polygon, Text structs with bit-packed TextStyle flags
- `src/graphics/elements/element.h` — Element tagged union + factory functions
- `src/graphics/layout/layout.h/.cpp` — Layout engine: Coordinate, LinearH, LinearV, Grid
- `src/graphics/backend/backend.h/.cpp` — RenderBackend interface + render_tree traversal
- `src/graphics/backend/software_backend.h` — Pixel buffer rasterizer (Bresenham lines, scanline ellipse, alpha blending)
- `src/graphics/backend/sdl2_backend.h` — SDL2 accelerated renderer

**Design decisions:**
- Shapes are plain POD structs, no virtual functions
- Backend uses virtual dispatch (visitor pattern) — only point of polymorphism
- TextStyle flags packed into single uint8_t (6 bits used)
- SoftwareBackend enables headless pixel-level test validation

---

### Phase 2 — Table model + CSV parser (completed)

**Files added:**
- `src/core/str.h` — Arena-backed string: pointer + length, null-terminated for C compat
- `src/core/model/table.h/.cpp` — Table/Row/Cell/Column structs, CRUD operations (append, insert, remove, move)
- `src/core/parser/csv.h/.cpp` — RFC-4180-style CSV parser + serializer

**CSV parser details:**
- Handles quoted fields (embedded commas, newlines, escaped `""`)
- Normalizes `\r\n` → `\n` in cell values at parse time
- Two-pass quoted field parsing: first pass computes length, second pass copies
- Expects format: header row, type row, then data rows
- Serializer produces minimal quoting (only when needed)

**Table model:**
- All allocations from arena — no per-object free
- Rows stored as contiguous array with memmove for insert/remove/move
- `row_capacity` pre-allocated to avoid reallocation
