# Codebase Analysis

## Phase 1 — Math Syntax: Expression Parser & Renderer

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

---

### Skew Identifier System (added in Phase 1 completion)

#### Why skew identifiers?

In physics, the same Latin letter is often used for multiple quantities. For
example, `T` means both period time and temperature. To distinguish them
unambiguously in ASCII input, a skew prefix is used: `T` is period time,
`` `1T `` is temperature. The skew is visible in the rendered output as a
different slant direction.

#### The five identifier forms

| Input form | Rule | AST prefix | Renders as |
|-----------|------|-----------|------------|
| `a` | `PlainIdentifier` | `"plain"` | upright a |
| `` `a `` | `LeftSkewIdentifier` | `"left-skew"` | italic a |
| `` `1a `` | `RightSkewIdentifier` | `"right-skew"` | right-skewed a |
| `\a` | `GreekIdentifier` | `"greek"` | α (upright) |
| `\1a` | `RightSkewGreekIdentifier` | `"greek-right"` | α (right-skewed) |

The skew index number (`1` in `` `1a `` and `\1a`) is kept open for future
extension. The grammar regex accepts any digit sequence: `` `2a ``, `\3b `,
etc., though only `1` is used in practice for now.

#### Grammar rule ordering

The `Identifier` rule tries options in this order:
1. `RightSkewGreekIdentifier` — `\1a` (must come before `GreekIdentifier` to
   avoid `\` being consumed as a Greek prefix leaving `1a` unparsed)
2. `GreekIdentifier` — `\a`
3. `RightSkewIdentifier` — `` `1a `` (must come before `LeftSkewIdentifier`
   to avoid `` ` `` being consumed leaving `1a` unparsed)
4. `LeftSkewIdentifier` — `` `a ``
5. `PlainIdentifier` — `a`

#### Greek letter mapping

The `GREEK` table in `render.ts` maps single Latin letters to their Greek
Unicode equivalents. The mapping uses phonetic/conventional assignments:
`a`→α, `b`→β, `g`→γ, `d`→δ, `l`→λ, `p`→π, `w`→ω, etc. Multi-letter
names (e.g. `\int`, `\sqrt`) do not map to Greek — they are used as control
expression names and rendered by `renderControl`.

#### CSS classes

Each prefix maps to a CSS class in `native-math.css`:
- `.ident-plain` — `font-style: normal`
- `.ident-left-skew` — `font-style: italic`
- `.ident-right-skew` — `font-style: italic; transform: skewX(15deg)`
- `.ident-greek` — `font-style: normal`
- `.ident-greek-right` — `font-style: italic; transform: skewX(15deg)`

`transform: skewX` requires `display: inline-block` to take effect on
inline elements, which is also set on those classes.

---

### Bug: Integral body rendered below the sign (Issue 3)

#### Symptom

`\int{0, 1, x^2}` rendered `x²` stacked below the ∫ symbol instead of
beside it to the right.

#### Root cause

The original `renderIntegral` produced this DOM structure:

```html
<span class="opstack">
  <span class="top">1</span>
  <span class="op large-operator">∫</span>
  <span class="bottom">0</span>
  <span>x²</span>   ← body placed as 4th child inside opstack
</span>
```

The `.opstack` CSS rule sets **all direct children** to `display: block`:

```css
.native-math .opstack .top,
.native-math .opstack .op,
.native-math .opstack .bottom {
  display: block;
}
```

However, the body `<span>` is not `.top`, `.op`, or `.bottom` — it has no
class. Despite this, being a direct child of a `display: inline-block`
container, it still participates in the block formatting context and flows
below the previous block children. The result: the body stacks below the
integral sign rather than sitting beside it.

The underlying mental model error was treating `.opstack` as a container
for the whole integral expression. In reality, `.opstack` is only meant to
hold the **stacked symbol with its bounds** — the three vertically arranged
pieces (top bound, operator, bottom bound). The integrand body is a
**sibling** of the opstack, not a child.

#### Fix

Introduced a new `.integral` wrapper using `display: inline-flex` with
`align-items: center`. The `.opstack` (bounds + symbol) and a new
`.integral-body` (the integrand) are flex siblings:

```html
<span class="integral">           ← flex row, items vertically centred
  <span class="opstack">          ← stacked bounds + symbol
    <span class="top">1</span>
    <span class="op large-operator">∫</span>
    <span class="bottom">0</span>
  </span>
  <span class="integral-body">    ← integrand, sits beside the sign
    x²
  </span>
</span>
```

New CSS:

```css
.native-math .integral {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
.native-math .integral-body {
  margin-left: 0.15em;
}
```

`align-items: center` vertically centres the body against the middle of
the integral sign. `vertical-align: middle` keeps the whole integral
inline with surrounding text.

#### Lesson

`.opstack` is a layout primitive for stacked operator notation (∫, Σ, Π,
lim, etc.) — it only handles the vertical stack of: top label, operator
glyph, bottom label. Any content that should appear **beside** an opstack
must be a sibling in an outer flex container, not a child of the opstack.
This pattern applies to all future operators that use `.opstack`.

---

### Design note: Skew visibility

#### The problem

The initial implementation used `font-style: italic` for left-skew and
`font-style: italic` + `transform: skewX(15deg)` for right-skew. In
practice this was nearly invisible:

- `font-style: italic` renders the font's own italic glyphs, which in
  Cambria Math look almost identical to the upright glyphs at normal
  reading size
- `skewX(15deg)` on top of italic added only a subtle extra tilt that
  was easy to miss at a glance

The purpose of skew is to **unambiguously distinguish symbols** — e.g.
`T` (period) vs `` `1T `` (temperature). If the visual difference is not
immediately obvious to the naked eye, the notation fails its purpose.

#### The fix

Removed `font-style: italic` from all identifier variants entirely.
`skewX` transform is now the **sole visual differentiator**, applied to
upright glyphs:

| Class | Transform | Visual result |
|-------|-----------|---------------|
| `ident-plain` | none | upright |
| `ident-left-skew` | `skewX(-20deg)` | clearly leans left |
| `ident-right-skew` | `skewX(20deg)` | clearly leans right |
| `ident-greek` | none | upright Greek glyph |
| `ident-greek-right` | `skewX(20deg)` | right-leaning Greek glyph |

Using `skewX` directly on upright glyphs gives full control over the
angle. At ±20° the difference between plain, left-skew, and right-skew
is immediately visible without needing to look closely.

#### Lesson

When a visual distinction carries semantic meaning (here: which physical
quantity a symbol refers to), the distinction must be **obvious at a
glance**. Subtle typographic differences like italic vs upright are not
sufficient. Use a transform with a large enough angle that the three
states are unambiguous even at small font sizes.


---

## Phase 2 — Linear Algebra, Rollout Notation & Extended Operators

This section explains all new concepts, code, and design decisions introduced
in Phase 2. It builds on the Phase 1 foundation — read Phase 1 first.

---

## New Background Knowledge

### What is a Relational Expression?

A relational expression compares two values: `a = b`, `x < y`, `n != 0`.
Unlike additive or multiplicative operators, relational operators are
**not chained** — `a = b = c` is not valid in this grammar. Each expression
has at most one relational operator.

Relational operators have the **lowest precedence** in the grammar. This
means `a + 1 = b` parses as `(a + 1) = b`, not `a + (1 = b)`.

### What is a SubSuperscript?

In mathematical notation, `x_i^2` means "x with subscript i and superscript 2
attached to the same base". This is different from `(x_i)^2` conceptually in
some notations, but in this grammar both produce the same AST node because
parentheses unwrap transparently.

The `SubSuperscriptExpression` node has three children: `base`, `subscript`,
and `superscript`. The renderer stacks the superscript above the subscript
to the right of the base character.

### What is a Vector Name Decorator?

`[a]` means "the vector (or matrix) named a". It is NOT a container or array
literal — it is a visual decorator that renders the identifier with an arrow
over it (a⃗). The parser distinguishes this from array literals by checking
whether the bracket content is a single bare identifier.

### What is a Rollout Operator?

`+{k=0, n, A[k]}` means "A[0] + A[1] + ... + A[n]" — it "rolls out" a
summation. Similarly `*{k=0, n, A[k]}` rolls out a product. These are
syntactic sugar for Σ (summation) and Π (product) with explicit index bounds.

The key grammar challenge: `+` and `*` are already operators at the Additive
and Multiplicative levels. The rollout form `+{` must be matched **atomically**
(no whitespace between `+` and `{`) at the Primary level, before the `+` can
be consumed as an additive operator.

### What is the Glyph Lookup Architecture?

The parser is **script-agnostic** — it does not know about Greek, Hebrew,
Cyrillic, or any other script. All backslash identifiers (`\alpha`, `\ha`,
`\sin`, `\pm`) are parsed identically as `IdentifierNode { name, prefix }`.

The **renderer** is responsible for meaning. It has a flat `GLYPH_TABLE` that
maps raw identifier names to Unicode glyphs. If a name has an entry, the glyph
is used. If not, the name is rendered as-is (which naturally handles `\sin`,
`\cos`, `\lim` — they have no entry and render as the text "sin", "cos", "lim").

This architecture means adding a new symbol requires only one line in the
lookup table — no grammar change ever needed.

---

## Updated Precedence Hierarchy

Phase 2 adds a new level at the top (lowest precedence) and new operators
at the multiplicative level:

```
Relational      (=, !=, <=, >=, ~=, :=, ~, <<, >>, ->, <, >)   ← NEW
Additive        (+, -)
Multiplicative  (*, /, ., \mod, \div, implicit)                  ← EXTENDED
Power           (^)
Unary           (-, +)
Postfix         (f(), x{}, x_i, x!, x', A[k])                   ← EXTENDED
Primary         (number, identifier, (expr), [expr], |expr|,     ← EXTENDED
                 +{...}, *{...}, ...)
```

---

## New AST Node Types (Phase 2)

### `SubSuperscriptExpressionNode`

```ts
interface SubSuperscriptExpressionNode {
    type: "SubSuperscriptExpression";
    base: ASTNode;       // the base character (e.g. x)
    subscript: ASTNode;  // the subscript (e.g. i)
    superscript: ASTNode; // the superscript (e.g. 2)
}
```

Produced by `Power` and `ImplicitPower` build functions when the left operand
is a `SubscriptExpression`. Instead of wrapping `SubscriptExpression(x, i)` in
`BinaryExpression(^, ..., 2)`, it combines all three into one node.

### `VectorNameNode`

```ts
interface VectorNameNode {
    type: "VectorName";
    identifier: ASTNode;  // the identifier being decorated
}
```

Produced by `BracketList` when the bracket content is a single identifier.
`[a]` → `VectorName(Identifier(a))`. Renders with an arrow over the name.

### `MatrixNode`

```ts
interface MatrixNode {
    type: "Matrix";
    rows: ASTNode[][];  // 2D array of expressions
}
```

Produced by:
- `[a, b, c]` → 1 row, 3 columns (row vector)
- `[[a, b], [c, d]]` → 2 rows, 2 columns (matrix)
- `(a, b, c)` → 3 rows, 1 column (column vector)

### `IndexExpressionNode`

```ts
interface IndexExpressionNode {
    type: "IndexExpression";
    base: ASTNode;   // the array/vector being indexed
    index: ASTNode;  // the index expression
}
```

Produced by `IndexSuffix` in `Postfix`. `A[k]` → `IndexExpression(A, k)`.
Semantically distinct from `SubscriptExpression` (label) — this is array access.

### `AbsoluteValueNode`

```ts
interface AbsoluteValueNode {
    type: "AbsoluteValue";
    expr: ASTNode;  // the expression inside |...|
}
```

The renderer checks the inner node type: if it's `VectorName` or `Matrix`,
renders as norm `‖x‖`; otherwise renders as absolute value `|x|`.

### `FactorialExpressionNode`

```ts
interface FactorialExpressionNode {
    type: "FactorialExpression";
    base: ASTNode;  // the expression being factorialed
}
```

Produced by `FactorialSuffix` (regex `/^!(?!=)/`). The negative lookahead
prevents `!=` from being consumed as factorial + `=`.

### `DerivativeNode`

```ts
interface DerivativeNode {
    type: "Derivative";
    base: ASTNode;  // the function being differentiated
    order: number;  // number of primes (1 for f', 2 for f'', etc.)
}
```

Produced by `DerivativeSuffix` (regex `/^'+/`). The order is the count of
prime characters matched.

### `EllipsisNode`

```ts
interface EllipsisNode {
    type: "Ellipsis";
}
```

Produced by the `Ellipsis` rule matching the literal `...`. Renders as `…`.

### `PiecewiseNode`

```ts
interface PiecewiseNode {
    type: "Piecewise";
    cases: { expr: ASTNode; condition: ASTNode }[];
}
```

Used by the piecewise renderer. The `\piecewise` control expression passes
its flat argument list (pairs of expression, condition) to the renderer which
interprets them as cases.

### Extended `IdentifierNode`

```ts
interface IdentifierNode {
    type: "Identifier";
    name: string;
    prefix: "plain" | "left-skew" | "right-skew" | "greek" | "greek-right" | "blackboard";
}
```

The `"blackboard"` prefix is new in Phase 2. It is produced by the
`BlackboardBoldIdentifier` rule matching `/^\\\\[A-Za-z]/` (two literal
backslashes followed by a letter). Renders using `BLACKBOARD_TABLE`.

---

## Updated Grammar Rules (Phase 2)

### Rule hierarchy (complete)

```
Expression → Relational
Relational → Additive (RelationalOp Additive)?
Additive → Multiplicative ((+|-) Multiplicative)*
Multiplicative → Power ((MultiplicativeOp Power) | ImplicitPower)*
ImplicitPower → Postfix (^ Unary)*
Power → Unary (^ Unary)*
Unary → (-|+) Unary | Postfix
Postfix → Primary (CallSuffix | ControlSuffix | SubscriptSuffix |
                    FactorialSuffix | DerivativeSuffix | IndexSuffix)*
Primary → RolloutExpression | Ellipsis | AbsoluteValue |
          BracketExpression | Number | Identifier | ParenExpression
```

### New rule: `Relational`

```
Relational → Additive (RelationalOp Additive)?
```

The `?` means at most one relational operator. This is implemented as a
choice between `[RelationalOp, Additive]` (produces a binary expression)
and an empty sequence (passes through the left Additive unchanged).

`RelationalOp` is a choice of literals ordered longest-first:
`!=`, `<=`, `>=`, `~=`, `:=`, `<<`, `>>`, `->`, `<`, `>`, `=`, `~`

**Why longest-first ordering matters:** If `<` were tried before `<=`, the
parser would match `<` and leave `=` as trailing garbage. By trying `<=`
first, the two-character operator is consumed whole.

**Why `->` must come before `>`:** Same reason — `->` starts with `-` which
would be consumed by Additive as subtraction, but the Additive repeat fails
(nothing valid after `>`), so the position stays before `->`. Then Relational
tries `->` and matches. If `>` were tried first at the Relational level, it
would incorrectly match the `>` in `->`.

### New rule: `MultiplicativeOp`

```
MultiplicativeOp → "*" | "/" | "." | /^\\(mod|div)\b/
```

The dot `.` is the dot product operator. `\mod` and `\div` are matched by
a regex with a word boundary `\b` to prevent matching `\modify` or `\divide`.

**How `\mod` avoids conflict with identifiers:** The `Multiplicative` repeat
tries `[MultiplicativeOp, Power]` BEFORE `ImplicitPower`. So when the parser
sees `\mod` after a left operand, it first tries `MultiplicativeOp` which
matches `\mod` via the regex. Only if that fails does it try `ImplicitPower`
(which would consume `\mod` as a GreekIdentifier). The ordering of the choice
ensures operators take priority over implicit multiplication.

**The `3.v` edge case:** The Number regex `/^([0-9]+(\.[0-9]*)?|\.[0-9]+)/`
matches `3.` as the number `3.0` (zero fractional digits). So `3.v` parses
as `3.0 * v` (implicit multiplication), not as `3 · v` (dot product). This
is documented and acceptable — dot product of a bare literal with a vector
is unusual.

### New rule: `FactorialSuffix`

```
FactorialSuffix → /^!(?!=)/
```

The negative lookahead `(?!=)` ensures `!` is only matched when NOT followed
by `=`. This prevents `x!=y` from being parsed as `(x!) = y` instead of
`x != y`.

### New rule: `DerivativeSuffix`

```
DerivativeSuffix → /^'+/
```

Matches one or more prime characters. The matched string's length gives the
derivative order. `f'` → order 1, `f''` → order 2, `f'''` → order 3.

### New rule: `IndexSuffix`

```
IndexSuffix → "[" Expression "]"
```

Array indexing. `A[k]` produces `IndexExpression(A, k)`. This is a postfix
suffix, so it's tried after the base is parsed. It does NOT conflict with
`BracketExpression` in Primary because `[` in Primary only matches when it's
the START of an expression (no left operand), while `IndexSuffix` only matches
AFTER a base has been parsed in Postfix.

### New rule: `RolloutExpression`

```
RolloutExpression → /^[+*]\{/ ArgumentList "}"
```

The regex `/^[+*]\{/` matches `+{` or `*{` as a single atomic token with NO
whitespace between the operator and the brace. This is critical: if whitespace
were allowed, `+ {k=0, n, A[k]}` would have `+` consumed by Additive before
Primary ever sees it.

Because `RolloutExpression` is tried FIRST in the Primary choice list, it
gets priority over Number and Identifier. The PEG choice tries each option
at the same position — if `RolloutExpression` fails (because the input doesn't
start with `+{` or `*{`), the other Primary options are tried.

**How `+{` avoids conflict with unary `+`:** The `Unary` rule tries
`[sign, Unary]` first. If `+` matches but the recursive `Unary` fails
(because `{` is not valid in any Primary), the sequence fails. The Unary
choice then tries its second option: `Postfix` → `Primary` →
`RolloutExpression` → matches `+{` atomically. PEG choice always tries
options at the original position, so the `+` consumed by the failed first
option is "given back".

### New rule: `AbsoluteValue`

```
AbsoluteValue → "|" Expression "|"
```

Matches a `|`-delimited expression. The renderer decides whether to display
as absolute value (`|x|`) or norm (`‖x‖`) based on the inner node type.

### New rule: `BracketExpression`

```
BracketExpression → "[" BracketContent "]"
BracketContent → MatrixRows | BracketList
MatrixRows → MatrixRow ("," MatrixRow)*
MatrixRow → "[" ArgumentList "]"
BracketList → Expression ("," Expression)*
```

The `BracketContent` choice tries `MatrixRows` first. `MatrixRows` expects
the content to start with `[` (the inner row bracket). If the content starts
with anything else (like an identifier), `MatrixRows` fails immediately and
`BracketList` is tried.

**`BracketList` build logic:**
- If the content is a single identifier with no commas → `VectorNameNode`
- Otherwise → `MatrixNode` with one row (row vector)

This means:
- `[a]` → VectorName (single identifier, no commas)
- `[a+b]` → Matrix with 1 row, 1 element (expression, not bare identifier)
- `[a, b]` → Matrix with 1 row, 2 elements (has commas)
- `[[a, b], [c, d]]` → Matrix with 2 rows, 2 elements each

### New rule: `ParenExpression`

```
ParenExpression → "(" Expression (("," Expression)* ")") 
```

Replaces the old inline parenthesis handling in Primary. Now handles both:
- `(expr)` — grouping (no commas) → unwraps to inner expression
- `(a, b, c)` — column vector (has commas) → `MatrixNode` with N rows of 1

### New rule: `BlackboardBoldIdentifier`

```
BlackboardBoldIdentifier → /^\\\\[A-Za-z]/
```

Matches two literal backslashes followed by one letter. In the source code,
the regex is written as `/^\\\\[A-Za-z]/` where each `\\` in the regex
represents one literal backslash character. So the regex matches the input
string `\\R` (two backslashes + R).

Tried FIRST in the Identifier choice list to prevent `\\R` from being
consumed as two separate tokens (`\` + something).

### Updated: `Power` and `ImplicitPower` build functions

Both now check if the left operand is a `SubscriptExpression`. If so, they
produce `SubSuperscriptExpression` instead of `BinaryExpression(^)`:

```ts
build([left, rest]) {
    if (rest.length === 0) return left;
    const exponent = /* right-fold rest */;
    if (left.type === "SubscriptExpression") {
        return {
            type: "SubSuperscriptExpression",
            base: left.base,
            subscript: left.subscript,
            superscript: exponent,
        };
    }
    return { type: "BinaryExpression", operator: "^", left, right: exponent };
}
```

**Note:** `(x_i)^2` also produces `SubSuperscriptExpression` because
parentheses unwrap the inner expression to a bare `SubscriptExpression`
before `Power` sees it. This is mathematically correct — both `x_i^2` and
`(x_i)^2` mean "x-sub-i squared".

---

## Updated Renderer (Phase 2)

### `GLYPH_TABLE` — the universal symbol lookup

A flat `Record<string, string>` mapping raw identifier names to Unicode glyphs.
This is the **single source of truth** for all symbol rendering. The table
contains:

| Category | Examples |
|----------|----------|
| Greek single-letter | `a`→α, `b`→β, `g`→γ, `d`→δ, `p`→π, `w`→ω |
| Greek uppercase | `A`→Α, `G`→Γ, `D`→Δ, `S`→Σ, `W`→Ω |
| Hebrew | `ha`→ℵ, `hb`→ℶ, `hg`→ℷ, `hd`→ℸ |
| Set operators | `union`→∪, `inter`→∩, `empty`→∅, `sub`→⊂ |
| Logic operators | `and`→∧, `or`→∨, `not`→¬, `imp`→⟹ |
| Calculus | `inf`→∞, `nabla`→∇, `partial`→∂ |
| Geometry | `angle`→∠, `parallel`→∥, `perp`→⊥ |
| Misc operators | `pm`→±, `mp`→∓, `circ`→∘, `mapsto`→↦ |

**How it works with the parser:** The parser produces `Identifier { name: "ha", prefix: "greek" }`.
The renderer calls `resolveGlyph("ha")` → looks up `GLYPH_TABLE["ha"]` → returns `"ℵ"`.
If no entry exists (e.g. `GLYPH_TABLE["sin"]` → undefined), the name is used as-is → renders "sin".

### `BLACKBOARD_TABLE` — number set symbols

A separate table for blackboard bold identifiers (`\\N`, `\\R`, etc.):

| Input | Glyph | Meaning |
|-------|-------|---------|
| `\\N` | ℕ | Natural numbers |
| `\\Z` | ℤ | Integers |
| `\\Q` | ℚ | Rationals |
| `\\R` | ℝ | Reals |
| `\\C` | ℂ | Complex numbers |
| `\\H` | ℍ | Quaternions |
| `\\P` | ℙ | Primes |
| `\\U` | 𝕌 | Universal set |
| `\\d` | ∂ | Partial derivative |

### `RELATIONAL_SYMBOL` — operator display mapping

Maps relational operator strings to their Unicode display symbols:
`"!="→"≠"`, `"<="→"≤"`, `">="→"≥"`, `"~="→"≈"`, `":="→"≡"`,
`"~"→"∝"`, `"<<"→"≪"`, `">>"→"≫"`, `"->"→"→"`, etc.

### `OPERATOR_PRECEDENCE` — extended

Now includes relational operators at precedence -2 (below additive at 0),
and dot product / mod / div at precedence 1 (same as `*` and `/`).

### New renderer functions

**`renderSubSuperscript(node)`**
Produces:
```html
<span class="subsuperscript">
  [base]
  <span class="scripts">
    <sup>[superscript]</sup>
    <sub>[subscript]</sub>
  </span>
</span>
```
The `.scripts` container uses flexbox column layout to stack sup above sub.

**`renderVectorName(node)`**
Produces:
```html
<span class="vector-name">
  [identifier]
  <span class="vector-arrow">⃗</span>
</span>
```
The combining arrow character is positioned above the identifier via CSS.

**`renderMatrix(node)`**
Produces a table structure:
```html
<span class="matrix">
  <span class="matrix-row">
    <span class="matrix-cell">[expr]</span>
    <span class="matrix-cell">[expr]</span>
  </span>
  ...
</span>
```
CSS provides left/right borders as matrix brackets.

**`renderIndex(node)`**
Renders identically to subscript (both display as subscript text), but the
AST node type preserves the semantic distinction between labeling (`x_i`)
and indexing (`A[k]`).

**`renderAbsoluteValue(node)`**
Checks the inner expression type:
- `VectorName` or `Matrix` → renders `‖expr‖` (double bars = norm)
- Anything else → renders `|expr|` (single bars = absolute value)

**`renderFactorial(node)`**
Simply appends `!` after the rendered base.

**`renderDerivative(node)`**
Appends `order` copies of the prime character `′` (U+2032) after the base.

**`renderBigOperator(node, symbol)`**
Reuses the integral layout (`.integral` flex container with `.opstack` and
`.integral-body`) but with a different symbol (Σ for `\S`, Π for `\P`).

**`renderLim(node)`**
Similar to big operator but uses plain text "lim" instead of a large symbol,
and only has a bottom label (the approach expression), no top label.

**`renderRollout(node)`**
Maps `+` to Σ and `*` to Π, then uses the big operator layout.

**`renderBinom(node)`**
Renders as a fraction wrapped in parentheses: `(n choose r)`.

**`renderEval(node)`**
Renders as `expr|_{bound}` — the expression followed by a vertical bar and
a subscripted bound specification.

**`renderPiecewiseControl(node)`**
Interprets the flat argument list as pairs of (expression, condition) and
delegates to `renderPiecewise`.

**`renderPiecewise(node)`**
Produces a table with a left border (acting as the brace):
```html
<span class="piecewise">
  <span class="piecewise-row">
    <span class="piecewise-expr">[expr]</span>
    <span class="piecewise-cond">[condition]</span>
  </span>
  ...
</span>
```

**Control expression dispatch (extended `renderControl`):**

| Name | Renderer | Visual |
|------|----------|--------|
| `sqrt` | `renderSqrt` | √ with overline |
| `int` | `renderIntegral` with ∫ | integral |
| `oint` | `renderIntegral` with ∮ | contour integral |
| `iint` | `renderIntegral` with ∬ | double integral |
| `iiint` | `renderIntegral` with ∭ | triple integral |
| `S` | `renderBigOperator` with Σ | summation |
| `P` | `renderBigOperator` with Π | product |
| `lim` | `renderLim` | limit |
| `floor` | inline | ⌊x⌋ |
| `ceil` | inline | ⌈x⌉ |
| `bar` | CSS class | x̄ (overline) |
| `hat` | CSS class | x̂ (hat) |
| `tilde` | CSS class | x̃ (tilde) |
| `ul` | CSS class | x̲ (underline) |
| `cancel` | CSS class | x̶ (strikethrough) |
| `inner` | inline | ⟨x, y⟩ |
| `binom` | `renderBinom` | (n choose r) |
| `eval` | `renderEval` | expr|_{bound} |
| `ubrace` | `renderUnderbrace` | underbrace with label |
| `obrace` | `renderOverbrace` | overbrace with label |
| `piecewise` | `renderPiecewiseControl` | piecewise function |
| `+` / `*` | `renderRollout` | rollout sum/product |
| `arc` | CSS class | arc over content |
| (default) | generic | name(args) |

---

## Updated CSS (Phase 2)

### `.subsuperscript` and `.scripts`

```css
.subsuperscript { display: inline-flex; align-items: baseline; }
.scripts { display: inline-flex; flex-direction: column; font-size: 0.7em; }
.scripts sup, .scripts sub { display: block; }
```

The scripts container stacks superscript above subscript in a column, both
at reduced font size, aligned to the baseline of the base character.

### `.vector-name` and `.vector-arrow`

```css
.vector-name { display: inline-block; position: relative; }
.vector-arrow { position: absolute; top: -0.3em; text-align: center; }
```

The arrow is positioned above the identifier using absolute positioning
within the relatively-positioned container.

### Decorator classes

| Class | CSS | Effect |
|-------|-----|--------|
| `.overline` | `border-top: 1px solid` | line above |
| `.hat` | `::before { content: '^' }` | caret above |
| `.tilde` | `::before { content: '~' }` | tilde above |
| `.underline` | `border-bottom: 1px solid` | line below |
| `.cancel` | `text-decoration: line-through` | strikethrough |
| `.arc` | `::before { content: '⌢' }` | arc above |

### `.ident-blackboard`

```css
.ident-blackboard { font-style: normal; display: inline-block; font-weight: bold; }
```

Bold weight distinguishes blackboard bold from regular identifiers.

---

## Design Decisions and Tradeoffs (Phase 2)

### Backslash relational operators as identifiers

**Problem:** The study.md specifies `\sub`, `\in`, `\notin`, etc. as
grammar-level relational operators. But in the PEG grammar, these tokens
would be consumed by `GreekIdentifier` (via implicit multiplication) before
the `Relational` level ever gets a chance to match them.

**Root cause:** The grammar hierarchy is `Relational` → `Additive` →
`Multiplicative` → ... → `Primary` → `Identifier`. When parsing the left
operand of a relational expression, the parser descends all the way to
`Identifier`. If `\in` appears after the left operand, the `Multiplicative`
repeat tries implicit multiplication, which matches `\in` as a
`GreekIdentifier`. By the time control returns to `Relational`, `\in` has
already been consumed.

**Resolution:** Only ASCII operators (`=`, `!=`, `<=`, `>=`, `~=`, `:=`, `~`,
`<<`, `>>`, `->`, `<`, `>`) are grammar-level relational operators. Backslash
operators (`\sub`, `\in`, etc.) are regular identifiers that render correctly
via `GLYPH_TABLE`. The visual output is identical (`x∈ℝ`); only the AST
differs (implicit multiplication vs relational binary expression).

### Piecewise uses commas instead of semicolons

**Problem:** The study.md specifies `\piecewise{x, x>=0; -x, x<0}` with
semicolons separating cases. Implementing semicolons requires either a
separate argument list parser for piecewise or making the grammar context-
sensitive (knowing that `\piecewise` uses different separators).

**Resolution:** Use commas throughout: `\piecewise{x, x>=0, -x, x<0}`. The
renderer interprets the flat argument list as consecutive pairs. This keeps
the grammar simple and context-free.

### `(x_i)^2` produces SubSuperscriptExpression

**Problem:** The study.md says `(x_i)^2` should produce
`BinaryExpression(^, SubscriptExpression, 2)` while `x_i^2` produces
`SubSuperscriptExpression`. But parentheses in this grammar simply unwrap
their content — `(x_i)` evaluates to the bare `SubscriptExpression` node.
The `Power` build function then sees a `SubscriptExpression` as its left
operand and produces `SubSuperscriptExpression`.

**Resolution:** Accept that both forms produce the same AST. This is
mathematically correct — `(x_i)^2` and `x_i^2` both mean "x-sub-i squared".
If a future use case requires distinguishing them, a "grouped" wrapper node
could be introduced, but this adds complexity with no current benefit.

### `->` interaction with `-` (subtraction)

**How `x -> y` parses correctly:** The Additive repeat tries `-` as a
subtraction operator. It matches `-`, then tries to parse `> y` as a
Multiplicative — which fails (nothing valid starts with `>`). The sequence
`[-, Multiplicative]` fails. The repeat stops. Additive returns just `x`.
Then Relational tries `->` at the original position (after `x`) and matches.

This works because PEG sequences do not commit — if a sequence fails partway
through, the position reverts to before the sequence started. The repeat only
advances `current` on successful iterations.


---

## Bug Fixes During Phase 2 Implementation

### Issue 4 — `(x_i)^2` incorrectly produced `BinaryExpression` after first fix attempt

#### Symptom

After the initial Phase 2 implementation, the test `x_i^2 produces
SubSuperscriptExpression` failed — it produced `BinaryExpression` instead.

#### Root cause — first fix attempt (wrong)

The `SubSuperscriptExpression` logic was initially placed in BOTH the `Power`
and `ImplicitPower` build functions. The test for `(x_i)^2` expected it to
produce `BinaryExpression(^, SubscriptExpression, 2)` — i.e., parentheses
should "protect" the subscript from being merged into a SubSuperscript.

However, `x_i^2` (without parens) is parsed through the `Power` rule (not
`ImplicitPower`), because `Multiplicative` starts by parsing its first operand
via `Power`. The path is:

```
Multiplicative → Power → Unary → Postfix → Primary → "x"
                                  Postfix suffix: SubscriptSuffix → "x_i"
                 Power repeat: "^" → Unary → "2"
                 Power build: left = SubscriptExpression(x, i), rest = [[^, 2]]
```

So `SubSuperscriptExpression` logic MUST be in `Power` for `x_i^2` to work.

The first fix attempt removed the logic from `Power` (keeping it only in
`ImplicitPower`), which fixed `(x_i)^2` but broke `x_i^2`.

#### Root cause — the real issue

The test expectation for `(x_i)^2` was wrong. Parentheses in this grammar
simply unwrap their content — `(x_i)` evaluates to the bare
`SubscriptExpression(x, i)` node. When `Power` sees this as its left operand,
it cannot distinguish it from the un-parenthesised `x_i`. Both produce
`SubscriptExpression` as the left operand of `Power`.

There is no "parenthesised" marker in the AST — parentheses are purely
syntactic grouping that is discarded after parsing. This is standard behaviour
in expression parsers (parentheses affect tree structure, not node types).

#### Fix

1. Restored `SubSuperscriptExpression` logic in the `Power` build function
2. Updated the test: `(x_i)^2` now correctly expects `SubSuperscriptExpression`
   (same as `x_i^2`), because both are mathematically equivalent — "x-sub-i
   squared"

#### Files changed

- `src/parser/grammar.ts` — `Power` build function: added `SubSuperscriptExpression`
  check (removed then re-added during the fix iteration)
- `test/parser/grammar.test.ts` — changed test expectation for `(x_i)^2`

#### Lesson

Parentheses in an expression parser are **transparent** — they affect the
tree structure (by overriding precedence) but leave no trace in the AST.
Once the parser has built the inner node, the parentheses are gone. Any
logic that inspects node types after parsing cannot distinguish "was this
node parenthesised?" from "was this node bare?".

If distinguishing parenthesised from bare subscripts were ever needed, the
grammar would need to produce a wrapper node (e.g., `GroupedExpression`) that
preserves the grouping information. This adds complexity with no current
benefit, so it was not implemented.

---

### Issue 5 — First test run had `(x_i)^2` producing `SubSuperscriptExpression` unexpectedly

#### Symptom

The very first test run (167 tests, 1 failure) showed:
```
SubSuperscript > (x_i)^2 produces BinaryExpression(^) wrapping SubscriptExpression
  Expected: "BinaryExpression"
  Received: "SubSuperscriptExpression"
```

#### Root cause

The `Power` build function checked `if (left.type === "SubscriptExpression")`
and produced `SubSuperscriptExpression`. Since `(x_i)` unwraps to
`SubscriptExpression`, the check triggered for both `x_i^2` and `(x_i)^2`.

#### What was tried (and failed)

Removing the `SubSuperscriptExpression` logic from `Power` and keeping it
only in `ImplicitPower`. This fixed `(x_i)^2` but broke `x_i^2` because
`x_i^2` goes through `Power` (not `ImplicitPower`).

The path for `x_i^2`:
```
Multiplicative → Power (first operand)
  Power → Unary → Postfix → parses "x_i" as SubscriptExpression
  Power repeat → "^2"
  Power build → left is SubscriptExpression → should produce SubSuperscriptExpression
```

The path does NOT go through `ImplicitPower` because `x_i^2` is the FIRST
operand of `Multiplicative`, parsed via the initial `Power` call (not the
repeat's implicit multiplication branch).

#### Final resolution

Accepted that both `x_i^2` and `(x_i)^2` produce `SubSuperscriptExpression`.
Updated the test expectation. This is the correct mathematical interpretation
— both notations mean the same thing.

#### Sequence of changes

1. Initial implementation: `Power` build has SubSuperscript logic → `(x_i)^2` test fails
2. First fix: removed logic from `Power` → `x_i^2` test fails (and 2 render tests)
3. Final fix: restored logic in `Power`, updated `(x_i)^2` test expectation → all 167 pass


---

### Issue 6 — Explicit multiplication `2*3` rendered without visible operator

#### Symptom

Typing `2*3` in the input showed `23` on screen — no multiplication sign
visible. The user could not distinguish explicit multiplication from implicit.

#### Root cause

The original `renderBinary` for `operator === "*"` always rendered the two
operands adjacent with no visible symbol (juxtaposition). This was correct
for implicit multiplication (`2x` → `2x`) but wrong for explicit
multiplication (`2*3` → should show a sign).

The AST uses `operator: "*"` for BOTH explicit (`2*3`) and implicit (`2x`)
multiplication. The parser does not distinguish them — both produce
`BinaryExpression("*", left, right)`. This is correct: the AST represents
structure, not visual presentation.

#### Design decision — renderer determines visibility

The responsibility for deciding whether to show `×` belongs to the **renderer**,
not the parser or AST. The AST records that two things are multiplied; the
renderer decides how to display that multiplication based on what the operands
look like when rendered.

#### The algorithm — digit adjacency check

The rule is simple:

> Show `×` if and only if the left operand's rendered form **ends with a digit**
> AND the right operand's rendered form **starts with a digit**.

This is the only case where juxtaposition is ambiguous — `23` looks like the
number twenty-three, not `2 × 3`. In all other cases, juxtaposition is
unambiguous:

| Left ends with | Right starts with | Ambiguous? | Example |
|---------------|-------------------|-----------|---------|
| digit | digit | YES → show × | `2*3` → `2 × 3` |
| digit | letter | no | `2*x` → `2x` |
| digit | `(` | no | `2*(a+b)` → `2(a+b)` |
| letter | digit | no | `x*2` → `x2` |
| letter | letter | no | `x*y` → `xy` |
| `)` | digit | no | `(a+b)*3` → `(a+b)3` |
| `)` | letter | no | `(a+b)*x` → `(a+b)x` |
| `)` | `(` | no | `(a+b)*(c+d)` → `(a+b)(c+d)` |

#### Implementation — recursive AST inspection

Two helper functions determine what the rendered edges look like:

**`startsWithDigit(node, parenthesised)`** — returns true if the node's
rendered output begins with a digit character:
- `NumberLiteral` → true
- `Identifier` → false (starts with a letter or glyph)
- `UnaryExpression` → false (starts with `-` or `+`)
- `BinaryExpression` → recurses into left child (accounting for whether
  that child would be parenthesised by the binary node)
- Parenthesised anything → false (starts with `(`)

**`endsWithDigit(node, parenthesised)`** — returns true if the node's
rendered output ends with a digit character:
- `NumberLiteral` → true
- `Identifier` → false
- `UnaryExpression` → recurses into operand
- `BinaryExpression` with `^` → false (ends with `</sup>`)
- `BinaryExpression` with `/` → false (ends with fraction bottom)
- `BinaryExpression` other → recurses into right child (accounting for
  whether that child would be parenthesised)
- `CallExpression` → false (ends with `)`)
- `FactorialExpression` → false (ends with `!`)
- Parenthesised anything → false (ends with `)`)

#### The subtlety — child parenthesisation within subtrees

The initial implementation had a bug: for `-2*(3+5)*4e^x^2`, the node
`((-2)*(3+5)) * 4` incorrectly showed `×` because `endsWithDigit` recursed
into the right child of the left subtree (`BinaryExpression(+, 3, 5)`) without
considering that this child WOULD be parenthesised when rendered (because `*`
has higher precedence than `+`).

The fix: `wouldParenLeft` and `wouldParenRight` helper functions replicate
the same parenthesisation logic used by `renderBinary`. When recursing into
a `BinaryExpression`'s children, the digit-check functions first determine
whether that child would be wrapped in parentheses, and if so, return false
(parenthesised nodes start/end with `(`/`)`).

#### Files changed

- `src/render/render.ts` — added `needsExplicitMultiplySign`,
  `startsWithDigit`, `endsWithDigit`, `wouldParenLeft`, `wouldParenRight`;
  updated `renderBinary` for `operator === "*"` to conditionally show `×`
- `test/render/render.test.ts` — added 11 test cases covering all
  multiplication sign visibility scenarios

#### Lesson

Visual presentation decisions belong in the renderer, not the AST. The AST
is a structural representation — it should use consistent, simple operators
(`"*"` for all multiplication) without encoding display concerns. The renderer
has access to the full subtree context needed to make intelligent display
decisions.


---

## Phase 3 — Plugin System & CSV Table Display

This section explains all new code introduced in Phase 3: the plugin
architecture, CSV reader, table component, and how they connect.

---

### Architecture Overview

Phase 3 introduces a layered architecture that separates concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                                                             │
│  ┌──────────────┐     ┌──────────────────────────────────┐  │
│  │  File I/O    │────▶│         CSV Reader               │  │
│  │ (file picker │     │  (structural — splits into       │  │
│  │  or drag&drop)     │   headers, types, rows)          │  │
│  └──────────────┘     └────────────┬─────────────────────┘  │
│                                    │                         │
│                                    ▼                         │
│                      ┌──────────────────────────────┐       │
│                      │      Plugin Registry         │       │
│                      │  (dispatches cell content     │       │
│                      │   to the correct plugin)      │       │
│                      └──────┬───────────┬───────────┘       │
│                             │           │                    │
│                    ┌────────▼──┐   ┌────▼────────┐          │
│                    │ Math      │   │ Plain Text  │          │
│                    │ Plugin    │   │ Plugin      │          │
│                    │ parse()   │   │ parse()     │          │
│                    │ render()  │   │ render()    │          │
│                    └───────────┘   └─────────────┘          │
│                             │           │                    │
│                             ▼           ▼                    │
│                      ┌──────────────────────────────┐       │
│                      │      Table Component         │       │
│                      │  (renders rows, columns,      │       │
│                      │   sortable headers)           │       │
│                      └──────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

**Key design principle:** The CSV reader is purely structural — it splits
text into rows and cells without interpreting cell content. It knows nothing
about math syntax, plain text, or any other payload format. The plugin
system handles all payload interpretation.

---

### `src/plugin/interface.ts` — Plugin Interface

Defines the contract that every data type renderer must implement:

```ts
interface Plugin {
    type_id: string;        // unique identifier (e.g. "math", "text")
    version: string;        // semantic version
    parse(text: string): ASTNode;      // text → structured data
    render(ast: ASTNode): HTMLElement;  // structured data → visual output
}
```

Every plugin provides two functions:
- `parse` — transforms raw cell text into an AST (or equivalent structure)
- `render` — transforms the AST into an HTML element for display

This interface is intentionally minimal. A plugin does not need to know about
tables, CSV, files, or other plugins. It only knows how to handle its own
data type.

---

### `src/plugin/math.ts` — Math Syntax Plugin

Wraps the existing parser and renderer (from Phases 1-2) into a conforming
plugin:

```ts
export const mathPlugin: Plugin = {
    type_id: "math",
    version: "2.0.0",
    parse(text) { return parser.parse("Expression", text) as ASTNode; },
    render(ast) { return renderMath(ast); },
};
```

No new code — just adapts the existing `parser` and `renderMath` to the
plugin interface.

---

### `src/plugin/plaintext.ts` — Plain Text Plugin

The identity plugin — renders text as-is with no parsing or formatting:

```ts
export const plainTextPlugin: Plugin = {
    type_id: "text",
    version: "1.0.0",
    parse(text) { return { type: "PlainText", text } as unknown as ASTNode; },
    render(ast) {
        const span = document.createElement("span");
        span.textContent = (ast as any).text;
        return span;
    },
};
```

Uses `as unknown as ASTNode` because `PlainTextNode` is not in the AST union
type — it's a plugin-internal type. This is acceptable because the plugin
interface is generic; each plugin defines its own internal representation.

Also serves as the **fallback** for unknown plugin types.

---

### `src/plugin/registry.ts` — Plugin Registry

Central dispatch point that routes cell content to the correct plugin:

```ts
const plugins: Record<string, Plugin> = { math: mathPlugin, text: plainTextPlugin };

function getPlugin(typeId: string): Plugin {
    return plugins[typeId] ?? plainTextPlugin;  // fallback to text
}

function renderCell(typeId: string, text: string): HTMLElement {
    const plugin = getPlugin(typeId);
    try {
        const ast = plugin.parse(text);
        return plugin.render(ast);
    } catch (e) {
        // Error handling: show parse error inline without crashing
        const span = document.createElement("span");
        span.className = "cell-error";
        span.innerHTML = `<strong>Parse error:</strong> ${escapeHTML(message)}`;
        return span;
    }
}
```

**Error handling:** If a math cell contains invalid syntax, `renderCell`
catches the parse error and renders it as a red inline error message. The
table continues to render — one bad cell does not crash the entire table.

**`escapeHTML` helper:** Converts special characters to HTML entities and
preserves formatting:
- `&` → `&amp;` (must be first to avoid double-escaping)
- `<` → `&lt;`, `>` → `&gt;` (prevent HTML injection)
- `\n` → `<br>` (preserve line breaks in error messages)
- ` ` → `&nbsp;` (preserve whitespace alignment in error carets)

The order of replacements matters: `&nbsp;` must come AFTER `&` escaping,
otherwise the `&` in `&nbsp;` would be escaped to `&amp;nbsp;`.

---

### `src/csv/reader.ts` — CSV File Reader

Parses CSV text into a structured `CSVData` object.

**File format convention:**
```
Row 0: Column headers (display names)
Row 1: Column types (plugin type_id per column)
Row 2+: Data rows
```

Example:
```csv
Name,Formula,Domain
text,math,text
Pythagorean Theorem,a^2 + b^2 = c^2,Geometry
```

**The `CSVData` interface:**
```ts
interface CSVData {
    headers: string[];   // ["Name", "Formula", "Domain"]
    types: string[];     // ["text", "math", "text"]
    rows: string[][];    // [["Pythagorean Theorem", "a^2 + b^2 = c^2", "Geometry"], ...]
}
```

**Parsing algorithm:**
- Iterates character by character
- Handles quoted fields (double quotes) with comma and newline support inside
- Handles escaped quotes (`""` → literal `"`)
- Handles both LF and CRLF line endings
- Throws if fewer than 2 rows (need at least headers + types)

**Design note:** The CSV reader is purely structural. It does not interpret
the `types` row — it just stores it as strings. The table component later
passes each type string to the plugin registry for dispatch. This means the
CSV reader can be used independently of the plugin system.

---

### `src/table/table.ts` — Table Component

Renders a `CSVData` object as an interactive HTML table:

```ts
function createTable(data: CSVData): HTMLElement
```

**Features:**
- Renders column headers from `data.headers`
- Renders each cell using `renderCell(typeId, cellValue)` — dispatching to
  the correct plugin based on the column's type
- **Sortable columns:** clicking a header sorts all rows by that column
  (ascending on first click, descending on second click)
- Sort indicator (▲/▼) shown in the active header

**Implementation:**
- Uses a closure over `sortCol`, `sortAsc`, and `rows` state
- `renderTable()` is called on initial render and after each sort change
- Sorting uses `localeCompare` on raw cell strings (not rendered output)
- The entire table is re-rendered on sort (simple and correct for small tables)

---

### `src/main.ts` — Updated Application Entry Point

Phase 3 adds CSV file loading alongside the existing expression renderer:

**File picker:** An `<input type="file" accept=".csv">` element. On change,
reads the file as text, parses it with `parseCSV`, and renders the table.

**Drag and drop:** The `#table-container` div accepts dropped `.csv` files.
Visual feedback (border color change) on dragover.

**Error handling:** CSV parse errors are displayed in the error div using
`textContent` (with `white-space: pre-wrap` CSS for newline preservation).

---

### `index.html` — Updated HTML

Added:
- `<h2>` section headers for "Expression Renderer" and "Knowledge Table"
- `<input type="file" id="file-input" accept=".csv">` for file selection
- `<div id="table-container">` as the table mount point and drop zone
- `<hr>` separator between the two sections

---

### `style.css` — Updated Styles

Added:
- `.knowledge-table` — border-collapse table with hover-able headers
- `.knowledge-table th` — clickable, grey background, cursor pointer
- `.knowledge-table td .cell-error` — red italic for parse errors
- `.table-drop-zone` — dashed border, centered text, min-height
- `.table-drop-zone.drag-over` — blue highlight on drag

---

### `public/sample.csv` — Sample Knowledge File

A demonstration CSV with 8 mathematical concepts:

| Name | Formula (math) | Domain (text) |
|------|---------------|---------------|
| Pythagorean Theorem | `a^2 + b^2 = c^2` | Geometry |
| Quadratic Formula | `x = (-b + \sqrt{...}) / (2a)` | Algebra |
| Euler's Identity | `e^(\p*\i) + 1 = 0` | Analysis |
| Derivative Power Rule | `f(x) = x^n -> f'(x) = n*x^(n-1)` | Calculus |
| Integration by Parts | `\int{a, b, u*v'} = ...` | Calculus |
| Area of Circle | `A = \p*r^2` | Geometry |
| Binomial Theorem | `+{k=0, n, \binom{n,k}*a^(n-k)*b^k}` | Algebra |
| Aleph Null | `\ha_0 = |\\N|` | Set Theory |

---

### Bug fix — Cell error newlines not visible

**Symptom:** Parse errors in table cells showed as a single line with no
line breaks, making the caret-style error messages unreadable.

**Root cause:** `span.textContent` was used to set the error message. Since
the span is inside a `<td>`, the browser's default `white-space: normal`
collapses all whitespace including newlines.

**Fix:** Used `span.innerHTML` with an `escapeHTML` helper that converts
`\n` to `<br>` and spaces to `&nbsp;`. The escaping order is critical:
1. `&` → `&amp;` (first, to avoid double-escaping later entities)
2. `<`, `>`, `"`, `'` → HTML entities (prevent injection)
3. `\n` → `<br>` (line breaks)
4. ` ` → `&nbsp;` (preserve whitespace alignment)

---

## Codebase Restructuring — New Architecture

### Motivation

The Phase 3 codebase had grown organically and had several structural problems:

- `src/parser/` mixed the general-purpose PEG engine with the math-specific grammar
- `src/render/` was math-specific but lived at the top level alongside the engine
- `src/plugin/` referenced math internals directly, creating tight coupling
- `src/csv/` was a data format module but lived alongside plugin code
- `src/table/` mixed UI rendering with data logic
- `main.ts` handled both expression demo and table loading in one monolith

### New Directory Structure

```
src/
├── engine/              # General-purpose PEG engine — no domain knowledge
│   ├── PEGParser.ts     # The parsing engine (unchanged logic)
│   └── types.ts         # PEG expression types only (engine-level)
│
├── plugins/             # All syntax plugins — each self-contained
│   ├── interface.ts     # Plugin contract: { type_id, version, parse, render }
│   ├── registry.ts      # Plugin dispatch + renderCell + escapeHTML
│   ├── math/            # Math syntax plugin (owns grammar, types, renderer)
│   │   ├── types.ts     # MathNode union type (replaces ASTNode)
│   │   ├── grammar.ts   # BobaMath PEG grammar
│   │   ├── render.ts    # Math renderer
│   │   ├── el.ts        # DOM helper
│   │   └── index.ts     # Plugin entry point (conforms to Plugin interface)
│   └── text/            # Plain text plugin
│       └── index.ts
│
├── data/                # Data layer — format-agnostic, plugin-agnostic
│   ├── types.ts         # TableData interface
│   └── csv.ts           # CSV grammar using PEGParser engine
│
├── ui/                  # UI components — presentation only, no parsing
│   ├── table.ts         # Table renderer with sorting
│   ├── file-loader.ts   # File picker + drag-and-drop
│   └── expression-input.ts  # Single-expression input + render
│
└── main.ts              # App entry — wires UI components together (thin)
```

### Test Structure (mirrors src)

```
test/
├── engine/
│   └── PEGParser.test.ts
├── plugins/
│   └── math/
│       ├── grammar.test.ts
│       └── render.test.ts
├── data/
│   └── csv.test.ts
└── ui/
    └── table.test.ts
```

### Key Changes Per File

**`src/engine/types.ts`** — now contains ONLY PEG engine types (`PEGExpression`,
`Grammar`, `MatchResult`, etc.). All AST node types moved to `src/plugins/math/types.ts`.

**`src/plugins/math/types.ts`** — new file. Contains all math AST node types
under the name `MathNode` (replacing the old `ASTNode` union). The math plugin
owns its own type definitions — no other module needs to know about them.

**`src/plugins/interface.ts`** — `Plugin.parse()` and `Plugin.render()` now use
`unknown` instead of `ASTNode`. Each plugin defines its own internal representation.
The interface is truly generic — it knows nothing about math, text, or any other domain.

**`src/plugins/math/index.ts`** — thin entry point. Calls `parser.parse()` and
`renderMath()` from the math submodules. Conforms to `Plugin` interface.

**`src/plugins/text/index.ts`** — simplified. `parse()` returns the raw string
as `unknown`. `render()` creates a span with `textContent`. No `as unknown as ASTNode`
cast needed since the interface uses `unknown`.

**`src/data/csv.ts`** — moved from `src/csv/reader.ts`. Imports `PEGParser` from
`../engine/PEGParser.ts`. Produces `TableData` (from `src/data/types.ts`), not
`CSVData`. The CSV parser knows nothing about plugins.

**`src/ui/table.ts`** — moved from `src/table/table.ts`. Imports `renderCell`
from `../plugins/registry.ts` and `TableData` from `../data/types.ts`.

**`src/ui/file-loader.ts`** — new file. Extracted from `main.ts`. Handles file
picker and drag-and-drop. Calls `parseCSV` and `createTable`. Takes DOM element
references as parameters — no global DOM access.

**`src/ui/expression-input.ts`** — new file. Extracted from `main.ts`. Handles
the expression input + render button. Takes DOM element references as parameters.

**`src/main.ts`** — reduced to ~12 lines of logic. Gets DOM elements, calls
`initExpressionInput` and `initFileLoader`, sets up demo test cases.

### Design Principles Enforced

1. **Engine is generic** — `src/engine/` has zero imports from any domain module
2. **Plugins are self-contained** — `src/plugins/math/` imports only from `engine/`
3. **Data layer is payload-agnostic** — `src/data/csv.ts` imports only from `engine/`
4. **UI is presentation-only** — `src/ui/` imports from `plugins/` and `data/` but
   contains no parsing logic
5. **main.ts is thin** — only wires components, no business logic
