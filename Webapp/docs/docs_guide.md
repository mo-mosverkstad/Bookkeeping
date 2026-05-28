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

## Source Structure (after Phase 15.B)

```
src/
├── engine/              # General-purpose PEG engine
├── model/               # Business model (1 class per file)
│   ├── Cell.ts
│   ├── Column.ts
│   ├── Row.ts
│   ├── Table.ts
│   ├── Graph.ts         # Graph model (nodes, edges, sourceFile)
│   ├── GraphNode.ts
│   ├── GraphEdge.ts
│   ├── TypedValue.ts
│   ├── Document.ts      # Document, Section, TableBlock, GraphBlock
│   ├── Association.ts
│   ├── RelationType.ts
│   ├── AssociationGraph.ts
│   ├── EditHistory.ts
│   ├── KnowledgeBase.ts # tables, graphs, documents
│   └── index.ts         # Barrel re-export only
├── controller/          # Orchestration (AppController)
├── knowledge-pane/      # Central knowledge display surface
│   ├── table-view.ts        # Spreadsheet view of a Table
│   ├── flow-diagram-view.ts # SVG diagram view of a Graph
│   ├── document-view.ts     # Stacked-section view of a Document
│   ├── workspace-controller.ts  # Tab strip + lazy open/close lifecycle
│   └── workspace-view.ts    # WorkspaceView interface + viewFactory
├── source-editor/       # Right sidebar source editor
│   ├── source-editor-view.ts
│   └── highlighter.ts
├── shell/               # App chrome and global event wiring
│   ├── app-shell.ts         # File loading, keyboard, toolbar wiring
│   ├── navigation-tree-view.ts  # Left sidebar directory tree
│   ├── graph-filter-view.ts
│   ├── search-view.ts
│   └── session.ts
├── cell-renderers/      # Stateless cell rendering plugins
│   ├── interface.ts         # CellRenderer interface (Plugin alias kept)
│   ├── registry.ts          # renderCell dispatch
│   ├── math/
│   ├── geometry/
│   ├── physics/
│   ├── chemistry/
│   └── text/
├── data/                # File parsers (CSV, control.json, .doc.json)
│   ├── csv.ts
│   ├── control.ts
│   └── doc.ts
├── search/              # Search engine
└── main.ts              # App entry point (wiring only)

test/                    # Mirrors src structure
├── engine/
├── cell-renderers/
│   ├── math/
│   ├── geometry/
│   └── physics/
├── data/
└── ui/
```

**`index.html` shell structure (Phase 15.B):**
```
#menu-bar        <- fixed: app title, file open, session banner
#toolbar         <- fixed: dynamic actions | export | sidebar toggle | nav toggle | filter | search
#tab-bar         <- fixed: open tabs only (lazy, closeable with x button)
#content-area    <- flex row:
  #nav-tree-panel  <- left: directory tree (collapsible)
  #workspace       <- centre: active view (table / diagram / document)
  #sidebar         <- right: source editor (collapsible)
#status-bar      <- fixed: active tab name + load summary
```

**Navigation model (Phase 15.B):**
- The nav tree is the primary navigation surface. It shows all loaded
  documents (as collapsible folders with their sections), and a
  Standalone folder for tables/graphs not owned by any document.
- Clicking any item in the nav tree calls `openTab(id)` on the
  `WorkspaceController`. If the tab is already open it is activated;
  otherwise a new tab is created from the registered view factory.
- Tabs are closeable. Closing a tab does not unload the data from the
  `KnowledgeBase` - the item remains in the nav tree and can be
  reopened at any time.

---

### `theory.md`
The theoretical foundation document. Explains the computer science theory
behind the parser and grammar system from first principles, written for
readers with no prior knowledge of parsing theory or formal languages.

Contents:
- Related academic fields and university courses
- Formal languages, alphabets, strings
- Grammars and the Chomsky hierarchy
- Context-free grammars (CFG) and ambiguity
- Parsing Expression Grammars (PEG) — definition, operators, comparison with CFG
- Recursive descent parsing
- How the PEG engine works internally
- The BobaMath grammar design philosophy
- Operator precedence via grammar structure
- Left vs right associativity and how build functions implement them
- Implicit multiplication — the hard problem and its solution
- The script-agnostic identifier system
- Scannerless parsing vs traditional tokenisation
- Abstract Syntax Trees — structure, purpose, node types
- The rendering pipeline from AST to visual HTML
- Why existing tools (PEG.js, ANTLR, MathJax, KaTeX) were not used
- Summary of design principles

---

### `exception.md`
Documents deviations from the standard workflow when the AI assistant
operates in a different environment (SUSE Linux) from the target runtime
(WSL Ubuntu without desktop). Defines what the assistant does (write code,
tests, docs, instructions) and what it does not do (execute tests, run
dev server, install dependencies).

Contents:
- Current environment situation
- What the assistant must and must not do
- Modified workflow with split responsibilities
- Instructions for running tests and demos on the target

---

## Reading Order

| Goal | Start here |
|------|-----------|
| Understand the project vision | `study.md` |
| Learn the CS theory behind the system | `theory.md` |
| Learn how the code works | `codebase_analysis.md` |
| Run or demo the app | `demos.md` |
| Check test results | `testing.md` |
| See what changed recently | `history.md` |
| Set up the dev environment | `environment_setup.md` |
| Understand cross-environment constraints | `exception.md` |
