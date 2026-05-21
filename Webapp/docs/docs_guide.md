# Documentation Guide

This folder contains all documentation for the Bookkeeping Webapp project.
Each file serves a distinct purpose and targets a different reading context.

---

## File Index

### `study.md`
The design and planning document. Read this first if you want to understand
**what** the project is trying to achieve and **why** it is structured the way it is.

Contents:
- Target definition — what problem the Webapp solves and for whom
- Feasibility analysis — what is technically realistic and what is not
- Implementation proposal — the chosen approach and its rationale
- Phase breakdown — the project divided into incremental delivery milestones
- System architecture — how the major components relate to each other
- Deployment illustration — how the app is built and served
- File structure — the layout of the source tree and what each part does

---

### `codebase_analysis.md`
The deep-dive technical reference. Written for readers who are new to the
codebase or to the underlying concepts (PEG parsing, AST construction, DOM rendering).

Contents:
- Background knowledge — PEG grammars, ASTs, operator precedence, implicit multiplication
- Module-by-module code walkthrough — every source file explained in plain language
- Key algorithms — how the parser works, how the grammar rules fold into AST nodes
- Design decisions — why certain choices were made (e.g. ImplicitPower vs Power)
- Per-phase additions — new concepts and code introduced in each phase

---

### `testing.md`
The test record. Documents every test case, how to run it, and what happened.

Contents:
- How to run tests (manual and automated)
- Per-phase test cases — input, expected output, actual output
- Verdicts — pass / fail / partial
- Issues found and how they were fixed

---

### `demos.md`
The hands-on runbook. Step-by-step instructions for setting up, building,
running, and demonstrating the app in each phase.

Contents:
- Environment setup (references `environ-setup.md` for full detail)
- Build instructions
- How to run the demo
- Expected results with screenshots or output descriptions
- Troubleshooting common problems

---

### `history.md`
The change log. A chronological record of every meaningful change made to
the project, organised by phase.

Contents:
- What changed, what was added, what was removed
- Bug fixes and the bugs they resolved
- Structural refactors
- Decisions reversed or revised

---

### `workflow.md`
The development process definition. Describes the exact iteration loop
followed in every phase: coding → testing → demo → documentation →
notify and await approval. This file governs how all other files are
produced and in what order.

---

### `environment_setup.md`
The hands-on guide for setting up the development environment. Covers the
choice between WSL Ubuntu and Windows host, Node.js installation via nvm,
project setup, and all available npm scripts.

Contents:
- WSL Ubuntu vs Windows host — recommendation and tradeoffs
- Installing Node.js via nvm in WSL
- Whether to copy the project to the native Linux filesystem (optional)
- Installing dependencies and running the dev server
- Available scripts (`dev`, `build`, `preview`)

---

## Reading Order

| Goal | Start here |
|------|-----------|
| Understand the project vision | `study.md` |
| Learn how the code works | `codebase_analysis.md` |
| Run or demo the app | `demos.md` |
| Check test results | `testing.md` |
| See what changed recently | `history.md` |
| Set up the dev environment | `environment_setup.md` |
