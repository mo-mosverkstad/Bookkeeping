# Workflow

This file defines the development process for the Bookkeeping C/C++ port.
Every phase follows this workflow exactly, in order. Do not skip steps.

---

## Entry Point

```
docs/study.md
```

`study.md` is the source of truth for the project. It contains:
- Ideas, wishes, and targets
- Study and feasibility analysis
- Solution and implementation proposal
- Phase scope definition (goals, tasks, completion criteria, demo spec)

Before starting any phase, the relevant phase section in `study.md` must
be complete and agreed upon. Coding does not begin until the phase scope
is defined.

---

## Per-Phase Iteration

```
docs/study.md  (phase scope defined and agreed)
      │
      ▼
  1. Coding
  2. Testing & Benchmarking
  3. Demo
  4. Documentation
      │
      ▼
  5. Notify — await signal to proceed to next phase
```

---

### Step 1 — Coding

Implement everything listed under the phase's **Concrete tasks** in `study.md`.

#### Performance requirements

All code in the hot path must follow these principles:

1. **Bit packing** — Pack scattered boolean flags and sub-byte enums into
   8/16/32/64-bit integers. Avoid scattered `bool` fields or enum types
   that waste alignment. Use bitfields or manual shifts/masks.

2. **Hand-rolled allocations** — No `malloc`/`new` in the hot path.
   Preallocate arena or pool allocators. Bump-allocate from the arena.
   Free in bulk (arena reset) rather than per-object.

3. **LUTs for trigonometry** — Precompute sin/cos/tan at a fixed angular
   resolution (e.g., every 0.1° from 0° to 90°) into lookup tables.
   Use interpolation for intermediate values. Apply to rotation matrices
   and any other trig in the graphics pipeline.

4. **Fixed-point math over float where applicable** — When no scientific
   notation is involved (coordinates, pixel positions, pricing, sizing),
   prefer fixed-point representations. The bit layout (I.F split) is
   ARBITRARY and must be justified per use case:
   - Estimate the value range → determines integer bits needed
   - Estimate precision needed → determines fractional bits needed
   - Pick the smallest integer type that fits (uint8_t, uint16_t, etc.)
   - NEVER over-allocate (e.g., 64-bit for an age that fits in 8 bits)
   - Document every layout choice with its reasoning
   Use float/double only when precision requirements demand it.

All code must be committed before moving to testing.

---

### Step 2 — Testing & Benchmarking

#### Unit tests

Run all test cases defined for the phase:
```
make test
```

**Test writing guidelines:**
- Write as much coverage as possible — cover the happy path, edge cases,
  boundary conditions, error cases, and any known tricky interactions
- Every bug that is found and fixed must have a corresponding regression
  test added so it can never silently reappear
- Tests must be independent — no test should rely on the side effects
  of another test
- Tests must be comprehensive and self-evaluating: each test must
  programmatically verify its own correctness, no manual inspection
- For the graphics library: capture rendered output (framebuffer pixel
  data) and compare against reference images or computed expected values.
  This validates rendering correctness automatically.

**All tests must pass — new and regression — before proceeding.**

#### Benchmarks

Run benchmarks for performance-critical code:
```
make bench
```

- Benchmark different algorithmic approaches when multiple exist
- Measure execution time, throughput, and memory usage
- Record results in `docs/testing.md` with hardware context
- Identify regressions by comparing against previous phase baselines
- Hot-path code must meet latency budgets defined in `study.md`

---

### Step 3 — Demo

Run the demo as specified in the phase's **Demo** section in `study.md`.
The demo must work end-to-end. A phase is not complete until its demo passes.

---

### Step 4 — Documentation

Update all four documentation files. All four must be updated before
notifying. Do not skip any file.

#### 4.1 — `docs/codebase_analysis.md`
- Explanation of new knowledge and concepts introduced in this phase
- Code analysis: walk through every new or changed file and explain it
- Written for readers who are new to the codebase

#### 4.2 — `docs/testing.md`
- Record all testing activities for this phase
- Each test case: input, expected output, actual output, verdict
- Benchmark results: algorithm, input size, time, comparison
- Issues found, how they were diagnosed, and how they were fixed

#### 4.3 — `docs/demos.md`
- Add this phase's demo to the demos document
- Include: prerequisites, environment setup, build steps, run steps,
  expected output, and how to verify correctness

#### 4.4 — `docs/history.md`
- Record all activities in this phase: coding, testing, demo
- What was added, changed, removed
- Bugs found and fixed
- Decisions made and why

---

### Step 5 — Notify

Notify that the phase is complete. State:
- Which phase was completed
- Where the demo can be run and what to look for
- Any known issues or deviations from the plan in `study.md`

**Wait for explicit approval before starting the next phase.**
The next phase does not begin until a go-ahead signal is received.
