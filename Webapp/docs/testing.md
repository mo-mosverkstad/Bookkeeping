# Testing

## Phase 1 — Parser & Basic Renderer

---

## How to Run Tests

There is no automated test runner in Phase 1. All tests are manual.

**Method 1 — Browser UI**
1. Start the dev server: `npm run dev`
2. Open `http://localhost:5173` in a browser
3. Type a test case into the input field and click Render
4. Observe the rendered output and the browser console (`F12 → Console`)
   for the JSON AST dump

**Method 2 — Hardcoded test injection**
`src/main.ts` pre-fills the input and auto-clicks Render on page load:
```ts
inputElement.value = "-2*(3+5)*4e^x^2";
buttonElement.click();
```
Change this line to test a different expression without typing.

**Method 3 — Browser console**
With the dev server running, open the console and call the parser directly:
```js
// The parser is not exposed globally in Phase 1.
// Use Method 1 or 2 instead.
```

---

## Phase 1 Test Cases

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
