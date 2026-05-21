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
