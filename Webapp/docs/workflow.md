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

Run all test cases defined for the phase. Record results.
Fix any failures before proceeding to the demo.

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
