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
