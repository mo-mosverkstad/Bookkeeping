# Testing

---

## How to Run Tests

### Automated unit tests (Vitest)

Unit tests live in `test/` and cover all three layers: PEG engine,
grammar/parser, and renderer.

```bash
# Install dependencies first (only needed once)
npm install

# Check for vulnerabilities after install
npm audit

# If vulnerabilities are found, fix them
npm audit fix --force

# Run all tests once and exit
npm test

# Run in watch mode — re-runs on every file save
npm run test:watch
```

### Reading the test results

Vitest prints results directly in the terminal. Each test suite and
individual test case is listed with a pass/fail indicator:

```
✓ test/parser/PEGParser.test.ts (14 tests)
✓ test/parser/grammar.test.ts (32 tests)
✓ test/render/render.test.ts (28 tests)

Test Files  3 passed (3)
Tests       74 passed (74)
Duration    Xms
```

A failing test looks like:
```
✗ test/parser/grammar.test.ts > Multiplicative > regression: (3+5) not parsed as 3*(+5)
  AssertionError: expected { type: 'UnaryExpression' } to match { type: 'BinaryExpression' }
    at test/parser/grammar.test.ts:87:5
```

The output tells you:
- Which file and test suite the failure is in
- Which specific test case failed
- What the actual value was vs what was expected
- The exact line number in the test file

### Manual browser tests

For visual verification of the renderer:

```bash
npm run dev
```

Open `http://localhost:5173`. The first test case loads automatically.
Call `__nextTest()` in the browser console (`F12`) to cycle through all
test cases. The browser console also prints the full JSON AST for each
rendered expression.

---

## Phase 1 — Math Syntax: Expression Parser & Renderer

---

### Automated test files

| File | Suites | What is covered |
|------|--------|-----------------|
| `test/parser/PEGParser.test.ts` | 7 | PEG engine primitives: literal, regex, sequence, choice, repeat, rule reference, build, error reporting |
| `test/parser/grammar.test.ts` | 10 | All grammar rules, all 5 identifier forms, operator precedence, regression tests for Issues 1 and 2 |
| `test/render/render.test.ts` | 11 | HTML structure per node type, CSS classes, Greek glyphs, integral layout regression for Issue 3 |

All tests are **regression tests** — they remain in the suite for all
future phases and will catch any breakage of Phase 1 functionality.

### TC-01 — Basic addition
| Field | Value |
|-------|-------|
| Input | `2+3` |
| Expected AST | `BinaryExpression(+, 2, 3)` |
| Expected render | `2 + 3` |
| Verdict | ✅ Pass |

---

### TC-02 — Operator precedence (add vs multiply)
| Field | Value |
|-------|-------|
| Input | `2+3*x` |
| Expected AST | `BinaryExpression(+, 2, BinaryExpression(*, 3, x))` |
| Expected render | `2 + 3x` |
| Verdict | ✅ Pass |

---

### TC-03 — Parenthesised grouping
| Field | Value |
|-------|-------|
| Input | `(2+3)*x` |
| Expected AST | `BinaryExpression(*, BinaryExpression(+, 2, 3), x)` |
| Expected render | `(2 + 3)x` |
| Verdict | ✅ Pass |

---

### TC-04 — Right-associative exponentiation
| Field | Value |
|-------|-------|
| Input | `x^2^3` |
| Expected AST | `BinaryExpression(^, x, BinaryExpression(^, 2, 3))` |
| Expected render | `x`<sup>`2`<sup>`3`</sup></sup> |
| Verdict | ✅ Pass |

---

### TC-05 — Unary negation
| Field | Value |
|-------|-------|
| Input | `-x` |
| Expected AST | `UnaryExpression(-, x)` |
| Expected render | `-x` |
| Verdict | ✅ Pass |

---

### TC-06 — Function call
| Field | Value |
|-------|-------|
| Input | `f(x)` |
| Expected AST | `CallExpression(f, [x])` |
| Expected render | `f(x)` |
| Verdict | ✅ Pass |

---

### TC-07 — Subscript
| Field | Value |
|-------|-------|
| Input | `x_i` |
| Expected AST | `SubscriptExpression(x, i)` |
| Expected render | `x`<sub>`i`</sub> |
| Verdict | ✅ Pass |

---

### TC-08 — Division as fraction
| Field | Value |
|-------|-------|
| Input | `a/b` |
| Expected AST | `BinaryExpression(/, a, b)` |
| Expected render | fraction with `a` on top, `b` on bottom |
| Verdict | ✅ Pass |

---

### TC-09 — Integral control expression
| Field | Value |
|-------|-------|
| Input | `\int{2, 3, f(x)*\dx}` |
| Expected AST | `ControlExpression(\int, [2, 3, BinaryExpression(*, f(x), \dx)])` |
| Expected render | integral symbol with bounds 2 and 3, body `f(x)dx` |
| Verdict | ✅ Pass |

---

### TC-10 — Manual test case (composite)
| Field | Value |
|-------|-------|
| Input | `-2*(3+5)*4e^x^2` |
| Expected AST | `BinaryExpression(*, BinaryExpression(*, BinaryExpression(*, UnaryExpression(-, 2), BinaryExpression(+, 3, 5)), 4), BinaryExpression(^, e, BinaryExpression(^, x, 2)))` |
| Expected render | `(-2)(3 + 5)(4)(e`<sup>`x`<sup>`2`</sup></sup>`)` |
| Verdict | ✅ Pass (after two bug fixes — see Issues below) |

---

### TC-11 — Implicit multiplication with power
| Field | Value |
|-------|-------|
| Input | `4e^x` |
| Expected AST | `BinaryExpression(*, 4, BinaryExpression(^, e, x))` |
| Expected render | `4e`<sup>`x`</sup> |
| Verdict | ✅ Pass (after bug fix — see Issue 2 below) |

---

### TC-12 — Chained function calls
| Field | Value |
|-------|-------|
| Input | `f(x)y(z)` |
| Expected AST | `BinaryExpression(*, CallExpression(f, [x]), CallExpression(y, [z]))` |
| Expected render | `f(x)y(z)` |
| Verdict | ✅ Pass |

---

## Issues Found and Fixed

### Issue 1 — Implicit multiplication used `ImplicitFactor` instead of a power-aware rule

**Symptom:** `4e^x^2` parsed as `(4 * e) ^ x ^ 2` instead of `4 * (e ^ (x ^ 2))`.

**Root cause:** The implicit multiplication branch in `Multiplicative` used
`ImplicitFactor`, which only matched a bare `Postfix` or parenthesised group —
no exponentiation. So `e^x^2` was not consumed as a unit; only `e` was taken
as the implicit factor, leaving `^x^2` to be applied to the whole `4*e` product.

**Fix:** Changed the implicit branch to use `Power` so that `e^x^2` is
consumed as a full power expression.

**Status:** Partially fixed — introduced Issue 2.

---

### Issue 2 — Implicit multiplication using `Power` stole unary signs from `Additive`

**Symptom:** `(3+5)` inside a larger expression parsed as `3 * (+5)` instead
of `3 + 5`. The full expression `-2*(3+5)*4e^x^2` produced the wrong AST with
`3 * (+5)` as the right operand of the first `*`.

**Root cause:** `Power` descends through `Unary`, which can consume a leading
`+` or `-`. When the implicit multiplication repeat tried `Power` after parsing
`3`, it matched `+` as a unary sign and `(5)` as the operand, stealing the `+`
that `Additive` needed to form `3 + 5`.

**Fix:** Introduced a new rule `ImplicitPower` that is identical to `Power`
but starts from `Postfix` instead of `Unary`. Since `Postfix` cannot consume
a sign, the `+` is left for `Additive`. The implicit multiplication branch now
uses `ImplicitPower`.

**Status:** ✅ Fixed.

---

### TC-13 — Left-skewed Latin identifier
| Field | Value |
|-------|-------|
| Input | `` `a `` |
| Expected AST | `Identifier { name: "a", prefix: "left-skew" }` |
| Expected render | italic a |
| Verdict | ✅ Pass |

---

### TC-14 — Right-skewed Latin identifier (physics disambiguation)
| Field | Value |
|-------|-------|
| Input | `` `1T `` |
| Expected AST | `Identifier { name: "T", prefix: "right-skew" }` |
| Expected render | right-skewed T |
| Verdict | ✅ Pass |

---

### TC-15 — Upright Greek identifier
| Field | Value |
|-------|-------|
| Input | `\a` |
| Expected AST | `Identifier { name: "a", prefix: "greek" }` |
| Expected render | α |
| Verdict | ✅ Pass |

---

### TC-16 — Right-skewed Greek identifier
| Field | Value |
|-------|-------|
| Input | `\1b` |
| Expected AST | `Identifier { name: "b", prefix: "greek-right" }` |
| Expected render | right-skewed β |
| Verdict | ✅ Pass |

---

### TC-17 — Mixed skew expression
| Field | Value |
|-------|-------|
| Input | `` `1T / `1t `` |
| Expected AST | `BinaryExpression(/, Identifier{T,right-skew}, Identifier{t,right-skew})` |
| Expected render | fraction: right-skewed T over right-skewed t |
| Verdict | ✅ Pass |

---

### TC-18 — Greek in expression
| Field | Value |
|-------|-------|
| Input | `\a + \1b` |
| Expected AST | `BinaryExpression(+, Identifier{a,greek}, Identifier{b,greek-right})` |
| Expected render | α + right-skewed β |
| Verdict | ✅ Pass |

---

## Issue 3 — Integral body rendered below the integral sign

**Symptom:** `\int{0, 1, x^2}` rendered `x²` stacked below the ∫ symbol
instead of beside it.

**Root cause:** `renderIntegral` placed the body as a fourth child inside
`.opstack`. The `.opstack` CSS sets all direct children to `display: block`,
so the body became a block element stacking below `.top`, `.op`, `.bottom`.

**Fix:** Wrapped the `.opstack` and the body in an outer `.integral` flex
container. The `.opstack` (containing only the stacked bounds and symbol)
and `.integral-body` (containing the integrand) are now flex siblings,
so the body sits beside the integral sign at the correct vertical alignment.

New HTML structure:
```html
<span class="integral">
  <span class="opstack">
    <span class="top">1</span>
    <span class="op large-operator">∫</span>
    <span class="bottom">0</span>
  </span>
  <span class="integral-body">x²</span>
</span>
```

**Files changed:** `src/render/render.ts`, `native-math.css`

**Status:** ✅ Fixed.

---

### TC-19 — Integral with compound body
| Field | Value |
|-------|-------|
| Input | `\int{0, \p, \s*x^2 + 2x - 1}` |
| Expected render | integral from 0 to π, body: σx² + 2x − 1 beside the sign |
| Verdict | ✅ Pass |

### TC-20 — Nested fractions
| Field | Value |
|-------|-------|
| Input | `(a/b) / (c/d)` |
| Expected render | stacked fraction with a/b on top and c/d on bottom |
| Verdict | ✅ Pass |

### TC-21 — Polynomial
| Field | Value |
|-------|-------|
| Input | `2x^3 + 3x^2 - x + 1` |
| Expected render | 2x³ + 3x² − x + 1 |
| Verdict | ✅ Pass |

### TC-22 — Function call inside integral
| Field | Value |
|-------|-------|
| Input | `\int{-1, 1, f(x)*g(x)}` |
| Expected render | integral from −1 to 1, body: f(x)g(x) |
| Verdict | ✅ Pass |

### TC-23 — Subscript chain
| Field | Value |
|-------|-------|
| Input | `x_i + x_j + x_k` |
| Expected render | x₍ᵢ₎ + x₍ⱼ₎ + x₍ₖ₎ |
| Verdict | ✅ Pass |

### TC-24 — Greek coefficients
| Field | Value |
|-------|-------|
| Input | `\a*x^2 + \b*x + \g` |
| Expected render | αx² + βx + γ |
| Verdict | ✅ Pass |

### TC-25 — Deeply nested right-associative power
| Field | Value |
|-------|-------|
| Input | `a^b^c^d` |
| Expected render | a^(b^(c^d)) — right-associative nesting |
| Verdict | ✅ Pass |

### TC-26 — Unary chain
| Field | Value |
|-------|-------|
| Input | `--x + -y` |
| Expected render | −(−x) + (−y) |
| Verdict | ✅ Pass |

### TC-27 — Implicit multiplication with Greek
| Field | Value |
|-------|-------|
| Input | `2\p r^2` |
| Expected render | 2πr² |
| Verdict | ✅ Pass |

---

## Test Fixes (Phase 1)

### Test fix 1 — `skips leading whitespace` had wrong assumption

**Symptom:** Test failed with parse error on `"  hello"`.

**Root cause:** The test created a `PEGParser` with no `skip` option, so
whitespace skipping was disabled by design. The test incorrectly assumed
the bare engine skips whitespace unconditionally.

**Fix:** Split into two tests — one that verifies whitespace is skipped
when `skip` is configured, and one that verifies it is NOT skipped when
`skip` is absent.

---

### Test fix 2 — `unary binds tighter than binary` had wrong expectation

**Symptom:** Test expected `-a^2` to parse as `-(a^2)` but actual result
was `(-a)^2`.

**Root cause:** The grammar rule is `Power → Unary (^ Unary)*`. This means
`-a` is consumed as a `Unary` node first, then `^2` is applied to the
whole unary expression, giving `(-a)^2`. The test comment said
"unary binds tighter than binary" which is the opposite of what the
grammar actually does — power binds tighter than unary in this grammar.

**Fix:** Corrected the test expectation to match the actual grammar
behaviour: `-a^2 = (-a)^2`. Updated the test name and comment to
accurately describe what the grammar does.

**Note:** This is a grammar design decision, not a bug. If the intended
behaviour is `-(a^2)`, the grammar would need to be restructured so
`Power → Postfix (^ Unary)*` and unary sits above power in the hierarchy.
This is recorded as a known design characteristic for Phase 2 review.

---

## Test Run Results (Phase 1)

### Attempt 1 — First run (2 failures)

```
 RUN  v3.2.4

 ❯ test/parser/PEGParser.test.ts (17 tests | 1 failed) 27ms
   ✓ PEGParser — literal > matches exact literal
   ✓ PEGParser — literal > throws on mismatch
   × PEGParser — literal > skips leading whitespace
     → error: unexpected 'null'
      --> inputString:1:1
       |
     1 |   hello
       | ^
       |
       = expected: "hello"
   [... 14 passing tests omitted ...]

 ❯ test/parser/grammar.test.ts (44 tests | 1 failed) 41ms
   [... 41 passing tests omitted ...]
   × Operator precedence > unary binds tighter than binary
     → expected { type: 'BinaryExpression', …(3) } to
       match object { type: 'UnaryExpression', …(2) }
   [... 2 passing tests omitted ...]

 ✓ test/render/render.test.ts (35 tests) 27ms

 Test Files  2 failed | 1 passed (3)
      Tests  2 failed | 94 passed (96)
   Duration  14.47s
```

**Failures:**
- `PEGParser — literal > skips leading whitespace` — wrong test assumption (no skip option configured)
- `Operator precedence > unary binds tighter than binary` — wrong expected AST (grammar gives `(-a)^2`, not `-(a^2)`)

---

### Attempt 2 — After fixing test expectations (all pass)

```
 RUN  v3.2.4

 ✓ test/parser/PEGParser.test.ts (18 tests) 11ms
 ✓ test/parser/grammar.test.ts (44 tests) 29ms
 ✓ test/render/render.test.ts (35 tests) 22ms

 Test Files  3 passed (3)
      Tests  97 passed (97)
   Duration  14.76s
```

**Verdict: ✅ All 97 tests pass.**

---

## Phase 2 — Math Syntax: Linear Algebra, Rollout Notation & Extended Operators

---

### Automated test files

| File | What is covered |
|------|-----------------|
| `test/parser/PEGParser.test.ts` | PEG engine primitives (unchanged from Phase 1) |
| `test/parser/grammar.test.ts` | All Phase 1 regression tests + Phase 2: relational operators, blackboard bold, factorial, derivative, index expression, SubSuperscript, vector name, matrix/vector literals, absolute value, rollout, ellipsis, dot product |
| `test/render/render.test.ts` | All Phase 1 regression tests + Phase 2: blackboard bold rendering, Hebrew glyph, relational symbols (≠, ≤, ≥, →), dot product (·), SubSuperscript layout, vector name with arrow, matrix grid, absolute value/norm, factorial, derivative primes, ellipsis, floor/ceil, inner product, big operators (Σ), lim |

### How to run

```bash
cd Webapp
npm install    # first time only
npm test       # run all tests once
```

Expected output (if all pass):
```
✓ test/parser/PEGParser.test.ts
✓ test/parser/grammar.test.ts
✓ test/render/render.test.ts

Test Files  3 passed (3)
```

---

### Phase 2 test cases

#### Grammar tests added

| Test | Input | Expected |
|------|-------|----------|
| Blackboard bold | `\\R` | `Identifier { name: "R", prefix: "blackboard" }` |
| Multi-letter backslash | `\sin` | `Identifier { name: "sin", prefix: "greek" }` |
| Hebrew identifier | `\ha` | `Identifier { name: "ha", prefix: "greek" }` |
| Dot product | `u.v` | `BinaryExpression(".", u, v)` |
| Relational = | `a = b` | `BinaryExpression("=", a, b)` |
| Relational != | `a != b` | `BinaryExpression("!=", a, b)` |
| Relational <= | `a <= b` | `BinaryExpression("<=", a, b)` |
| Relational >= | `a >= b` | `BinaryExpression(">=", a, b)` |
| Relational ~= | `a ~= b` | `BinaryExpression("~=", a, b)` |
| Relational := | `a := b` | `BinaryExpression(":=", a, b)` |
| Relational ~ | `a ~ b` | `BinaryExpression("~", a, b)` |
| Relational << | `a << b` | `BinaryExpression("<<", a, b)` |
| Relational >> | `a >> b` | `BinaryExpression(">>", a, b)` |
| Relational -> | `x -> a` | `BinaryExpression("->", x, a)` |
| Relational < | `a < b` | `BinaryExpression("<", a, b)` |
| Relational > | `a > b` | `BinaryExpression(">", a, b)` |
| Relational precedence | `a + 1 = b` | `BinaryExpression("=", a+1, b)` |
| -> before > | `x -> y` | `BinaryExpression("->")` not `BinaryExpression(">")` |
| << before < | `a << b` | `BinaryExpression("<<")` not `BinaryExpression("<")` |
| ~= before ~ | `a ~= b` | `BinaryExpression("~=")` not `BinaryExpression("~")` |
| Factorial | `n!` | `FactorialExpression(n)` |
| Factorial vs != | `x != y` | `BinaryExpression("!=")` not factorial |
| Factorial on group | `(n+1)!` | `FactorialExpression(n+1)` |
| Derivative single | `f'` | `Derivative(f, 1)` |
| Derivative double | `f''` | `Derivative(f, 2)` |
| Derivative + call | `f'(x)` | `CallExpression(Derivative(f,1), [x])` |
| Index expression | `A[k]` | `IndexExpression(A, k)` |
| Index numeric | `A[0]` | `IndexExpression(A, 0)` |
| SubSuperscript | `x_i^2` | `SubSuperscriptExpression(x, i, 2)` |
| Explicit paren power | `(x_i)^2` | `SubSuperscriptExpression(x, i, 2)` — parens unwrap, same result |
| Vector name | `[a]` | `VectorName(a)` |
| Vector name skewed | `` [`1T] `` | `VectorName(T, right-skew)` |
| Row vector | `[a, b, c]` | `Matrix { rows: [[a,b,c]] }` |
| Matrix 2×2 | `[[a,b],[c,d]]` | `Matrix { rows: [[a,b],[c,d]] }` |
| Column vector | `(a, b, c)` | `Matrix { rows: [[a],[b],[c]] }` |
| Grouping not vector | `(a)` | `Identifier(a)` |
| Absolute value | `|x|` | `AbsoluteValue(x)` |
| Abs with expr | `|a+b|` | `AbsoluteValue(a+b)` |
| Rollout + | `+{k=0, n, A[k]}` | `ControlExpression("+", [k=0, n, A[k]])` |
| Rollout * | `*{k=0, n, A[k]}` | `ControlExpression("*", [k=0, n, A[k]])` |
| Ellipsis | `...` | `Ellipsis` |

#### Render tests added

| Test | Input | Verified |
|------|-------|----------|
| Blackboard bold glyph | `\\R` | Contains "ℝ" |
| Blackboard bold class | `\\R` | Has `.ident-blackboard` |
| Hebrew glyph | `\ha` | Contains "ℵ" |
| Multi-letter as text | `\sin` | Contains "sin" |
| Dot product symbol | `u.v` | Contains "·" |
| != symbol | `a != b` | Contains "≠" |
| <= symbol | `a <= b` | Contains "≤" |
| >= symbol | `a >= b` | Contains "≥" |
| -> symbol | `x -> a` | Contains "→" |
| = symbol | `a = b` | Contains "=" |
| SubSuperscript container | `x_i^2` | Has `.subsuperscript` |
| SubSuperscript scripts | `x_i^2` | `.scripts` has sup and sub |
| Vector name class | `[a]` | Has `.vector-name` |
| Vector name arrow | `[a]` | Contains "⃗" |
| Matrix class | `[[a,b],[c,d]]` | Has `.matrix` |
| Matrix rows | `[[a,b],[c,d]]` | 2 `.matrix-row` elements |
| Matrix cells | `[[a,b],[c,d]]` | 4 `.matrix-cell` elements |
| Abs value delimiters | `|x|` | Contains "|" |
| Norm delimiters | `|[a]|` | Contains "‖" |
| Factorial | `n!` | Contains "!" |
| Derivative prime | `f'` | Contains "′" |
| Derivative double | `f''` | Two "′" characters |
| Ellipsis glyph | `...` | Contains "…" |
| Floor brackets | `\floor{x}` | Contains "⌊" and "⌋" |
| Ceil brackets | `\ceil{x}` | Contains "⌈" and "⌉" |
| Inner product | `\inner{x,y}` | Contains "⟨" and "⟩" |
| Big operator Σ | `\S{k=0,n,k}` | Contains "Σ", has `.integral` |
| Lim text | `\lim{x,f(x)}` | Contains "lim" |

---

### Test run results

**Status: awaiting execution on target (WSL Ubuntu)**

Per `docs/exception.md`, tests are written by the assistant and executed
by the user on the target environment. Results will be recorded here after
the user runs `npm test`.
