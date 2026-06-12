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
