# Codebase Analysis

## Phase 1 — Parser & Basic Renderer

This document explains every concept and every piece of code in the project,
written for readers who are new to parsers, ASTs, or this codebase.

---

## Background Knowledge

### What is a Parser?

A parser reads a string of text and turns it into a structured data object
that a program can work with. For example, the string `"2+3*x"` is just
characters — a parser turns it into a tree that says:
"this is an addition of 2 and (3 multiplied by x)".

### What is a PEG Grammar?

PEG stands for **Parsing Expression Grammar**. It is a way of describing the
rules of a language. Each rule says: "to match this thing, try matching these
sub-things in this order". Rules can refer to other rules, forming a hierarchy.

A PEG grammar is **deterministic** — it never backtracks ambiguously. When a
choice fails, it moves on to the next option immediately.

### What is an AST?

AST stands for **Abstract Syntax Tree**. It is the tree-shaped data structure
that the parser produces. Each node in the tree represents one piece of the
expression:

```
Input:  2 + 3 * x

AST:
        BinaryExpression (+)
       /                  \
NumberLiteral(2)    BinaryExpression (*)
                   /                  \
           NumberLiteral(3)      Identifier(x)
```

The tree structure encodes operator precedence — multiplication is deeper in
the tree than addition, which means it is evaluated first.

### What is Operator Precedence?

In math, `2 + 3 * x` means `2 + (3 * x)`, not `(2 + 3) * x`. Multiplication
has higher precedence than addition. In a grammar, this is encoded by making
multiplication a "deeper" rule than addition — the parser must resolve
multiplication before it can resolve addition.

The precedence hierarchy in BobaMath (lowest to highest):

```
Additive        (+, -)
Multiplicative  (*, /, implicit)
Power           (^)
Unary           (-, +)
Postfix         (function calls, subscripts)
Primary         (numbers, identifiers, parentheses)
```

### What is Implicit Multiplication?

In math notation, writing two things next to each other often means multiply:
`2x` means `2 * x`, `sin(x)y` means `sin(x) * y`. This is called implicit
multiplication. It is trickier to parse than explicit `*` because there is no
operator character to trigger it — the parser must recognise that two adjacent
parseable things means multiply.

### What is Right-Associativity?

For most operators, `a - b - c` means `(a - b) - c` (left-to-right). This is
left-associativity. But for exponentiation, `a^b^c` conventionally means
`a^(b^c)` (right-to-left). This is right-associativity. The grammar handles
this by collecting all the `^` operands and then folding them from right to
left in the `build` function.

---

## Module Walkthrough

### `src/parser/types.ts`

This file defines all the TypeScript interfaces — the "shapes" of data used
throughout the project. It has two groups:

**PEG engine types** — describe the grammar rules themselves:

- `PEGExpression` — a union type: any grammar node is one of six kinds
- `LiteralExpression` — matches an exact string, e.g. `"+"`
- `RegexExpression` — matches a regular expression pattern, e.g. a number
- `SequenceExpression` — matches several things one after another
- `ChoiceExpression` — tries each option in order, uses the first that succeeds
- `RepeatExpression` — matches zero or more repetitions (like `*` in regex)
- `RuleReferenceExpression` — refers to another named rule by name
- `Grammar` — a dictionary mapping rule names to their PEG definition and
  optional `build` function
- `MatchResult` — either a `MatchSuccess` (with position and node) or a
  `MatchFailure` (with position only)

**AST node types** — describe the output of parsing:

- `NumberLiteralNode` — a numeric constant, e.g. `3.14`
- `IdentifierNode` — a variable or function name, e.g. `x` or `\int`
- `BinaryExpressionNode` — two operands and an operator, e.g. `a + b`
- `UnaryExpressionNode` — one operand and a prefix operator, e.g. `-x`
- `CallExpressionNode` — a function call, e.g. `f(x, y)`
- `ControlExpressionNode` — a control expression, e.g. `\int{a, b, f(x)}`
- `SubscriptExpressionNode` — a subscript, e.g. `x_i`
- `ASTNode` — a union of all the above; any node in the tree is one of these

---

### `src/parser/PEGParser.ts`

This is the parsing engine. It takes a `Grammar` object and an input string,
and produces an AST.

**Constructor**
```ts
new PEGParser(grammar, { skip: /^[ \t\r\n]+/ })
```
The `skip` pattern tells the parser to ignore whitespace between tokens.

**`parse(startRule, input)`**
The public entry point. It resets internal state, calls `matchRule` on the
start rule, and checks that the entire input was consumed. If anything fails,
it throws a formatted error message showing the line, column, and what was
expected.

**`matchRule(ruleName, position)`**
Looks up the rule by name in the grammar, runs `match` on its PEG expression,
then calls the rule's `build` function (if it has one) to transform the raw
parse result into an AST node.

**`match(expr, position)`**
Dispatches to the correct match method based on the expression type.

**`matchLiteral`**
Skips whitespace, then checks if the input at the current position starts with
the expected string. If yes, advances position by the string length.

**`matchRegex`**
Skips whitespace, slices the input from the current position, and tries to
match the regex at the start of that slice (`match.index !== 0` check ensures
it only matches at the current position, not somewhere later).

**`matchSequence`**
Runs each part in order, collecting results into an array. If any part fails,
the whole sequence fails immediately.

**`matchChoice`**
Tries each option in order. Returns the first success. If all fail, returns
failure. Importantly, it does **not** backtrack — once an option starts
succeeding and then fails mid-way, the whole choice fails (this is the PEG
"committed choice" behaviour).

**`matchRepeat`**
Runs the inner expression repeatedly until it fails or makes no progress
(position unchanged). Always succeeds, returning an array of zero or more
results.

**Error reporting**
The parser tracks the "best error" — the failure that got furthest into the
input. This gives the most useful error message, because the furthest failure
is usually closest to what the user intended.

---

### `src/parser/grammar.ts`

This file defines the BobaMath grammar as a `Grammar` object and exports a
ready-to-use `parser` instance.

Each entry in the grammar object has:
- `peg` — the PEG expression describing what to match
- `build` — a function that transforms the raw match result into an AST node

**Rule hierarchy (top to bottom = lowest to highest precedence):**

```
Expression → Additive
Additive → Multiplicative ((+|-) Multiplicative)*
Multiplicative → Power ((*|/) Power | ImplicitPower)*
ImplicitPower → Postfix (^ Unary)*
Power → Unary (^ Unary)*
Unary → (-|+) Unary | Postfix
Postfix → Primary (CallSuffix | ControlSuffix | SubscriptSuffix)*
Primary → Number | Identifier | ( Expression )
```

**Key design decision — `ImplicitPower` vs `Power`**

The implicit multiplication branch in `Multiplicative` uses `ImplicitPower`
instead of `Power`. The difference: `Power` starts from `Unary`, which can
consume a leading `+` or `-`. If implicit multiplication used `Power`, then
inside `(3+5)`, after parsing `3`, the implicit repeat would try `Power` →
`Unary` → match `+` as a unary sign, stealing it from `Additive` and turning
`3+5` into `3*(+5)`. `ImplicitPower` starts from `Postfix` instead, which
cannot consume a sign, so the `+` is left for `Additive` to handle correctly.

**`Additive` build function**

The PEG match produces `[left, [[op, right], [op, right], ...]]`. The build
function folds this left-to-right into a left-leaning binary tree:
```
2 + 3 + 4  →  BinaryExpression(+, BinaryExpression(+, 2, 3), 4)
```

**`Power` build function**

The PEG match produces `[left, [[^, a], [^, b], ...]]`. The build function
folds right-to-left to produce right-associative trees:
```
x^2^3  →  BinaryExpression(^, x, BinaryExpression(^, 2, 3))
```

**`Postfix` build function**

Accumulates suffixes (call, control, subscript) onto a base node left-to-right:
```
f(x)(y)  →  CallExpression(CallExpression(f, [x]), [y])
```

**`ArgumentList` build function**

Handles both empty `()` and non-empty `(a, b, c)` argument lists. The empty
case is matched by a zero-part sequence, which produces an empty array `[]`.

---

### `src/render/el.ts`

A tiny helper that creates an `HTMLElement`, optionally sets its `className`,
and appends children (which can be strings or other nodes). This avoids
repetitive `document.createElement` + `appendChild` boilerplate throughout
the renderer.

```ts
el("span", "fraction", [el("span", "top", [...]), el("span", "bottom", [...])])
```

---

### `src/render/render.ts`

Walks an AST and produces `HTMLElement` nodes. The main entry points are:

**`render(node)`**
Dispatches on `node.type` to the appropriate sub-renderer.

**`renderBinary(node)`**
Handles `+`, `-`, `*`, `/`, `^`. Computes whether parentheses are needed
around the left or right child by comparing operator precedences:
- Left child needs parens if the current operator has strictly higher
  precedence than the child's operator (except `^`, which uses `>=` to force
  parens on a left-associative sub-expression like `(a+b)^c`)
- Right child needs parens for `-` and `/` if the current operator has
  precedence `>=` the child's (because `a - (b - c) ≠ a - b - c`)

Division is rendered as a CSS fraction (stacked numerator/denominator).
Power is rendered with `<sup>`. Multiplication renders the two sides adjacent
with no operator symbol (implicit-style).

**`renderControl(node)`**
Dispatches on the control name. `\int` renders as an integral with stacked
bounds. `\sqrt` renders with a CSS radical. Unknown control names fall back to
a generic `name(args)` display.

**`renderMath(ast)`**
Wraps the rendered output in a `<span class="native-math">` which applies the
Cambria Math font and base sizing from `native-math.css`.

---

### `src/main.ts`

The application entry point. Runs after the DOM is loaded (`window.addEventListener("load", ...)`).

- Gets references to the input, result, error, and button DOM elements
- Attaches a click handler to the Render button that calls `parser.parse` and
  `renderMath`, inserting the result into the DOM
- Catches parse errors and displays them in the error div
- Pre-fills the input with the manual test case and triggers a click so the
  result is visible immediately on page load

---

### `index.html`

The HTML shell. Contains:
- Links to `style.css` and `native-math.css`
- A `<script type="module">` tag pointing to `src/main.ts` (Vite handles
  transpilation)
- The minimal DOM: `#input`, `#render` button, `#result`, `#error-message`

The page title and `#app` div identify the app as "BobaMath input renderer".

---

### `native-math.css`

Provides all the visual math rendering styles:
- `.fraction` — stacks numerator and denominator with a horizontal rule
- `.opstack` — stacks top label, operator symbol, and bottom label (used for
  integrals, sums, products)
- `.large-operator` — enlarges the operator symbol (∫, Σ, etc.)
- `.sqrt` — draws the radical sign using a CSS `::before` pseudo-element and
  a top border
- `.matrix` / `.matrix-row` / `.matrix-cell` — table-based matrix layout
  (CSS prepared, not yet wired in Phase 1)
- `.piecewise` — left-brace piecewise function layout (CSS prepared, not yet
  wired in Phase 1)
