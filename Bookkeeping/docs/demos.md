# Demos

This document records demonstrations for each completed phase.

---

## Phase 1 — Graphics library foundation

### Prerequisites
- GCC 12+ with C++20 support
- SDL2 development library installed (`libsdl2-dev`)

### Build & Run
```bash
cd Bookkeeping/
make clean && make
./main
```

### Expected output
- An SDL2 window (800×600) opens with dark background
- Shows 3 colored rectangles stacked vertically (with gray borders)
- A green horizontal line
- A blue filled ellipse
- Press Escape or close window to exit

### Verification
- Visual: shapes render at correct positions with correct colors
- Automated: `make test` runs 45 tests validating pixel-level correctness

---

## Phase 1 Extension — Scroll, hit testing, text measurement, clipping

### Build & Run
```bash
make clean && make
./main
```

### Expected output
- Window opens (800×600, dark background)
- Title text at top: "Scroll Demo (wheel=scroll, click=hit test)"
- Scrollable list of 20 colored items (viewport clips to 300px)
- Mouse wheel scrolls the list
- Click on items prints to terminal: "Surface hit: Item N" and "Deep hit: M node(s)"
- Below the scroll area: a blue ellipse and a green diagonal line
- Terminal shows text measurement: `Text measure 'Hello World' @ 16px: 105.6 x 16.0`
- Press Escape to exit

### Verification
- Automated: `make test` runs 90 tests (67 graphics + 23 table)
- Scroll: items outside viewport are clipped (not visible)
- Hit test: clicking different items reports different IDs

---

## Phase 2 — Table model + CSV parser

### Build & Run
```bash
make test-table
```

### Expected output
```
Running 23 tests...
  PASS str_empty_is_empty
  PASS str_eq_same
  ...
  PASS csv_roundtrip_quoted
  BENCH csv_parse_1000_rows: ~67μs/iter
  PASS bench_csv_parse_large
Results: 23 passed, 0 failed, 23 total
```

### Verification
- All 23 tests pass programmatically
- Round-trip test proves parse→serialize→compare fidelity
- Benchmark shows 1000-row CSV parses in <100μs

---

## Phase 1 Refactoring — Clean OOP + UI builder

### Build & Run
```bash
make clean && make
./main
```

### Expected output
- Window shows all layout types stacked vertically:
  - Title label
  - Horizontal row of 5 colored boxes
  - 3×2 grid of cells
  - Scrollable list (wheel to scroll)
  - Coordinate layout with ellipse + rect
  - VirtualLayout counter (click the purple bar → bars appear)
  - Striped sprite (FunctionalLayout)
- Terminal prints hit info on click
- Counter only increments when clicking the purple counter bar
- Press Escape to exit

### Verification
- `make test` runs 152 tests (102 graphics + 23 table + 27 UI)
- Counter: colored bars appear only on purple-bar clicks
- Scroll: items clip at viewport boundary
- Hit test: correct node IDs printed for each click target


---

## Phase 3 — Table rendering

### Prerequisites
- SDL2 + SDL2_ttf installed (`libsdl2-dev libsdl2-ttf-dev`)
- DejaVu Sans font at `/usr/share/fonts/truetype/dejavu/`

### Build & Run
```bash
make clean && make
./main
```

### Expected output
- Window shows all previous demos PLUS a table with:
  - Header row: "Name | Age | City | Skill" (bold, dark bg)
  - Data rows: Alice/30/London/C++, Bob/25/Paris/Rust, etc.
  - Actual readable text (via SDL2_ttf)
- Mouse wheel scrolls ONLY the scroll view under the cursor
- Table rows clip at viewport bottom
- Hit test prints row IDs when clicking table cells

### Verification
- `make test` → 170 tests pass (102 + 23 + 27 + 18)
- Scrolling table doesn't scroll the item list (and vice versa)
- Text is rendered as actual glyphs, not placeholder rectangles


---

## Phase 4 — Math expression parser + renderer

### Build & Run
```bash
make test-math     # 50 tests + benchmark
make clean && make
./main             # Demo includes math in table cells
```

### Expected output (test)
```
Running 50 tests...
  PASS math_parse_number
  ...
  PASS math_render_empty_set
  BENCH math_parse 1000x: ~35μs/iter
Results: 50 passed, 0 failed, 50 total
```

### Verification
- `make test` → 220 tests pass (102 + 23 + 27 + 18 + 50)
- Parser handles: numbers, vars, Greek, operators, fractions, powers, subscripts, sqrt, sets, text literals, implicit multiplication, parentheses
- Renderer produces correct tree structures (verified by child_count, type checks, dimension checks)
- Benchmark: 100 complex expression parses in ~35μs


---

## Phase 5 — Cell editing + undo/redo

### Build & Run
```bash
make clean && make
./main
```

### Expected output
- Click a table cell → terminal shows: `Edit cell [0,1] = "30"`
- Type characters → terminal shows live: `Editing [0,1]: "305" cursor=3`
- Press Enter → table re-renders with new value visible on screen
- Press Escape → cancels, cell reverts
- Ctrl+Z → undoes last committed edit (table updates)
- Ctrl+Y → redoes
- All previous features still work (scroll, counter, hit testing)

### Verification
- `make test` → 243 tests pass (102 + 23 + 27 + 18 + 50 + 23)
- Edit + undo cycle: edit cell, commit, undo → value restored
- Cancel: type text, press Escape → original value preserved
- Multi-cell: selection + clear works (tested programmatically)


---

## Phase 6 — Renderers + proper math rendering

### Prerequisites
- SDL2 + SDL2_ttf + math fonts installed (see environment_setup.md)

### Build & Run
```bash
make clean && make
./main
```

### Expected output
- Math expressions rendered with DejaVu Math TeX Gyre font:
  - `a² + b² = c²` with superscripts visually shifted up and smaller
  - Fractions stacked vertically with horizontal bar
  - √ symbol rendered from actual Unicode glyph
- Chemistry: `2H2 + O2 -> 2H2O` as readable text
- Physics: `E = mc²` with proper superscript
- Rich text section shows all three embedded on separate lines

### Verification
- `make test` → 277 tests pass (102 + 23 + 27 + 18 + 50 + 23 + 34)
- Superscripts appear smaller and above baseline
- Fractions show numerator above denominator with a line between
- Math font renders Greek/√ correctly (requires DejaVu Math TeX Gyre)


---

## Phase 7 — Graph diagram

### Build & Run
```bash
make clean && make
./main
```

### Expected output
- Flowchart visible: 4 rectangles (Start, Process, Decision?, End) connected by lines
- Lines stop at node borders (don't overlap the rectangles)
- Click on graph nodes prints their id in terminal
- All previous features still work

### Verification
- `make test` → 291 tests pass (102+23+27+18+50+23+34+14)
- `make test-graph` → 14 tests pass
- Graph nodes are hit-testable (click prints id)


---

## Phase 8 — Workspace + Search + Navigation + Tabs

### Build & Run
```bash
make clean && make
./main
```

### Expected output
- Window title: "Bookkeeping — Phase 8: Workspace + Search + Tabs + NavTree"
- Top: search bar (type Ctrl+F to activate)
- Below search: tab strip showing [People] [Cities] [Workflow]
- Left panel: navigation tree (Tables → People, Cities; Graphs → Workflow)
- Right panel: active view content (table or graph depending on tab)
- Switching tabs changes the right panel content
- Nav tree items are expandable/collapsible (click ▼/▶ indicators)

### Interaction
1. **Tab switching**: Click any tab → right panel updates
2. **Nav tree**: Click category (▼ Tables) to collapse/expand; click leaf (People) to activate that tab
3. **Search**: Press Ctrl+F, type a query → results appear below. ESC dismisses search.
4. **Cell editing**: Click a table cell → begin editing (terminal shows edit state). Type, Enter to commit, Ctrl+Z/Y for undo/redo.
5. **Scroll**: Mouse wheel scrolls the deepest scroll container under cursor

### Verification
- `make test` → 335 tests pass (102+23+27+18+50+23+34+27+31)
- `make test-workspace` → 31 tests pass
- Tab clicks switch the visible content
- Search "London" in People tab → shows matching cells
- Nav tree expand/collapse toggles children visibility
