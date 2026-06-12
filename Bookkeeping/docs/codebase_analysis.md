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

(To be filled as phases are completed)
