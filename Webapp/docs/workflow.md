# Workflow

This file defines the development process for the Bookkeeping Webapp project.
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
  2. Testing
  3. Demo
  4. Documentation
      │
      ▼
  5. Notify — await signal to proceed to next phase
```

---

### Step 1 — Coding

Implement everything listed under the phase's **Concrete tasks** in `study.md`.
All code must be committed before moving to testing.

---

### Step 2 — Testing

Run all test cases defined for the phase:
```
npm test
```
This runs **all** tests in `test/` via Vitest — both the new tests added
in this phase and all regression tests from every previous phase.
Results are printed in the terminal — each test suite and individual test
case is listed with a pass/fail indicator, and any failure shows the exact
file, line, actual value, and expected value.

**All tests must pass — new and regression — before proceeding to the demo.**
If any test fails, whether it is a new test for the current phase or a
regression test from a previous phase:
1. Diagnose and fix the failure
2. Rerun `npm test`
3. Repeat until every single test passes

Do not proceed to the demo with any failing test, regardless of which
phase it belongs to. A regression failure means a previous phase's
functionality has been broken and must be restored before moving forward.

During development, use `npm run test:watch` for continuous re-running
on every file save.

See `docs/testing.md` for a full explanation of how to read the output.

**When writing test cases:**
- Write as much coverage as possible — cover the happy path, edge cases,
  boundary conditions, error cases, and any known tricky interactions
- Every bug that is found and fixed must have a corresponding regression
  test added so it can never silently reappear
- Tests must be independent — no test should rely on the side effects
  of another test

Whenever a bug is found during testing or demo:
1. Record the bug in `docs/testing.md` — symptom, root cause, fix, and
   both the failing and passing test run outputs
2. Record the bug in `docs/codebase_analysis.md` — explain the root cause
   in depth so a new reader understands why it happened and how the fix
   works. Include: what the wrong behaviour was, what code caused it,
   what the correct mental model is, and what the fix changed
3. Record the bug in `docs/history.md` — what changed and why

Do not proceed to the demo until all bugs found in testing are fixed
and recorded in all three files.

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
