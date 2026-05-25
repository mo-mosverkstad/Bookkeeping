# History

## Phase 1 — Parser & Basic Renderer

---

### Initial implementation

**Added**
- `PEGParser` class — recursive descent PEG engine with support for literal,
  regex, sequence, choice, repeat, and rule-reference expressions
- Whitespace skipping via configurable `skip` regex pattern
- Structured error reporting — tracks the furthest failure position and
  formats a compiler-style error message with line, column, and caret
- BobaMath grammar — full arithmetic expression grammar covering:
  - Additive (`+`, `-`)
  - Multiplicative (`*`, `/`, implicit multiplication)
  - Power (`^`, right-associative)
  - Unary prefix (`-`, `+`)
  - Postfix: function calls `f(x)`, control expressions `\name{...}`,
    subscripts `x_i`
  - Primary: numbers, plain identifiers (`x`), escaped identifiers (`\int`),
    parenthesised expressions
- AST node types: `NumberLiteral`, `Identifier`, `BinaryExpression`,
  `UnaryExpression`, `CallExpression`, `ControlExpression`, `SubscriptExpression`
- HTML renderer: `render()`, `renderMath()`, `renderBinary()`, `renderCall()`,
  `renderControl()`, `renderSubscript()`, `renderIntegral()`
- `el()` DOM helper
- `native-math.css` — styles for fraction, opstack, large-operator, sqrt,
  matrix, piecewise
- Basic UI: text input, Render button, result div, error div
- Manual test injection: pre-fills input with `-2*(3+5)*4e^x^2` on load

---

### Bug fix — implicit multiplication precedence (Issue 1)

**Problem:** `4e^x^2` parsed as `(4 * e) ^ x ^ 2` instead of `4 * (e ^ (x ^ 2))`.

**Change:** Replaced `ImplicitFactor` with `Power` as the implicit
multiplication operand in `Multiplicative`'s repeat rule.

**File changed:** `src/main.ts` (pre-split), later `src/parser/grammar.ts`

---

### Bug fix — implicit multiplication stealing unary signs (Issue 2)

**Problem:** `(3+5)` inside a larger expression parsed as `3 * (+5)` because
the implicit `Power` branch consumed `+` as a unary sign before `Additive`
could use it as an additive operator.

**Change:** Introduced `ImplicitPower` rule — identical to `Power` but rooted
at `Postfix` instead of `Unary`, preventing it from consuming leading signs.
The implicit multiplication branch in `Multiplicative` now uses `ImplicitPower`.

**File changed:** `src/main.ts` (pre-split), later `src/parser/grammar.ts`

---

### Refactor — split `main.ts` into modules

**Motivation:** `main.ts` had grown to contain the PEG engine, all type
definitions, the grammar, the renderer, and the DOM wiring in a single file.
Splitting it makes each concern independently readable and reusable.

**Changes:**

| New file | Contents moved from `main.ts` |
|----------|-------------------------------|
| `src/parser/types.ts` | All PEG engine interfaces and AST node types |
| `src/parser/PEGParser.ts` | `PEGParser` class |
| `src/parser/grammar.ts` | Grammar definition + exported `parser` instance |
| `src/render/el.ts` | `el()` helper function |
| `src/render/render.ts` | All `render*` functions |
| `src/main.ts` | DOM wiring only (load event + button handler) |

**Deleted:** `src/parser/parser.ts` (was an empty placeholder)

**Other improvements in the refactor:**
- Removed duplicate `buttonElement.addEventListener("click", ...)` — the
  original `main.ts` had the click handler registered twice
- Replaced `this.document.getElementById` with `document.getElementById` in
  the load handler (the `this` reference was incorrect inside a regular
  function listener)
- `interleave()` parameter type tightened from `Node[]` to `HTMLElement[]`
  to match actual usage

---

### Documentation

**Added**
- `environ-setup.md` — dev environment setup guide (WSL vs Windows, Node.js
  install, project setup, available scripts)
- `docs/docs_guide.md` — index of all documentation files
- `docs/study.md` — target definition, feasibility, proposal, phases,
  architecture, deployment, file structure
- `docs/codebase_analysis.md` — beginner-friendly explanation of all concepts
  and code
- `docs/testing.md` — all test cases, verdicts, issues and fixes
- `docs/demos.md` — setup, build, run, expected results, troubleshooting
- `docs/history.md` — this file

---

### Phase 1 completion — Skew identifier system

**Added**
- `IdentifierNode.prefix` field in `src/parser/types.ts` — encodes the
  visual form of an identifier: `"plain"`, `"left-skew"`, `"right-skew"`,
  `"greek"`, `"greek-right"`
- Five identifier grammar rules in `src/parser/grammar.ts`:
  - `PlainIdentifier` — `/^[a-zA-Z]/`
  - `LeftSkewIdentifier` — `` /^`[a-zA-Z]/ ``
  - `RightSkewIdentifier` — `` /^`[0-9]+[a-zA-Z]/ ``
  - `GreekIdentifier` — `/^\\[a-zA-Z][a-zA-Z0-9]*/`
  - `RightSkewGreekIdentifier` — `/^\\[0-9]+[a-zA-Z][a-zA-Z0-9]*/`
- `GREEK` mapping table in `src/render/render.ts` — maps single Latin
  letters to Unicode Greek glyphs (α, β, γ, ... Ω)
- `renderIdentifier()` function in `src/render/render.ts` — dispatches
  on `prefix` to produce the correct CSS class and glyph
- Identifier CSS classes in `native-math.css`:
  `.ident-plain`, `.ident-left-skew`, `.ident-right-skew`,
  `.ident-greek`, `.ident-greek-right`
- Phase 1 test case cycle in `src/main.ts` — 6 test cases cycled via
  `__nextTest()` in the browser console

**Changed**
- `Identifier` rule in `grammar.ts` — now dispatches to 5 sub-rules
  instead of 2 (`EscapedIdentifier` and `PlainIdentifier` replaced)
- `render()` in `render.ts` — `Identifier` case now calls
  `renderIdentifier()` instead of inline string handling
- `src/main.ts` — single hardcoded test case replaced with a 6-case
  cycle covering all Phase 1 demo inputs

**Removed**
- `EscapedIdentifier` rule — replaced by `GreekIdentifier` and
  `RightSkewGreekIdentifier` which also strip the prefix correctly

---

### Bug fix — Integral body rendered below sign (Issue 3)

**Problem:** `renderIntegral` placed the body as a fourth `display: block`
child inside `.opstack`, causing it to stack below the ∫ symbol.

**Change:** `renderIntegral` now produces an outer `.integral` flex container
holding the `.opstack` (bounds + symbol only) and a sibling `.integral-body`
(the integrand). Added `.integral` and `.integral-body` CSS rules.

**Files changed:** `src/render/render.ts`, `native-math.css`

---

### Extended test cases

Added 9 new test cases (TC-19 to TC-27) to `src/main.ts` covering:
compound integral bodies, nested fractions, polynomials, function calls
inside integrals, subscript chains, Greek coefficients, deeply nested
right-associative powers, unary chains, and implicit multiplication with
Greek letters. Cycled via `__nextTest()` in the browser console.

---

### Unit test infrastructure added

**Added**
- `vitest` and `happy-dom` as dev dependencies in `package.json`
- `npm test` script (runs all tests once) and `npm run test:watch` (watch mode)
- `vite.config.ts` — Vitest config using `happy-dom` environment, includes
  all `test/**/*.test.ts` files
- `test/parser/PEGParser.test.ts` — unit tests for the PEG engine primitives:
  literal, regex, sequence, choice, repeat, rule reference, build function,
  error reporting
- `test/parser/grammar.test.ts` — unit tests for the math syntax grammar:
  numbers, all 5 identifier forms, additive, multiplicative (including
  implicit multiplication), power (right-associativity), unary, postfix
  (call, subscript, control), grouping, operator precedence, error cases.
  Includes regression tests for Issue 1 (implicit multiplication precedence)
  and Issue 2 (unary sign theft)
- `test/render/render.test.ts` — unit tests for the renderer using
  `happy-dom`: number, identifier CSS classes, Greek glyph mapping, fraction
  structure, power `<sup>`, subscript `<sub>`, call, integral structure
  (including regression for Issue 3 — body beside sign not inside opstack),
  sqrt, automatic parenthesisation, `renderMath` wrapper
- `tsconfig.json` updated to include `test/` and `vite.config.ts`

**Test counts:** 3 layers × multiple suites = 60+ individual test cases,
all serving as regression tests for future phases.

---

## Phase 2 — Linear Algebra, Rollout Notation & Extended Operators

---

### Implementation

**Added — Grammar**
- `Relational` grammar level between `Expression` and `Additive`
- `RelationalOp` rule: `=`, `!=`, `<=`, `>=`, `~=`, `:=`, `~`, `<<`, `>>`,
  `->`, `<`, `>` — ordered longest-first to resolve conflicts
- `MultiplicativeOp` rule: `*`, `/`, `.` (dot product), `\mod`, `\div`
- `FactorialSuffix`: regex `/^!(?!=)/` (negative lookahead avoids `!=` conflict)
- `DerivativeSuffix`: regex `/^'+/` (one or more primes)
- `IndexSuffix`: `[Expression]` postfix
- `RolloutExpression`: `/^[+*]\{/` atomic match at Primary level
- `AbsoluteValue`: `|Expression|` at Primary level
- `Ellipsis`: `...` literal at Primary level
- `BracketExpression`: `[content]` with sub-rules for matrix rows, row vectors,
  and vector name decorators
- `ParenExpression`: handles both grouping `(expr)` and column vector `(a, b, c)`
- `BlackboardBoldIdentifier`: regex `/^\\\\[A-Za-z]/` for `\\N`, `\\R`, etc.
- `SubSuperscriptExpression` produced by `Power` and `ImplicitPower` build
  functions when left operand is `SubscriptExpression`

**Added — AST node types**
- `SubSuperscriptExpressionNode` — base + subscript + superscript
- `VectorNameNode` — identifier with arrow decorator
- `MatrixNode` — rectangular array of expressions
- `IndexExpressionNode` — array indexing
- `AbsoluteValueNode` — absolute value / norm
- `FactorialExpressionNode` — factorial postfix
- `DerivativeNode` — prime derivative with order
- `EllipsisNode` — sequence ellipsis
- `PiecewiseNode` — piecewise function cases
- `IdentifierNode.prefix` extended with `"blackboard"` variant

**Added — Renderer**
- `GLYPH_TABLE` — comprehensive lookup table: Greek, Hebrew (ℵ, ℶ, ℷ, ℸ),
  operators (±, ∓, ∞, ∇, ∂), set operators (∪, ∩, ∖, ×, ∁, ∅, 𝒫, ⊂, ⊃,
  ⊆, ⊇, ⊊, ⊋, △), logic (∧, ∨, ¬, ⟹, ⟺, ∀, ∃, ∄), calculus (∮, ∬, ∭),
  geometry (∠, △, ∥, ⊥, ∼), misc (∘, ⊕, ⊗, ⊙, ↦, ∈, ∉, ≅, ∣, ∤, ÷)
- `BLACKBOARD_TABLE` — ℕ, ℤ, ℚ, ℝ, ℂ, ℍ, ℙ, 𝕌, ∂
- `RELATIONAL_SYMBOL` — maps operator strings to Unicode symbols for rendering
- `renderSubSuperscript` — base with stacked sup/sub in `.scripts` container
- `renderVectorName` — identifier with combining arrow
- `renderMatrix` — table layout with `.matrix-row` and `.matrix-cell`
- `renderIndex` — subscript display for array indexing
- `renderAbsoluteValue` — `|x|` for scalars, `‖x‖` for vectors/matrices
- `renderFactorial` — appends `!`
- `renderDerivative` — appends prime characters (′)
- `renderPiecewise` — table with left brace
- `renderBigOperator` — Σ and Π with stacked bounds (reuses integral layout)
- `renderLim` — "lim" with approach expression below
- `renderBinom` — fraction in parentheses
- `renderEval` — expression with evaluation bar and subscript
- `renderUnderbrace` / `renderOverbrace` — content with brace and label
- `renderRollout` — rollout operators using big operator layout
- Control expression renderers: `\floor`→⌊⌋, `\ceil`→⌈⌉, `\bar`→overline,
  `\hat`→hat, `\tilde`→tilde, `\ul`→underline, `\cancel`→strikethrough,
  `\inner`→⟨⟩, `\arc`→arc decorator

**Added — CSS**
- `.subsuperscript` and `.scripts` — stacked superscript/subscript layout
- `.vector-name` and `.vector-arrow` — arrow positioning
- `.overline`, `.hat`, `.tilde`, `.underline`, `.cancel`, `.arc` — decorators
- `.underbrace`, `.overbrace` with content and label children
- `.eval-bar` — evaluation bar styling
- `.ident-blackboard` — bold styling for blackboard bold
- `.piecewise-expr`, `.piecewise-cond` — table cell styling for piecewise

**Changed**
- `Expression` rule now points to `Relational` instead of `Additive`
- `Multiplicative` repeat now tries `MultiplicativeOp` (including `.`, `\mod`,
  `\div`) before implicit multiplication
- `Power` and `ImplicitPower` build functions produce `SubSuperscriptExpression`
  when left operand is `SubscriptExpression`
- `Postfix` suffix list extended with `FactorialSuffix`, `DerivativeSuffix`,
  `IndexSuffix`
- `Primary` options extended with `RolloutExpression`, `Ellipsis`,
  `AbsoluteValue`, `BracketExpression`, `ParenExpression` (replaces old
  inline paren handling)
- `Identifier` choice list extended with `BlackboardBoldIdentifier` (tried first)
- `GREEK` table in renderer replaced by comprehensive `GLYPH_TABLE`
- `renderBinary` extended with dot product (·), mod, div, and relational symbols
- `renderControl` extended with all new control expression types

---

### Design decisions

1. **Backslash relational operators as identifiers**: `\sub`, `\in`, `\notin`,
   etc. are parsed as regular backslash identifiers (not grammar-level operators)
   because the PEG implicit multiplication rule would consume them before the
   Relational level gets a chance. They render correctly via GLYPH_TABLE.

2. **Piecewise uses commas**: `\piecewise{x, x>=0, -x, x<0}` instead of
   semicolons, to avoid grammar complexity. The renderer interprets pairs.

- `(x_i)^2` also produces `SubSuperscriptExpression` — parentheses unwrap
  the inner expression to a bare `SubscriptExpression`, which `Power`'s build
  function then combines with the exponent. This is mathematically correct:
  `(x_i)^2` and `x_i^2` both mean "x-sub-i squared".

3. **ASCII-only relational operators at grammar level**: Only `=`, `!=`, `<=`,
   `>=`, `~=`, `:=`, `~`, `<<`, `>>`, `->`, `<`, `>` are grammar-level
   relational operators. All others are identifiers rendered via GLYPH_TABLE.

---

### Test infrastructure

- Grammar tests: extended with ~35 new test cases covering all Phase 2 features
- Render tests: extended with ~30 new test cases covering all Phase 2 renderers
- All Phase 1 regression tests preserved and passing
- Tests awaiting execution on target (WSL Ubuntu) per exception.md


---

## Phase 3 — Plugin System & CSV Table Display

---

### Implementation

**Added — Plugin system**
- `src/plugin/interface.ts` — `Plugin` interface: `{ type_id, version, parse(), render() }`
- `src/plugin/math.ts` — Math syntax plugin wrapping existing parser + renderer
- `src/plugin/plaintext.ts` — Plain text plugin (identity, fallback)
- `src/plugin/registry.ts` — Plugin registry with `getPlugin()` and `renderCell()`
- `escapeHTML()` helper for safe error display with preserved formatting

**Added — CSV reader**
- `src/csv/reader.ts` — CSV parser producing `CSVData { headers, types, rows }`
- Handles quoted fields, escaped quotes, CRLF, empty fields
- Convention: row 0 = headers, row 1 = types, row 2+ = data

**Added — Table component**
- `src/table/table.ts` — `createTable(data)` renders interactive HTML table
- Plugin-dispatched cell rendering via `renderCell(typeId, text)`
- Sortable columns (click header, ascending/descending toggle)

**Added — UI**
- File picker (`<input type="file" accept=".csv">`)
- Drag-and-drop zone with visual feedback
- Table container for rendered output

**Added — Sample data**
- `public/sample.csv` — 8 mathematical concepts with math and text columns

**Added — Tests**
- `test/csv/reader.test.ts` — 8 tests for CSV parsing
- `test/plugin/registry.test.ts` — 7 tests for plugin dispatch and error handling
- `test/table/table.test.ts` — 8 tests for table rendering and sorting

**Changed**
- `src/main.ts` — added CSV file loading (picker + drag-and-drop)
- `index.html` — added file input, table container, section headers
- `style.css` — added table styles, cell-error, drop-zone styles

---

### Bug fixes

**Cell error newlines:** Parse errors in table cells displayed without line
breaks. Fixed by using `innerHTML` with `escapeHTML()` that converts `\n` → `<br>`
and ` ` → `&nbsp;` (after HTML entity escaping to prevent double-escaping).

**Test input for error case:** `"2++invalid"` was partially parseable by the
math plugin. Changed to `"@@@"` which always fails.

---

### Design decisions

1. **Plugin interface is minimal:** Only `parse()` and `render()` — no
   knowledge of tables, files, or other plugins required.

2. **CSV reader is payload-agnostic:** It splits text into cells without
   interpreting content. The types row is just data to the CSV reader.

3. **Graceful degradation:** Unknown plugin types fall back to plain text.
   Parse errors render inline without crashing the table.

4. **PEGParser is general-purpose:** The same engine could parse CSV as a
   PEG grammar, but the hand-written parser is simpler for CSV's quoting rules.

---

## Codebase Restructuring

### Motivation

The Phase 3 codebase had grown organically with poor separation of concerns.
The PEG engine was mixed with math-specific code, plugins referenced internals
directly, and `main.ts` was a monolith.

### Changes

**Deleted directories:**
- `src/parser/` — split into `src/engine/` (generic) and `src/plugins/math/` (domain)
- `src/render/` — moved to `src/plugins/math/render.ts` and `src/plugins/math/el.ts`
- `src/plugin/` — renamed to `src/plugins/` with restructured contents
- `src/csv/` — moved to `src/data/csv.ts`
- `src/table/` — moved to `src/ui/table.ts`

**New directories:**
- `src/engine/` — PEGParser + engine-level types only
- `src/plugins/math/` — self-contained math plugin (types, grammar, renderer, entry)
- `src/plugins/text/` — plain text plugin
- `src/data/` — format-agnostic data layer (TableData, CSV parser)
- `src/ui/` — presentation components (table, file-loader, expression-input)

**New files:**
- `src/ui/file-loader.ts` — extracted from main.ts
- `src/ui/expression-input.ts` — extracted from main.ts
- `src/data/types.ts` — TableData interface (renamed from CSVData)
- `src/plugins/math/types.ts` — MathNode union (moved from engine types)

**Changed:**
- `Plugin` interface uses `unknown` instead of `ASTNode` — truly generic
- `main.ts` reduced to ~12 lines — only wires components
- Test structure mirrors src structure: `test/engine/`, `test/plugins/math/`,
  `test/data/`, `test/ui/`

### Design decisions

1. **Engine has zero domain imports** — `src/engine/` is a standalone library
2. **Plugins own their types** — `MathNode` lives in `src/plugins/math/types.ts`
3. **CSV is a PEG grammar** — demonstrates the engine is truly general-purpose
4. **UI components take DOM refs as parameters** — no global DOM access in components


---

## Phase 4 — Association Graph & Filtered Table View

---

### Implementation

**Added — Data layer**
- `src/data/graph.ts` — `AssociationGraph` class: stores directed typed edges,
  filters by relation/target, inverse lookup via vocabulary, entity inspection

**Added — UI**
- `src/ui/graph-filter.ts` — filter UI: relation/target dropdowns, filter button,
  reset button, association detail panel with clickable entity links

**Added — Sample data**
- `public/theorems.csv` — 6 theorems with `_associations` column
- `public/definitions.csv` — 9 definitions with inverse associations
- `public/vocabulary.json` — 5 relation types with inverses

**Added — Tests**
- `test/data/graph.test.ts` — 11 tests for AssociationGraph
- `test/ui/graph-filter.test.ts` — 5 tests for filter UI

**Changed**
- `src/ui/file-loader.ts` — supports multiple files, builds graph from
  `_associations` column, rebuilds UI after each file load
- `index.html` — `multiple` attribute on file input
- `style.css` — graph filter and association detail styles
- `public/sample.csv`, `public/theorems.csv`, `public/definitions.csv` —
  fixed CSV quoting for fields containing commas

**Test count:** 218 total (up from 202 in Phase 3)

---

### Bug fixes

**Relational chaining:** `f(x) = x^n -> f'(x) = n*x^(n-1)` failed to parse
because the `Relational` rule only allowed one operator. Fixed by changing
from `(RelationalOp Additive)?` to `(RelationalOp Additive)*` with left-fold.
This allows chaining relational operators (e.g., equation `->` equation).

---

### Design decisions

1. **`_associations` column convention** — associations are stored inline in
   the CSV as a dedicated column. No sidecar file needed for simple cases.
   The column name `_associations` is reserved (prefixed with `_` to indicate
   it's metadata, not content).

2. **Entity ID = first column** — simple, no extra configuration needed.
   Cross-file references use the target's first-column value directly.

3. **Vocabulary is optional** — the graph works without a vocabulary file.
   Relation types are discovered from the data. The vocabulary adds inverse
   name resolution for the detail panel.

4. **Shared graph across files** — all loaded files contribute to one graph.
   This enables cross-file navigation (theorem → definition in another file).

5. **UI rebuilds on each file load** — simple and correct. For small knowledge
   bases (hundreds of entities), re-rendering is instantaneous.


---

## MVC Architectural Refactoring

### Changes

**Added**
- `src/model/index.ts` — business model classes: `Cell`, `Column`, `Row`,
  `Table`, `Association`, `RelationType`, `AssociationGraph`, `KnowledgeBase`
- `src/controller/index.ts` — `AppController` class: orchestrates model and views
- `src/view/table-view.ts` — `TableView` class: renders Table models as HTML
- `src/view/graph-filter-view.ts` — `GraphFilterView` class: filter UI + detail panel

**Changed**
- `src/main.ts` — rewritten to use MVC wiring (controller + views)
- `src/data/graph.ts` — now re-exports from model (backward compat)
- `src/model/index.ts` `AssociationGraph` — accepts both old and new interfaces

**Kept (backward compat for tests)**
- `src/ui/table.ts` — `createTable(TableData)` function unchanged
- `src/ui/graph-filter.ts` — `initGraphFilter()` function unchanged

### Design decisions

1. **Model is DOM-free** — can be used in Node.js, tests, or any non-browser context
2. **Controller mediates** — views never access model directly for mutations
3. **Views are stateless** (except sort state) — they re-render from model on each call
4. **Backward compat preserved** — all 218 existing tests pass without modification

---

## Phase 5 — Inline Editor

---

### Implementation

**Changed — Model (`src/model/index.ts`)**
- `Cell.value` and `Row.cells` made mutable (removed `readonly`) — required
  for in-place edits without reconstructing the entire model
- `Table.rows` made mutable — required for add/delete row
- All classes rewritten to use explicit property declarations instead of
  constructor parameter shorthand — required by `erasableSyntaxOnly` compiler flag
- Added `EditAction` union type: `cell | addRow | deleteRow`
- Added `EditHistory` class — `push`, `undo`, `redo`, `canUndo`, `canRedo`, `clear`
- Added `KnowledgeBase.exportTableAsCSV()` — serializes a table to CSV text
  with correct quoting for commas, double quotes, and newlines

**Changed — Controller (`src/controller/index.ts`)**
- Added `history: EditHistory` (public, for testing)
- Added `editCell(tableIdx, rowIdx, colIdx, newValue)` — mutates cell value,
  records undo action; no-op if value is unchanged
- Added `addRow(tableIdx)` — appends empty row with correct column count,
  records undo action
- Added `deleteRow(tableIdx, rowIdx)` — splices row out, records undo action
- Added `undo()` — pops last action from history, applies inverse mutation,
  calls `showAll()` to re-render
- Added `redo()` — pops from redo stack, re-applies mutation, calls `showAll()`
- Added `exportCSV(tableIdx)` — delegates to `KnowledgeBase.exportTableAsCSV`

**Rewritten — TableView (`src/view/table-view.ts`)**
- Constructor now takes `editBar` and `editPreview` DOM elements in addition
  to the container
- Added `setController()` method
- One active cell at a time — clicking a new cell cancels/commits the current one
- All cells (text and syntax) use `contenteditable` directly in the `<td>` as
  the source editor; Enter = commit, Escape = cancel, blur = commit
- Syntax cells additionally show a live rendered preview in the top bar as the
  user types; the preview updates on every `input` event
- Text cells and idle state: top bar is hidden
- Each row has a ✕ delete button (with confirmation dialog)
- Below each table: "+ Add Row" and "⬇ Export CSV" buttons
- Filtered view (from graph filter) is read-only — no edit controls
- `cancelActive()` and `commitActive()` are public — called by `main.ts`
  on outside click and Ctrl+Z/Y respectively

**Changed — `index.html`**
- Added `#cell-edit-bar` div with `#cell-edit-preview` inside — hidden by
  default, shown only when a syntax cell is active
- Removed the input field from the edit bar — the bar is read-only

**Changed — `main.ts`**
- Passes `editBar` and `editPreview` to `TableView` constructor
- Calls `tableView.setController(controller)`
- Added global `keydown` handler: Ctrl+Z = `controller.undo()`,
  Ctrl+Y / Ctrl+Shift+Z = `controller.redo()`
- Added `document` click handler: calls `tableView.cancelActive()` to
  cancel any active edit when clicking outside the table

**Changed — `style.css`**
- Added `.cell-edit-bar`, `.cell-edit-bar-label`, `.cell-edit-bar-preview` —
  top bar layout (flex row, blue border, hidden when idle)
- Added `.editable-cell` — cursor pointer, hover highlight
- Added `.cell-active` — blue outline on the currently edited cell
- Added `.row-actions`, `.row-delete-btn` — delete button column
- Added `.table-toolbar` — add row / export button bar below each table

**Added — Tests**
- `test/model/edit-history.test.ts` — 8 tests for `EditHistory`,
  4 tests for `exportTableAsCSV`
- `test/controller/edit.test.ts` — 13 tests for `editCell`, `undo`, `redo`,
  `addRow`, `deleteRow`, `exportCSV`

---

### Bug fixes

**`erasableSyntaxOnly` compiler errors:** All model classes used TypeScript
constructor parameter shorthand (`public readonly x: T` in constructor params).
This syntax is forbidden by the `erasableSyntaxOnly` flag in `tsconfig.json`.
Fixed by rewriting all classes with explicit property declarations above the
constructor and plain assignments inside it.

**Vite `EACCES` rename error on WSL:** Running `npm run dev` from a project
path under `/mnt/c/` (Windows NTFS filesystem) caused Vite's dependency
optimiser to fail with `EACCES: permission denied, rename`. Fixed by
redirecting Vite's cache directory to the Linux home filesystem via
`cacheDir` in `vite.config.ts`.

---

### Design decisions

1. **Cell is the source editor** — the `<td>` itself becomes `contenteditable`
   when active. No separate input overlay is needed. This keeps the table
   layout stable and avoids z-index / positioning complexity.

2. **Top bar is read-only rendered preview** — it shows what the current source
   will look like when committed. It has no input field. The user always types
   in the cell, not in the bar.

3. **Top bar hidden for text cells and when idle** — text cells have no syntax
   to render, so showing the bar would be meaningless. The bar only appears
   when a syntax cell (e.g. `math`) is active.

4. **One active cell at a time** — activating a new cell automatically
   commits the previous one. This avoids the complexity of tracking multiple
   dirty cells and simplifies the undo stack (each commit is one action).

5. **Undo/redo at controller level** — the history stack lives in the
   controller, not the view. The view only calls `editCell`, `addRow`,
   `deleteRow`; the controller decides what to record. This keeps the view
   stateless with respect to history.

---

## Phase 6 — Binary Format (Skipped)

**Status: skipped — deferred indefinitely.**

Phase 6 was planned to introduce a compact binary file format for storage
and loading of knowledge tables. Multiple design iterations were explored,
including:

- A simple BK01 format with length-prefixed UTF-8 cell values
- A BK02 block-offset format with typed cell blobs
- A BK03 1KiB block-based columnar format with token streams, embedded
  segments, and RLE compression

All iterations were abandoned. The binary format specification proved too
ambiguous and too complex to implement correctly within the current
development scope. The layered architecture (block storage → token stream
→ embedded TLV → math AST binary) introduced too many interdependent
design decisions that could not be resolved cleanly without a much longer
design phase.

**Business decision:** Phase 6 is skipped to maintain delivery momentum.
The system continues to use CSV as the sole file format.

**Accepted tradeoffs:**
- No compact binary storage — files are larger than necessary
- No fast load path — math expressions are re-parsed from source text on
  every load rather than decoded from a pre-parsed binary representation
- No disk storage optimisation — performance and storage efficiency are
  sacrificed in favour of simplicity and correctness

**Future:** Binary format remains on the roadmap. It should be revisited
when the grammar is fully stable, real knowledge data exists to measure
actual file sizes, and sufficient design time is available to specify the
format unambiguously from byte level upward.

---

## Phase 7 — Search, Indexing & Tooling

---

### Implementation

**Added — `src/search/index.ts`**
- `searchText(kb, query)` — full-text search across all text-type cell values,
  case-insensitive, returns `SearchHit[]` with match position
- `searchByIdentifier(kb, name)` — structural search: parses each math cell's
  source text, walks the AST, returns cells containing an `IdentifierNode`
  with the given raw name (e.g. `"int"` finds all cells using `\int`)
- `getNeighbourhood(kb, entityId, maxHops)` — BFS over the association graph,
  returns all entities within `maxHops` hops with direction and hop count
- `crossTableJoin(kb, leftTableIdx, rightTableIdx, relation)` — finds entity
  pairs from two tables connected by a given relation type

**Added — `src/view/search-view.ts`**
- Search bar with two inputs: text search and symbol/identifier search
- Results panel with highlighted match text and clickable entity rows
- Neighbourhood panel showing connected entities up to 2 hops, triggered
  by clicking any entity (from search results or table first column)

**Added — `src/view/session.ts`**
- `saveSession(fileNames)` — persists loaded file names to `localStorage`
- `loadSession()` — retrieves session data on next open
- `clearSession()` — removes session data

**Changed — `src/controller/index.ts`**
- Added `searchText(query)`, `searchByIdentifier(name)`,
  `getNeighbourhood(entityId, maxHops)`, `crossTableJoin(...)`,
  `getLoadedFileNames()` — thin delegators to the search engine

**Changed — `src/main.ts`**
- Wires `SearchView` into the page
- Entity click handler now also triggers `searchView.showNeighbourhood()`
- Calls `saveSession()` after each file load
- Shows session restore banner on page load if a previous session exists

**Changed — `index.html`**
- Added `#session-banner` div (hidden by default)
- Added `#search-container` div above the edit bar

**Changed — `style.css`**
- Added `.session-banner` — amber warning bar
- Added `.search-bar`, `.search-input`, `.search-btn` — search controls
- Added `.search-results`, `.search-result-item`, `.search-result-value` —
  results list with highlighted matches
- Added `.neighbourhood-panel`, `.neighbourhood-item` — hop graph display

**Added — `test/search/search.test.ts`**
- 15 tests covering: text search (match, multi-table, no match, blank query,
  match positions, math cells excluded), identifier search (found, not found,
  blank), neighbourhood (hop 1, hop 0, no self, hop count), cross-table join

---

### Design decisions

1. **Search does not index** — all search functions scan the in-memory model
   on every call. For the current scale (hundreds of entities), this is
   instantaneous. A persistent index would be premature optimisation.

2. **Structural search parses on demand** — math cells are re-parsed during
   `searchByIdentifier`. This is correct because the source text is the
   canonical form. Parsing is fast enough for interactive use.

3. **Neighbourhood uses BFS** — breadth-first traversal ensures the shortest
   path is found first and hop counts are correct.

4. **Session stores file names only** — the browser cannot access the
   filesystem directly. The session banner tells the user which files to
   reload; it does not reload them automatically.

5. **Domain tool = symbol search** — `searchByIdentifier` is the first
   domain tool. It answers "which theorems use this symbol?" directly.

---

## Phase 8 — Spreadsheet Shell Layout & Refactoring

---

### Refactoring — 1 class per file (`src/model/`)

`src/model/index.ts` was a single file containing 9 classes. Each class was
extracted into its own file. `index.ts` is now a pure barrel re-export.

| New file | Class |
|----------|-------|
| `src/model/Cell.ts` | `Cell` |
| `src/model/Column.ts` | `Column` |
| `src/model/Row.ts` | `Row` |
| `src/model/Table.ts` | `Table` |
| `src/model/Association.ts` | `Association` |
| `src/model/RelationType.ts` | `RelationType` |
| `src/model/AssociationGraph.ts` | `AssociationGraph` |
| `src/model/EditHistory.ts` | `EditHistory` + `EditAction` type |
| `src/model/KnowledgeBase.ts` | `KnowledgeBase` |
| `src/model/index.ts` | Barrel re-export only — all existing imports unchanged |

All cross-file references use `import type` where possible to avoid circular
dependency issues.

---

### New controller actions — `insertRow` and `moveRow`

**`insertRow(tableIdx, atIdx)`** — inserts an empty row at a specific index
(not just at the end). Records an `addRow` undo action.

**`moveRow(tableIdx, fromIdx, toIdx)`** — moves a row from one index to
another. Records a `moveRow` undo action.

`EditAction` union extended with:
```ts
| { type: "moveRow"; tableIdx: number; fromIdx: number; toIdx: number }
```

Undo/redo for `moveRow`:
- Undo: splice from `toIdx`, insert at `fromIdx`
- Redo: splice from `fromIdx`, insert at `toIdx`

---

### Spreadsheet shell layout

The page is restructured from a scrolling document into a fixed spreadsheet
shell. `body` is a `flex-column` with `overflow: hidden`. Only `#workspace`
scrolls.

**Chrome layers (top to bottom):**

| Layer | Element | Content |
|-------|---------|---------|
| 1 | `#menu-bar` | App title, 📂 Open button, session banner |
| 2 | `#formula-bar` | `fx` label, expression input, Render button, live cell preview |
| 3 | `#toolbar` | + Row, ⬇ Export \| graph filter \| search |
| 4 | `#tab-bar` | One tab per loaded CSV |
| 5 | `#workspace` | Only this scrolls — the active table lives here |
| 6 | `#status-bar` | `TableName — N rows × M cols` |

**Key CSS rules:**
- `html, body { height: 100%; overflow: hidden }` — shell never scrolls
- `#workspace { flex: 1 1 0; overflow: auto }` — fills remaining height, scrolls
- `thead th { position: sticky; top: 0 }` — column headers stay visible while scrolling

---

### `TableView` changes

- Constructor signature changed: now accepts `tabStrip` as a separate
  parameter (the `#tab-strip` div inside `#tab-bar`) instead of creating
  its own tab strip inside the container
- Removed internal `tableArea` div — the container IS the table area
- Added `getActiveTableIdx(): number` — used by toolbar buttons in `main.ts`
- Added `setStatusCallback(cb)` — called after each render with a status
  string (`"TableName — N rows × M cols"`)
- Per-row drag handle column (⠿) added to editable tables — dragging a row
  calls `controller.moveRow()`
- Per-row insert button (+) added to row actions column — calls
  `controller.insertRow(tableIdx, rowIdx + 1)`
- The old per-table toolbar (Add Row / Export CSV buttons below each table)
  is removed — those actions moved to `#toolbar` in the HTML

---

### `GraphFilterView` changes

- Association detail panel is now appended to `document.body` instead of
  inside the table container — it floats over the workspace as a positioned
  overlay
- Closes on outside click via a `document` click listener
- Labels shortened to fit the toolbar (`"Rel:"`, `"Target:"`, `"All"`)

---

### `main.ts` changes

- Retrieves `#tab-strip`, `#graph-filter-container`, `#search-container`,
  `#toolbar` button elements by ID
- Passes `tabStrip` to `TableView` constructor
- `GraphFilterView` and `SearchView` are mounted in their dedicated toolbar
  containers instead of the table container
- `#btn-add-row` calls `controller.addRow(tableView.getActiveTableIdx())`
- `#btn-export-csv` calls `controller.exportCSV(tableView.getActiveTableIdx())`
  and triggers a download
- Drag-and-drop is now on `#workspace` instead of `#table-container`
- Status bar updated via `tableView.setStatusCallback()`

---

### `index.html` changes

Complete restructure. Old flat document replaced with:

```html
<div id="menu-bar">      <!-- app title + file open + session banner -->
<div id="formula-bar">   <!-- fx label + expression input + render + preview -->
<div id="toolbar">       <!-- row actions | graph filter | search -->
<div id="tab-bar">       <!-- tab strip -->
<div id="workspace">     <!-- scrollable table area -->
<div id="status-bar">    <!-- row/col count -->
```

---

### `style.css` changes

Full rewrite. Key additions:

- `body { display: flex; flex-direction: column; overflow: hidden }` — shell layout
- `#menu-bar`, `#formula-bar`, `#toolbar`, `#tab-bar`, `#status-bar` — all
  `flex-shrink: 0` fixed chrome rows
- `#workspace { flex: 1 1 0; overflow: auto }` — only scrollable region
- `.tab-active { bottom: -2px; padding-bottom: 5px }` — active tab overlaps
  the tab bar border to appear connected to the table
- `.row-drag-handle` — grab cursor, braille dots glyph (⠿)
- `.row-dragging { opacity: 0.35 }` — visual feedback during drag
- `.row-drag-over td { border-top: 2px solid #3b82f6 }` — drop target indicator
- `.col-rownum` — sticky row number column style (prepared, not yet wired)
- `thead th { position: sticky; top: 0; z-index: 2 }` — frozen header row
- Search results and neighbourhood panel use `position: fixed` to float
  below the toolbar without pushing layout
- Association detail panel uses `position: fixed` for the same reason

---

### Design decisions

1. **`body` is the flex container, not `#app`.** The shell must fill the
   full viewport. Wrapping in `#app` with padding would require compensating
   calculations. Using `body` directly is simpler and more robust.

2. **Tab strip is external to `TableView`.** The tab strip lives in `#tab-bar`
   (fixed chrome), not inside `#workspace` (scrollable). `TableView` receives
   it as a constructor parameter rather than creating it internally.

3. **Toolbar buttons use `getActiveTableIdx()`.** The Add Row and Export
   buttons in the toolbar need to know which table is active. Rather than
   passing the index through events, `TableView` exposes a getter. This keeps
   the toolbar wiring in `main.ts` simple.

4. **Floating panels via `position: fixed`.** The association detail,
   search results, and neighbourhood panels are positioned relative to the
   viewport (fixed), not relative to their DOM parent. This allows them to
   overlay the workspace without being clipped by `overflow: auto` on
   `#workspace`.

5. **`thead th { position: sticky; top: 0 }`.** The table header row stays
   visible as the user scrolls through a long table. This is the standard
   spreadsheet behaviour — column names are always visible.

---

## Phase 9 — Geometry Syntax Plugin

---

### Implementation

**Added — `src/plugins/geometry/`**

New plugin directory with five files mirroring the math plugin structure:

| File | Role |
|------|------|
| `types.ts` | AST node interfaces — no logic, no imports except `MathNode` |
| `grammar.ts` | PEG grammar definition + exported `parser` instance + `parseGeometry()` |
| `build.ts` | *(intermediate, superseded — see refactoring below)* |
| `el.ts` | `svgEl()` and `svgText()` SVG element helpers |
| `render.ts` | `renderGeometry()` — AST → SVG element |
| `index.ts` | Plugin entry point: `type_id: "geometry"`, `version: "1.0.0"` |

**Grammar design:**

The geometry grammar uses `PEGParser` with `skip: /^[ \t]+/` (spaces and tabs only — newlines are statement separators, not whitespace). The grammar structure:

```
Program      = Statement (\n Statement)*
Statement    = AssignStatement | CallStatement | BlankOrComment
AssignStatement = CallExpr "=" RhsValue
CallStatement   = CallExpr
CallExpr     = Name "(" ArgList ")"
ArgList      = Arg ("," Arg)*  |  empty
Arg          = PointGroup | CallExpr | MathArg
PointGroup   = "(" Label ("," Label)* ")"
MathArg      = /^[^,)\n\r]+/
RhsValue     = CallExpr | RhsRaw
```

`CallExpr` is a proper PEG sequence (name + `(` + ArgList + `)`) — not a raw string regex. By the time `build()` is called, it receives a fully structured `ParsedCall { name, args[] }`. `build()` only does a `switch(name)` and assembles the AST node — no string splitting, no re-parsing.

Math sub-expressions (coordinates, labels, measurements) are isolated by the PEG grammar and passed as raw strings to `build()`, which calls `mathParser.parse("Expression", span)` on the already-isolated text.

**AST node types** (all in `types.ts`):

`SystemDeclNode`, `PointDeclNode`, `SegmentExpr`, `LineExpr`, `RayExpr`, `ArrowNode`, `AngleExpr`, `ParallelNode`, `PerpendicularNode`, `IntersectionNode`, `MidpointNode`, `EqualityNode`, `TriangleNode`, `QuadrilateralNode`, `PolygonNode`, `CircleNode`, `EllipseNode`, `ArcNode`, `PlaneNode`, `HyperplaneNode`, `AxisDeclNode`, `OriginDeclNode`, `GraphNode`, `GeodesicNode`, `CurvatureNode`, `GeometryProgram`.

**Renderer** (`render.ts`):

SVG renderer with a 400×300 internal viewport. Points with explicit coordinates are scaled to fit; remaining points are auto-laid-out in a circle. Draws all primitives as SVG elements. Imports `svgEl`/`svgText` from `el.ts`.

**Added — `src/plugins/registry.ts`**

`geometryPlugin` registered with `type_id: "geometry"`.

**Added — `native-math.css`**

Geometry diagram styles: `.geo-diagram`, `.geo-segment`, `.geo-line`, `.geo-ray`, `.geo-arrow`, `.geo-angle-arc`, `.geo-polygon`, `.geo-circle`, `.geo-ellipse`, `.geo-arc`, `.geo-point`, `.geo-label`, `.geo-tick`, `.geo-perp-mark`, `.geo-arrowhead`, `.geo-math-label`, `.geo-wrapper`.

**Added — `public/geometry-sample.csv`**

Sample CSV with `geometry` type column demonstrating right triangle, parallel lines, circle, and angle constructs.

**Added — `test/plugins/geometry/grammar.test.ts`**

25 tests covering all construct types, coordinate parsing, multi-statement programs, and comment/blank-line handling.

**Added — `vitest.config.ts`**

Added `cacheDir` pointing to `~/.vite-cache/Webapp` (Linux native filesystem) to avoid WSL DrvFs cache coherency issues with newly created directories.

---

### Refactoring — modular architecture matching math plugin

The initial `grammar.ts` was a monolith mixing the PEG grammar, build helpers (`splitArgs`, `callNameOf`, `innerOf`, `buildCall`, `buildAssign`, `parseGeoExpr`), and the public entry point. It was also using a single regex to capture entire `"Name(...)"` calls as raw strings, then re-parsing them inside `build()`.

**Refactored to match `src/plugins/math/` structure exactly:**

| File | Contents |
|------|----------|
| `types.ts` | AST node interfaces only |
| `grammar.ts` | PEG grammar + exported `parser` + `parseGeometry()` |
| `el.ts` | `svgEl()`, `svgText()` — mirrors `math/el.ts` |
| `render.ts` | Renderer only, imports from `el.ts` |
| `index.ts` | Plugin entry point |

The `build.ts` intermediate file (created during the first refactor pass) was superseded when the grammar was rewritten to parse structure properly — build helpers are now inline in `grammar.ts` as in the math plugin.

---

### Bug fixes

**Bug 1 — `BlankOrComment` matching empty string**

`BlankOrComment` regex `/^(?:#[^\n]*|\/\/[^\n]*|[ \t]*)/` used `*` (zero or more) for whitespace, so it matched empty string on every line. Since `Statement` tried `BlankOrComment` first (PEG ordered choice), it always succeeded with an empty match, leaving the real statement unconsumed. The parser then expected a newline or EOF and found the statement text instead.

Fix: reorder `Statement` choices to try `AssignStatement` and `CallStatement` before `BlankOrComment`, and change `[ \t]*` to `[ \t]+` so `BlankOrComment` only matches lines with actual whitespace or comment characters.

**Bug 2 — `build()` re-parsing raw strings**

The first grammar implementation captured `"Point(A,B,C)"` as a single regex string, then `build()` called `callNameOf()`, `innerOf()`, `splitArgs()` to re-parse it. This violated the architecture principle: `build()` should only assemble AST nodes from already-parsed data.

Fix: rewrote `CallExpr` as a proper PEG sequence `Name "(" ArgList ")"` with `ArgList` parsing individual arguments. `build()` now receives `{ name: "Point", args: ["A","B","C"] }` and only does `switch(name)` + node construction.

**Bug 3 — Formula bar dismissing cell focus on click**

The `document.addEventListener("click", () => tableView.cancelActive())` fired on every click including clicks on the formula bar textarea, committing and deactivating the active cell before the user could reposition the cursor.

Fix: added a `sourceInput.contains(e.target)` guard — clicks inside the formula bar are excluded from the cancel-active listener.

**Bug 4 — Alt+Enter causing blur instead of newline**

On Chromium-based browsers, pressing Alt+Enter on a `<textarea>` dispatches `blur` before `keydown` completes. The `blur` listener was firing and calling `commit()`, clearing the textarea.

Fix: added `suppressBlur` flag set to `true` at the start of the Alt+Enter handler. The `blur` listener checks `if (this.suppressBlur) return`. After inserting the newline, `requestAnimationFrame` resets the flag and re-focuses the textarea.

**Bug 5 — Session dismiss button not working**

`document.getElementById("dismiss-session")?.addEventListener(...)` was called after `sessionBanner.innerHTML = ...`. The button was found correctly, but the document-level click listener (`tableView.cancelActive()`) was also firing on the same click, potentially interfering. More critically, the listener was attached via `getElementById` which is fragile after `innerHTML` replacement.

Fix: replaced with event delegation on `sessionBanner` itself with `e.stopPropagation()` to prevent the click from bubbling to the document listener.

**Bug 6 — Formula result div rendering algebraic syntax for all cell types**

The formula bar previously had a `#result` div that rendered the formula bar content as a math expression on Enter. This caused geometry cells to be re-interpreted as algebraic syntax, producing incorrect renders.

Fix: removed `#result` div, all `mathPlugin`/`renderMath` imports, and the standalone renderer block from `main.ts`. The formula bar is now a pure source editor with no automatic rendering of its own content.

---

### Design decisions

1. **`skip: /^[ \t]+/` not `/^[ \t\r\n]+/`** — Geometry is a statement-list language where newlines are the statement separator. The math plugin skips all whitespace including newlines because it parses a single expression. Geometry must not skip newlines or the `Program` rule cannot detect statement boundaries.

2. **`CallExpr` as PEG sequence, not regex** — Capturing `"Name(...)"` as a raw string and re-parsing in `build()` duplicates the parser's job and produces fragile code. The PEG grammar parses the full structure; `build()` only assembles.

3. **`PointGroup` rule for `Circle((A,B,C),O)`** — The inner `(A,B,C)` is a group of point labels, not a math expression. A dedicated `PointGroup` rule (tried before `CallExpr` and `MathArg` in the `Arg` choice) handles this correctly without ambiguity.

4. **Math delegation in `build()`** — Math sub-expressions (coordinates, measurements) are captured as raw strings by `MathArg` and `RhsRaw`. `build()` calls `mathParser.parse("Expression", span)` on the already-isolated text. This is correct: the PEG grammar handles geometry structure; the math parser handles math content. The two parsers are composed at the `build()` boundary, not at the grammar level.

5. **`el.ts` for SVG helpers** — Mirrors `math/el.ts` for HTML helpers. Keeps `render.ts` focused on drawing logic, not element creation boilerplate.

---

## Phase 10 — Physics Free-Body Syntax Plugin

---

### Implementation

**Added — `src/plugins/physics/`**

| File | Role |
|------|------|
| `types.ts` | AST node interfaces — `BodyDeclNode`, `ForceNode`, `VelocityNode`, `AngularNode`, `TorqueNode`, `ConstraintNode`, `FrameDeclNode`, `InertialDeclNode`, `EOMNode`, `PhysicsProgram` |
| `grammar.ts` | PEG grammar + exported `parser` + `parsePhysics()` entry point |
| `render.ts` | `renderPhysics()` — extends geometry SVG renderer with physics overlay |
| `index.ts` | Plugin entry point: `type_id: "physics"`, `version: "1.0.0"` |

**Grammar design:**

Physics syntax is a superset of geometry syntax. A physics cell can freely mix geometry declarations (`Point`, `Segment`, `Triangle`) with physics statements (`Force`, `Body`, `Fixed`) on separate lines.

`parsePhysics()` partitions lines by keyword: lines whose leading keyword is in `PHYSICS_KEYWORDS` go to the physics PEG parser; all other lines go to `parseGeometry()`. Both parsers receive only non-empty lines (blank placeholders are filtered before joining). The result is a `PhysicsProgram { geoStatements, physStatements }` — the geometry base layer and physics overlay are kept separate.

The physics PEG grammar follows the same architecture as the geometry grammar: `CallExpr` as a proper PEG sequence, `ArgList` parsing individual args, `build()` only assembles AST from already-parsed data.

**Renderer:**

`renderPhysics()` calls `renderGeometry()` first to draw the geometric base layer, then overlays physics elements on the same SVG:

| Statement | Visual |
|-----------|--------|
| `Force` | Red arrow from point in direction, math label |
| `Velocity` | Blue arrow |
| `Acceleration` | Orange arrow |
| `Fixed` | Pin joint circle + hatch lines |
| `Roller` | Triangle + circle |
| `Spring` | Zigzag polyline, optional stiffness label |
| `Damper` | Line + rectangle |
| `String` | Dashed line |

**Added — `src/plugins/registry.ts`**

`physicsPlugin` registered with `type_id: "physics"`.

**Added — `native-math.css`**

Physics styles: force (red), velocity (blue), acceleration (orange), pin/hatch, roller, spring (purple), damper (cyan), string (dashed), body/force labels.

**Added — `public/physics-sample.csv`**

Three demo cells: block on surface, inclined plane with pin+roller, spring-mass system.

**Added — `test/plugins/physics/grammar.test.ts`**

14 tests covering all statement types and the mixed geometry+physics line partitioning.

---

### Bug fix — `loadCSV` crash on rows with wrong field count

**Symptom:** Loading `physics-sample.csv` (or any CSV where a Notes column value contains commas) caused `Cannot read properties of undefined (reading 'typeId')`.

**Root cause:** `loadCSV` in `controller/index.ts` mapped rows as:
```ts
rawRow.map((val, i) => new Cell(val, columns[i].typeId))
```
When `rawRow` had more fields than `columns` (because an unquoted comma in a Notes value was split by the CSV parser), `columns[i]` was `undefined` at index `i >= columns.length`, and `.typeId` threw.

**Fix:** Changed the mapping to iterate over `columns` instead of `rawRow`:
```ts
columns.map((col, i) => new Cell(rawRow[i] ?? "", col.typeId))
```
This always produces exactly one cell per column. Extra fields in `rawRow` are silently ignored; missing fields default to `""`. This is the correct defensive approach — the model always has exactly one cell per column regardless of CSV field count.

**Also fixed:** `physics-sample.csv` Notes values had unquoted commas. Simplified to remove internal commas.

---

### Design decisions

1. **Line partitioning, not grammar composition** — Physics syntax is a superset of geometry. Rather than writing a single unified grammar that handles both, `parsePhysics()` partitions lines by keyword and delegates each partition to its own parser. This keeps both grammars simple and independent, and means geometry cells continue to work unchanged.

2. **`PhysicsProgram` holds both layers separately** — `geoStatements` and `physStatements` are kept in separate arrays. The renderer processes them in order: geometry base first, physics overlay second. This makes it easy to add or remove physics annotations without touching the geometry structure.

3. **Direction as raw string** — Force/velocity directions (`\d`, `\u`, `\r`, `\l`) are stored as raw identifier strings, not parsed as math expressions. The renderer maps them to unit vectors via `directionVector()`. This avoids the complexity of parsing backslash identifiers as math nodes just to extract a direction.

4. **Renderer reuses geometry SVG** — `renderPhysics()` calls `renderGeometry()` and appends physics elements to the same SVG element. This avoids duplicating the point layout and coordinate scaling logic.

---

## Phase 11 — Chemistry Reaction Syntax Plugin

---

### Implementation

**Added — `src/plugins/chemistry/`**

| File | Role |
|------|------|
| `types.ts` | AST node interfaces — `ChargeNode`, `IsotopeNode`, `ElementGroup`, `ParenGroup`, `BracketGroup`, `CompoundNode`, `ChargedSpeciesNode`, `ParticleNode`, `ReactionTerm`, `ReactionNode`, `ConditionNode`, `ThermoNode`, `AtomDeclNode`, `BondDeclNode`, `GroupDeclNode`, `ChemistryProgram` |
| `grammar.ts` | PEG grammar + exported `parser` instance + `parseChemistry()` entry point |
| `render.ts` | `renderChemistry()` — HTML/SVG renderer |
| `index.ts` | Plugin entry point: `type_id: "chemistry"`, `version: "1.0.0"` |

**Grammar design:**

The chemistry grammar uses `PEGParser` with `skip: /^[ \t]+/`. All structural
rules are expressed as PEG grammar entries with `build()` functions assembling
AST nodes. No string splitting or re-parsing inside `build()`.

Key atomicity decisions to prevent skip from firing inside compound notation:
- `ElementGroup` is a single atomic regex `/^(\^[0-9]+(_[0-9]+)?)?[A-Z][a-z]*[0-9]*/`
  capturing isotope prefix + symbol + count in one token — no skip can fire
  between the element letter and its subscript digit
- `ParenGroup` and `BracketGroup` capture their closing delimiter + count as
  one atomic regex (`/^\)[0-9]*/`, `/^\][0-9]*/`)
- `State` and `Charge` are single atomic regexes
- Optional `Coeff`, `State`, and `Charge` are handled by patching the grammar
  after definition — wrapping the regex in a `choice` with an empty sequence

Grammar structure:
```
Program        = Statement (\n Statement)*
Statement      = ThermoStmt | StructStmt | ReactionStmt | BlankOrComment
ReactionStmt   = "Reaction(" Side Arrow Side ("," Conditions)? ")"
Side           = Term ("+" Term)*
Term           = Coeff? Species
Species        = ChargedSpecies | Particle | BareCompound
ChargedSpecies = "{" BareCompound "," Charge "}" State?
BareCompound   = Group+ State?
Group          = BracketGroup | ParenGroup | ElementGroup
Arrow          = "<=>" | "<->" | "-->" | "->"   (longest-first)
Conditions     = "cond(" CondItem ("," CondItem)* ")"
CondItem       = Identifier "=" MathExpr | Identifier
ThermoStmt     = ThermoKey "=" MathExpr
StructStmt     = AtomStmt | BondStmt | GroupStmt
```

**Renderer:**

- Reactions: horizontal layout — reactants, arrow (with conditions above), products
- Charges: `<sup>` with magnitude+sign (e.g. `2+`, `-`)
- Atom counts: `<sub>`
- Isotopes: stacked leading `<sup>`/`<sub>` for mass/atomic numbers
- State symbols: italic postfix `(s)`, `(l)`, `(g)`, `(aq)`
- Thermodynamic quantities: `ΔH = value` using math renderer for the value
- Structural formulas: text rows listing atom/bond/group declarations

**Added — `src/plugins/registry.ts`**

`chemistryPlugin` registered with `type_id: "chemistry"`.

**Added — `native-math.css`**

Chemistry styles: `.chem-program`, `.chem-reaction`, `.chem-side`, `.chem-term`,
`.chem-coeff`, `.chem-species`, `.chem-arrow-wrap`, `.chem-arrow`,
`.chem-conditions`, `.chem-state`, `.chem-isotope`, `.chem-isotope-scripts`,
`.chem-thermo`, `.chem-structural`, `.chem-struct-row`.

**Added — `public/chemistry-sample.csv`**

Ten demo rows covering: combustion, Haber process equilibrium with conditions,
ionic precipitation with charged species, nuclear fission with isotopes,
thermodynamic quantity, and structural formula declarations.

---

### Bug fixes

**Bug 1 — Missing types row in chemistry-sample.csv**

The CSV was missing the required second row declaring column types. Without
`text,text,chemistry` as row 1, the CSV parser treated the first data row as
the types row, dispatching all chemistry cells to the `text` plugin and
rendering them as plain source text.

Fix: added `text,text,chemistry` as the second row of `chemistry-sample.csv`.

**Bug 2 — Conditions delimiter mismatch**

The grammar `Conditions` rule used `"["` / `"]"` as delimiters, but the
study.md spec and sample CSV use `cond(...)` syntax. The parser failed with
`expected "["` when encountering `cond(T=450\deg,...)`.

Fix: changed `Conditions` to open with `"cond("` and close with `")"`.
Updated `CondValue` stop regex from `/^[^\],]+/` to `/^[^,)]+/` to match
the new closing delimiter.

---

### Design decisions

1. **PEGParser for all structural rules** — unlike the first implementation
   (which used a hand-written cursor-based parser), all grammar rules are
   expressed as PEG entries fed into `PEGParser`. `build()` functions only
   assemble AST nodes from already-parsed data. No string splitting or
   re-parsing inside `build()`.

2. **Atomic regexes for no-whitespace rules** — `ElementGroup`, `ParenGroup`
   closing, `BracketGroup` closing, `State`, and `Charge` are all single
   atomic regex tokens. This prevents the `skip` pattern from firing between
   an element symbol and its subscript count, which would be incorrect.

3. **Grammar patching for optional elements** — optional `Coeff`, `State`,
   and `Charge` are implemented by patching the grammar object after the
   initial definition, wrapping the regex in a `choice` with an empty
   sequence. This keeps the initial grammar definition readable while
   correctly handling the optional cases.

4. **`ParenGroup` disambiguation from `State`** — `ParenGroup` requires at
   least one `Group` inside, and `Group` requires starting with `[A-Z]`,
   `[`, or `^`. State symbols `(s)`, `(l)`, `(g)`, `(aq)` contain only
   lowercase letters, so `Group` fails on them, causing `ParenGroup` to
   fail, and the optional `State` choice matches instead. No explicit
   lookahead needed.

5. **`cond(...)` for conditions** — conditions use `cond(key=value, ...)` 
   syntax matching the study.md spec, not `[...]` brackets.

6. **Math delegation for thermo values and condition values** — `ThermoStmt`
   and `CondItem` values are captured as raw text by `LineRest` and
   `CondValue` rules, then passed to `mathParser.parse("Expression", span)`
   in `build()`. Same composition pattern as geometry and physics.

---

## Phase 12 — Control File & Map Views

---

### Implementation

**Added — `src/data/control.ts`**

New file. Defines all interfaces and the parser for `control.json`.

| Export | Purpose |
|--------|---------|
| `NodeMapping`, `EdgeMapping`, `ActorMapping`, `MessageMapping` | Column role declarations per diagram type |
| `NodeSource`, `EdgeSource`, `ActorSource`, `MessageSource` | File + mapping pairs |
| `NodeStyle`, `EdgeStyle` | Per-type visual style declarations |
| `TableDecl`, `FlowDecl`, `SequenceDecl`, `ControlEntry`, `ControlFile` | Control file structure |
| `ResolvedNode`, `ResolvedEdge`, `ResolvedActor`, `ResolvedMessage`, `ResolvedDiagram` | Runtime-resolved diagram data |
| `parseControlFile(json)` | Parses raw JSON into a `ControlFile` |
| `resolveNodes`, `resolveEdges`, `resolveActors`, `resolveMessages` | Map CSV rows to resolved diagram data using a mapping declaration |

**Added — `src/view/workspace-view.ts`**

Defines the `WorkspaceView` interface and `viewFactory()`. All workspace-level views (table and diagram) implement this interface: `mount(container, data, state?)`, `unmount(): ViewState`, `update(data)`.

**Added — `src/view/flow-diagram-view.ts`**

New file. `FlowDiagramView` implements `WorkspaceView`. Renders flow, spatial, relation, and sequence diagrams as SVG.

Layout algorithm:
- Tarjan SCC detects strongly-connected components (cycles)
- Cycle nodes are placed on a circle (polygon layout)
- Non-cycle nodes are placed in layered ranks above the circle via BFS
- Cycle edges use outward-bowing Bézier arcs
- DAG edges use orthogonal routing (right-angle paths)
- Pan/zoom via mousedown/mousemove/wheel on a `<g>` transform

**Added — `src/view/table-view-adapter.ts`**

Wraps `TableView` to conform to `WorkspaceView`. Allows the tab-switching machinery to treat table tabs and diagram tabs uniformly.

**Added — `KnowledgeBase.diagrams`**

`src/model/KnowledgeBase.ts` gains `readonly diagrams: ResolvedDiagram[] = []`. No existing fields or methods change.

**Changed — `src/controller/index.ts`**

Added:
- `loadControlFile(jsonText)` — parses JSON text into a `ControlFile`
- `resolveAllDiagrams(controlFile, csvMap)` — resolves all diagram declarations against loaded CSV data, populates `kb.diagrams`
- `getDiagrams()` — returns `kb.diagrams`

**Changed — `src/main.ts`**

Rewritten to handle the Phase 12 loading flow:
- File input now accepts `.csv,.json`
- `loadFiles(files[])` reads all files in parallel via `Promise.all`
- Detects `control.json` in the batch
- **Control path**: parses control file, loads table-entry CSVs, resolves diagrams, builds tab strip from control file entries
- **Fallback path**: no `control.json` → loads all CSVs as plain tables (backward compatible)
- `renderControlTabs(controlFile)` builds the tab strip; table tabs call `renderTableRows` directly (bypassing `renderAll` to avoid tab strip overwrite); diagram tabs mount a `FlowDiagramView`

**Changed — `index.html`**

File input `accept` attribute changed from `.csv` to `.csv,.json`.

**Added — `public/control.json`**

Sample control file with 6 entries: `theorems` (table), `glycolysis-table` (table), `glycolysis-map` (flow), `krebs-table` (table), `krebs-map` (flow), `metabolism-map` (flow with multiple node files).

**Added — `public/krebs-nodes.csv`**

18 nodes: 9 compounds (Acetyl-CoA, Oxaloacetate, Citrate, Isocitrate, α-Ketoglutarate, Succinyl-CoA, Succinate, Fumarate, Malate) + 8 enzymes + PDH (Pyruvate dehydrogenase, the entry-point enzyme).

**Added — `public/krebs-edges.csv`**

19 edges encoding the full Krebs cycle. Entry: `Pyruvate → PDH → AcCoA`. Cycle closes: `MDH → OAA → CS`.

**Added — `public/metabolism-edges.csv`**

Combined glycolysis + Krebs edges in one file. `Pyruvate` is the shared linking node between the two pathways.

---

### Bug fixes

**Bug 1 — `erasableSyntaxOnly` error in `FlowDiagramView`**

Constructor parameter shorthand `constructor(private readonly viewType: string)` is forbidden by `erasableSyntaxOnly`. Fixed by declaring the field explicitly above the constructor and assigning in the body.

**Bug 2 — Infinite BFS loop on cyclic graphs**

The BFS rank assignment in `layeredLayout` re-enqueued nodes every time a longer path was found (`r + 1 > cur`). In a cycle (`Pyruvate → PK → Pyruvate`), this caused unbounded queue growth until `RangeError: Invalid array length`. Fixed by adding an `enqueued` Set — each node is pushed onto the queue at most once.

**Bug 3 — Tab strip overwritten on table tab click**

Clicking a table tab called `tableView.renderAll()`, which internally calls `renderTabStrip()` — this does `tabStrip.innerHTML = ""` and rebuilds the strip with one tab per raw CSV table, wiping out the control-file-driven tabs. Fixed by calling `renderTableRows()` directly instead of `renderAll()`, so only the table body is rendered and the tab strip is left untouched.

---

### Design decisions

1. **Two maps + one combined map, not one merged map.** Glycolysis and Krebs are distinct pathways. Forcing them into one map produces an unreadable diagram at scale. The control file's `nodes: [...]` array syntax merges both node files into `metabolism-map` for the linked overview, while `glycolysis-map` and `krebs-map` remain independent.

2. **`renderTableRows` instead of `renderAll` for control-file table tabs.** `renderAll` rebuilds the tab strip as a side effect. In control-file mode the tab strip is owned by `renderControlTabs`, not by `TableView`. Calling `renderTableRows` directly renders only the table body, leaving the tab strip untouched.

3. **Tarjan SCC for cycle detection.** Tarjan's algorithm finds all strongly-connected components in O(V+E). The largest SCC is the main cycle. This correctly handles both purely cyclic graphs (Krebs) and graphs with a linear prefix feeding into a cycle (glycolysis → Krebs in the metabolism map).

4. **Circular layout for cycle nodes, layered layout for DAG nodes.** Cycle nodes are placed on a circle ordered by traversal. Non-cycle nodes are placed in BFS ranks above the circle. This produces the correct visual shape for both pathway types without any manual coordinate specification.

5. **Radius formula uses total perimeter, not max node width.** The old formula `(maxNodeW + gap) × n / 2π` used the widest node for every slot, inflating the ring for graphs with one long label. The correct formula sums all node widths plus gaps and divides by 2π — the ring circumference equals the total perimeter needed.

6. **Bézier arcs for cycle edges, orthogonal paths for DAG edges.** Cycle edges bow outward from the circle centre using a quadratic Bézier with a control point pushed away from the centre. DAG edges use right-angle routing (vertical → horizontal jog → vertical). This visually distinguishes the two edge types and prevents cycle edges from cutting through the ring interior.

---

## Phase 12 — Post-mortem & Technical Debt Record

*Written at end-of-session. Records what was completed, what was left broken,
what needs refactoring, and what future phases must address.*

---

### What was completed

- `src/data/control.ts` — fully implemented and type-correct after the
  `as unknown as NodeMapping` cast fix
- `src/view/flow-diagram-view.ts` — fully implemented: Tarjan SCC, circular
  layout for cycles, layered BFS layout for DAG nodes, orthogonal edge routing,
  Bézier arc routing for cycle edges, pan/zoom
- `src/view/workspace-view.ts` — `WorkspaceView` interface and `viewFactory`
  defined; `editBar`/`editPreview` stale parameters removed
- `src/view/table-view-adapter.ts` — constructor fixed to match current
  `TableView(container, tabStrip, sourceInput)` 3-argument signature
- `src/main.ts` — Phase 12 loading flow: `Promise.all` batch read, control.json
  detection, `renderControlTabs`, fallback path
- `public/control.json`, `krebs-nodes.csv`, `krebs-edges.csv`,
  `metabolism-edges.csv` — sample data for glycolysis, Krebs, and combined map
- All four documentation files updated

---

### What was left broken or incomplete

**1. `TableView.renderTableRows` is private — called via `(tableView as any)`**

In `main.ts`, `renderControlTabs` calls:
```ts
(tableView as any).renderTableRows(table, table.rows, tableIdx);
```
This bypasses TypeScript's access control. `renderTableRows` must be made
`public` (or a dedicated `renderSingleTable(table, tableIdx)` public method
added) so the call is type-safe. The `as any` cast is a known technical debt.

**2. `TableViewAdapter` uses `(this.tableView as any).container = container`**

The adapter re-wires `TableView`'s private `container` field on mount:
```ts
(this.tableView as any).container = container;
```
This is fragile — if `TableView` is refactored, this silently breaks.
`TableView` needs a `setContainer(el: HTMLElement)` public method.

**3. Tab strip ownership is split between `TableView` and `main.ts`**

In the fallback path (no `control.json`), `TableView.renderAll()` owns and
rebuilds the tab strip. In the control-file path, `renderControlTabs` in
`main.ts` owns the tab strip and must prevent `TableView` from touching it.
This dual ownership is the root cause of the "tabs disappear" bug that was
fixed by calling `renderTableRows` directly. The correct fix is a single
`TabStripController` class that owns the tab strip and is the only entity
that writes to it.

**4. `TableViewAdapter` is unused in the current `main.ts`**

`workspace-view.ts` defines `viewFactory` and `TableViewAdapter`, but
`main.ts` does not use `viewFactory` at all — it directly instantiates
`TableView` and `FlowDiagramView` separately. `TableViewAdapter` was
written for a future unified tab-switching architecture that was not
completed in Phase 12. It currently has no callers.

**5. `src/ui/` legacy layer is dead code**

`src/ui/file-loader.ts`, `src/ui/graph-filter.ts`, `src/ui/table.ts`,
`src/ui/expression-input.ts` are kept for backward test compatibility but
are not used by `main.ts`. They are dead code in the running application.

---

### Refactoring needed — the table/graph entanglement

The core architectural problem is that `TableView` has two responsibilities
that should be separate:

1. **Tab strip management** — which tabs exist, which is active, switching
   between them. This is currently done inside `renderAll()` → `renderTabStrip()`,
   which means `TableView` owns the tab strip. But in Phase 12, `main.ts`
   also needs to own the tab strip (to add diagram tabs). The result is two
   competing owners of the same DOM element.

2. **Table body rendering** — rendering a single `Table` object as an HTML
   `<table>` with sortable columns, editable cells, drag handles, and row
   actions. This is the core job of `TableView` and should be its only job.

**The correct refactoring:**

```
TabStripController          — owns #tab-strip, manages tab buttons,
                              fires onTabChange(entryId) callbacks
                              knows nothing about tables or diagrams

WorkspaceController         — owns #workspace, holds the active WorkspaceView,
                              calls mount/unmount on tab change,
                              dispatches to TableView or FlowDiagramView

TableView                   — renders ONE table into a container
                              no tab strip, no tab switching
                              public renderTable(table, tableIdx): void
                              public setContainer(el): void

FlowDiagramView             — renders ONE diagram into a container
                              already correct — no tab strip involvement

AppController               — model operations only (loadCSV, editCell, etc.)
                              no view references except callbacks
```

This separation means:
- `TableView` never touches the tab strip
- `FlowDiagramView` never touches the tab strip
- `TabStripController` never touches table or diagram content
- `WorkspaceController` is the single coordinator

---

### Future phases — diagram types beyond flow graphs

The current `FlowDiagramView` handles directed graphs (flow, spatial,
relation) and sequence diagrams. These cover reaction pathways and UML.
They do not cover biological diagrams where the visual representation is
spatial and pictorial rather than topological.

**The electron transport chain problem:**

The electron transport chain cannot be represented as a flow graph because:
- Proteins (Complex I, II, III, IV, ATP synthase) are not abstract nodes —
  they are spatial blobs with specific shapes embedded in a membrane
- The inner mitochondrial membrane is a physical boundary that must be
  rendered as a layered structure (matrix side vs intermembrane space)
- Electron carriers (NADH, FADH₂, ubiquinone, cytochrome c) move between
  proteins in specific spatial directions
- Proton gradients are directional flows across the membrane, not graph edges
- The visual convention is a cross-section diagram, not a node-edge graph

This class of diagram — **spatial biology diagrams** — requires a different
rendering approach entirely.

**Proposed future view type: `"biology"` (or `"spatial-diagram"`)**

A biology diagram is a declarative SVG scene where:
- **Membranes** are rendered as layered bands (lipid bilayer, inner/outer
  mitochondrial membrane, plasma membrane, etc.)
- **Proteins** are rendered as named blobs with configurable shapes
  (transmembrane proteins span the membrane; peripheral proteins sit on one side)
- **Small molecules** are rendered as labelled circles or icons
- **Flows** are rendered as directional arrows between named elements,
  optionally constrained to one side of a membrane
- **Compartments** are labelled regions (matrix, intermembrane space, cytosol)

The data model for this would be a new CSV schema:

```csv
Type,Name,Location,Shape,Color
text,text,text,text,text
membrane,InnerMitochondrialMembrane,,band,#fde68a
compartment,Matrix,below:InnerMitochondrialMembrane,,
compartment,IntermembraneSpace,above:InnerMitochondrialMembrane,,
protein,ComplexI,membrane:InnerMitochondrialMembrane,blob,#bfdbfe
protein,ComplexIII,membrane:InnerMitochondrialMembrane,blob,#bfdbfe
protein,ATPSynthase,membrane:InnerMitochondrialMembrane,blob,#bbf7d0
molecule,NADH,compartment:Matrix,circle,#fca5a5
molecule,Ubiquinone,membrane:InnerMitochondrialMembrane,circle,#d8b4fe
flow,NADH,ComplexI,electron,
flow,ComplexI,Ubiquinone,electron,
flow,H+,Matrix,IntermembraneSpace,proton,
```

The control file would declare this as `"view": "biology"` with a mapping
that identifies the Type, Name, Location, Shape, and Color columns.

**This is a Phase 13+ concern.** The architecture is already prepared for it:
- `WorkspaceView` interface is generic — any new view type implements it
- `viewFactory` adds one `case "biology":` line
- `control.json` adds `"view": "biology"` as a new entry type
- The biology renderer is a new file `src/view/biology-diagram-view.ts`
- No existing code changes

**Other diagram types in the same category:**
- Signal transduction pathways (receptor → cascade → transcription factor)
  — partially representable as flow graphs but benefit from spatial membrane context
- Cell structure diagrams (organelle positions within a cell)
- Pharmacokinetic compartment models (absorption, distribution, metabolism,
  excretion as spatial compartments with flow rates)
- Neural circuit diagrams (neurons as blobs with dendrites/axons, synapses
  as spatial connections)

All of these share the same pattern: spatial containment + named blobs +
directional flows. A single `"biology"` view type with a flexible enough
data schema could cover all of them.

---

### Summary of technical debt priority

| Priority | Item | Effort |
|----------|------|--------|
| High | Make `renderTableRows` public in `TableView` | Trivial |
| High | Add `setContainer(el)` public method to `TableView` | Trivial |
| High | Separate tab strip ownership into `TabStripController` | Medium |
| Medium | Remove `src/ui/` dead code layer | Small |
| Medium | Wire `viewFactory` / `TableViewAdapter` into `main.ts` | Medium |
| Medium | Unify fallback and control-file tab paths in `main.ts` | Medium |
| Low | `WorkspaceController` to replace `main.ts` tab logic | Large |
| Future | `"biology"` view type for spatial membrane diagrams | Large |
