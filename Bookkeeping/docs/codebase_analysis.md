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

### Phase 1 Extension — ScrollLayout, hit testing, text measurement, clipping (completed)

**Files modified:**
- `src/graphics/layout/layout.h` — Added `LAYOUT_SCROLL`, scroll fields, hit testing API, text measurement hook
- `src/graphics/layout/layout.cpp` — Scroll layout algorithm, surface/deep hit testing, text measurement with hook
- `src/graphics/backend/backend.h` — Added `ClipRect`, `set_clip()`/`reset_clip()` to RenderBackend
- `src/graphics/backend/backend.cpp` — `render_tree` handles scroll nodes (clip + offset)
- `src/graphics/backend/software_backend.h` — Scissor rect clipping in all draw calls
- `src/graphics/backend/sdl2_backend.h` — `SDL_RenderSetClipRect` for clipping

**Files added:**
- `src/demo.h` — Self-contained demo showcasing scroll, hit testing, shapes, text measurement

**ScrollLayout:**
- Children positioned relative to content (not viewport)
- `scroll_x`/`scroll_y` offsets shift content within viewport
- `content_width`/`content_height` computed for scroll bounds
- Clipping applied automatically during render_tree traversal

**Hit testing:**
- Surface hit: returns topmost node at (x,y) — traverses children in reverse (last = topmost)
- Deep hit: returns all overlapping nodes in an array (parent first, deepest last)
- Both respect scroll offsets (adjusts coordinates before recursing into scroll children)

**Text measurement:**
- Hook pattern: `set_text_measure_hook(fn)` to plug in real font metrics
- Default mock: `width = chars * size * 0.6`, `height = lines * size`
- Used by SoftwareBackend and SDL2Backend for placeholder text rendering

**Clipping:**
- `set_clip(ClipRect)` restricts all subsequent drawing to the scissor rect
- `reset_clip()` restores full-buffer rendering
- SoftwareBackend checks bounds in `set_pixel()`; SDL2Backend uses `SDL_RenderSetClipRect`

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

---

### Phase 1 Refactoring — Clean OOP, UI builder, platform abstraction (completed)

**Files added:**
- `src/graphics/ui.h` — React-like fluent builder API (VStack, HStack, Grid, Scroll, Box, Label, ColorBox, Absolute, build())
- `src/graphics/node_builder.h` — Lower-level Node builder (superseded by ui.h)
- `src/platform/platform.h` — Platform-agnostic window/event interface (PlatformWindow, InputEvent)
- `src/platform/sdl2_platform.cpp` — SDL2 implementation of PlatformWindow
- `src/graphics/elements/rect.h, ellipse.h, line.h, polyline.h, polygon.h, text.h` — One file per shape
- `test/test_ui.cpp` — 27 tests for UI builder, method API, VirtualLayout, FunctionalLayout

**Refactored:**
- `LayoutNode` now has methods: `compute()`, `render()`, `hit_surface()`, `hit_deep()`
- Demo uses only platform-agnostic `PlatformWindow` — zero SDL in app code
- UI builder reads like React: `VStack(&a, 8).child(Box(...).bg(...))`

**Zero-cost OOP:**
- Methods on structs compile to identical code as free functions
- Only RenderBackend and PlatformWindow use virtual (platform boundary)
- No vtable for shapes, layout nodes, or UI builder


---

### Phase 3 — Table rendering (completed)

**Files added:**
- `src/app/table_view.h` — Builds visual table from Table model (header + scrollable data rows)

**Design:**
- Header row: HStack of column cells (bold text, dark background)
- Data rows: HStack per row inside a ScrollLayout viewport
- Column widths auto-sized from header text measurement (min 80px)
- Alternating row background colors
- Each row has id `"row-N"` for hit testing
- Scroll isolation: mouse wheel only scrolls the scroll node under cursor (hit-test gated)

**SDL2_ttf integration:**
- Real font rendering via DejaVu Sans (regular + bold)
- `TTF_RenderUTF8_Blended` for anti-aliased text
- Font size set per-element via `TTF_SetFontSize`

**Bug fixed:**
- Mouse wheel scrolled all scroll views simultaneously → now hit-tests to find deepest LAYOUT_SCROLL under cursor, scrolls only that one


---

### Phase 4 — Math expression parser + renderer (completed)

**Files added:**
- `src/core/parser/math/math_ast.h` — AST node types (tagged union: NUMBER, IDENTIFIER, BINARY, UNARY, FRACTION, SUPERSCRIPT, SUBSCRIPT, SQRT, SET, TEXT, CALL, PAREN, ELLIPSIS, MATRIX)
- `src/core/parser/math/math_parser.h` — Recursive descent parser with precedence: comma < relational < additive < multiplicative < power < unary < primary
- `src/core/parser/math/math_render.h` — AST → LayoutNode tree (fractions=VStack, superscripts=70% size, √ prefix, set braces, parens)
- `test/test_math.cpp` — 50 tests (parser + renderer + benchmark)

**Parser features:**
- Numbers (int + float), identifiers (single/multi letter), Greek (`\alpha`)
- Binary ops: +, -, *, / (→ fraction), =, !=, <=, >=, <, >, ->
- Implicit multiplication: `2x`, `(a+b)(c+d)`, `x"text"`
- Unary: `-x`, `+x` (negative lookahead for `{` to avoid conflict with sets)
- Power `^`, subscript `_`
- `\sqrt{...}`, sets `{a, b, c}`, text `"..."`, ellipsis `...`
- Parenthesized expressions
- Comma separator at lowest precedence

**Renderer layout mapping:**
- Binary op → HStack(left, op_label, right)
- Fraction → VStack(numerator, bar, denominator)
- Superscript → HStack(base, small_sup)
- Subscript → HStack(base, small_sub)
- Sqrt → HStack(√, body)
- Set → HStack({, elem, comma, elem, ..., })
- Paren → HStack( (, expr, ) )


---

### Phase 5 — Cell editing + undo/redo (completed)

**Files added:**
- `src/app/edit_history.h` — EditHistory: fixed-capacity push/undo/redo stack, arena-allocated
- `src/app/table_editor.h` — TableEditor: cell editing, text input, cursor, undo/redo, multi-cell selection, clear/move operations
- `test/test_editor.cpp` — 23 tests

**TableEditor design:**
- `begin_edit(row, col)` → loads cell value into 512-byte edit buffer
- `insert_char`, `delete_back`, `delete_forward` → manipulate buffer with memmove
- `commit_edit()` → pushes EditAction to history, updates table model
- `cancel_edit()` → discards buffer changes
- `undo()/redo()` → restores/reapplies cell values from history
- `CellSelection` supports single, toggle (Ctrl+click), and range (Shift+click)
- `clear_selected_cells()` / `move_selection(dest_row, dest_col)` for multi-cell ops

**Demo integration:**
- Click table cell → activates editor, shows current value in terminal
- Type → inserts characters into edit buffer (live feedback in terminal)
- Enter → commits edit, table re-renders with updated value
- Escape → cancels edit
- Ctrl+Z/Y → undo/redo
- Table view rebuilds on every committed change
