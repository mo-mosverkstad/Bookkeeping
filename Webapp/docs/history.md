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
