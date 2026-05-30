# History

## Phase 1 â€” Parser & Basic Renderer

---

### Initial implementation

**Added**
- `PEGParser` class â€” recursive descent PEG engine with support for literal,
  regex, sequence, choice, repeat, and rule-reference expressions
- Whitespace skipping via configurable `skip` regex pattern
- Structured error reporting â€” tracks the furthest failure position and
  formats a compiler-style error message with line, column, and caret
- BobaMath grammar â€” full arithmetic expression grammar covering:
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
- `native-math.css` â€” styles for fraction, opstack, large-operator, sqrt,
  matrix, piecewise
- Basic UI: text input, Render button, result div, error div
- Manual test injection: pre-fills input with `-2*(3+5)*4e^x^2` on load

---

### Bug fix â€” implicit multiplication precedence (Issue 1)

**Problem:** `4e^x^2` parsed as `(4 * e) ^ x ^ 2` instead of `4 * (e ^ (x ^ 2))`.

**Change:** Replaced `ImplicitFactor` with `Power` as the implicit
multiplication operand in `Multiplicative`'s repeat rule.

**File changed:** `src/main.ts` (pre-split), later `src/parser/grammar.ts`

---

### Bug fix â€” implicit multiplication stealing unary signs (Issue 2)

**Problem:** `(3+5)` inside a larger expression parsed as `3 * (+5)` because
the implicit `Power` branch consumed `+` as a unary sign before `Additive`
could use it as an additive operator.

**Change:** Introduced `ImplicitPower` rule â€” identical to `Power` but rooted
at `Postfix` instead of `Unary`, preventing it from consuming leading signs.
The implicit multiplication branch in `Multiplicative` now uses `ImplicitPower`.

**File changed:** `src/main.ts` (pre-split), later `src/parser/grammar.ts`

---

### Refactor â€” split `main.ts` into modules

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
- Removed duplicate `buttonElement.addEventListener("click", ...)` â€” the
  original `main.ts` had the click handler registered twice
- Replaced `this.document.getElementById` with `document.getElementById` in
  the load handler (the `this` reference was incorrect inside a regular
  function listener)
- `interleave()` parameter type tightened from `Node[]` to `HTMLElement[]`
  to match actual usage

---

### Documentation

**Added**
- `environ-setup.md` â€” dev environment setup guide (WSL vs Windows, Node.js
  install, project setup, available scripts)
- `docs/docs_guide.md` â€” index of all documentation files
- `docs/study.md` â€” target definition, feasibility, proposal, phases,
  architecture, deployment, file structure
- `docs/codebase_analysis.md` â€” beginner-friendly explanation of all concepts
  and code
- `docs/testing.md` â€” all test cases, verdicts, issues and fixes
- `docs/demos.md` â€” setup, build, run, expected results, troubleshooting
- `docs/history.md` â€” this file

---

### Phase 1 completion â€” Skew identifier system

**Added**
- `IdentifierNode.prefix` field in `src/parser/types.ts` â€” encodes the
  visual form of an identifier: `"plain"`, `"left-skew"`, `"right-skew"`,
  `"greek"`, `"greek-right"`
- Five identifier grammar rules in `src/parser/grammar.ts`:
  - `PlainIdentifier` â€” `/^[a-zA-Z]/`
  - `LeftSkewIdentifier` â€” `` /^`[a-zA-Z]/ ``
  - `RightSkewIdentifier` â€” `` /^`[0-9]+[a-zA-Z]/ ``
  - `GreekIdentifier` â€” `/^\\[a-zA-Z][a-zA-Z0-9]*/`
  - `RightSkewGreekIdentifier` â€” `/^\\[0-9]+[a-zA-Z][a-zA-Z0-9]*/`
- `GREEK` mapping table in `src/render/render.ts` â€” maps single Latin
  letters to Unicode Greek glyphs (Î±, Î², Î³, ... Î©)
- `renderIdentifier()` function in `src/render/render.ts` â€” dispatches
  on `prefix` to produce the correct CSS class and glyph
- Identifier CSS classes in `native-math.css`:
  `.ident-plain`, `.ident-left-skew`, `.ident-right-skew`,
  `.ident-greek`, `.ident-greek-right`
- Phase 1 test case cycle in `src/main.ts` â€” 6 test cases cycled via
  `__nextTest()` in the browser console

**Changed**
- `Identifier` rule in `grammar.ts` â€” now dispatches to 5 sub-rules
  instead of 2 (`EscapedIdentifier` and `PlainIdentifier` replaced)
- `render()` in `render.ts` â€” `Identifier` case now calls
  `renderIdentifier()` instead of inline string handling
- `src/main.ts` â€” single hardcoded test case replaced with a 6-case
  cycle covering all Phase 1 demo inputs

**Removed**
- `EscapedIdentifier` rule â€” replaced by `GreekIdentifier` and
  `RightSkewGreekIdentifier` which also strip the prefix correctly

---

### Bug fix â€” Integral body rendered below sign (Issue 3)

**Problem:** `renderIntegral` placed the body as a fourth `display: block`
child inside `.opstack`, causing it to stack below the âˆ« symbol.

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
- `vite.config.ts` â€” Vitest config using `happy-dom` environment, includes
  all `test/**/*.test.ts` files
- `test/parser/PEGParser.test.ts` â€” unit tests for the PEG engine primitives:
  literal, regex, sequence, choice, repeat, rule reference, build function,
  error reporting
- `test/parser/grammar.test.ts` â€” unit tests for the math syntax grammar:
  numbers, all 5 identifier forms, additive, multiplicative (including
  implicit multiplication), power (right-associativity), unary, postfix
  (call, subscript, control), grouping, operator precedence, error cases.
  Includes regression tests for Issue 1 (implicit multiplication precedence)
  and Issue 2 (unary sign theft)
- `test/render/render.test.ts` â€” unit tests for the renderer using
  `happy-dom`: number, identifier CSS classes, Greek glyph mapping, fraction
  structure, power `<sup>`, subscript `<sub>`, call, integral structure
  (including regression for Issue 3 â€” body beside sign not inside opstack),
  sqrt, automatic parenthesisation, `renderMath` wrapper
- `tsconfig.json` updated to include `test/` and `vite.config.ts`

**Test counts:** 3 layers Ã— multiple suites = 60+ individual test cases,
all serving as regression tests for future phases.

---

## Phase 2 â€” Linear Algebra, Rollout Notation & Extended Operators

---

### Implementation

**Added â€” Grammar**
- `Relational` grammar level between `Expression` and `Additive`
- `RelationalOp` rule: `=`, `!=`, `<=`, `>=`, `~=`, `:=`, `~`, `<<`, `>>`,
  `->`, `<`, `>` â€” ordered longest-first to resolve conflicts
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

**Added â€” AST node types**
- `SubSuperscriptExpressionNode` â€” base + subscript + superscript
- `VectorNameNode` â€” identifier with arrow decorator
- `MatrixNode` â€” rectangular array of expressions
- `IndexExpressionNode` â€” array indexing
- `AbsoluteValueNode` â€” absolute value / norm
- `FactorialExpressionNode` â€” factorial postfix
- `DerivativeNode` â€” prime derivative with order
- `EllipsisNode` â€” sequence ellipsis
- `PiecewiseNode` â€” piecewise function cases
- `IdentifierNode.prefix` extended with `"blackboard"` variant

**Added â€” Renderer**
- `GLYPH_TABLE` â€” comprehensive lookup table: Greek, Hebrew (â„µ, â„¶, â„·, â„¸),
  operators (Â±, âˆ“, âˆž, âˆ‡, âˆ‚), set operators (âˆª, âˆ©, âˆ–, Ã—, âˆ, âˆ…, ð’«, âŠ‚, âŠƒ,
  âŠ†, âŠ‡, âŠŠ, âŠ‹, â–³), logic (âˆ§, âˆ¨, Â¬, âŸ¹, âŸº, âˆ€, âˆƒ, âˆ„), calculus (âˆ®, âˆ¬, âˆ­),
  geometry (âˆ , â–³, âˆ¥, âŠ¥, âˆ¼), misc (âˆ˜, âŠ•, âŠ—, âŠ™, â†¦, âˆˆ, âˆ‰, â‰…, âˆ£, âˆ¤, Ã·)
- `BLACKBOARD_TABLE` â€” â„•, â„¤, â„š, â„, â„‚, â„, â„™, ð•Œ, âˆ‚
- `RELATIONAL_SYMBOL` â€” maps operator strings to Unicode symbols for rendering
- `renderSubSuperscript` â€” base with stacked sup/sub in `.scripts` container
- `renderVectorName` â€” identifier with combining arrow
- `renderMatrix` â€” table layout with `.matrix-row` and `.matrix-cell`
- `renderIndex` â€” subscript display for array indexing
- `renderAbsoluteValue` â€” `|x|` for scalars, `â€–xâ€–` for vectors/matrices
- `renderFactorial` â€” appends `!`
- `renderDerivative` â€” appends prime characters (â€²)
- `renderPiecewise` â€” table with left brace
- `renderBigOperator` â€” Î£ and Î  with stacked bounds (reuses integral layout)
- `renderLim` â€” "lim" with approach expression below
- `renderBinom` â€” fraction in parentheses
- `renderEval` â€” expression with evaluation bar and subscript
- `renderUnderbrace` / `renderOverbrace` â€” content with brace and label
- `renderRollout` â€” rollout operators using big operator layout
- Control expression renderers: `\floor`â†’âŒŠâŒ‹, `\ceil`â†’âŒˆâŒ‰, `\bar`â†’overline,
  `\hat`â†’hat, `\tilde`â†’tilde, `\ul`â†’underline, `\cancel`â†’strikethrough,
  `\inner`â†’âŸ¨âŸ©, `\arc`â†’arc decorator

**Added â€” CSS**
- `.subsuperscript` and `.scripts` â€” stacked superscript/subscript layout
- `.vector-name` and `.vector-arrow` â€” arrow positioning
- `.overline`, `.hat`, `.tilde`, `.underline`, `.cancel`, `.arc` â€” decorators
- `.underbrace`, `.overbrace` with content and label children
- `.eval-bar` â€” evaluation bar styling
- `.ident-blackboard` â€” bold styling for blackboard bold
- `.piecewise-expr`, `.piecewise-cond` â€” table cell styling for piecewise

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
- `renderBinary` extended with dot product (Â·), mod, div, and relational symbols
- `renderControl` extended with all new control expression types

---

### Design decisions

1. **Backslash relational operators as identifiers**: `\sub`, `\in`, `\notin`,
   etc. are parsed as regular backslash identifiers (not grammar-level operators)
   because the PEG implicit multiplication rule would consume them before the
   Relational level gets a chance. They render correctly via GLYPH_TABLE.

2. **Piecewise uses commas**: `\piecewise{x, x>=0, -x, x<0}` instead of
   semicolons, to avoid grammar complexity. The renderer interprets pairs.

- `(x_i)^2` also produces `SubSuperscriptExpression` â€” parentheses unwrap
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

## Phase 3 â€” Plugin System & CSV Table Display

---

### Implementation

**Added â€” Plugin system**
- `src/plugin/interface.ts` â€” `Plugin` interface: `{ type_id, version, parse(), render() }`
- `src/plugin/math.ts` â€” Math syntax plugin wrapping existing parser + renderer
- `src/plugin/plaintext.ts` â€” Plain text plugin (identity, fallback)
- `src/plugin/registry.ts` â€” Plugin registry with `getPlugin()` and `renderCell()`
- `escapeHTML()` helper for safe error display with preserved formatting

**Added â€” CSV reader**
- `src/csv/reader.ts` â€” CSV parser producing `CSVData { headers, types, rows }`
- Handles quoted fields, escaped quotes, CRLF, empty fields
- Convention: row 0 = headers, row 1 = types, row 2+ = data

**Added â€” Table component**
- `src/table/table.ts` â€” `createTable(data)` renders interactive HTML table
- Plugin-dispatched cell rendering via `renderCell(typeId, text)`
- Sortable columns (click header, ascending/descending toggle)

**Added â€” UI**
- File picker (`<input type="file" accept=".csv">`)
- Drag-and-drop zone with visual feedback
- Table container for rendered output

**Added â€” Sample data**
- `public/sample.csv` â€” 8 mathematical concepts with math and text columns

**Added â€” Tests**
- `test/csv/reader.test.ts` â€” 8 tests for CSV parsing
- `test/plugin/registry.test.ts` â€” 7 tests for plugin dispatch and error handling
- `test/table/table.test.ts` â€” 8 tests for table rendering and sorting

**Changed**
- `src/main.ts` â€” added CSV file loading (picker + drag-and-drop)
- `index.html` â€” added file input, table container, section headers
- `style.css` â€” added table styles, cell-error, drop-zone styles

---

### Bug fixes

**Cell error newlines:** Parse errors in table cells displayed without line
breaks. Fixed by using `innerHTML` with `escapeHTML()` that converts `\n` â†’ `<br>`
and ` ` â†’ `&nbsp;` (after HTML entity escaping to prevent double-escaping).

**Test input for error case:** `"2++invalid"` was partially parseable by the
math plugin. Changed to `"@@@"` which always fails.

---

### Design decisions

1. **Plugin interface is minimal:** Only `parse()` and `render()` â€” no
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
- `src/parser/` â€” split into `src/engine/` (generic) and `src/plugins/math/` (domain)
- `src/render/` â€” moved to `src/plugins/math/render.ts` and `src/plugins/math/el.ts`
- `src/plugin/` â€” renamed to `src/plugins/` with restructured contents
- `src/csv/` â€” moved to `src/data/csv.ts`
- `src/table/` â€” moved to `src/ui/table.ts`

**New directories:**
- `src/engine/` â€” PEGParser + engine-level types only
- `src/plugins/math/` â€” self-contained math plugin (types, grammar, renderer, entry)
- `src/plugins/text/` â€” plain text plugin
- `src/data/` â€” format-agnostic data layer (TableData, CSV parser)
- `src/ui/` â€” presentation components (table, file-loader, expression-input)

**New files:**
- `src/ui/file-loader.ts` â€” extracted from main.ts
- `src/ui/expression-input.ts` â€” extracted from main.ts
- `src/data/types.ts` â€” TableData interface (renamed from CSVData)
- `src/plugins/math/types.ts` â€” MathNode union (moved from engine types)

**Changed:**
- `Plugin` interface uses `unknown` instead of `ASTNode` â€” truly generic
- `main.ts` reduced to ~12 lines â€” only wires components
- Test structure mirrors src structure: `test/engine/`, `test/plugins/math/`,
  `test/data/`, `test/ui/`

### Design decisions

1. **Engine has zero domain imports** â€” `src/engine/` is a standalone library
2. **Plugins own their types** â€” `MathNode` lives in `src/plugins/math/types.ts`
3. **CSV is a PEG grammar** â€” demonstrates the engine is truly general-purpose
4. **UI components take DOM refs as parameters** â€” no global DOM access in components


---

## Phase 4 â€” Association Graph & Filtered Table View

---

### Implementation

**Added â€” Data layer**
- `src/data/graph.ts` â€” `AssociationGraph` class: stores directed typed edges,
  filters by relation/target, inverse lookup via vocabulary, entity inspection

**Added â€” UI**
- `src/ui/graph-filter.ts` â€” filter UI: relation/target dropdowns, filter button,
  reset button, association detail panel with clickable entity links

**Added â€” Sample data**
- `public/theorems.csv` â€” 6 theorems with `_associations` column
- `public/definitions.csv` â€” 9 definitions with inverse associations
- `public/vocabulary.json` â€” 5 relation types with inverses

**Added â€” Tests**
- `test/data/graph.test.ts` â€” 11 tests for AssociationGraph
- `test/ui/graph-filter.test.ts` â€” 5 tests for filter UI

**Changed**
- `src/ui/file-loader.ts` â€” supports multiple files, builds graph from
  `_associations` column, rebuilds UI after each file load
- `index.html` â€” `multiple` attribute on file input
- `style.css` â€” graph filter and association detail styles
- `public/sample.csv`, `public/theorems.csv`, `public/definitions.csv` â€”
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

1. **`_associations` column convention** â€” associations are stored inline in
   the CSV as a dedicated column. No sidecar file needed for simple cases.
   The column name `_associations` is reserved (prefixed with `_` to indicate
   it's metadata, not content).

2. **Entity ID = first column** â€” simple, no extra configuration needed.
   Cross-file references use the target's first-column value directly.

3. **Vocabulary is optional** â€” the graph works without a vocabulary file.
   Relation types are discovered from the data. The vocabulary adds inverse
   name resolution for the detail panel.

4. **Shared graph across files** â€” all loaded files contribute to one graph.
   This enables cross-file navigation (theorem â†’ definition in another file).

5. **UI rebuilds on each file load** â€” simple and correct. For small knowledge
   bases (hundreds of entities), re-rendering is instantaneous.


---

## MVC Architectural Refactoring

### Changes

**Added**
- `src/model/index.ts` â€” business model classes: `Cell`, `Column`, `Row`,
  `Table`, `Association`, `RelationType`, `AssociationGraph`, `KnowledgeBase`
- `src/controller/index.ts` â€” `AppController` class: orchestrates model and views
- `src/view/table-view.ts` â€” `TableView` class: renders Table models as HTML
- `src/view/graph-filter-view.ts` â€” `GraphFilterView` class: filter UI + detail panel

**Changed**
- `src/main.ts` â€” rewritten to use MVC wiring (controller + views)
- `src/data/graph.ts` â€” now re-exports from model (backward compat)
- `src/model/index.ts` `AssociationGraph` â€” accepts both old and new interfaces

**Kept (backward compat for tests)**
- `src/ui/table.ts` â€” `createTable(TableData)` function unchanged
- `src/ui/graph-filter.ts` â€” `initGraphFilter()` function unchanged

### Design decisions

1. **Model is DOM-free** â€” can be used in Node.js, tests, or any non-browser context
2. **Controller mediates** â€” views never access model directly for mutations
3. **Views are stateless** (except sort state) â€” they re-render from model on each call
4. **Backward compat preserved** â€” all 218 existing tests pass without modification

---

## Phase 5 â€” Inline Editor

---

### Implementation

**Changed â€” Model (`src/model/index.ts`)**
- `Cell.value` and `Row.cells` made mutable (removed `readonly`) â€” required
  for in-place edits without reconstructing the entire model
- `Table.rows` made mutable â€” required for add/delete row
- All classes rewritten to use explicit property declarations instead of
  constructor parameter shorthand â€” required by `erasableSyntaxOnly` compiler flag
- Added `EditAction` union type: `cell | addRow | deleteRow`
- Added `EditHistory` class â€” `push`, `undo`, `redo`, `canUndo`, `canRedo`, `clear`
- Added `KnowledgeBase.exportTableAsCSV()` â€” serializes a table to CSV text
  with correct quoting for commas, double quotes, and newlines

**Changed â€” Controller (`src/controller/index.ts`)**
- Added `history: EditHistory` (public, for testing)
- Added `editCell(tableIdx, rowIdx, colIdx, newValue)` â€” mutates cell value,
  records undo action; no-op if value is unchanged
- Added `addRow(tableIdx)` â€” appends empty row with correct column count,
  records undo action
- Added `deleteRow(tableIdx, rowIdx)` â€” splices row out, records undo action
- Added `undo()` â€” pops last action from history, applies inverse mutation,
  calls `showAll()` to re-render
- Added `redo()` â€” pops from redo stack, re-applies mutation, calls `showAll()`
- Added `exportCSV(tableIdx)` â€” delegates to `KnowledgeBase.exportTableAsCSV`

**Rewritten â€” TableView (`src/view/table-view.ts`)**
- Constructor now takes `editBar` and `editPreview` DOM elements in addition
  to the container
- Added `setController()` method
- One active cell at a time â€” clicking a new cell cancels/commits the current one
- All cells (text and syntax) use `contenteditable` directly in the `<td>` as
  the source editor; Enter = commit, Escape = cancel, blur = commit
- Syntax cells additionally show a live rendered preview in the top bar as the
  user types; the preview updates on every `input` event
- Text cells and idle state: top bar is hidden
- Each row has a âœ• delete button (with confirmation dialog)
- Below each table: "+ Add Row" and "â¬‡ Export CSV" buttons
- Filtered view (from graph filter) is read-only â€” no edit controls
- `cancelActive()` and `commitActive()` are public â€” called by `main.ts`
  on outside click and Ctrl+Z/Y respectively

**Changed â€” `index.html`**
- Added `#cell-edit-bar` div with `#cell-edit-preview` inside â€” hidden by
  default, shown only when a syntax cell is active
- Removed the input field from the edit bar â€” the bar is read-only

**Changed â€” `main.ts`**
- Passes `editBar` and `editPreview` to `TableView` constructor
- Calls `tableView.setController(controller)`
- Added global `keydown` handler: Ctrl+Z = `controller.undo()`,
  Ctrl+Y / Ctrl+Shift+Z = `controller.redo()`
- Added `document` click handler: calls `tableView.cancelActive()` to
  cancel any active edit when clicking outside the table

**Changed â€” `style.css`**
- Added `.cell-edit-bar`, `.cell-edit-bar-label`, `.cell-edit-bar-preview` â€”
  top bar layout (flex row, blue border, hidden when idle)
- Added `.editable-cell` â€” cursor pointer, hover highlight
- Added `.cell-active` â€” blue outline on the currently edited cell
- Added `.row-actions`, `.row-delete-btn` â€” delete button column
- Added `.table-toolbar` â€” add row / export button bar below each table

**Added â€” Tests**
- `test/model/edit-history.test.ts` â€” 8 tests for `EditHistory`,
  4 tests for `exportTableAsCSV`
- `test/controller/edit.test.ts` â€” 13 tests for `editCell`, `undo`, `redo`,
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

1. **Cell is the source editor** â€” the `<td>` itself becomes `contenteditable`
   when active. No separate input overlay is needed. This keeps the table
   layout stable and avoids z-index / positioning complexity.

2. **Top bar is read-only rendered preview** â€” it shows what the current source
   will look like when committed. It has no input field. The user always types
   in the cell, not in the bar.

3. **Top bar hidden for text cells and when idle** â€” text cells have no syntax
   to render, so showing the bar would be meaningless. The bar only appears
   when a syntax cell (e.g. `math`) is active.

4. **One active cell at a time** â€” activating a new cell automatically
   commits the previous one. This avoids the complexity of tracking multiple
   dirty cells and simplifies the undo stack (each commit is one action).

5. **Undo/redo at controller level** â€” the history stack lives in the
   controller, not the view. The view only calls `editCell`, `addRow`,
   `deleteRow`; the controller decides what to record. This keeps the view
   stateless with respect to history.

---

## Phase 6 â€” Binary Format (Skipped)

**Status: skipped â€” deferred indefinitely.**

Phase 6 was planned to introduce a compact binary file format for storage
and loading of knowledge tables. Multiple design iterations were explored,
including:

- A simple BK01 format with length-prefixed UTF-8 cell values
- A BK02 block-offset format with typed cell blobs
- A BK03 1KiB block-based columnar format with token streams, embedded
  segments, and RLE compression

All iterations were abandoned. The binary format specification proved too
ambiguous and too complex to implement correctly within the current
development scope. The layered architecture (block storage â†’ token stream
â†’ embedded TLV â†’ math AST binary) introduced too many interdependent
design decisions that could not be resolved cleanly without a much longer
design phase.

**Business decision:** Phase 6 is skipped to maintain delivery momentum.
The system continues to use CSV as the sole file format.

**Accepted tradeoffs:**
- No compact binary storage â€” files are larger than necessary
- No fast load path â€” math expressions are re-parsed from source text on
  every load rather than decoded from a pre-parsed binary representation
- No disk storage optimisation â€” performance and storage efficiency are
  sacrificed in favour of simplicity and correctness

**Future:** Binary format remains on the roadmap. It should be revisited
when the grammar is fully stable, real knowledge data exists to measure
actual file sizes, and sufficient design time is available to specify the
format unambiguously from byte level upward.

---

## Phase 7 â€” Search, Indexing & Tooling

---

### Implementation

**Added â€” `src/search/index.ts`**
- `searchText(kb, query)` â€” full-text search across all text-type cell values,
  case-insensitive, returns `SearchHit[]` with match position
- `searchByIdentifier(kb, name)` â€” structural search: parses each math cell's
  source text, walks the AST, returns cells containing an `IdentifierNode`
  with the given raw name (e.g. `"int"` finds all cells using `\int`)
- `getNeighbourhood(kb, entityId, maxHops)` â€” BFS over the association graph,
  returns all entities within `maxHops` hops with direction and hop count
- `crossTableJoin(kb, leftTableIdx, rightTableIdx, relation)` â€” finds entity
  pairs from two tables connected by a given relation type

**Added â€” `src/view/search-view.ts`**
- Search bar with two inputs: text search and symbol/identifier search
- Results panel with highlighted match text and clickable entity rows
- Neighbourhood panel showing connected entities up to 2 hops, triggered
  by clicking any entity (from search results or table first column)

**Added â€” `src/view/session.ts`**
- `saveSession(fileNames)` â€” persists loaded file names to `localStorage`
- `loadSession()` â€” retrieves session data on next open
- `clearSession()` â€” removes session data

**Changed â€” `src/controller/index.ts`**
- Added `searchText(query)`, `searchByIdentifier(name)`,
  `getNeighbourhood(entityId, maxHops)`, `crossTableJoin(...)`,
  `getLoadedFileNames()` â€” thin delegators to the search engine

**Changed â€” `src/main.ts`**
- Wires `SearchView` into the page
- Entity click handler now also triggers `searchView.showNeighbourhood()`
- Calls `saveSession()` after each file load
- Shows session restore banner on page load if a previous session exists

**Changed â€” `index.html`**
- Added `#session-banner` div (hidden by default)
- Added `#search-container` div above the edit bar

**Changed â€” `style.css`**
- Added `.session-banner` â€” amber warning bar
- Added `.search-bar`, `.search-input`, `.search-btn` â€” search controls
- Added `.search-results`, `.search-result-item`, `.search-result-value` â€”
  results list with highlighted matches
- Added `.neighbourhood-panel`, `.neighbourhood-item` â€” hop graph display

**Added â€” `test/search/search.test.ts`**
- 15 tests covering: text search (match, multi-table, no match, blank query,
  match positions, math cells excluded), identifier search (found, not found,
  blank), neighbourhood (hop 1, hop 0, no self, hop count), cross-table join

---

### Design decisions

1. **Search does not index** â€” all search functions scan the in-memory model
   on every call. For the current scale (hundreds of entities), this is
   instantaneous. A persistent index would be premature optimisation.

2. **Structural search parses on demand** â€” math cells are re-parsed during
   `searchByIdentifier`. This is correct because the source text is the
   canonical form. Parsing is fast enough for interactive use.

3. **Neighbourhood uses BFS** â€” breadth-first traversal ensures the shortest
   path is found first and hop counts are correct.

4. **Session stores file names only** â€” the browser cannot access the
   filesystem directly. The session banner tells the user which files to
   reload; it does not reload them automatically.

5. **Domain tool = symbol search** â€” `searchByIdentifier` is the first
   domain tool. It answers "which theorems use this symbol?" directly.

---

## Phase 8 â€” Spreadsheet Shell Layout & Refactoring

---

### Refactoring â€” 1 class per file (`src/model/`)

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
| `src/model/index.ts` | Barrel re-export only â€” all existing imports unchanged |

All cross-file references use `import type` where possible to avoid circular
dependency issues.

---

### New controller actions â€” `insertRow` and `moveRow`

**`insertRow(tableIdx, atIdx)`** â€” inserts an empty row at a specific index
(not just at the end). Records an `addRow` undo action.

**`moveRow(tableIdx, fromIdx, toIdx)`** â€” moves a row from one index to
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
| 1 | `#menu-bar` | App title, ðŸ“‚ Open button, session banner |
| 2 | `#formula-bar` | `fx` label, expression input, Render button, live cell preview |
| 3 | `#toolbar` | + Row, â¬‡ Export \| graph filter \| search |
| 4 | `#tab-bar` | One tab per loaded CSV |
| 5 | `#workspace` | Only this scrolls â€” the active table lives here |
| 6 | `#status-bar` | `TableName â€” N rows Ã— M cols` |

**Key CSS rules:**
- `html, body { height: 100%; overflow: hidden }` â€” shell never scrolls
- `#workspace { flex: 1 1 0; overflow: auto }` â€” fills remaining height, scrolls
- `thead th { position: sticky; top: 0 }` â€” column headers stay visible while scrolling

---

### `TableView` changes

- Constructor signature changed: now accepts `tabStrip` as a separate
  parameter (the `#tab-strip` div inside `#tab-bar`) instead of creating
  its own tab strip inside the container
- Removed internal `tableArea` div â€” the container IS the table area
- Added `getActiveTableIdx(): number` â€” used by toolbar buttons in `main.ts`
- Added `setStatusCallback(cb)` â€” called after each render with a status
  string (`"TableName â€” N rows Ã— M cols"`)
- Per-row drag handle column (â ¿) added to editable tables â€” dragging a row
  calls `controller.moveRow()`
- Per-row insert button (+) added to row actions column â€” calls
  `controller.insertRow(tableIdx, rowIdx + 1)`
- The old per-table toolbar (Add Row / Export CSV buttons below each table)
  is removed â€” those actions moved to `#toolbar` in the HTML

---

### `GraphFilterView` changes

- Association detail panel is now appended to `document.body` instead of
  inside the table container â€” it floats over the workspace as a positioned
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

- `body { display: flex; flex-direction: column; overflow: hidden }` â€” shell layout
- `#menu-bar`, `#formula-bar`, `#toolbar`, `#tab-bar`, `#status-bar` â€” all
  `flex-shrink: 0` fixed chrome rows
- `#workspace { flex: 1 1 0; overflow: auto }` â€” only scrollable region
- `.tab-active { bottom: -2px; padding-bottom: 5px }` â€” active tab overlaps
  the tab bar border to appear connected to the table
- `.row-drag-handle` â€” grab cursor, braille dots glyph (â ¿)
- `.row-dragging { opacity: 0.35 }` â€” visual feedback during drag
- `.row-drag-over td { border-top: 2px solid #3b82f6 }` â€” drop target indicator
- `.col-rownum` â€” sticky row number column style (prepared, not yet wired)
- `thead th { position: sticky; top: 0; z-index: 2 }` â€” frozen header row
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
   spreadsheet behaviour â€” column names are always visible.

---

## Phase 9 â€” Geometry Syntax Plugin

---

### Implementation

**Added â€” `src/plugins/geometry/`**

New plugin directory with five files mirroring the math plugin structure:

| File | Role |
|------|------|
| `types.ts` | AST node interfaces â€” no logic, no imports except `MathNode` |
| `grammar.ts` | PEG grammar definition + exported `parser` instance + `parseGeometry()` |
| `build.ts` | *(intermediate, superseded â€” see refactoring below)* |
| `el.ts` | `svgEl()` and `svgText()` SVG element helpers |
| `render.ts` | `renderGeometry()` â€” AST â†’ SVG element |
| `index.ts` | Plugin entry point: `type_id: "geometry"`, `version: "1.0.0"` |

**Grammar design:**

The geometry grammar uses `PEGParser` with `skip: /^[ \t]+/` (spaces and tabs only â€” newlines are statement separators, not whitespace). The grammar structure:

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

`CallExpr` is a proper PEG sequence (name + `(` + ArgList + `)`) â€” not a raw string regex. By the time `build()` is called, it receives a fully structured `ParsedCall { name, args[] }`. `build()` only does a `switch(name)` and assembles the AST node â€” no string splitting, no re-parsing.

Math sub-expressions (coordinates, labels, measurements) are isolated by the PEG grammar and passed as raw strings to `build()`, which calls `mathParser.parse("Expression", span)` on the already-isolated text.

**AST node types** (all in `types.ts`):

`SystemDeclNode`, `PointDeclNode`, `SegmentExpr`, `LineExpr`, `RayExpr`, `ArrowNode`, `AngleExpr`, `ParallelNode`, `PerpendicularNode`, `IntersectionNode`, `MidpointNode`, `EqualityNode`, `TriangleNode`, `QuadrilateralNode`, `PolygonNode`, `CircleNode`, `EllipseNode`, `ArcNode`, `PlaneNode`, `HyperplaneNode`, `AxisDeclNode`, `OriginDeclNode`, `GraphNode`, `GeodesicNode`, `CurvatureNode`, `GeometryProgram`.

**Renderer** (`render.ts`):

SVG renderer with a 400Ã—300 internal viewport. Points with explicit coordinates are scaled to fit; remaining points are auto-laid-out in a circle. Draws all primitives as SVG elements. Imports `svgEl`/`svgText` from `el.ts`.

**Added â€” `src/plugins/registry.ts`**

`geometryPlugin` registered with `type_id: "geometry"`.

**Added â€” `native-math.css`**

Geometry diagram styles: `.geo-diagram`, `.geo-segment`, `.geo-line`, `.geo-ray`, `.geo-arrow`, `.geo-angle-arc`, `.geo-polygon`, `.geo-circle`, `.geo-ellipse`, `.geo-arc`, `.geo-point`, `.geo-label`, `.geo-tick`, `.geo-perp-mark`, `.geo-arrowhead`, `.geo-math-label`, `.geo-wrapper`.

**Added â€” `public/geometry-sample.csv`**

Sample CSV with `geometry` type column demonstrating right triangle, parallel lines, circle, and angle constructs.

**Added â€” `test/plugins/geometry/grammar.test.ts`**

25 tests covering all construct types, coordinate parsing, multi-statement programs, and comment/blank-line handling.

**Added â€” `vitest.config.ts`**

Added `cacheDir` pointing to `~/.vite-cache/Webapp` (Linux native filesystem) to avoid WSL DrvFs cache coherency issues with newly created directories.

---

### Refactoring â€” modular architecture matching math plugin

The initial `grammar.ts` was a monolith mixing the PEG grammar, build helpers (`splitArgs`, `callNameOf`, `innerOf`, `buildCall`, `buildAssign`, `parseGeoExpr`), and the public entry point. It was also using a single regex to capture entire `"Name(...)"` calls as raw strings, then re-parsing them inside `build()`.

**Refactored to match `src/plugins/math/` structure exactly:**

| File | Contents |
|------|----------|
| `types.ts` | AST node interfaces only |
| `grammar.ts` | PEG grammar + exported `parser` + `parseGeometry()` |
| `el.ts` | `svgEl()`, `svgText()` â€” mirrors `math/el.ts` |
| `render.ts` | Renderer only, imports from `el.ts` |
| `index.ts` | Plugin entry point |

The `build.ts` intermediate file (created during the first refactor pass) was superseded when the grammar was rewritten to parse structure properly â€” build helpers are now inline in `grammar.ts` as in the math plugin.

---

### Bug fixes

**Bug 1 â€” `BlankOrComment` matching empty string**

`BlankOrComment` regex `/^(?:#[^\n]*|\/\/[^\n]*|[ \t]*)/` used `*` (zero or more) for whitespace, so it matched empty string on every line. Since `Statement` tried `BlankOrComment` first (PEG ordered choice), it always succeeded with an empty match, leaving the real statement unconsumed. The parser then expected a newline or EOF and found the statement text instead.

Fix: reorder `Statement` choices to try `AssignStatement` and `CallStatement` before `BlankOrComment`, and change `[ \t]*` to `[ \t]+` so `BlankOrComment` only matches lines with actual whitespace or comment characters.

**Bug 2 â€” `build()` re-parsing raw strings**

The first grammar implementation captured `"Point(A,B,C)"` as a single regex string, then `build()` called `callNameOf()`, `innerOf()`, `splitArgs()` to re-parse it. This violated the architecture principle: `build()` should only assemble AST nodes from already-parsed data.

Fix: rewrote `CallExpr` as a proper PEG sequence `Name "(" ArgList ")"` with `ArgList` parsing individual arguments. `build()` now receives `{ name: "Point", args: ["A","B","C"] }` and only does `switch(name)` + node construction.

**Bug 3 â€” Formula bar dismissing cell focus on click**

The `document.addEventListener("click", () => tableView.cancelActive())` fired on every click including clicks on the formula bar textarea, committing and deactivating the active cell before the user could reposition the cursor.

Fix: added a `sourceInput.contains(e.target)` guard â€” clicks inside the formula bar are excluded from the cancel-active listener.

**Bug 4 â€” Alt+Enter causing blur instead of newline**

On Chromium-based browsers, pressing Alt+Enter on a `<textarea>` dispatches `blur` before `keydown` completes. The `blur` listener was firing and calling `commit()`, clearing the textarea.

Fix: added `suppressBlur` flag set to `true` at the start of the Alt+Enter handler. The `blur` listener checks `if (this.suppressBlur) return`. After inserting the newline, `requestAnimationFrame` resets the flag and re-focuses the textarea.

**Bug 5 â€” Session dismiss button not working**

`document.getElementById("dismiss-session")?.addEventListener(...)` was called after `sessionBanner.innerHTML = ...`. The button was found correctly, but the document-level click listener (`tableView.cancelActive()`) was also firing on the same click, potentially interfering. More critically, the listener was attached via `getElementById` which is fragile after `innerHTML` replacement.

Fix: replaced with event delegation on `sessionBanner` itself with `e.stopPropagation()` to prevent the click from bubbling to the document listener.

**Bug 6 â€” Formula result div rendering algebraic syntax for all cell types**

The formula bar previously had a `#result` div that rendered the formula bar content as a math expression on Enter. This caused geometry cells to be re-interpreted as algebraic syntax, producing incorrect renders.

Fix: removed `#result` div, all `mathPlugin`/`renderMath` imports, and the standalone renderer block from `main.ts`. The formula bar is now a pure source editor with no automatic rendering of its own content.

---

### Design decisions

1. **`skip: /^[ \t]+/` not `/^[ \t\r\n]+/`** â€” Geometry is a statement-list language where newlines are the statement separator. The math plugin skips all whitespace including newlines because it parses a single expression. Geometry must not skip newlines or the `Program` rule cannot detect statement boundaries.

2. **`CallExpr` as PEG sequence, not regex** â€” Capturing `"Name(...)"` as a raw string and re-parsing in `build()` duplicates the parser's job and produces fragile code. The PEG grammar parses the full structure; `build()` only assembles.

3. **`PointGroup` rule for `Circle((A,B,C),O)`** â€” The inner `(A,B,C)` is a group of point labels, not a math expression. A dedicated `PointGroup` rule (tried before `CallExpr` and `MathArg` in the `Arg` choice) handles this correctly without ambiguity.

4. **Math delegation in `build()`** â€” Math sub-expressions (coordinates, measurements) are captured as raw strings by `MathArg` and `RhsRaw`. `build()` calls `mathParser.parse("Expression", span)` on the already-isolated text. This is correct: the PEG grammar handles geometry structure; the math parser handles math content. The two parsers are composed at the `build()` boundary, not at the grammar level.

5. **`el.ts` for SVG helpers** â€” Mirrors `math/el.ts` for HTML helpers. Keeps `render.ts` focused on drawing logic, not element creation boilerplate.

---

## Phase 10 â€” Physics Free-Body Syntax Plugin

---

### Implementation

**Added â€” `src/plugins/physics/`**

| File | Role |
|------|------|
| `types.ts` | AST node interfaces â€” `BodyDeclNode`, `ForceNode`, `VelocityNode`, `AngularNode`, `TorqueNode`, `ConstraintNode`, `FrameDeclNode`, `InertialDeclNode`, `EOMNode`, `PhysicsProgram` |
| `grammar.ts` | PEG grammar + exported `parser` + `parsePhysics()` entry point |
| `render.ts` | `renderPhysics()` â€” extends geometry SVG renderer with physics overlay |
| `index.ts` | Plugin entry point: `type_id: "physics"`, `version: "1.0.0"` |

**Grammar design:**

Physics syntax is a superset of geometry syntax. A physics cell can freely mix geometry declarations (`Point`, `Segment`, `Triangle`) with physics statements (`Force`, `Body`, `Fixed`) on separate lines.

`parsePhysics()` partitions lines by keyword: lines whose leading keyword is in `PHYSICS_KEYWORDS` go to the physics PEG parser; all other lines go to `parseGeometry()`. Both parsers receive only non-empty lines (blank placeholders are filtered before joining). The result is a `PhysicsProgram { geoStatements, physStatements }` â€” the geometry base layer and physics overlay are kept separate.

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

**Added â€” `src/plugins/registry.ts`**

`physicsPlugin` registered with `type_id: "physics"`.

**Added â€” `native-math.css`**

Physics styles: force (red), velocity (blue), acceleration (orange), pin/hatch, roller, spring (purple), damper (cyan), string (dashed), body/force labels.

**Added â€” `public/physics-sample.csv`**

Three demo cells: block on surface, inclined plane with pin+roller, spring-mass system.

**Added â€” `test/plugins/physics/grammar.test.ts`**

14 tests covering all statement types and the mixed geometry+physics line partitioning.

---

### Bug fix â€” `loadCSV` crash on rows with wrong field count

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
This always produces exactly one cell per column. Extra fields in `rawRow` are silently ignored; missing fields default to `""`. This is the correct defensive approach â€” the model always has exactly one cell per column regardless of CSV field count.

**Also fixed:** `physics-sample.csv` Notes values had unquoted commas. Simplified to remove internal commas.

---

### Design decisions

1. **Line partitioning, not grammar composition** â€” Physics syntax is a superset of geometry. Rather than writing a single unified grammar that handles both, `parsePhysics()` partitions lines by keyword and delegates each partition to its own parser. This keeps both grammars simple and independent, and means geometry cells continue to work unchanged.

2. **`PhysicsProgram` holds both layers separately** â€” `geoStatements` and `physStatements` are kept in separate arrays. The renderer processes them in order: geometry base first, physics overlay second. This makes it easy to add or remove physics annotations without touching the geometry structure.

3. **Direction as raw string** â€” Force/velocity directions (`\d`, `\u`, `\r`, `\l`) are stored as raw identifier strings, not parsed as math expressions. The renderer maps them to unit vectors via `directionVector()`. This avoids the complexity of parsing backslash identifiers as math nodes just to extract a direction.

4. **Renderer reuses geometry SVG** â€” `renderPhysics()` calls `renderGeometry()` and appends physics elements to the same SVG element. This avoids duplicating the point layout and coordinate scaling logic.

---

## Phase 11 â€” Chemistry Reaction Syntax Plugin

---

### Implementation

**Added â€” `src/plugins/chemistry/`**

| File | Role |
|------|------|
| `types.ts` | AST node interfaces â€” `ChargeNode`, `IsotopeNode`, `ElementGroup`, `ParenGroup`, `BracketGroup`, `CompoundNode`, `ChargedSpeciesNode`, `ParticleNode`, `ReactionTerm`, `ReactionNode`, `ConditionNode`, `ThermoNode`, `AtomDeclNode`, `BondDeclNode`, `GroupDeclNode`, `ChemistryProgram` |
| `grammar.ts` | PEG grammar + exported `parser` instance + `parseChemistry()` entry point |
| `render.ts` | `renderChemistry()` â€” HTML/SVG renderer |
| `index.ts` | Plugin entry point: `type_id: "chemistry"`, `version: "1.0.0"` |

**Grammar design:**

The chemistry grammar uses `PEGParser` with `skip: /^[ \t]+/`. All structural
rules are expressed as PEG grammar entries with `build()` functions assembling
AST nodes. No string splitting or re-parsing inside `build()`.

Key atomicity decisions to prevent skip from firing inside compound notation:
- `ElementGroup` is a single atomic regex `/^(\^[0-9]+(_[0-9]+)?)?[A-Z][a-z]*[0-9]*/`
  capturing isotope prefix + symbol + count in one token â€” no skip can fire
  between the element letter and its subscript digit
- `ParenGroup` and `BracketGroup` capture their closing delimiter + count as
  one atomic regex (`/^\)[0-9]*/`, `/^\][0-9]*/`)
- `State` and `Charge` are single atomic regexes
- Optional `Coeff`, `State`, and `Charge` are handled by patching the grammar
  after definition â€” wrapping the regex in a `choice` with an empty sequence

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

- Reactions: horizontal layout â€” reactants, arrow (with conditions above), products
- Charges: `<sup>` with magnitude+sign (e.g. `2+`, `-`)
- Atom counts: `<sub>`
- Isotopes: stacked leading `<sup>`/`<sub>` for mass/atomic numbers
- State symbols: italic postfix `(s)`, `(l)`, `(g)`, `(aq)`
- Thermodynamic quantities: `Î”H = value` using math renderer for the value
- Structural formulas: text rows listing atom/bond/group declarations

**Added â€” `src/plugins/registry.ts`**

`chemistryPlugin` registered with `type_id: "chemistry"`.

**Added â€” `native-math.css`**

Chemistry styles: `.chem-program`, `.chem-reaction`, `.chem-side`, `.chem-term`,
`.chem-coeff`, `.chem-species`, `.chem-arrow-wrap`, `.chem-arrow`,
`.chem-conditions`, `.chem-state`, `.chem-isotope`, `.chem-isotope-scripts`,
`.chem-thermo`, `.chem-structural`, `.chem-struct-row`.

**Added â€” `public/chemistry-sample.csv`**

Ten demo rows covering: combustion, Haber process equilibrium with conditions,
ionic precipitation with charged species, nuclear fission with isotopes,
thermodynamic quantity, and structural formula declarations.

---

### Bug fixes

**Bug 1 â€” Missing types row in chemistry-sample.csv**

The CSV was missing the required second row declaring column types. Without
`text,text,chemistry` as row 1, the CSV parser treated the first data row as
the types row, dispatching all chemistry cells to the `text` plugin and
rendering them as plain source text.

Fix: added `text,text,chemistry` as the second row of `chemistry-sample.csv`.

**Bug 2 â€” Conditions delimiter mismatch**

The grammar `Conditions` rule used `"["` / `"]"` as delimiters, but the
study.md spec and sample CSV use `cond(...)` syntax. The parser failed with
`expected "["` when encountering `cond(T=450\deg,...)`.

Fix: changed `Conditions` to open with `"cond("` and close with `")"`.
Updated `CondValue` stop regex from `/^[^\],]+/` to `/^[^,)]+/` to match
the new closing delimiter.

---

### Design decisions

1. **PEGParser for all structural rules** â€” unlike the first implementation
   (which used a hand-written cursor-based parser), all grammar rules are
   expressed as PEG entries fed into `PEGParser`. `build()` functions only
   assemble AST nodes from already-parsed data. No string splitting or
   re-parsing inside `build()`.

2. **Atomic regexes for no-whitespace rules** â€” `ElementGroup`, `ParenGroup`
   closing, `BracketGroup` closing, `State`, and `Charge` are all single
   atomic regex tokens. This prevents the `skip` pattern from firing between
   an element symbol and its subscript count, which would be incorrect.

3. **Grammar patching for optional elements** â€” optional `Coeff`, `State`,
   and `Charge` are implemented by patching the grammar object after the
   initial definition, wrapping the regex in a `choice` with an empty
   sequence. This keeps the initial grammar definition readable while
   correctly handling the optional cases.

4. **`ParenGroup` disambiguation from `State`** â€” `ParenGroup` requires at
   least one `Group` inside, and `Group` requires starting with `[A-Z]`,
   `[`, or `^`. State symbols `(s)`, `(l)`, `(g)`, `(aq)` contain only
   lowercase letters, so `Group` fails on them, causing `ParenGroup` to
   fail, and the optional `State` choice matches instead. No explicit
   lookahead needed.

5. **`cond(...)` for conditions** â€” conditions use `cond(key=value, ...)` 
   syntax matching the study.md spec, not `[...]` brackets.

6. **Math delegation for thermo values and condition values** â€” `ThermoStmt`
   and `CondItem` values are captured as raw text by `LineRest` and
   `CondValue` rules, then passed to `mathParser.parse("Expression", span)`
   in `build()`. Same composition pattern as geometry and physics.

---

## Phase 12 â€” Control File & Map Views

---

### Implementation

**Added â€” `src/data/control.ts`**

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

**Added â€” `src/view/workspace-view.ts`**

Defines the `WorkspaceView` interface and `viewFactory()`. All workspace-level views (table and diagram) implement this interface: `mount(container, data, state?)`, `unmount(): ViewState`, `update(data)`.

**Added â€” `src/view/flow-diagram-view.ts`**

New file. `FlowDiagramView` implements `WorkspaceView`. Renders flow, spatial, relation, and sequence diagrams as SVG.

Layout algorithm:
- Tarjan SCC detects strongly-connected components (cycles)
- Cycle nodes are placed on a circle (polygon layout)
- Non-cycle nodes are placed in layered ranks above the circle via BFS
- Cycle edges use outward-bowing BÃ©zier arcs
- DAG edges use orthogonal routing (right-angle paths)
- Pan/zoom via mousedown/mousemove/wheel on a `<g>` transform

**Added â€” `src/view/table-view-adapter.ts`**

Wraps `TableView` to conform to `WorkspaceView`. Allows the tab-switching machinery to treat table tabs and diagram tabs uniformly.

**Added â€” `KnowledgeBase.diagrams`**

`src/model/KnowledgeBase.ts` gains `readonly diagrams: ResolvedDiagram[] = []`. No existing fields or methods change.

**Changed â€” `src/controller/index.ts`**

Added:
- `loadControlFile(jsonText)` â€” parses JSON text into a `ControlFile`
- `resolveAllDiagrams(controlFile, csvMap)` â€” resolves all diagram declarations against loaded CSV data, populates `kb.diagrams`
- `getDiagrams()` â€” returns `kb.diagrams`

**Changed â€” `src/main.ts`**

Rewritten to handle the Phase 12 loading flow:
- File input now accepts `.csv,.json`
- `loadFiles(files[])` reads all files in parallel via `Promise.all`
- Detects `control.json` in the batch
- **Control path**: parses control file, loads table-entry CSVs, resolves diagrams, builds tab strip from control file entries
- **Fallback path**: no `control.json` â†’ loads all CSVs as plain tables (backward compatible)
- `renderControlTabs(controlFile)` builds the tab strip; table tabs call `renderTableRows` directly (bypassing `renderAll` to avoid tab strip overwrite); diagram tabs mount a `FlowDiagramView`

**Changed â€” `index.html`**

File input `accept` attribute changed from `.csv` to `.csv,.json`.

**Added â€” `public/control.json`**

Sample control file with 6 entries: `theorems` (table), `glycolysis-table` (table), `glycolysis-map` (flow), `krebs-table` (table), `krebs-map` (flow), `metabolism-map` (flow with multiple node files).

**Added â€” `public/krebs-nodes.csv`**

18 nodes: 9 compounds (Acetyl-CoA, Oxaloacetate, Citrate, Isocitrate, Î±-Ketoglutarate, Succinyl-CoA, Succinate, Fumarate, Malate) + 8 enzymes + PDH (Pyruvate dehydrogenase, the entry-point enzyme).

**Added â€” `public/krebs-edges.csv`**

19 edges encoding the full Krebs cycle. Entry: `Pyruvate â†’ PDH â†’ AcCoA`. Cycle closes: `MDH â†’ OAA â†’ CS`.

**Added â€” `public/metabolism-edges.csv`**

Combined glycolysis + Krebs edges in one file. `Pyruvate` is the shared linking node between the two pathways.

---

### Bug fixes

**Bug 1 â€” `erasableSyntaxOnly` error in `FlowDiagramView`**

Constructor parameter shorthand `constructor(private readonly viewType: string)` is forbidden by `erasableSyntaxOnly`. Fixed by declaring the field explicitly above the constructor and assigning in the body.

**Bug 2 â€” Infinite BFS loop on cyclic graphs**

The BFS rank assignment in `layeredLayout` re-enqueued nodes every time a longer path was found (`r + 1 > cur`). In a cycle (`Pyruvate â†’ PK â†’ Pyruvate`), this caused unbounded queue growth until `RangeError: Invalid array length`. Fixed by adding an `enqueued` Set â€” each node is pushed onto the queue at most once.

**Bug 3 â€” Tab strip overwritten on table tab click**

Clicking a table tab called `tableView.renderAll()`, which internally calls `renderTabStrip()` â€” this does `tabStrip.innerHTML = ""` and rebuilds the strip with one tab per raw CSV table, wiping out the control-file-driven tabs. Fixed by calling `renderTableRows()` directly instead of `renderAll()`, so only the table body is rendered and the tab strip is left untouched.

---

### Design decisions

1. **Two maps + one combined map, not one merged map.** Glycolysis and Krebs are distinct pathways. Forcing them into one map produces an unreadable diagram at scale. The control file's `nodes: [...]` array syntax merges both node files into `metabolism-map` for the linked overview, while `glycolysis-map` and `krebs-map` remain independent.

2. **`renderTableRows` instead of `renderAll` for control-file table tabs.** `renderAll` rebuilds the tab strip as a side effect. In control-file mode the tab strip is owned by `renderControlTabs`, not by `TableView`. Calling `renderTableRows` directly renders only the table body, leaving the tab strip untouched.

3. **Tarjan SCC for cycle detection.** Tarjan's algorithm finds all strongly-connected components in O(V+E). The largest SCC is the main cycle. This correctly handles both purely cyclic graphs (Krebs) and graphs with a linear prefix feeding into a cycle (glycolysis â†’ Krebs in the metabolism map).

4. **Circular layout for cycle nodes, layered layout for DAG nodes.** Cycle nodes are placed on a circle ordered by traversal. Non-cycle nodes are placed in BFS ranks above the circle. This produces the correct visual shape for both pathway types without any manual coordinate specification.

5. **Radius formula uses total perimeter, not max node width.** The old formula `(maxNodeW + gap) Ã— n / 2Ï€` used the widest node for every slot, inflating the ring for graphs with one long label. The correct formula sums all node widths plus gaps and divides by 2Ï€ â€” the ring circumference equals the total perimeter needed.

6. **BÃ©zier arcs for cycle edges, orthogonal paths for DAG edges.** Cycle edges bow outward from the circle centre using a quadratic BÃ©zier with a control point pushed away from the centre. DAG edges use right-angle routing (vertical â†’ horizontal jog â†’ vertical). This visually distinguishes the two edge types and prevents cycle edges from cutting through the ring interior.

---

## Phase 12 â€” Post-mortem & Technical Debt Record

*Written at end-of-session. Records what was completed, what was left broken,
what needs refactoring, and what future phases must address.*

---

### What was completed

- `src/data/control.ts` â€” fully implemented and type-correct after the
  `as unknown as NodeMapping` cast fix
- `src/view/flow-diagram-view.ts` â€” fully implemented: Tarjan SCC, circular
  layout for cycles, layered BFS layout for DAG nodes, orthogonal edge routing,
  BÃ©zier arc routing for cycle edges, pan/zoom
- `src/view/workspace-view.ts` â€” `WorkspaceView` interface and `viewFactory`
  defined; `editBar`/`editPreview` stale parameters removed
- `src/view/table-view-adapter.ts` â€” constructor fixed to match current
  `TableView(container, tabStrip, sourceInput)` 3-argument signature
- `src/main.ts` â€” Phase 12 loading flow: `Promise.all` batch read, control.json
  detection, `renderControlTabs`, fallback path
- `public/control.json`, `krebs-nodes.csv`, `krebs-edges.csv`,
  `metabolism-edges.csv` â€” sample data for glycolysis, Krebs, and combined map
- All four documentation files updated

---

### What was left broken or incomplete

**1. `TableView.renderTableRows` is private â€” called via `(tableView as any)`**

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
This is fragile â€” if `TableView` is refactored, this silently breaks.
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
`main.ts` does not use `viewFactory` at all â€” it directly instantiates
`TableView` and `FlowDiagramView` separately. `TableViewAdapter` was
written for a future unified tab-switching architecture that was not
completed in Phase 12. It currently has no callers.

**5. `src/ui/` legacy layer is dead code**

`src/ui/file-loader.ts`, `src/ui/graph-filter.ts`, `src/ui/table.ts`,
`src/ui/expression-input.ts` are kept for backward test compatibility but
are not used by `main.ts`. They are dead code in the running application.

---

### Refactoring needed â€” the table/graph entanglement

The core architectural problem is that `TableView` has two responsibilities
that should be separate:

1. **Tab strip management** â€” which tabs exist, which is active, switching
   between them. This is currently done inside `renderAll()` â†’ `renderTabStrip()`,
   which means `TableView` owns the tab strip. But in Phase 12, `main.ts`
   also needs to own the tab strip (to add diagram tabs). The result is two
   competing owners of the same DOM element.

2. **Table body rendering** â€” rendering a single `Table` object as an HTML
   `<table>` with sortable columns, editable cells, drag handles, and row
   actions. This is the core job of `TableView` and should be its only job.

**The correct refactoring:**

```
TabStripController          â€” owns #tab-strip, manages tab buttons,
                              fires onTabChange(entryId) callbacks
                              knows nothing about tables or diagrams

WorkspaceController         â€” owns #workspace, holds the active WorkspaceView,
                              calls mount/unmount on tab change,
                              dispatches to TableView or FlowDiagramView

TableView                   â€” renders ONE table into a container
                              no tab strip, no tab switching
                              public renderTable(table, tableIdx): void
                              public setContainer(el): void

FlowDiagramView             â€” renders ONE diagram into a container
                              already correct â€” no tab strip involvement

AppController               â€” model operations only (loadCSV, editCell, etc.)
                              no view references except callbacks
```

This separation means:
- `TableView` never touches the tab strip
- `FlowDiagramView` never touches the tab strip
- `TabStripController` never touches table or diagram content
- `WorkspaceController` is the single coordinator

---

### Future phases â€” diagram types beyond flow graphs

The current `FlowDiagramView` handles directed graphs (flow, spatial,
relation) and sequence diagrams. These cover reaction pathways and UML.
They do not cover biological diagrams where the visual representation is
spatial and pictorial rather than topological.

**The electron transport chain problem:**

The electron transport chain cannot be represented as a flow graph because:
- Proteins (Complex I, II, III, IV, ATP synthase) are not abstract nodes â€”
  they are spatial blobs with specific shapes embedded in a membrane
- The inner mitochondrial membrane is a physical boundary that must be
  rendered as a layered structure (matrix side vs intermembrane space)
- Electron carriers (NADH, FADHâ‚‚, ubiquinone, cytochrome c) move between
  proteins in specific spatial directions
- Proton gradients are directional flows across the membrane, not graph edges
- The visual convention is a cross-section diagram, not a node-edge graph

This class of diagram â€” **spatial biology diagrams** â€” requires a different
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
- `WorkspaceView` interface is generic â€” any new view type implements it
- `viewFactory` adds one `case "biology":` line
- `control.json` adds `"view": "biology"` as a new entry type
- The biology renderer is a new file `src/view/biology-diagram-view.ts`
- No existing code changes

**Other diagram types in the same category:**
- Signal transduction pathways (receptor â†’ cascade â†’ transcription factor)
  â€” partially representable as flow graphs but benefit from spatial membrane context
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

---

## Phase 12 â€” Table Encapsulation Refactoring

*Intermediate refactoring between Phase 12 (Control File & Map Views) and
Phase 13 (File System Access). No new user-visible features. Addresses
technical debt identified in the Phase 12 post-mortem.*

---

### Motivation

The controller was doing table work that belongs in `Table`. Specifically:

- `loadCSV` constructed `Column`, `Row`, and `Cell` objects directly â€”
  the controller knew the internal structure of the model
- `editCell`, `addRow`, `insertRow`, `moveRow`, `deleteRow`, `undo`, `redo`
  all accessed `table.rows[i]`, `table.rows.splice(...)`, `table.rows.push(...)`,
  and `cell.value =` directly â€” bypassing the `Table` class entirely
- `KnowledgeBase.exportTableAsCSV` accessed `r.cells.map(c => c.value)` â€”
  CSV serialisation logic lived outside the class that owns the data
- The search engine accessed `row.cells[i].typeId` and `row.cells[i].value`
  directly instead of going through `Table`

The principle violated: **table logic should live in `Table`**. The controller
should only orchestrate â€” it should not know how rows are stored, how cells
are constructed, or how CSV is serialised.

---

### Changes â€” `src/model/Table.ts`

**Added `static fromCSV(name, parsed): Table`**

Factory method. Constructs `Column`, `Row`, and `Cell` objects from parsed
CSV data. The controller no longer imports or instantiates these classes.

**Added `createEmptyRow(): Row`**

Creates a blank row matching the table's column schema. Used internally by
`appendRow` and `insertRowAt`.

**Added row mutation methods:**
- `appendRow(): Row` â€” appends and returns a new empty row
- `insertRowAt(idx): Row` â€” inserts and returns a new empty row at index
- `removeRowAt(idx): Row` â€” removes and returns the row at index
- `moveRowFromTo(fromIdx, toIdx): void` â€” moves a row
- `restoreRowAt(idx, row): void` â€” restores a previously removed row (for undo)

**Added cell access methods:**
- `getCellValue(rowIdx, colIdx): string` â€” safe read, returns `""` if out of bounds
- `setCellValue(rowIdx, colIdx, value): void` â€” safe write, no-op if out of bounds

**Added `toCSV(): string`**

Serialises the table to CSV text (header row, types row, data rows). Moved
from `KnowledgeBase.exportTableAsCSV`. Uses `getCellValue` internally â€”
no direct `cell.value` access.

---

### Changes â€” `src/controller/index.ts`

- Removed `Column`, `Row`, `Cell` imports â€” no longer needed
- `loadCSV` â†’ `Table.fromCSV(name, parsed)` â€” one line
- `editCell` â†’ `table.getCellValue` + `table.setCellValue`
- `addRow` â†’ `table.appendRow()`
- `insertRow` â†’ `table.insertRowAt(atIdx)`
- `moveRow` â†’ `table.moveRowFromTo(fromIdx, toIdx)`
- `deleteRow` â†’ `table.removeRowAt(rowIdx)`
- `undo` / `redo` â†’ all use `Table` methods; no direct `rows`/`cells` access
- `addRow` undo: finds the row by reference via `table.rows.lastIndexOf(action.row)`
  rather than always popping the last row â€” correct for both `addRow` and `insertRow`

---

### Changes â€” `src/model/KnowledgeBase.ts`

- `addTable`: uses `table.getCellValue(rowIdx, assocColIdx)` instead of
  `r.getCellValue(assocColIdx)` â€” consistent with the new Table API
- `exportTableAsCSV`: delegates to `table.toCSV()` â€” one line

---

### Changes â€” `src/search/index.ts`

- `searchText`: iterates `table.columns` for `typeId` and calls
  `table.getCellValue(rowIdx, colIdx)` instead of `row.cells[i].typeId`
  and `row.cells[i].value`
- `searchByIdentifier`: same pattern
- Removed `Table` and `Row` type imports â€” no longer needed directly

---

### Changes â€” `src/view/table-view.ts`

**Added public methods to fix `(x as any)` casts:**
- `getController(): AppController | null` â€” replaces `(tableView as any).controller`
- `getSortState(): { sortCol, sortAsc }` â€” replaces `(tableView as any).sortCol`
- `setContainer(el: HTMLElement): void` â€” replaces `(tableView as any).container = el`
- `renderTable(tableIdx: number): void` â€” renders only the table body without
  touching the tab strip; replaces `(tableView as any).renderTableRows(...)`

**Promoted `sortCol` and `sortAsc` to instance fields** (were closure-local
variables inside `renderTableRows`, unreachable from outside).

---

### Changes â€” `src/view/table-view-adapter.ts`

Rewritten to use only the public `TableView` API â€” no `(x as any)` casts:
- `mount`: calls `tableView.setContainer(container)` instead of field mutation
- `unmount`: calls `tableView.getSortState()` to save sort state
- `update`: calls `tableView.getController()?.getKnowledgeBase()` to get tables

---

### Changes â€” `src/main.ts`

- `renderControlTabs` table tab handler: calls `tableView.renderTable(tableIdx)`
  instead of `(tableView as any).renderTableRows(table, table.rows, tableIdx)`

---

### Design decisions

1. **`Table` owns all row/cell mutation** â€” the controller never touches
   `table.rows[i]` or `cell.value` directly. All mutations go through named
   methods with clear semantics.

2. **`Table.fromCSV` is the single construction point** â€” `Column`, `Row`,
   and `Cell` are no longer imported by the controller. The controller only
   knows about `Table` and `KnowledgeBase`.

3. **`toCSV` belongs on `Table`** â€” CSV serialisation is a function of the
   table's data. It belongs with the data, not in a container class.

4. **`getCellValue`/`setCellValue` are safe by design** â€” both return/no-op
   gracefully on out-of-bounds access. The controller never needs to guard
   against undefined cells.

5. **No `(x as any)` casts remain** â€” all cross-class access uses the public
   API. TypeScript enforces the interface at compile time.

---


---


---

## Phase 13 — Graph as a First-Class Model (planning decision)

*Recorded after Phase 12 session. No implementation yet.*

---

### Decision: `Graph` is a co-equal model class alongside `Table`

**Problem identified:** The Phase 12 model has an implicit assumption that
everything is a table. `KnowledgeBase` holds `tables: Table[]` as the
primary data and `diagrams: ResolvedDiagram[]` as a derived rendering layer
computed from tables at load time. A diagram is not a model object — it is
a view declaration over table data. This is architecturally wrong.

A biochemistry pathway is not a table that happens to be rendered as a
graph. It *is* a graph. Its natural representation is nodes and edges, not
rows and columns. Forcing it through the table model and then deriving a
rendering declaration from it adds an unnecessary indirection layer.

**Resolution:** Introduce `Graph` as a co-equal model class. `KnowledgeBase`
holds both `tables: Table[]` and `graphs: Graph[]`. A `.graph.json` file
loads directly into a `Graph` object, the same way a `.csv` file loads into
a `Table` object. `ResolvedDiagram[]` is removed from `KnowledgeBase`.

**`TypedValue` is the shared primitive, not `Cell`:**

`Cell` is a table-specific concept — it implies a position in a grid
(row x column). A graph node property is not a cell. The shared primitive
is `TypedValue`: a value string plus a `typeId` that tells the plugin system
how to render it. `Cell` is a table-specific subclass of `TypedValue`.
`GraphNode.properties` and `GraphEdge.properties` hold `TypedValue` objects
directly — without the table-specific `Cell` wrapper.

**What is shared between Table and Graph:**
- `TypedValue` — the primitive: `{ value: string, typeId: string }`. `Row`
  wraps these as `Cell[]`; `GraphNode.properties` holds them directly as
  `Map<string, TypedValue>`. The plugin system renders both via the same
  `renderTypedValue(typeId, value)` call.
- `AssociationGraph` — both table rows and graph nodes can have `_associations`
- `EditHistory` — same mechanism, extended with graph-specific action types
- Search engine — scans both `tables` and `graphs`

**What is separate:**
- Data structure: `Row[]` vs `GraphNode[]` + `GraphEdge[]`
- Property container: `Cell` (TypedValue at a row/column position) vs
  `TypedValue` directly in `Map<string, TypedValue>`
- Mutation API: `appendRow/removeRowAt` vs `addNode/removeNode/addEdge/removeEdge`
- Serialisation: `toCSV()` vs `toGraphJSON()`
- View: `TableView` vs `FlowDiagramView`
- File format: `.csv` vs `.graph.json`

**Phase numbering:** 13 = Graph as First-Class Model, 14 = File System
Access, 15 = Semantic Layer, 16 = Stable Identity, 17 = Native Format.

---

## Phase 13 — Graph as a First-Class Model

---

### Implementation

**Added — `src/model/TypedValue.ts`**

New base class: `{ value: string, typeId: string }`. The shared primitive
between the table and graph layers. No position, no container context.

**Refactored — `src/model/Cell.ts`**

`Cell extends TypedValue` with no extra fields. All existing code that
uses `Cell` continues to work unchanged. The only semantic change is that
`Cell` now explicitly declares itself as a table-specific typed value.

**Added — `src/model/GraphNode.ts`**

`GraphNode { id, properties: Map<string, TypedValue> }`. Convenience
getters `label` and `type` read from the properties map, falling back to
`id` and `""` respectively.

**Added — `src/model/GraphEdge.ts`**

`GraphEdge { id, from, to, properties: Map<string, TypedValue> }`.
Convenience getters `type` and `label` read from properties.

**Added — `src/model/Graph.ts`**

`Graph` — the co-equal model class alongside `Table`:
- `static fromGraphJSON(name, json): Graph` — parses a `.graph.json` file.
  String property values are stored as `TypedValue(v, "text")`. Object
  property values `{ value, typeId }` are stored as `TypedValue(value, typeId)`.
- `toGraphJSON(): string` — serialises back to JSON. String-typed properties
  are written as plain strings; other types as `{ value, typeId }` objects.
- `addNode`, `removeNode`, `addEdge`, `removeEdge` — mutation API parallel
  to `Table`'s row mutation API.
- `getEdgesFrom`, `getEdgesTo` — query methods.
- `nodeStyles`, `edgeStyles`, `layout` — diagram presentation metadata.

**Changed — `src/model/KnowledgeBase.ts`**

- Added `readonly graphs: Graph[] = []`
- Added `addGraph(graph): void`
- Removed `readonly diagrams: ResolvedDiagram[]` — was a rendering artifact,
  not a model object. `Graph[]` replaces it as the proper model.
- `clear()` now also clears `graphs`

**Changed — `src/model/EditHistory.ts`**

`EditAction` union extended with four graph action types:
`addNode | removeNode | addEdge | removeEdge`.

**Changed — `src/model/index.ts`**

Exports `TypedValue`, `GraphNode`, `GraphEdge`, `Graph`, `GraphViewType`.

**Changed — `src/controller/index.ts`**

- Added `loadGraph(fileName, jsonText)` — parses `.graph.json` via
  `Graph.fromGraphJSON`, calls `kb.addGraph()`
- Added `getGraphs(): Graph[]`
- Added `addNode`, `removeNode`, `addEdge`, `removeEdge` — thin delegators
  with undo/redo recording
- Added `exportGraph(graphIdx): string` — delegates to `graph.toGraphJSON()`
- `resolveAllDiagrams` now produces `Graph` objects via `kb.addGraph()`
  instead of pushing to `kb.diagrams`
- Removed `getDiagrams()` — replaced by `getGraphs()`
- Undo/redo extended to handle all four graph action types

**Changed — `src/data/control.ts`**

- Added `GraphFileDecl { id, view: "graph", file }` interface
- `ControlEntry` union extended with `GraphFileDecl`
- `parseEntry` handles `view === "graph"` — returns a `GraphFileDecl`

**Changed — `src/view/workspace-view.ts`**

- `WorkspaceData.diagram?: ResolvedDiagram` replaced by `WorkspaceData.graph?: Graph`
- Removed `ResolvedDiagram` import from `control.ts`

**Changed — `src/view/flow-diagram-view.ts`**

- Added local adapter interfaces `RNode`, `REdge`, `RActor`, `RMessage`
  replacing the imported `ResolvedNode`, `ResolvedEdge`, `ResolvedActor`,
  `ResolvedMessage` from `control.ts`
- Added `graphToNodes`, `graphToEdges`, `graphToActors`, `graphToMessages`
  adapter functions — convert a `Graph` to the shapes the internal rendering
  functions expect
- All internal function signatures updated to use local `RNode`/`REdge` types
- `render()` reads from `this.currentData.graph` instead of
  `this.currentData.diagram`

**Changed — `src/main.ts`**

- New loading path: if `.graph.json` files are dropped (without `control.json`),
  each is loaded via `controller.loadGraph()` and a tab is created per graph
- `renderGraphTabs()` — builds the tab strip from `controller.getGraphs()`
- `renderControlTabs()` — updated to look up graphs by `entry.id` via
  `controller.getGraphs().find(g => g.name === entry.id)` instead of
  `controller.getDiagrams()`
- File picker `accept` attribute updated to include `.graph.json`

**Added — `public/glycolysis.graph.json`**

Complete glycolysis pathway as a self-contained graph file: 14 nodes
(7 compounds + 7 enzymes), 15 edges, nodeStyles, edgeStyles.

**Added — `public/krebs.graph.json`**

Complete Krebs cycle as a self-contained graph file: 19 nodes
(10 compounds + 9 enzymes), 19 edges.

**Added — `public/metabolism.graph.json`**

Combined glycolysis + Krebs as a self-contained graph file: 32 nodes,
34 edges.

**Changed — `public/control.json`**

Diagram entries updated from `view: "flow"` with CSV edge references to
`view: "graph"` with `.graph.json` file references. Table entries unchanged.

**Added — `test/model/graph.test.ts`**

28 tests covering: `TypedValue`/`Cell` inheritance, `GraphNode`/`GraphEdge`
property access, `Graph.fromGraphJSON` (valid, typed properties, auto-ids,
error cases), `Graph.toGraphJSON` round-trip, all mutation methods
(`addNode`, `removeNode`, `addEdge`, `removeEdge`, `getEdgesFrom`,
`getEdgesTo`), `KnowledgeBase.addGraph` and `clear`.

---

### Design decisions

1. **`TypedValue` is the shared primitive, not `Cell`.** `Cell` is a
   table-specific concept implying a position in a grid. Graph node
   properties are not cells. `TypedValue` has no spatial connotation —
   it is just a value string plus a rendering type. `Cell extends TypedValue`
   with no extra fields, so all existing code is unchanged.

2. **`Graph` is co-equal with `Table` in `KnowledgeBase`.** `diagrams:
   ResolvedDiagram[]` was a rendering artifact derived from tables at load
   time. `graphs: Graph[]` is a proper model layer — loaded from `.graph.json`
   files directly, the same way tables are loaded from `.csv` files.

3. **`.graph.json` is self-contained.** No `control.json` needed to interpret
   it. Dropping a `.graph.json` file directly produces a diagram tab. The
   `control.json` `view: "graph"` entry type is a directory index pointing
   to a `.graph.json` file.

4. **Backward compatibility preserved.** The legacy `control.json` + CSV
   edges approach still works. `resolveAllDiagrams` now produces `Graph`
   objects instead of `ResolvedDiagram` objects, but the calling code in
   `main.ts` is updated accordingly. All existing CSV files are unchanged.

5. **`FlowDiagramView` is unchanged in rendering logic.** Only the data
   source changes — from `ResolvedDiagram` to `Graph` via thin adapter
   functions. The Tarjan SCC, circular layout, Bézier arcs, and orthogonal
   routing are identical.

---

## Phase 13 — View Layer Refactoring

*Intermediate refactoring. No new user-visible features. Addresses the
architectural problems identified in the view layer analysis.*

---

### Motivation

Three problems were identified:

1. **`main.ts` contained view logic.** `document.addEventListener("keydown", ...)`,
   toolbar button handlers, file loading, drag-drop, session banner, and all
   tab switching logic lived in the startup file. `main.ts` should only
   instantiate layers and wire them together.

2. **Tab switching was duplicated.** `renderControlTabs` and `renderGraphTabs`
   were two separate functions in `main.ts` that duplicated the same
   mount/unmount/state-save logic. Every new loading path would require a
   third function.

3. **`TableView` did not implement `WorkspaceView`.** `TableViewAdapter`
   existed only to bridge `TableView` into the `WorkspaceView` interface.
   It was a workaround, not a design.

---

### Changes

**Added `src/view/workspace-controller.ts`**

`WorkspaceController` owns the tab strip and all view dispatch logic:
- `registerTab(id, view, data)` — adds a tab button and stores the entry
- `activateTab(id)` — saves state of current view via `unmount()`, mounts
  the new view with any previously saved state
- `activateFirst()` — activates the first registered tab
- `clear()` — unmounts active view, clears all tabs and saved states
- `getActiveTableView()` — returns the active view if it is a `TableView`,
  otherwise null (used by toolbar buttons and the cancel-active-cell handler)

**Added `src/view/app-shell.ts`**

`AppShell` owns all application-level event wiring:
- `wireKeyboard()` — Ctrl+Z/Y undo/redo; document click to cancel active cell
- `wireToolbar()` — Add Row and Export CSV button handlers
- `wireFileLoading()` — file input change, drag-over, drop
- `wireSessionBanner()` — session restore banner
- `loadFiles()` — reads all dropped files, dispatches to `loadControlBatch`
  or `loadPlainBatch`, calls `registerAllTabs()`
- `registerAllTabs()` — iterates `kb.graphs` then `kb.tables`, calls
  `viewFactory` for each, registers with `WorkspaceController`

**Changed `src/view/table-view.ts`**

`TableView` now implements `WorkspaceView` directly:
- `mount(container, data, state?)` — sets container, restores sort state
  and scroll position from saved state, renders the table
- `unmount(): ViewState` — cancels any active cell edit, returns
  `{ scrollTop, scrollLeft, sortCol, sortAsc }`
- `update(data)` — re-renders when data changes while mounted

**Changed `src/view/workspace-view.ts`**

`viewFactory` now dispatches on model type (`Table | Graph`) instead of
on a control file entry view string:
- `model instanceof Table` → creates `TableView`, sets controller and
  entity click handler
- otherwise → creates `FlowDiagramView(graph.viewType)`

**Changed `src/controller/index.ts`**

- Removed `tableView: TableView` field and `setTableView()` method
- Added `workspaceController: WorkspaceController` field and
  `setWorkspaceController()` method
- Added `entityClickHandler` field, `setEntityClickHandler()`,
  `getEntityClickHandler()` — allows `viewFactory` to apply the handler
  to each `TableView` at registration time
- `filterByRelation` and `showAll` now call
  `this.workspaceController?.getActiveTableView()` instead of holding a
  direct `TableView` reference

**Rewritten `src/main.ts`**

Pure startup wiring — no logic:
1. Get DOM references
2. Instantiate `AppController`
3. Instantiate toolbar views (`GraphFilterView`, `SearchView`)
4. Instantiate `WorkspaceController`, wire to controller
5. Set entity click handler on controller
6. Instantiate `AppShell`, call `shell.init()`

**Deleted `src/view/table-view-adapter.ts`**

No longer needed. `TableView` implements `WorkspaceView` directly.

---

### Design decisions

1. **`AppShell` receives `AppController` and `WorkspaceController` as
   constructor fields.** It knows both but neither knows it. The view
   layer knows the controller; the controller does not know the view layer
   (except through the `WorkspaceController` reference needed for
   `showAll`/`filterByRelation`).

2. **`viewFactory` dispatches on model type, not on string.** The previous
   `switch (entry.view)` was fragile — adding a new view type required
   updating the switch. Dispatching on `instanceof Table` vs `Graph` is
   closed to extension: new model types get new branches, existing ones
   are unchanged.

3. **`WorkspaceController.getActiveTableView()` uses duck-typing.** It
   checks `typeof view.getActiveTableIdx === "function"` rather than
   `view instanceof TableView`. This avoids a circular import between
   `WorkspaceController` and `TableView`.

4. **Entity click handler stored on controller.** `viewFactory` creates
   `TableView` instances inside `AppShell.registerAllTabs()`, after the
   handler is set on the controller. `viewFactory` reads it via
   `controller.getEntityClickHandler()` and applies it to each new
   `TableView`. This avoids passing the handler as a parameter through
   multiple layers.

---

## Post-Phase 13 — Graph Editing, Dynamic Toolbar & Bug Fixes

*A series of incremental improvements made after the Phase 13 view layer
refactoring. No phase number assigned — these are refinements to the
existing Phase 13 architecture.*

---

### Dynamic toolbar

**Problem:** The toolbar had a hardcoded `+ Row` button and a hardcoded
`Export` button. Graph tabs had no toolbar actions at all. Adding new
view-specific actions required editing `index.html` and `AppShell`.

**Solution:** Split the toolbar into two sections:

- `#dynamic-toolbar` — empty `<div>` populated at runtime from the active
  view's `getToolbarActions()` result. Rebuilt on every tab switch and
  after every action that changes selection state.
- `#static-toolbar` — contains only the Export button, which is common
  to all views.

**Interface additions:**

```ts
interface ToolbarAction {
    id: string;
    label: string;
    title?: string;
    disabled?: boolean;
}

interface WorkspaceView {
    getToolbarActions(): ToolbarAction[];
    onToolbarAction(id: string): void;
}
```

`TableView` returns `[{ id: "add-row", label: "+ Row" }]`.
`FlowDiagramView` returns graph-specific actions (see below).

`WorkspaceController.activateTab` fires `onToolbarChange(actions, view)`
after mounting. `AppShell.wireDynamicToolbar` registers this callback and
rebuilds `#dynamic-toolbar` from the action descriptors. Each button calls
`view.onToolbarAction(id)` and then calls `rebuild()` to refresh disabled
states immediately.

---

### Graph editing operations

**Added to `FlowDiagramView`:**

| Action | Behaviour |
|--------|-----------|
| `+ Node` | Generates a unique id (`node-1`, `node-2`, ...), calls `controller.addNode()`, immediately enters inline label edit on the new node |
| `+ Edge` / `Cancel Edge` | Toggles edge-draw mode. In edge-draw mode, first node click sets source (highlighted), second click creates the edge. Button label changes to "Cancel Edge" while in mode. |
| `Delete` | Deletes the selected node (with all its edges) or the selected edge. Label changes dynamically: "Delete Node", "Delete Edge", or disabled "Delete" depending on what is selected. |

**Double-click to edit node label:**

Double-clicking a node hides the SVG `<text>` label and inserts a
`<foreignObject>` containing an `<input>` sized to the node's bounding
box. Enter or blur commits the new label via `controller.editNodeLabel()`.
Escape cancels. The input is auto-focused and all text is selected.

**`controller.editNodeLabel(graphIdx, nodeId, newLabel)`** — new controller
method. Mutates the node's `label` TypedValue in-place. No undo recorded
for label edits (acceptable interim — the node itself is undoable).

**Edge selection:** Edges are clickable via a 10px-wide transparent hit
area overlaid on the visible path. Clicking an edge highlights it in blue
and enables the Delete button. Clicking a node clears edge selection and
vice versa — the two are mutually exclusive.

**`kbGraphIdx`** — `FlowDiagramView` resolves the real index of its graph
in `kb.graphs[]` at mount time, the same way `TableView` resolves
`kbTableIdx`. All controller calls use this index.

---

### Bug fix — Graph tabs disappear when editing a table cell

**Symptom:** Editing a cell in a table tab caused all graph tabs to
disappear from the tab strip.

**Root cause:** `controller.editCell()` called `showAll()` →
`workspaceController.getActiveTableView()?.renderAll(tables)` →
`TableView.renderAll()` → `renderTabStrip()` → `tabStrip.innerHTML = ""`
— wiping the entire tab strip and rebuilding it with only table tabs.

**Fix:** Removed `renderTabStrip()` and all `tabStrip.innerHTML` writes
from `TableView`. `showAll()` now calls `tv.renderTable(tv.getActiveTableIdx())`
which re-renders only the active table body. The tab strip is owned
exclusively by `WorkspaceController` and is never touched by `TableView`.

---

### Bug fix — Undo/redo operates on invisible tab

**Symptom:** Pressing Ctrl+Z while on tab B reversed an edit on tab A,
but the user remained on tab B and saw nothing change.

**Root cause:** `undo()` and `redo()` called `showAll()` which re-rendered
the active view regardless of which table the action affected.

**Fix:** `undo()` and `redo()` now call `navigateToTable(tableIdx)` or
`navigateToGraph(graphIdx)` after applying the mutation. If the target tab
is already active, only the table body is re-rendered (fast path). If a
different tab is active, `workspaceController.activateTab(name)` switches
to it — the mount re-renders automatically. This matches Excel's behaviour:
undo always navigates to the tab where the action occurred.

---

### Bug fix — Editing one sheet modifies another

**Symptom:** After editing a cell in sheet B, the edit appeared in sheet A.

**Root cause:** `viewFactory` creates a new `TableView` instance per tab.
Each instance starts with `activeTabIdx = 0`. `renderTableRows` passed
`this.activeTabIdx` (always `0`) as the `tableIdx` argument to
`controller.editCell(tableIdx, ...)`. The controller uses `tableIdx` as an
index into `kb.tables[]` — so every `TableView` always edited `kb.tables[0]`.

**Fix:** Added `kbTableIdx: number` field to `TableView`. In `mount()`,
it is resolved once:
```ts
this.kbTableIdx = kb.tables.indexOf(data.table);
```
All controller calls (`editCell`, `addRow`, `insertRow`, `moveRow`,
`deleteRow`) and `getActiveTableIdx()` now use `this.kbTableIdx` instead
of `this.activeTabIdx`.

---

### Bug fix — Scrollbars appear on diagram tabs

**Symptom:** SVG diagrams showed browser scrollbars even though they have
their own pan/zoom.

**Root cause:** `#workspace` has `overflow: auto` which applies to all
content including SVG. When the SVG is larger than the container,
scrollbars appear.

**Fix:** Added CSS class `workspace-diagram` that sets `overflow: hidden`
on `#workspace`. `WorkspaceController.activateTab` toggles this class
based on `next.data.graph !== undefined` — diagram tabs get
`overflow: hidden`, table tabs get `overflow: auto` restored.

---

### Bug fix — Double-click on node canceled by preceding click

**Symptom:** Double-clicking a node to edit its label sometimes did nothing,
or the edit was immediately committed with the original value.

**Root cause:** `dblclick` fires after two `click` events. The first
`click` called `onNodeClick` → `render()` which destroyed and recreated
the entire SVG. The `dblclick` then fired on a stale DOM element that no
longer existed, so `onNodeDblClick` was never reached.

**Fix:** A 220ms timer on single-click. When `click` fires, it sets a
`setTimeout`. When `dblclick` fires within 220ms, it cancels the timer
before it fires — so `onNodeClick` never runs and `onNodeDblClick` runs
cleanly on the live DOM.

---

### Bug fix — Toolbar disabled state not updated after node/edge selection

**Symptom:** After clicking a node, the Delete button remained disabled.
After clicking an edge, "Delete Node" appeared enabled even though no node
was selected.

**Root cause:** `getToolbarActions()` was only called when a tab was
activated or a toolbar button was clicked. Clicking a node changed
`selectedNodeIds` and called `render()`, but the toolbar was never rebuilt.

**Fix:** `FlowDiagramView` stores a `toolbarRefresh` callback set by
`WorkspaceController` after mount. Every method that changes selection
(`onNodeClick`, `onToolbarAction`, edge click) calls
`this.toolbarRefresh?.()` after `render()`. `WorkspaceController` sets
the callback to `() => onToolbarChange(view.getToolbarActions(), view)`.

---

### Simplification — Single Delete button

**Problem:** Two separate "Delete Node" and "Delete Edge" buttons with
independent disabled states were confusing — both could appear enabled or
disabled in unexpected combinations.

**Solution:** One `Delete` button whose label and disabled state reflect
the current selection:
- Node selected → "Delete Node" (enabled)
- Edge selected → "Delete Edge" (enabled)
- Nothing selected → "Delete" (disabled)

Node and edge selection are mutually exclusive (selecting one clears the
other), so there is never ambiguity about what will be deleted.

---

### `WorkspaceController.getActiveId()`

Added `getActiveId(): string | null` — returns the id of the currently
active tab. Used by `navigateToTable` to check whether the target tab is
already active before deciding whether to switch or just re-render.

---

## Bug fix — Drop hint persists after file load; graph content distorted

**Symptom 1:** After loading files, the `#table-container` div retained its
`drop-hint` CSS class. The drop-hint class applies `display: flex`,
`align-items: center`, `justify-content: center`, and a dashed border.
SVG diagrams mounted into this container were centred and constrained by
the flex layout instead of filling the container, producing a distorted
and incorrectly positioned diagram.

**Symptom 2:** After reloading files (calling `workspace.clear()` then
registering new tabs), the drop hint text was not restored — the container
was left empty with no visual feedback.

**Root cause:** `WorkspaceController.activateTab` called
`this.container.innerHTML = ""` to clear content before mounting the new
view, but never cleared `this.container.className`. The `drop-hint` class
set in `index.html` persisted for the lifetime of the session.

`WorkspaceController.clear()` set `this.container.innerHTML = ""` but did
not restore the drop hint text or class, leaving the container blank.

**Fix — `activateTab`:**
```ts
this.container.innerHTML = "";
this.container.className = "";  // clear drop-hint and any other state classes
```

**Fix — `clear()`:**
```ts
this.container.innerHTML = "Drop .csv or .graph.json files here or use Open above";
this.container.className = "drop-hint";
this.container.parentElement?.classList.remove("workspace-diagram");
```

The `workspace-diagram` class (which suppresses scrollbars for diagram
tabs) is also removed on clear, so the workspace returns to its default
scrollable state when no files are loaded.

---

## Planned phases — Source Code Editor, Test Resources, and subsequent

*Recorded as planning decisions. No implementation yet.*

---

### Phase 14 — Source Code Editor Panel

**Problem:** The formula bar is a cell-level editor — it edits one cell at
a time. There is no way to write or view the raw source of an entire table
or graph in a structured text format, or to create new content by typing
a domain-specific syntax directly.

**Proposal:** A source code editor panel (collapsible, below the formula
bar or as a side panel) where the user can type raw source text and see it
parsed and rendered live. The editor supports multiple syntaxes dispatched
by a declared type header.

**Key constraint: always use `PEGParser` with a grammar data structure.**
Never write a manual parser for the editor. The `PEGParser` engine is
abstract and reusable — all existing plugins (math, chemistry, geometry,
physics) already use it. The editor must follow the same pattern: define
a grammar data structure, feed it to `PEGParser`, get an AST, render it.

This means:
- A "table source" syntax (if added) must be a PEG grammar, not a manual
  CSV-like parser
- A "graph source" syntax (if added) must be a PEG grammar
- Any new domain syntax must be a PEG grammar

The editor is not a replacement for the cell editor — it is a complement.
It operates at the document level (an entire table or graph), not the cell
level.

**Concrete design:**
- A `<textarea>` with syntax type selector (dropdown: math, chemistry,
  geometry, physics, table, graph, ...)
- Live parse-and-render on every keystroke (debounced)
- Parse errors shown inline with line/column information
- "Apply" button commits the parsed result to the model
- The existing `PEGParser` engine and all existing plugin grammars are
  reused without modification

---

### Phase 15 — Test Resource Rectification

**Problem:** The `testresources/` directory contains ~60 CSV files across
6 domains (Mathematics, Chemistry, Biology, Biochemistry, Hardware,
Software). These files are the primary real-world knowledge data for the
application. However, they currently do not load correctly because:

1. **Missing types row.** The CSV convention requires row 1 to be a types
   row declaring the plugin type for each column (`text`, `math`,
   `chemistry`, etc.). All test resource files are missing this row. The
   app treats the first data row as the types row, dispatching all cells
   to wrong plugins and rendering everything as plain text.

2. **Math syntax in content columns.** Many cells contain math syntax
   expressions (`\\sqrt`, `\\int`, `\\S{...}`, `\\D`, etc.) that should
   be rendered by the math plugin, but are currently rendered as raw text
   because the types row is absent.

3. **Chemistry syntax in chemistry files.** The organic chemistry file
   contains compound names and reaction data that could be rendered by
   the chemistry plugin.

4. **No `control.json`.** Each domain folder is a standalone collection
   of CSV files with no `control.json` to declare how they should be
   loaded together or which columns have which types.

**Proposed fix:**

For each domain folder:
1. Audit each CSV file — identify which columns contain math expressions,
   which contain plain text, which contain chemistry syntax
2. Add the types row as the second row of each file
3. Create a `control.json` for each domain folder declaring all tables
   and their display order
4. Fix any cells that use incorrect or non-standard syntax so they parse
   correctly with the existing plugins

**Column type assignment heuristic:**
- `Group`, `Name`, category columns → `text`
- Formula, expression, equation columns → `math`
- Compound, reaction columns in chemistry files → `chemistry`
- Code columns in software files → `text` (code is not a plugin type yet)
- All other columns → `text`

**This phase does not add new plugins or new syntax.** It only rectifies
the existing files to work with the existing application. New syntax
support (e.g. a code plugin) is deferred to a later phase.

---

### Phase numbering shift

The three new phases (14 = Source Code Editor, 15 = Test Resources) are
inserted before the existing planned phases. The existing phases shift:

| Old number | New number | Phase |
|---|---|---|
| 14 | 16 | File System Access & Save Strategy |
| 15 | 17 | Semantic Layer |
| 16 | 18 | Stable Entity Identity & Semantic Editing |
| 17 | 19 | Native Format |

---

## Phase 14 — Source Code Editor

---

### Implementation

**Added — `src/plugins/highlighter.ts`**

Lightweight syntax highlighter using the sticky-regex tokeniser pattern.
Each `SyntaxType` has a list of `TokenRule` objects (`{ name, pattern }`
where `pattern` has the `y` sticky flag). The `highlight(text, type)`
function walks the text, tries each rule at the current position, emits
`<span class="hl-{name}">` for matches, and plain escaped text for
unmatched characters. Token rule sets defined for: `math`, `chemistry`,
`geometry`, `physics`, `table-source`, `graph-source`, `text`.

**Added — `src/view/source-editor-view.ts`**

`SourceEditorView` — collapsible panel with:

- **Overlay editor:** transparent `<textarea>` over a `<pre>` that shows
  highlighted HTML. The `<pre>` mirrors the textarea content with token
  spans. Scroll position is synced between the two.
- **Focus-state border:** `se-focused` class added on focus, removed on
  blur. CSS: `2px solid #3b82f6` when focused, `1px solid #1e293b` when not.
- **Local undo/redo:** `LocalHistory` class (max 200 snapshots). Snapshots
  store `{ text, selStart, selEnd }`. The textarea's `keydown` listener
  runs in **capture phase** so it intercepts Ctrl+Z/Y before the global
  `document` listener. `AppShell.wireKeyboard` also guards with
  `if (this.sourceEditor.focused) return` as a safety net.
- **Reactive parsing:** 300ms debounced parse on every `input` event.
  "Parse" button for manual trigger. For cell-level types (math, chemistry,
  geometry, physics), delegates to `renderCell`. For `table-source` and
  `graph-source`, shows a placeholder until grammars are implemented.
- **Apply button:** commits parsed result to the model. For cell-level
  types, directs the user to the formula bar. For `table-source`/
  `graph-source`, calls `controller.replaceTable`/`replaceGraph` (deferred
  until parsers are implemented).
- **Collapse toggle:** hides/shows the body with a ▾/▸ button.

**Added — `controller.replaceTable(tableIdx, newTable)`**

Replaces an entire table in `kb.tables[]`. No undo recorded (the source
editor has its own local undo stack; the Apply action is a deliberate
commit, not an incremental edit).

**Added — `controller.replaceGraph(graphIdx, newGraph)`**

Replaces an entire graph in `kb.graphs[]`. Same rationale.

**Changed — `src/view/app-shell.ts`**

- Added `sourceEditor: SourceEditorView` field and constructor parameter
- `wireKeyboard` guards global undo/redo with
  `if (this.sourceEditor.focused) return`

**Changed — `src/main.ts`**

- Instantiates `SourceEditorView` with `#source-editor-container`
- Passes it to `AppShell` constructor

**Changed — `index.html`**

Added `<div id="source-editor-container">` between the formula bar and
the toolbar.

**Changed — `style.css`**

Added all source editor styles: `.source-editor`, `.se-header`,
`.se-body`, `.se-editor-pane`, `.se-highlight`, `.se-textarea`,
`.se-preview-pane`, `.se-preview`, `.se-error`, `.se-focused` (blue
border), and all `.hl-*` token colour classes.

---

### Design decisions

1. **Overlay technique for syntax highlighting.** The `<textarea>` is
   transparent (`-webkit-text-fill-color: transparent`) so the user sees
   the highlighted `<pre>` behind it while typing into the textarea. This
   avoids `contenteditable` complexity and preserves native textarea
   behaviour (cursor, selection, IME, accessibility).

2. **Capture-phase keydown for local undo/redo.** The source editor's
   `keydown` listener is registered with `{ capture: true }` so it fires
   before the global `document` listener in `AppShell`. This ensures
   Ctrl+Z inside the editor always triggers local undo, never global undo,
   without needing to call `e.stopPropagation()` (which would break other
   listeners).

3. **`table-source` and `graph-source` parsers deferred.** The editor
   infrastructure (highlighting, local undo, focus state, Apply wiring) is
   fully implemented. The PEG grammars for these two syntax types are
   deferred — the editor shows a placeholder and the Apply button is
   disabled for them until the grammars are defined. This follows the
   incremental delivery principle: ship the infrastructure, add the
   grammars when ready.

4. **No undo for `replaceTable`/`replaceGraph`.** The source editor has
   its own local undo stack. The Apply action is a deliberate commit — the
   user has already been able to undo their typing locally. Recording it
   in the global stack would create a confusing double-undo experience.

---

## Phase 14 — Source Code Editor: Bug Fixes

Three bugs were found and fixed after the initial Phase 14 implementation.

---

### Bug fix — `activateCell` scope bug

**Problem:** Clicking a table cell did not populate the source editor.
Clicking Apply had no effect.

**Root cause:** `activateCell` was a `TableView` method. It called
`this.sourceEditor?.setText(value, typeId, { tableIdx, rowIdx, colIdx })`
but `tableIdx`, `rowIdx`, and `colIdx` were closure variables from
`renderTableRows`, not parameters of `activateCell`. Inside the method
they were `undefined`. `SourceEditorView.apply()` reads `activeCellCtx`
(set by `setText`) to know which cell to commit to — with `undefined`
indices, `controller.editCell(undefined, undefined, undefined, text)` was
a no-op.

**Fix:** Added `tableIdx`, `rowIdx`, `colIdx` as explicit parameters to
`activateCell`. The call site in `renderTableRows` passes them explicitly.

**Files changed:** `src/view/table-view.ts`

---

### Bug fix — Invisible text in source editor overlay

**Problem:** Text typed into the source editor was invisible. Only the
caret was visible.

**Root cause:** `.se-highlight` had `color: transparent`, hiding the
`<pre>` layer. `.se-textarea` used `-webkit-text-fill-color: transparent`,
a non-standard property.

**Fix:**
- `.se-highlight { color: #1e293b }` — visible base colour for the `<pre>`
- `.se-textarea { color: transparent; caret-color: #1e293b }` — standard
  CSS to hide raw text while showing the caret

**Files changed:** `style.css`

---

### Bug fix — Enter key behaviour in source editor

**Problem:** Enter in a math cell inserted a newline instead of applying.
Enter in a text cell applied instead of inserting a newline.

**Root cause:** The `keydown` handler treated all syntax types identically.

**Fix:** Added a `syntaxType` check in the `keydown` handler:
- Single-line syntaxes (`math`, `chemistry`): Enter = Apply
- Multi-line syntaxes (`text`, `geometry`, `physics`, `table-source`,
  `graph-source`): Enter = newline
- Shift+Enter always inserts a newline

**Files changed:** `src/view/source-editor-view.ts`

---

### Bug fix — Text newlines not rendered in table cells

**Problem:** A text cell containing newlines displayed all lines on one
line in the table.

**Root cause:** The text plugin's `render` function created a `<span>`
with `textContent`. The browser's default `white-space: normal` collapses
newlines.

**Fix:** Added `span.style.whiteSpace = "pre-wrap"` to the text plugin
renderer.

**Files changed:** `src/plugins/text/index.ts`

---

## Phase 15 - Architecture Refactoring: Terminology & Source Separation

---

### Motivation

Two problems had accumulated across 14 phases:

1. **Fuzzy vocabulary.** Terms like "main view", "plugin", "editor", and
   "view" were used inconsistently across code, comments, and conversation.

2. **Wrong grouping axis.** `src/view/` contained three completely different
   things — Knowledge Pane views, the Source Editor, and the Shell. They
   were grouped together only because they all produce DOM, not because they
   serve the same UI surface.

---

### Changes

**Deleted directories:**
- `src/view/` — split into three new directories
- `src/plugins/` — renamed to `src/cell-renderers/`

**New directories:**

| Directory | Contents |
|---|---|
| `src/knowledge-pane/` | `table-view.ts`, `flow-diagram-view.ts`, `workspace-controller.ts`, `workspace-view.ts` |
| `src/source-editor/` | `source-editor-view.ts`, `highlighter.ts` |
| `src/shell/` | `app-shell.ts`, `session.ts`, `graph-filter-view.ts`, `search-view.ts` |
| `src/cell-renderers/` | `interface.ts`, `registry.ts`, `math/`, `chemistry/`, `geometry/`, `physics/`, `text/` |

**Renamed:**
- `Plugin` interface → `CellRenderer` in `src/cell-renderers/interface.ts`
- `type Plugin = CellRenderer` alias kept for backward compatibility

**Changed:**
- All import paths across `src/` and `test/` updated to reflect new locations
- `highlighter.ts` moved from `src/plugins/` to `src/source-editor/` — it
  is used exclusively by the Source Editor, not by cell renderers

**No logic changes.** All rendering, parsing, and model code is identical.
All tests pass without modification.

---

### Design decisions

1. **Group by UI surface served, not by abstraction level.** The math plugin
   and the source editor both involve parsing and rendering, but they serve
   completely different surfaces. Grouping them together obscured this.

2. **`CellRenderer` is the correct name.** The old name `Plugin` was vague.
   A cell renderer is a stateless function that takes a raw string value and
   a type identifier and returns an `HTMLElement`. The name makes this clear.

3. **Backward-compatible alias.** `type Plugin = CellRenderer` ensures any
   code that still uses the old name compiles without change.

---

## Phase 15.B - Document Model, Navigation Tree & Tab Lifecycle

---

### What was added

**`src/model/Document.ts`** — new file

Three new model classes:
- `Document { name, sections: Section[] }` — orchestrates one reference sheet
- `Section { id, title, block: TableBlock | GraphBlock, referenceMapping? }` — one named block
- `TableBlock | GraphBlock` — discriminated union; each holds a direct reference to the loaded model object
- `ReferenceMapping { chartSection, nodeIdColumn, labelColumn }` — the numbered-label / legend pattern

**`src/model/Graph.ts`** — added `sourceFile: string | null = null`

Set to the original filename (e.g. `"glycolysis.graph.json"`) by both
`loadGraph` in the controller and the `"graph"` entry path in
`resolveAllDiagrams`. Required because `control.json` names graphs by
entry `id`, not by filename — `graph.name` is not the filename.

**`src/model/KnowledgeBase.ts`** — added `documents: Document[]` and `addDocument(doc)`

`addDocument` only pushes to the array. It does NOT re-register the
document's tables/graphs — they are already in `kb.tables`/`kb.graphs`
from the earlier `loadCSV`/`loadGraph` calls.

**`src/model/index.ts`** — exports `Document`, `Section`, `Block`, `TableBlock`, `GraphBlock`, `ReferenceMapping`

**`src/data/doc.ts`** — new file

`parseDocJSON(fileName, json, tableMap, graphMap): Document`
- `tableMap` keyed by `t.name + ".csv"`
- `graphMap` keyed by `g.sourceFile` (not `g.name + ".graph.json"`)
- Sections whose referenced file is not found are skipped with `console.warn`

**`src/knowledge-pane/document-view.ts`** — new file

`DocumentView implements WorkspaceView`. Renders a `Document` as a vertical
stack of collapsible sections. Each section mounts a `TableView` or
`FlowDiagramView` as a child. Collapse state saved/restored via
`unmount()`/`mount()`. Section elements carry `data-section-id` attributes
for scroll-to-section navigation.

**`src/shell/navigation-tree-view.ts`** — new file

`NavigationTreeView` — directory-style left sidebar. Documents render as
collapsible `📁` folders with their sections as leaf items. Standalone
tables/graphs (not owned by any document) appear under a `📁 Standalone`
folder. Collapse state preserved across `refresh()` calls via a
`Set<string>` keyed by `"doc:" + doc.name` or `"standalone"`. All click
handlers call `workspace.openTab()`.

**`public/mathematics.doc.json`**, **`public/biochemistry.doc.json`**,
**`public/hardware.doc.json`** — new sample document files

**`public/math-calculus.csv`**, **`public/math-linear-algebra.csv`**,
**`public/glycolysis-compounds.csv`**, **`public/hardware-boolean.csv`**,
**`public/hardware-gates.csv`** — new sample CSV files for the documents

---

### What was changed

**`src/knowledge-pane/workspace-controller.ts`** — rewritten

Redesigned from "register everything as a tab on load" to a lazy
open-on-demand model:
- `registerView(id, factory, data)` — stores a view factory without creating a tab button
- `openTab(id)` — creates the tab button and mounts the view on first call; activates existing tab on subsequent calls
- `closeTab(id)` — removes the tab button, unmounts the view, activates adjacent tab
- `openFirst()` — opens the first registered view
- Tab buttons now have a `✕` close span

**`src/knowledge-pane/workspace-view.ts`**
- `WorkspaceData` gained `document?: Document`
- `viewFactory` now dispatches on `Document` → `DocumentView` in addition to `Table` and `Graph`
- `setOnCellApply` wiring removed from `viewFactory` (moved to per-cell-activation)

**`src/shell/app-shell.ts`**
- Added `loadDocResults()` shared helper — used by both `loadControlBatch` and `loadPlainBatch`
- `loadControlBatch` now receives and processes `docResults` (was the root bug — docs were silently skipped when `control.json` was present)
- `registerAllTabs` uses `registerView` + `openFirst` instead of `registerTab` + `activateFirst`
- Standalone deduplication uses `g.sourceFile` instead of `g.name + ".graph.json"`

**`src/controller/index.ts`**
- Added `loadDocument(doc: Document)` — delegates to `kb.addDocument()`
- `loadGraph` now sets `graph.sourceFile = fileName`
- `resolveAllDiagrams` now sets `graph.sourceFile = decl.file` for `"graph"` entries

**`src/source-editor/source-editor-view.ts`**
- Removed `activeCellCtx` field and the direct `controller.editCell` path in `apply()`
- `setOnCellApply` now accepts `((value, type) => void) | null`
- `setText` no longer accepts a `cellCtx` parameter

**`src/knowledge-pane/table-view.ts`**
- `activateCell` now calls `this.sourceEditor?.setOnCellApply(() => this.commitActive())` when a cell is activated
- `commit` and `cancel` closures now call `this.sourceEditor?.setOnCellApply(null)` to clear the callback
- `setText` call no longer passes `cellCtx`

**`index.html`**
- Added `#nav-tree-panel` (left of workspace), `#nav-tree-header`, `#nav-tree`
- Added `#btn-toggle-nav` button in static toolbar

**`style.css`**
- Added nav tree panel CSS (220px, collapsible with `nav-collapsed` class)
- Added folder/leaf item styles (`.nav-folder-header`, `.nav-folder-children`, `.nav-leaf`)
- Added `.tab-close` button styles (red on hover)

---

### Bugs found and fixed

**Bug 1 — Documents never appeared in nav tree (root cause: `loadControlBatch` never received `docResults`)**

Symptom: Nav tree showed `docs: 0` even when `.doc.json` files were included
in the file drop. Console showed `[registerAllTabs] docs: 0 tables: 3 graphs: 3`.

Root cause: `loadFiles` correctly classified `.doc.json` files into
`docResults`. However, when `control.json` was present in the drop,
`loadControlBatch` was called — and `docResults` was never passed to it.
Only `loadPlainBatch` received `docResults`. Since the public test data
includes `control.json`, docs were always skipped.

Fix: Added `docResults` parameter to `loadControlBatch`. Extracted
`loadDocResults()` as a shared helper called by both batch functions.

**Bug 2 — Graph sections inside documents showed 0 sections (root cause: graph map keyed by wrong field)**

Symptom: After fixing Bug 1, documents appeared in the nav tree but with
0 sections. Console showed warnings like `"glycolysis.graph.json" not loaded,
skipping section "glycolysis-chart"`.

Root cause: `loadDocResults` built the graph map as
`new Map(kb.graphs.map(g => [g.name + ".graph.json", g]))`. But
`control.json` names graphs by entry `id` (e.g. `"glycolysis-map"`), not
by filename. So `graph.name` was `"glycolysis-map"` and the map key was
`"glycolysis-map.graph.json"` — which never matched the doc's reference
`"glycolysis.graph.json"`.

Fix: Added `sourceFile: string | null` field to `Graph`. Set it in both
`loadGraph` and `resolveAllDiagrams`. Built the graph map using
`g.sourceFile` as the key instead of `g.name + ".graph.json"`.

**Bug 3 — `addDocument` caused duplicate tables/graphs**

Symptom: After loading, `kb.tables` contained each table twice. The
standalone deduplication logic incorrectly excluded some items.

Root cause: `addDocument` called `this.addTable(section.block.table)` and
`this.addGraph(section.block.graph)` for each section. But those tables
and graphs were already in `kb.tables`/`kb.graphs` from the earlier
`loadCSV`/`loadGraph` calls. Re-adding them caused duplicates.

Fix: Removed the re-registration calls from `addDocument`. It now only
pushes to `this.documents`.

**Bug 4 — Apply button showed "No active cell" error even with a cell focused**

Symptom: Clicking a cell, editing in the source editor, then clicking Apply
showed "No active cell — click a cell first, then edit here and Apply."

Root cause: `onCellApply` was set once per `TableView` creation in
`viewFactory`. With lazy tab opening, whichever tab was opened last owned
the callback. Clicking a cell in an earlier-opened tab set `activeCell` on
that view, but `onCellApply` pointed to a different view's `commitActive`
where `activeCell` was null.

Fix: Removed the global `setOnCellApply` wiring from `viewFactory`.
`activateCell` in `TableView` now calls
`this.sourceEditor?.setOnCellApply(() => this.commitActive())` when a cell
is activated, and the commit/cancel closures call
`this.sourceEditor?.setOnCellApply(null)` to clear it. The callback always
points to the `TableView` that owns the currently active cell.

**Bug 5 — Apply updated the model but the cell DOM showed the old value**

Symptom: After clicking Apply, the model was updated (confirmed by
re-clicking the cell) but the cell still showed the old rendered value
until the next full re-render.

Root cause: `SourceEditorView.apply()` had two code paths. The
`activeCellCtx` path called `controller.editCell()` directly, then set
`activeCellCtx = null`. This bypassed `TableView.commit()`, so
`showRendered(td, value)` was never called and `cell-active` was never
removed from the `td`.

Fix: Removed the `activeCellCtx` path entirely. Apply now always goes
through `onCellApply → commitActive()`, which correctly: removes
`cell-active`, calls `showRendered(td, value)`, clears the editor, and
commits to the model.

---

### Design decisions

1. **`addDocument` must not re-register tables/graphs.** The document's
   tables and graphs are already in `kb.tables`/`kb.graphs`. Re-adding
   them caused duplicates that broke the standalone deduplication logic.
   The document is the coordination layer only — it does not own the data.

2. **Graph map keyed by `sourceFile`, not `graph.name`.** `control.json`
   assigns graph names from entry `id` fields, not filenames. The only
   stable filename-based key is `sourceFile`. This field must be set by
   every code path that loads a graph.

3. **`loadDocResults` is a shared helper.** Both `loadControlBatch` and
   `loadPlainBatch` must process `.doc.json` files. Extracting the logic
   into a shared helper eliminates the duplication and ensures both paths
   behave identically.

4. **Nav tree drives tab opening; tabs are closeable.** The tab strip is
   no longer a mirror of the loaded KB. It shows only what the user has
   explicitly opened. The nav tree is the primary navigation surface.
   Closing a tab does not unload the data — the item remains in the nav
   tree and can be reopened at any time.

5. **`onCellApply` registered per-cell-activation, not per-view-creation.**
   Per-cell-activation registration ensures the callback always points to
   the `TableView` that owns the currently active cell, regardless of how
   many tabs are open or in what order they were opened.

---

## Phase 16 — Test Resource Rectification

---

### What was done

Rectified all 80 CSV files across 6 domain folders in `testresources/` so
they conform to the application's CSV convention (header row + types row +
data rows). Created `control.json` for each domain folder.

---

### Changes per domain

**Mathematics reference sheet (21 files)**
- Added types row to all 20 well-structured files
- Restructured `Externals.csv` (was a malformed single-entry note) into
  proper `Name,Basic relationship,Presetted values` format
- Types assignment: `Group` → `text`, `Name` → `text`,
  `Basic relationship` → `math`, `Presetted values` → `math`
- Created `control.json` listing all 21 tables in pedagogical order

**Hardware reference sheet (6 files)**
- Added types row to all files (English-only, no translation needed)
- Fixed `Architectures.csv` header (was `Unnamed: 0,Unnamed: 1,Unnamed: 2`)
- Fixed `General concepts.csv` (had no header row — prepended one)
- All columns typed as `text` (hardware descriptions) except
  `Boolean algebra.csv` which uses `math` for the relationship column
- Created `control.json` listing all 6 tables

**Software reference sheet (18 files)**
- Added types row to all files (English-only)
- Fixed headers on 11 files that had `Structural,Unnamed:...` or
  `Unnamed:...` placeholder headers from spreadsheet export
- Replaced empty files (`PHP.csv`, `Sheet2.csv`) with minimal valid CSV
- Fixed `Java ref.csv` header (had junk URL rows at top)
- All columns typed as `text` (code is not a plugin type yet)
- Created `control.json` listing all 18 tables

**Chemistry reference sheet (19 files)**
- Added types row to all files
- Fixed headers on 5 files with `Unnamed:...` placeholders
- Fixed `General.csv` (had no header — prepended one)
- Fixed `Isomer table.csv` (had no header — prepended isotope column names)
- Types: `Formula`/`Compound` columns → `chemistry`, numeric/text → `text`,
  `Stochiometry.csv` uses `math` for relationship/values columns
- Created `control.json` listing all 19 tables

**Biology reference sheet (10 files)**
- Added types row to all files
- Fixed headers on 7 files that had pseudo-headers with group names as
  column headers and `Unnamed:` placeholders
- Restored multi-line first data rows that were broken during header
  replacement (Hormonsystemet, Immunförsvaret, Kardiovaskulära system,
  Muskeloskeletala systemet, Nervous system, Respirationssystemet)
- All columns typed as `text` (biology descriptions)
- Created `control.json` listing all 10 tables

**Biochemistry reference sheet (6 files)**
- Added types row to all files
- Fixed headers on 2 files with pseudo-headers (Cellular biology, Genetics)
- Restructured 2 near-empty files (Microbiology, Molecular biology) into
  valid CSV with proper headers
- `Biomolecules` uses `chemistry` type for the Structure column
- `Metabolism.csv` kept as `text` — pathway notation (`LINEAR`, `RING`,
  `BRANCH`) renders as plain text; graph equivalents already exist in
  `public/` from Phase 13
- Created `control.json` listing all 6 tables

---

### Validation results

- 80 CSV files across 6 domains: all have header + types row
- 6 `control.json` files created: all reference existing files
- All type values are valid plugin types (`text`, `math`, `chemistry`)
- All 349 existing tests pass without modification

---

### Design decisions

1. **Types row uses existing plugin types only.** No new plugins were
   introduced. Columns that contain content not supported by any plugin
   (code, pathway notation) are typed as `text` and render as plain text.

2. **Pathway data not converted to `.graph.json` in this phase.** The
   `Metabolism.csv` pathway notation (`LINEAR`, `RING`, `BRANCH`) describes
   graph structures, but the main pathways (glycolysis, Krebs cycle,
   metabolism overview) already have `.graph.json` equivalents in `public/`
   from Phase 13. Converting the remaining pathways is deferred.

3. **Bilingual terminology not added in this phase.** The study plan
   specified adding English translations to Swedish-only biology files and
   Swedish translations to English-only math files. This is a content
   authoring task that requires domain expertise and is deferred to a
   follow-up pass. The structural rectification (headers, types rows,
   control.json) is complete.

4. **Near-empty files preserved.** Files like `PHP.csv`, `Sheet2.csv`,
   `Analog circuits.csv`, `Microbiology.csv` contain minimal or no data.
   They are given valid headers and types rows so they load without error.
   Content can be added later without structural changes.

5. **`control.json` uses kebab-case IDs.** Entry IDs follow the same
   convention as the existing `public/control.json`: lowercase, hyphenated,
   derived from the filename without extension.

---

## Phase 16.B — Rich Cell Renderer

---

### Problem

The `math` cell type expects the entire cell content to be a single
parseable math expression. But the test resource cells contain multi-line
content mixing math expressions with natural language explanations:

```
lim{x->a, f(x)} = L
For any \e > 0, there exist \d > 0 such that |x-a|<\d => |f(x)-L|<\e
```

The math parser fails on the prose lines. A delimiter-based approach
(e.g. `$...$` for inline math) was considered but rejected because:
- It requires escaping the delimiter character in content
- The existing data doesn't use delimiters — all 60+ files would need editing
- The data is naturally structured as one expression OR one prose line per line

### Solution

A new `rich` cell type that uses **line-level parser fallback**:
1. Split cell content by newlines
2. For each line, try parsers in order: math → chemistry → geometry → physics
3. If all parsers fail, render as plain text
4. No delimiters needed, no escaping needed

### What was added

**`src/cell-renderers/rich/index.ts`** — new file

`richPlugin: CellRenderer` with:
- `parse(text)`: splits by `\r?\n`, tries each line against all parsers
- `render(ast)`: renders each line with its detected type, separated by `<br>`
- Line types: `math | chemistry | geometry | physics | text | blank`

**`src/cell-renderers/registry.ts`** — added `rich: richPlugin` to renderers map

**`style.css`** — added `.rich-cell`, `.rich-text`, `.rich-cell .native-math` styles

### What was changed

**Test resource types rows** — updated to use `rich` instead of `math`:
- All 21 Mathematics files: formula columns changed from `math` to `rich`
- `Chemistry/Stochiometry.csv`: formula columns changed from `math` to `rich`
- `Hardware/Boolean algebra.csv`: relationship column changed from `math` to `rich`

### Validation

- 1758 rich cells across all test resources parse with zero failures
- All 349 existing tests pass without modification
- No delimiter escaping needed — the line-level approach avoids the problem entirely

---

## Phase 16.C — Rich Renderer v2: Explicit Embedding Syntax

---

### Problem

The line-level auto-detection approach (Phase 16.B) was unreliable. The math
parser is too permissive — it accepts single identifiers, numbers, and short
phrases as valid expressions. This caused arbitrary text to be rendered as
math. Users had no control over what was math and what was text.

### Solution

Replaced auto-detection with **explicit embedding syntax**:
- `math`expression`` — renders as formatted math
- `chem`formula`` — renders as chemistry
- `geom`program`` — renders as geometry
- `phys`program`` — renders as physics
- Everything else — renders as plain text

The backtick delimiter was chosen because it never appears in math, chemistry,
geometry, or physics syntax. No escaping needed.

### Changes

**`src/cell-renderers/rich/index.ts`** — rewritten (v2.0.0)
- Uses regex to find embeddings: `\b(math|chem|geom|phys)`([^`]*)`/g`
- Each embedding is parsed by its respective grammar
- Failed embeddings fall back to plain text
- Text between embeddings is plain text spans

**`src/cell-renderers/registry.ts`** — default fallback changed to `richPlugin`

**`src/source-editor/source-editor-view.ts`** — type dropdown removed
- All cells are rich, no type selection needed
- Editor always operates in rich mode
- Enter inserts newline (multi-line)

**`src/source-editor/highlighter.ts`** — added `"rich"` to SyntaxType

**`src/knowledge-pane/table-view.ts`** — Apply keeps cell active
- `commitActive()` calls `editCell(..., silent=true)` to skip re-render
- Only the single cell's DOM is updated via `showRendered()`
- Cell stays active, editor keeps text

**`src/controller/index.ts`** — `editCell` gained `silent` parameter
- When `silent=true`, model is updated but `showAll()` is not called

**All test resource files (80)** — types rows set to all `rich`

**All public/ CSV files (16)** — types rows set to all `rich`

**Test resource content** — math-parseable lines wrapped with `math`...``
using strict heuristic (requires math indicators + no prose words)

**Bilingual names** — English/Swedish translations added to Name/Group/Concept
columns in Mathematics, Chemistry, Biology, and Biochemistry domains.
Format: `English name/Svenskt namn`. Hardware and Software domains excluded
(English-only, no established Swedish CS terminology).

### Final validation

- 34,713 non-empty cells across all test resources
- 5,043 math embeddings — all parse correctly
- 0 parse failures
- 349 tests pass (1 test updated: fallback expects "rich" not "text")
- All 6 `control.json` files valid


---

## Phase 17 — File System Access & Save Strategy

---

### What was added

**`src/data/file-system.ts`** — new file

- `HAS_FILE_SYSTEM_ACCESS` — capability constant, evaluated once at module load
- `FileSystemStrategy` interface: `open()`, `save()`, `saveAs()`, `canSaveInPlace`
- `NativeFileSystemStrategy` — uses `showOpenFilePicker`, `createWritable`,
  `showSaveFilePicker` for true in-place save
- `DownloadFallbackStrategy` — uses `<input type="file">` for open,
  `Blob` + `<a download>` for save

### What was changed

**`src/controller/index.ts`**
- Added `fileSystem`, `loadedFiles`, `dirty`, `onDirtyChange` fields
- Added `setFileSystemStrategy()`, `getFileSystemStrategy()`,
  `storeLoadedFile()`, `markDirty()`, `isDirty()`, `getDirtyFiles()`,
  `setOnDirtyChange()`, `saveFile()`, `saveAllModified()`
- `editCell`, `addRow`, `insertRow`, `deleteRow` now call `markDirty()`

**`src/main.ts`**
- Dynamic import of file-system module at startup
- Strategy selection based on `HAS_FILE_SYSTEM_ACCESS`
- `Ctrl+S` handler calling `saveAllModified()`
- Dirty change callback updating status bar, tabs, and nav tree

**`src/shell/app-shell.ts`**
- `wireFileLoading()` intercepts Open label click when native API available
- `openFromStrategy()` loads files with handles for in-place save
- `storeLoadedFile()` called on drag-drop load (null handles)
- Save button wired to `saveAllModified()`

**`index.html`**
- Added Save button to toolbar
- Open label given id for interception

### Design decisions

1. **One Open button, automatic detection.** On Chrome/Edge, clicking Open
   uses `showOpenFilePicker` (returns handles). On Firefox, it falls back
   to `<input type="file">` (no handles). Same UI, different mechanism.

2. **Handles stored per-file.** Each loaded file's handle is stored in
   `loadedFiles` map. When saving, the handle enables silent in-place write.
   Null handle (from drag-drop or Firefox) triggers `saveAs` dialog.

3. **Dirty tracking fires callback.** `markDirty()` fires `onDirtyChange`
   which updates three indicators: status bar ("● Unsaved changes"),
   tab strip ("● tablename"), and nav tree ("● tablename").

4. **No try/catch for capability detection.** `HAS_FILE_SYSTEM_ACCESS` is
   a pure property existence check. No version strings, no browser sniffing.

5. **Sequential saves.** `saveAllModified()` awaits each file sequentially
   to avoid permission prompt conflicts and browser download throttling.


---

### Phase 17 addendum — Per-file dirty tracking

Replaced global `history.savedPosition` with per-file content comparison.

**Problem:** Global saved position was incorrect for multi-file. Undoing
file A's change while file B remained dirty would clear all dirty flags.
Also, saving at a mid-point then undoing did not re-raise the dirty flag.

**Fix:** `recheckDirtyFile(name)` serializes the file's current model state
and compares to the text stored in `loadedFiles` at last save. If they
differ, the file is dirty. If they match, it's clean.

**Result:** Dirty state is now per-file and content-based. Undo/redo
correctly raises/clears dirty flags for each individual file regardless
of other files' states. 7 integration tests added to verify all scenarios.


---

## Phase 18 — Diagram Grammars (Mermaid-compatible, zero dependencies)

---

### What was added

**7 diagram types** implemented with Mermaid-compatible syntax, zero external
dependencies. Each uses the PEG parser infrastructure (or line-based parsing
for simpler formats).

```
src/cell-renderers/diagram/
├── index.ts                — dispatcher (detects type from first keyword)
├── flowchart/
│   ├── types.ts            — FlowchartAST, FlowNodeDef, FlowEdge
│   ├── grammar.ts          — PEG grammar (flowchart/graph keyword, shapes, arrows)
│   └── render.ts           — SVG renderer with topological layer layout
├── sequence/
│   ├── types.ts            — SequenceAST, SeqMessage
│   ├── grammar.ts          — PEG grammar (participants, arrows, labels)
│   └── render.ts           — SVG renderer with lifelines and messages
├── class-diagram/
│   ├── types.ts            — ClassDiagramAST, ClassDef, ClassRelation
│   ├── grammar.ts          — PEG grammar (classes, members, relations)
│   └── render.ts           — SVG renderer with class boxes and arrows
├── state/
│   ├── types.ts            — StateDiagramAST, StateDef, StateTransition
│   ├── grammar.ts          — PEG grammar (states, transitions, [*] markers)
│   └── render.ts           — SVG renderer with rounded state boxes
├── er/
│   ├── types.ts            — ERDiagramAST, EREntity, ERRelation
│   ├── grammar.ts          — PEG grammar (entities, cardinality, labels)
│   └── render.ts           — SVG renderer with entity boxes and relations
├── gantt/
│   ├── types.ts            — GanttAST, GanttSection, GanttTask
│   ├── grammar.ts          — Line-based parser (sections, tasks, dates)
│   └── render.ts           — SVG renderer with horizontal bars
└── pie/
    ├── types.ts            — PieAST, PieSlice
    └── render.ts           — Parser + SVG renderer with arc paths
```

**`src/knowledge-pane/diagram-view.ts`** — standalone diagram view

Renders a diagram file as an SVG tab. Bidirectional sync with source editor:
- Mount: parses source, renders SVG, loads source into editor
- Apply: re-parses edited source, re-renders SVG
- Parse errors shown in the container

**File loading** — `.md`, `.mmd`, `.flowchart` files recognized as diagrams

The app shell detects diagram files by extension or by first-line keyword
match (`flowchart`, `sequenceDiagram`, `classDiagram`, `stateDiagram`,
`erDiagram`, `gantt`, `pie`). They open as standalone diagram tabs.

### Supported syntax (Mermaid-compatible)

**Flowchart:**
```
flowchart TD
    A[Start] --> B{Decision}
    B --> C[OK]
    B --> D((Fail))
```

**Sequence:**
```
sequenceDiagram
    Alice->>Bob: Hello
    Bob-->>Alice: Hi
```

**State:**
```
stateDiagram-v2
    [*] --> Idle
    Idle --> Running : start
    Running --> [*]
```

**Gantt:**
```
gantt
    title Schedule
    section Dev
    Task A :a1, 2024-01-01, 30d
```

**Pie:**
```
pie title Results
    "Yes" : 70
    "No" : 30
```

### Graph save format

Graphs now save in their text syntax (via `serializeGraph`) instead of JSON.
The `toGraphJSON()` method still exists but is no longer used for saving.
This makes graph files human-readable and editable in any text editor.

### Sample files

- `public/sample-flowchart.md` — TD flowchart
- `public/sample-flowchart-lr.md` — LR flowchart
- `public/sample-sequence.md` — sequence diagram
- `public/sample-state.md` — state diagram
- `public/sample-gantt.md` — Gantt chart
- `public/sample-pie.md` — pie chart

### Test results

383 tests pass (17 new flowchart grammar tests + all regression tests).

---

### Phase 18 continuation — .diagram file format and graph rendering improvements

---

#### What changed

**File format: `.diagram` replaces `.md` and `.graph.json`**

- New file extension `.diagram` for all text-syntax diagrams
- `.graph.json` files removed — diagrams save their own Mermaid-compatible syntax
- `.md` diagram files removed — diagrams are NOT markdown
- Sample files renamed: `sample-flowchart.diagram`, `krebs.diagram`, etc.

**`.doc.json` integration — per-diagram-kind block types**

Block types are now specific: `graph_flowchart`, `graph_sequence`, `graph_class`,
`graph_state`, `graph_er`, `graph_gantt`, `graph_pie`. Example:
```json
{ "type": "graph_flowchart", "file": "glycolysis.diagram", "labelStyle": "default" }
```

**`control.json` integration — `"view": "diagram"` entries**

```json
{ "id": "krebs-map", "view": "diagram", "file": "krebs.diagram" }
```

**Model layer:**
- `DiagramBlock` added to `src/model/Document.ts`
- `DiagramFileDecl` added to `src/data/control.ts`

**Data layer:**
- `parseDocJSON` gains `diagramMap` parameter for resolving diagram blocks
- `parseControlFile` handles `"view": "diagram"` entries

**Shell layer:**
- `AppShell` detects `.diagram` files, passes to doc parser and nav tree
- `NavigationTreeView` gains `diagramNames` field for standalone diagrams
- `DocumentView` renders `DiagramBlock` sections via `DiagramView`

**Graph rendering algorithm — Sugiyama layered layout:**
- Shared `src/cell-renderers/diagram/graph-utils.ts` with Tarjan SCC and back-edge detection
- Flowchart and state diagram use proper Sugiyama method:
  1. Cycle breaking via Tarjan SCC / DFS back-edge detection
  2. Longest-path rank assignment
  3. Barycenter crossing minimization
  4. Iterative median coordinate assignment (4 up/down passes)
  5. Overlap resolution within each layer
  6. Viewport centering
- Ring layout for cyclic graphs (≥50% of nodes in a cycle)
- Cubic bezier S-curves for edges (Mermaid-style)
- Back-edges route around the graph exterior
- `nodeIntersect` computes edge-node border intersection for arrowhead placement
- Draw order: nodes behind, edges on top (arrowheads always visible)

**State diagram grammar fix:**
- `OptLabel` only matches when starting with `:` — no longer eats next line
- `[*]` split into start/end nodes when used as both source and target
- End state rendered as double circle

**Pan/zoom on DiagramView:**
- Container uses `overflow: hidden` (no scrollbars)
- Mouse drag for panning, scroll wheel for zooming
- SVG content wrapped in a transformable `<g>` group

#### Files added
- `src/cell-renderers/diagram/graph-utils.ts` — shared Tarjan SCC + back-edge detection
- `public/*.diagram` — 8 diagram files replacing old .md and .graph.json

#### Files removed
- `public/sample-*.md` — replaced by `.diagram`
- `public/*.graph.json` — replaced by `.diagram`

#### Files changed
- `src/model/Document.ts` — added `DiagramBlock`
- `src/data/doc.ts` — added `diagramMap` parameter, `graph_*` block handling
- `src/data/control.ts` — added `DiagramFileDecl`, `"diagram"` view parsing
- `src/shell/app-shell.ts` — `.diagram` detection, nav tree population
- `src/shell/navigation-tree-view.ts` — `diagramNames`, `DiagramBlock` handling
- `src/knowledge-pane/document-view.ts` — `DiagramBlock` rendering
- `src/knowledge-pane/diagram-view.ts` — pan/zoom, overflow hidden
- `src/cell-renderers/diagram/flowchart/render.ts` — Sugiyama layout, ring layout, bezier edges
- `src/cell-renderers/diagram/state/render.ts` — Sugiyama layout, [*] splitting, bezier edges
- `src/cell-renderers/diagram/state/grammar.ts` — OptLabel fix, newline handling
- `src/cell-renderers/diagram/er/render.ts` — white label backgrounds
- `public/control.json` — uses `"view": "diagram"`
- `public/biochemistry.doc.json` — uses `graph_flowchart` block type
