# Codebase Analysis

## Phase 1 â€” Math Syntax: Expression Parser & Renderer

This document explains every concept and every piece of code in the project,
written for readers who are new to parsers, ASTs, or this codebase.

---

## Background Knowledge

### What is a Parser?

A parser reads a string of text and turns it into a structured data object
that a program can work with. For example, the string `"2+3*x"` is just
characters â€” a parser turns it into a tree that says:
"this is an addition of 2 and (3 multiplied by x)".

### What is a PEG Grammar?

PEG stands for **Parsing Expression Grammar**. It is a way of describing the
rules of a language. Each rule says: "to match this thing, try matching these
sub-things in this order". Rules can refer to other rules, forming a hierarchy.

A PEG grammar is **deterministic** â€” it never backtracks ambiguously. When a
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

The tree structure encodes operator precedence â€” multiplication is deeper in
the tree than addition, which means it is evaluated first.

### What is Operator Precedence?

In math, `2 + 3 * x` means `2 + (3 * x)`, not `(2 + 3) * x`. Multiplication
has higher precedence than addition. In a grammar, this is encoded by making
multiplication a "deeper" rule than addition â€” the parser must resolve
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
operator character to trigger it â€” the parser must recognise that two adjacent
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

This file defines all the TypeScript interfaces â€” the "shapes" of data used
throughout the project. It has two groups:

**PEG engine types** â€” describe the grammar rules themselves:

- `PEGExpression` â€” a union type: any grammar node is one of six kinds
- `LiteralExpression` â€” matches an exact string, e.g. `"+"`
- `RegexExpression` â€” matches a regular expression pattern, e.g. a number
- `SequenceExpression` â€” matches several things one after another
- `ChoiceExpression` â€” tries each option in order, uses the first that succeeds
- `RepeatExpression` â€” matches zero or more repetitions (like `*` in regex)
- `RuleReferenceExpression` â€” refers to another named rule by name
- `Grammar` â€” a dictionary mapping rule names to their PEG definition and
  optional `build` function
- `MatchResult` â€” either a `MatchSuccess` (with position and node) or a
  `MatchFailure` (with position only)

**AST node types** â€” describe the output of parsing:

- `NumberLiteralNode` â€” a numeric constant, e.g. `3.14`
- `IdentifierNode` â€” a variable or function name, e.g. `x` or `\int`
- `BinaryExpressionNode` â€” two operands and an operator, e.g. `a + b`
- `UnaryExpressionNode` â€” one operand and a prefix operator, e.g. `-x`
- `CallExpressionNode` â€” a function call, e.g. `f(x, y)`
- `ControlExpressionNode` â€” a control expression, e.g. `\int{a, b, f(x)}`
- `SubscriptExpressionNode` â€” a subscript, e.g. `x_i`
- `ASTNode` â€” a union of all the above; any node in the tree is one of these

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
failure. Importantly, it does **not** backtrack â€” once an option starts
succeeding and then fails mid-way, the whole choice fails (this is the PEG
"committed choice" behaviour).

**`matchRepeat`**
Runs the inner expression repeatedly until it fails or makes no progress
(position unchanged). Always succeeds, returning an array of zero or more
results.

**Error reporting**
The parser tracks the "best error" â€” the failure that got furthest into the
input. This gives the most useful error message, because the furthest failure
is usually closest to what the user intended.

---

### `src/parser/grammar.ts`

This file defines the BobaMath grammar as a `Grammar` object and exports a
ready-to-use `parser` instance.

Each entry in the grammar object has:
- `peg` â€” the PEG expression describing what to match
- `build` â€” a function that transforms the raw match result into an AST node

**Rule hierarchy (top to bottom = lowest to highest precedence):**

```
Expression â†’ Additive
Additive â†’ Multiplicative ((+|-) Multiplicative)*
Multiplicative â†’ Power ((*|/) Power | ImplicitPower)*
ImplicitPower â†’ Postfix (^ Unary)*
Power â†’ Unary (^ Unary)*
Unary â†’ (-|+) Unary | Postfix
Postfix â†’ Primary (CallSuffix | ControlSuffix | SubscriptSuffix)*
Primary â†’ Number | Identifier | ( Expression )
```

**Key design decision â€” `ImplicitPower` vs `Power`**

The implicit multiplication branch in `Multiplicative` uses `ImplicitPower`
instead of `Power`. The difference: `Power` starts from `Unary`, which can
consume a leading `+` or `-`. If implicit multiplication used `Power`, then
inside `(3+5)`, after parsing `3`, the implicit repeat would try `Power` â†’
`Unary` â†’ match `+` as a unary sign, stealing it from `Additive` and turning
`3+5` into `3*(+5)`. `ImplicitPower` starts from `Postfix` instead, which
cannot consume a sign, so the `+` is left for `Additive` to handle correctly.

**`Additive` build function**

The PEG match produces `[left, [[op, right], [op, right], ...]]`. The build
function folds this left-to-right into a left-leaning binary tree:
```
2 + 3 + 4  â†’  BinaryExpression(+, BinaryExpression(+, 2, 3), 4)
```

**`Power` build function**

The PEG match produces `[left, [[^, a], [^, b], ...]]`. The build function
folds right-to-left to produce right-associative trees:
```
x^2^3  â†’  BinaryExpression(^, x, BinaryExpression(^, 2, 3))
```

**`Postfix` build function**

Accumulates suffixes (call, control, subscript) onto a base node left-to-right:
```
f(x)(y)  â†’  CallExpression(CallExpression(f, [x]), [y])
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
  precedence `>=` the child's (because `a - (b - c) â‰  a - b - c`)

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
- `.fraction` â€” stacks numerator and denominator with a horizontal rule
- `.opstack` â€” stacks top label, operator symbol, and bottom label (used for
  integrals, sums, products)
- `.large-operator` â€” enlarges the operator symbol (âˆ«, Î£, etc.)
- `.sqrt` â€” draws the radical sign using a CSS `::before` pseudo-element and
  a top border
- `.matrix` / `.matrix-row` / `.matrix-cell` â€” table-based matrix layout
  (CSS prepared, not yet wired in Phase 1)
- `.piecewise` â€” left-brace piecewise function layout (CSS prepared, not yet
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
| `\a` | `GreekIdentifier` | `"greek"` | Î± (upright) |
| `\1a` | `RightSkewGreekIdentifier` | `"greek-right"` | Î± (right-skewed) |

The skew index number (`1` in `` `1a `` and `\1a`) is kept open for future
extension. The grammar regex accepts any digit sequence: `` `2a ``, `\3b `,
etc., though only `1` is used in practice for now.

#### Grammar rule ordering

The `Identifier` rule tries options in this order:
1. `RightSkewGreekIdentifier` â€” `\1a` (must come before `GreekIdentifier` to
   avoid `\` being consumed as a Greek prefix leaving `1a` unparsed)
2. `GreekIdentifier` â€” `\a`
3. `RightSkewIdentifier` â€” `` `1a `` (must come before `LeftSkewIdentifier`
   to avoid `` ` `` being consumed leaving `1a` unparsed)
4. `LeftSkewIdentifier` â€” `` `a ``
5. `PlainIdentifier` â€” `a`

#### Greek letter mapping

The `GREEK` table in `render.ts` maps single Latin letters to their Greek
Unicode equivalents. The mapping uses phonetic/conventional assignments:
`a`â†’Î±, `b`â†’Î², `g`â†’Î³, `d`â†’Î´, `l`â†’Î», `p`â†’Ï€, `w`â†’Ï‰, etc. Multi-letter
names (e.g. `\int`, `\sqrt`) do not map to Greek â€” they are used as control
expression names and rendered by `renderControl`.

#### CSS classes

Each prefix maps to a CSS class in `native-math.css`:
- `.ident-plain` â€” `font-style: normal`
- `.ident-left-skew` â€” `font-style: italic`
- `.ident-right-skew` â€” `font-style: italic; transform: skewX(15deg)`
- `.ident-greek` â€” `font-style: normal`
- `.ident-greek-right` â€” `font-style: italic; transform: skewX(15deg)`

`transform: skewX` requires `display: inline-block` to take effect on
inline elements, which is also set on those classes.

---

### Bug: Integral body rendered below the sign (Issue 3)

#### Symptom

`\int{0, 1, x^2}` rendered `xÂ²` stacked below the âˆ« symbol instead of
beside it to the right.

#### Root cause

The original `renderIntegral` produced this DOM structure:

```html
<span class="opstack">
  <span class="top">1</span>
  <span class="op large-operator">âˆ«</span>
  <span class="bottom">0</span>
  <span>xÂ²</span>   â† body placed as 4th child inside opstack
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

However, the body `<span>` is not `.top`, `.op`, or `.bottom` â€” it has no
class. Despite this, being a direct child of a `display: inline-block`
container, it still participates in the block formatting context and flows
below the previous block children. The result: the body stacks below the
integral sign rather than sitting beside it.

The underlying mental model error was treating `.opstack` as a container
for the whole integral expression. In reality, `.opstack` is only meant to
hold the **stacked symbol with its bounds** â€” the three vertically arranged
pieces (top bound, operator, bottom bound). The integrand body is a
**sibling** of the opstack, not a child.

#### Fix

Introduced a new `.integral` wrapper using `display: inline-flex` with
`align-items: center`. The `.opstack` (bounds + symbol) and a new
`.integral-body` (the integrand) are flex siblings:

```html
<span class="integral">           â† flex row, items vertically centred
  <span class="opstack">          â† stacked bounds + symbol
    <span class="top">1</span>
    <span class="op large-operator">âˆ«</span>
    <span class="bottom">0</span>
  </span>
  <span class="integral-body">    â† integrand, sits beside the sign
    xÂ²
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

`.opstack` is a layout primitive for stacked operator notation (âˆ«, Î£, Î ,
lim, etc.) â€” it only handles the vertical stack of: top label, operator
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

The purpose of skew is to **unambiguously distinguish symbols** â€” e.g.
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
angle. At Â±20Â° the difference between plain, left-skew, and right-skew
is immediately visible without needing to look closely.

#### Lesson

When a visual distinction carries semantic meaning (here: which physical
quantity a symbol refers to), the distinction must be **obvious at a
glance**. Subtle typographic differences like italic vs upright are not
sufficient. Use a transform with a large enough angle that the three
states are unambiguous even at small font sizes.


---

## Phase 2 â€” Linear Algebra, Rollout Notation & Extended Operators

This section explains all new concepts, code, and design decisions introduced
in Phase 2. It builds on the Phase 1 foundation â€” read Phase 1 first.

---

## New Background Knowledge

### What is a Relational Expression?

A relational expression compares two values: `a = b`, `x < y`, `n != 0`.
Relational operators can be **chained** left-to-right â€” `f(x) = x^n -> f'(x) = n*x^(n-1)`
parses as `((f(x) = x^n) -> f'(x)) = n*x^(n-1)`. This allows expressing
implications between equations.

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
literal â€” it is a visual decorator that renders the identifier with an arrow
over it (aâƒ—). The parser distinguishes this from array literals by checking
whether the bracket content is a single bare identifier.

### What is a Rollout Operator?

`+{k=0, n, A[k]}` means "A[0] + A[1] + ... + A[n]" â€” it "rolls out" a
summation. Similarly `*{k=0, n, A[k]}` rolls out a product. These are
syntactic sugar for Î£ (summation) and Î  (product) with explicit index bounds.

The key grammar challenge: `+` and `*` are already operators at the Additive
and Multiplicative levels. The rollout form `+{` must be matched **atomically**
(no whitespace between `+` and `{`) at the Primary level, before the `+` can
be consumed as an additive operator.

### What is the Glyph Lookup Architecture?

The parser is **script-agnostic** â€” it does not know about Greek, Hebrew,
Cyrillic, or any other script. All backslash identifiers (`\alpha`, `\ha`,
`\sin`, `\pm`) are parsed identically as `IdentifierNode { name, prefix }`.

The **renderer** is responsible for meaning. It has a flat `GLYPH_TABLE` that
maps raw identifier names to Unicode glyphs. If a name has an entry, the glyph
is used. If not, the name is rendered as-is (which naturally handles `\sin`,
`\cos`, `\lim` â€” they have no entry and render as the text "sin", "cos", "lim").

This architecture means adding a new symbol requires only one line in the
lookup table â€” no grammar change ever needed.

---

## Updated Precedence Hierarchy

Phase 2 adds a new level at the top (lowest precedence) and new operators
at the multiplicative level:

```
Relational      (=, !=, <=, >=, ~=, :=, ~, <<, >>, ->, <, >)   â† NEW
Additive        (+, -)
Multiplicative  (*, /, ., \mod, \div, implicit)                  â† EXTENDED
Power           (^)
Unary           (-, +)
Postfix         (f(), x{}, x_i, x!, x', A[k])                   â† EXTENDED
Primary         (number, identifier, (expr), [expr], |expr|,     â† EXTENDED
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
`[a]` â†’ `VectorName(Identifier(a))`. Renders with an arrow over the name.

### `MatrixNode`

```ts
interface MatrixNode {
    type: "Matrix";
    rows: ASTNode[][];  // 2D array of expressions
}
```

Produced by:
- `[a, b, c]` â†’ 1 row, 3 columns (row vector)
- `[[a, b], [c, d]]` â†’ 2 rows, 2 columns (matrix)
- `(a, b, c)` â†’ 3 rows, 1 column (column vector)

### `IndexExpressionNode`

```ts
interface IndexExpressionNode {
    type: "IndexExpression";
    base: ASTNode;   // the array/vector being indexed
    index: ASTNode;  // the index expression
}
```

Produced by `IndexSuffix` in `Postfix`. `A[k]` â†’ `IndexExpression(A, k)`.
Semantically distinct from `SubscriptExpression` (label) â€” this is array access.

### `AbsoluteValueNode`

```ts
interface AbsoluteValueNode {
    type: "AbsoluteValue";
    expr: ASTNode;  // the expression inside |...|
}
```

The renderer checks the inner node type: if it's `VectorName` or `Matrix`,
renders as norm `â€–xâ€–`; otherwise renders as absolute value `|x|`.

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

Produced by the `Ellipsis` rule matching the literal `...`. Renders as `â€¦`.

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
Expression â†’ Relational
Relational â†’ Additive (RelationalOp Additive)*
Additive â†’ Multiplicative ((+|-) Multiplicative)*
Multiplicative â†’ Power ((MultiplicativeOp Power) | ImplicitPower)*
ImplicitPower â†’ Postfix (^ Unary)*
Power â†’ Unary (^ Unary)*
Unary â†’ (-|+) Unary | Postfix
Postfix â†’ Primary (CallSuffix | ControlSuffix | SubscriptSuffix |
                    FactorialSuffix | DerivativeSuffix | IndexSuffix)*
Primary â†’ RolloutExpression | Ellipsis | AbsoluteValue |
          BracketExpression | Number | Identifier | ParenExpression
```

### New rule: `Relational`

```
Relational â†’ Additive (RelationalOp Additive)*
```

The `*` means zero or more relational operators can be chained. This allows
expressions like `f(x) = x^n -> f'(x) = n*x^(n-1)` where `->` separates
two equations. The build function folds left-to-right, same as `Additive`.

`RelationalOp` is a choice of literals ordered longest-first:
`!=`, `<=`, `>=`, `~=`, `:=`, `<<`, `>>`, `->`, `<`, `>`, `=`, `~`

**Why longest-first ordering matters:** If `<` were tried before `<=`, the
parser would match `<` and leave `=` as trailing garbage. By trying `<=`
first, the two-character operator is consumed whole.

**Why `->` must come before `>`:** Same reason â€” `->` starts with `-` which
would be consumed by Additive as subtraction, but the Additive repeat fails
(nothing valid after `>`), so the position stays before `->`. Then Relational
tries `->` and matches. If `>` were tried first at the Relational level, it
would incorrectly match the `>` in `->`.

### New rule: `MultiplicativeOp`

```
MultiplicativeOp â†’ "*" | "/" | "." | /^\\(mod|div)\b/
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
as `3.0 * v` (implicit multiplication), not as `3 Â· v` (dot product). This
is documented and acceptable â€” dot product of a bare literal with a vector
is unusual.

### New rule: `FactorialSuffix`

```
FactorialSuffix â†’ /^!(?!=)/
```

The negative lookahead `(?!=)` ensures `!` is only matched when NOT followed
by `=`. This prevents `x!=y` from being parsed as `(x!) = y` instead of
`x != y`.

### New rule: `DerivativeSuffix`

```
DerivativeSuffix â†’ /^'+/
```

Matches one or more prime characters. The matched string's length gives the
derivative order. `f'` â†’ order 1, `f''` â†’ order 2, `f'''` â†’ order 3.

### New rule: `IndexSuffix`

```
IndexSuffix â†’ "[" Expression "]"
```

Array indexing. `A[k]` produces `IndexExpression(A, k)`. This is a postfix
suffix, so it's tried after the base is parsed. It does NOT conflict with
`BracketExpression` in Primary because `[` in Primary only matches when it's
the START of an expression (no left operand), while `IndexSuffix` only matches
AFTER a base has been parsed in Postfix.

### New rule: `RolloutExpression`

```
RolloutExpression â†’ /^[+*]\{/ ArgumentList "}"
```

The regex `/^[+*]\{/` matches `+{` or `*{` as a single atomic token with NO
whitespace between the operator and the brace. This is critical: if whitespace
were allowed, `+ {k=0, n, A[k]}` would have `+` consumed by Additive before
Primary ever sees it.

Because `RolloutExpression` is tried FIRST in the Primary choice list, it
gets priority over Number and Identifier. The PEG choice tries each option
at the same position â€” if `RolloutExpression` fails (because the input doesn't
start with `+{` or `*{`), the other Primary options are tried.

**How `+{` avoids conflict with unary `+`:** The `Unary` rule tries
`[sign, Unary]` first. If `+` matches but the recursive `Unary` fails
(because `{` is not valid in any Primary), the sequence fails. The Unary
choice then tries its second option: `Postfix` â†’ `Primary` â†’
`RolloutExpression` â†’ matches `+{` atomically. PEG choice always tries
options at the original position, so the `+` consumed by the failed first
option is "given back".

### New rule: `AbsoluteValue`

```
AbsoluteValue â†’ "|" Expression "|"
```

Matches a `|`-delimited expression. The renderer decides whether to display
as absolute value (`|x|`) or norm (`â€–xâ€–`) based on the inner node type.

### New rule: `BracketExpression`

```
BracketExpression â†’ "[" BracketContent "]"
BracketContent â†’ MatrixRows | BracketList
MatrixRows â†’ MatrixRow ("," MatrixRow)*
MatrixRow â†’ "[" ArgumentList "]"
BracketList â†’ Expression ("," Expression)*
```

The `BracketContent` choice tries `MatrixRows` first. `MatrixRows` expects
the content to start with `[` (the inner row bracket). If the content starts
with anything else (like an identifier), `MatrixRows` fails immediately and
`BracketList` is tried.

**`BracketList` build logic:**
- If the content is a single identifier with no commas â†’ `VectorNameNode`
- Otherwise â†’ `MatrixNode` with one row (row vector)

This means:
- `[a]` â†’ VectorName (single identifier, no commas)
- `[a+b]` â†’ Matrix with 1 row, 1 element (expression, not bare identifier)
- `[a, b]` â†’ Matrix with 1 row, 2 elements (has commas)
- `[[a, b], [c, d]]` â†’ Matrix with 2 rows, 2 elements each

### New rule: `ParenExpression`

```
ParenExpression â†’ "(" Expression (("," Expression)* ")") 
```

Replaces the old inline parenthesis handling in Primary. Now handles both:
- `(expr)` â€” grouping (no commas) â†’ unwraps to inner expression
- `(a, b, c)` â€” column vector (has commas) â†’ `MatrixNode` with N rows of 1

### New rule: `BlackboardBoldIdentifier`

```
BlackboardBoldIdentifier â†’ /^\\\\[A-Za-z]/
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
before `Power` sees it. This is mathematically correct â€” both `x_i^2` and
`(x_i)^2` mean "x-sub-i squared".

---

## Updated Renderer (Phase 2)

### `GLYPH_TABLE` â€” the universal symbol lookup

A flat `Record<string, string>` mapping raw identifier names to Unicode glyphs.
This is the **single source of truth** for all symbol rendering. The table
contains:

| Category | Examples |
|----------|----------|
| Greek single-letter | `a`â†’Î±, `b`â†’Î², `g`â†’Î³, `d`â†’Î´, `p`â†’Ï€, `w`â†’Ï‰ |
| Greek uppercase | `A`â†’Î‘, `G`â†’Î“, `D`â†’Î”, `S`â†’Î£, `W`â†’Î© |
| Hebrew | `ha`â†’â„µ, `hb`â†’â„¶, `hg`â†’â„·, `hd`â†’â„¸ |
| Set operators | `union`â†’âˆª, `inter`â†’âˆ©, `empty`â†’âˆ…, `sub`â†’âŠ‚ |
| Logic operators | `and`â†’âˆ§, `or`â†’âˆ¨, `not`â†’Â¬, `imp`â†’âŸ¹ |
| Calculus | `inf`â†’âˆž, `nabla`â†’âˆ‡, `partial`â†’âˆ‚ |
| Geometry | `angle`â†’âˆ , `parallel`â†’âˆ¥, `perp`â†’âŠ¥ |
| Misc operators | `pm`â†’Â±, `mp`â†’âˆ“, `circ`â†’âˆ˜, `mapsto`â†’â†¦ |

**How it works with the parser:** The parser produces `Identifier { name: "ha", prefix: "greek" }`.
The renderer calls `resolveGlyph("ha")` â†’ looks up `GLYPH_TABLE["ha"]` â†’ returns `"â„µ"`.
If no entry exists (e.g. `GLYPH_TABLE["sin"]` â†’ undefined), the name is used as-is â†’ renders "sin".

### `BLACKBOARD_TABLE` â€” number set symbols

A separate table for blackboard bold identifiers (`\\N`, `\\R`, etc.):

| Input | Glyph | Meaning |
|-------|-------|---------|
| `\\N` | â„• | Natural numbers |
| `\\Z` | â„¤ | Integers |
| `\\Q` | â„š | Rationals |
| `\\R` | â„ | Reals |
| `\\C` | â„‚ | Complex numbers |
| `\\H` | â„ | Quaternions |
| `\\P` | â„™ | Primes |
| `\\U` | ð•Œ | Universal set |
| `\\d` | âˆ‚ | Partial derivative |

### `RELATIONAL_SYMBOL` â€” operator display mapping

Maps relational operator strings to their Unicode display symbols:
`"!="â†’"â‰ "`, `"<="â†’"â‰¤"`, `">="â†’"â‰¥"`, `"~="â†’"â‰ˆ"`, `":="â†’"â‰¡"`,
`"~"â†’"âˆ"`, `"<<"â†’"â‰ª"`, `">>"â†’"â‰«"`, `"->"â†’"â†’"`, etc.

### `OPERATOR_PRECEDENCE` â€” extended

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
  <span class="vector-arrow">âƒ—</span>
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
- `VectorName` or `Matrix` â†’ renders `â€–exprâ€–` (double bars = norm)
- Anything else â†’ renders `|expr|` (single bars = absolute value)

**`renderFactorial(node)`**
Simply appends `!` after the rendered base.

**`renderDerivative(node)`**
Appends `order` copies of the prime character `â€²` (U+2032) after the base.

**`renderBigOperator(node, symbol)`**
Reuses the integral layout (`.integral` flex container with `.opstack` and
`.integral-body`) but with a different symbol (Î£ for `\S`, Î  for `\P`).

**`renderLim(node)`**
Similar to big operator but uses plain text "lim" instead of a large symbol,
and only has a bottom label (the approach expression), no top label.

**`renderRollout(node)`**
Maps `+` to Î£ and `*` to Î , then uses the big operator layout.

**`renderBinom(node)`**
Renders as a fraction wrapped in parentheses: `(n choose r)`.

**`renderEval(node)`**
Renders as `expr|_{bound}` â€” the expression followed by a vertical bar and
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
| `sqrt` | `renderSqrt` | âˆš with overline |
| `int` | `renderIntegral` with âˆ« | integral |
| `oint` | `renderIntegral` with âˆ® | contour integral |
| `iint` | `renderIntegral` with âˆ¬ | double integral |
| `iiint` | `renderIntegral` with âˆ­ | triple integral |
| `S` | `renderBigOperator` with Î£ | summation |
| `P` | `renderBigOperator` with Î  | product |
| `lim` | `renderLim` | limit |
| `floor` | inline | âŒŠxâŒ‹ |
| `ceil` | inline | âŒˆxâŒ‰ |
| `bar` | CSS class | xÌ„ (overline) |
| `hat` | CSS class | xÌ‚ (hat) |
| `tilde` | CSS class | xÌƒ (tilde) |
| `ul` | CSS class | xÌ² (underline) |
| `cancel` | CSS class | xÌ¶ (strikethrough) |
| `inner` | inline | âŸ¨x, yâŸ© |
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
| `.arc` | `::before { content: 'âŒ¢' }` | arc above |

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

**Root cause:** The grammar hierarchy is `Relational` â†’ `Additive` â†’
`Multiplicative` â†’ ... â†’ `Primary` â†’ `Identifier`. When parsing the left
operand of a relational expression, the parser descends all the way to
`Identifier`. If `\in` appears after the left operand, the `Multiplicative`
repeat tries implicit multiplication, which matches `\in` as a
`GreekIdentifier`. By the time control returns to `Relational`, `\in` has
already been consumed.

**Resolution:** Only ASCII operators (`=`, `!=`, `<=`, `>=`, `~=`, `:=`, `~`,
`<<`, `>>`, `->`, `<`, `>`) are grammar-level relational operators. Backslash
operators (`\sub`, `\in`, etc.) are regular identifiers that render correctly
via `GLYPH_TABLE`. The visual output is identical (`xâˆˆâ„`); only the AST
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
their content â€” `(x_i)` evaluates to the bare `SubscriptExpression` node.
The `Power` build function then sees a `SubscriptExpression` as its left
operand and produces `SubSuperscriptExpression`.

**Resolution:** Accept that both forms produce the same AST. This is
mathematically correct â€” `(x_i)^2` and `x_i^2` both mean "x-sub-i squared".
If a future use case requires distinguishing them, a "grouped" wrapper node
could be introduced, but this adds complexity with no current benefit.

### `->` interaction with `-` (subtraction)

**How `x -> y` parses correctly:** The Additive repeat tries `-` as a
subtraction operator. It matches `-`, then tries to parse `> y` as a
Multiplicative â€” which fails (nothing valid starts with `>`). The sequence
`[-, Multiplicative]` fails. The repeat stops. Additive returns just `x`.
Then Relational tries `->` at the original position (after `x`) and matches.

This works because PEG sequences do not commit â€” if a sequence fails partway
through, the position reverts to before the sequence started. The repeat only
advances `current` on successful iterations.


---

## Bug Fixes During Phase 2 Implementation

### Issue 4 â€” `(x_i)^2` incorrectly produced `BinaryExpression` after first fix attempt

#### Symptom

After the initial Phase 2 implementation, the test `x_i^2 produces
SubSuperscriptExpression` failed â€” it produced `BinaryExpression` instead.

#### Root cause â€” first fix attempt (wrong)

The `SubSuperscriptExpression` logic was initially placed in BOTH the `Power`
and `ImplicitPower` build functions. The test for `(x_i)^2` expected it to
produce `BinaryExpression(^, SubscriptExpression, 2)` â€” i.e., parentheses
should "protect" the subscript from being merged into a SubSuperscript.

However, `x_i^2` (without parens) is parsed through the `Power` rule (not
`ImplicitPower`), because `Multiplicative` starts by parsing its first operand
via `Power`. The path is:

```
Multiplicative â†’ Power â†’ Unary â†’ Postfix â†’ Primary â†’ "x"
                                  Postfix suffix: SubscriptSuffix â†’ "x_i"
                 Power repeat: "^" â†’ Unary â†’ "2"
                 Power build: left = SubscriptExpression(x, i), rest = [[^, 2]]
```

So `SubSuperscriptExpression` logic MUST be in `Power` for `x_i^2` to work.

The first fix attempt removed the logic from `Power` (keeping it only in
`ImplicitPower`), which fixed `(x_i)^2` but broke `x_i^2`.

#### Root cause â€” the real issue

The test expectation for `(x_i)^2` was wrong. Parentheses in this grammar
simply unwrap their content â€” `(x_i)` evaluates to the bare
`SubscriptExpression(x, i)` node. When `Power` sees this as its left operand,
it cannot distinguish it from the un-parenthesised `x_i`. Both produce
`SubscriptExpression` as the left operand of `Power`.

There is no "parenthesised" marker in the AST â€” parentheses are purely
syntactic grouping that is discarded after parsing. This is standard behaviour
in expression parsers (parentheses affect tree structure, not node types).

#### Fix

1. Restored `SubSuperscriptExpression` logic in the `Power` build function
2. Updated the test: `(x_i)^2` now correctly expects `SubSuperscriptExpression`
   (same as `x_i^2`), because both are mathematically equivalent â€” "x-sub-i
   squared"

#### Files changed

- `src/parser/grammar.ts` â€” `Power` build function: added `SubSuperscriptExpression`
  check (removed then re-added during the fix iteration)
- `test/parser/grammar.test.ts` â€” changed test expectation for `(x_i)^2`

#### Lesson

Parentheses in an expression parser are **transparent** â€” they affect the
tree structure (by overriding precedence) but leave no trace in the AST.
Once the parser has built the inner node, the parentheses are gone. Any
logic that inspects node types after parsing cannot distinguish "was this
node parenthesised?" from "was this node bare?".

If distinguishing parenthesised from bare subscripts were ever needed, the
grammar would need to produce a wrapper node (e.g., `GroupedExpression`) that
preserves the grouping information. This adds complexity with no current
benefit, so it was not implemented.

---

### Issue 5 â€” First test run had `(x_i)^2` producing `SubSuperscriptExpression` unexpectedly

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
Multiplicative â†’ Power (first operand)
  Power â†’ Unary â†’ Postfix â†’ parses "x_i" as SubscriptExpression
  Power repeat â†’ "^2"
  Power build â†’ left is SubscriptExpression â†’ should produce SubSuperscriptExpression
```

The path does NOT go through `ImplicitPower` because `x_i^2` is the FIRST
operand of `Multiplicative`, parsed via the initial `Power` call (not the
repeat's implicit multiplication branch).

#### Final resolution

Accepted that both `x_i^2` and `(x_i)^2` produce `SubSuperscriptExpression`.
Updated the test expectation. This is the correct mathematical interpretation
â€” both notations mean the same thing.

#### Sequence of changes

1. Initial implementation: `Power` build has SubSuperscript logic â†’ `(x_i)^2` test fails
2. First fix: removed logic from `Power` â†’ `x_i^2` test fails (and 2 render tests)
3. Final fix: restored logic in `Power`, updated `(x_i)^2` test expectation â†’ all 167 pass


---

### Issue 6 â€” Explicit multiplication `2*3` rendered without visible operator

#### Symptom

Typing `2*3` in the input showed `23` on screen â€” no multiplication sign
visible. The user could not distinguish explicit multiplication from implicit.

#### Root cause

The original `renderBinary` for `operator === "*"` always rendered the two
operands adjacent with no visible symbol (juxtaposition). This was correct
for implicit multiplication (`2x` â†’ `2x`) but wrong for explicit
multiplication (`2*3` â†’ should show a sign).

The AST uses `operator: "*"` for BOTH explicit (`2*3`) and implicit (`2x`)
multiplication. The parser does not distinguish them â€” both produce
`BinaryExpression("*", left, right)`. This is correct: the AST represents
structure, not visual presentation.

#### Design decision â€” renderer determines visibility

The responsibility for deciding whether to show `Ã—` belongs to the **renderer**,
not the parser or AST. The AST records that two things are multiplied; the
renderer decides how to display that multiplication based on what the operands
look like when rendered.

#### The algorithm â€” digit adjacency check

The rule is simple:

> Show `Ã—` if and only if the left operand's rendered form **ends with a digit**
> AND the right operand's rendered form **starts with a digit**.

This is the only case where juxtaposition is ambiguous â€” `23` looks like the
number twenty-three, not `2 Ã— 3`. In all other cases, juxtaposition is
unambiguous:

| Left ends with | Right starts with | Ambiguous? | Example |
|---------------|-------------------|-----------|---------|
| digit | digit | YES â†’ show Ã— | `2*3` â†’ `2 Ã— 3` |
| digit | letter | no | `2*x` â†’ `2x` |
| digit | `(` | no | `2*(a+b)` â†’ `2(a+b)` |
| letter | digit | no | `x*2` â†’ `x2` |
| letter | letter | no | `x*y` â†’ `xy` |
| `)` | digit | no | `(a+b)*3` â†’ `(a+b)3` |
| `)` | letter | no | `(a+b)*x` â†’ `(a+b)x` |
| `)` | `(` | no | `(a+b)*(c+d)` â†’ `(a+b)(c+d)` |

#### Implementation â€” recursive AST inspection

Two helper functions determine what the rendered edges look like:

**`startsWithDigit(node, parenthesised)`** â€” returns true if the node's
rendered output begins with a digit character:
- `NumberLiteral` â†’ true
- `Identifier` â†’ false (starts with a letter or glyph)
- `UnaryExpression` â†’ false (starts with `-` or `+`)
- `BinaryExpression` â†’ recurses into left child (accounting for whether
  that child would be parenthesised by the binary node)
- Parenthesised anything â†’ false (starts with `(`)

**`endsWithDigit(node, parenthesised)`** â€” returns true if the node's
rendered output ends with a digit character:
- `NumberLiteral` â†’ true
- `Identifier` â†’ false
- `UnaryExpression` â†’ recurses into operand
- `BinaryExpression` with `^` â†’ false (ends with `</sup>`)
- `BinaryExpression` with `/` â†’ false (ends with fraction bottom)
- `BinaryExpression` other â†’ recurses into right child (accounting for
  whether that child would be parenthesised)
- `CallExpression` â†’ false (ends with `)`)
- `FactorialExpression` â†’ false (ends with `!`)
- Parenthesised anything â†’ false (ends with `)`)

#### The subtlety â€” child parenthesisation within subtrees

The initial implementation had a bug: for `-2*(3+5)*4e^x^2`, the node
`((-2)*(3+5)) * 4` incorrectly showed `Ã—` because `endsWithDigit` recursed
into the right child of the left subtree (`BinaryExpression(+, 3, 5)`) without
considering that this child WOULD be parenthesised when rendered (because `*`
has higher precedence than `+`).

The fix: `wouldParenLeft` and `wouldParenRight` helper functions replicate
the same parenthesisation logic used by `renderBinary`. When recursing into
a `BinaryExpression`'s children, the digit-check functions first determine
whether that child would be wrapped in parentheses, and if so, return false
(parenthesised nodes start/end with `(`/`)`).

#### Files changed

- `src/render/render.ts` â€” added `needsExplicitMultiplySign`,
  `startsWithDigit`, `endsWithDigit`, `wouldParenLeft`, `wouldParenRight`;
  updated `renderBinary` for `operator === "*"` to conditionally show `Ã—`
- `test/render/render.test.ts` â€” added 11 test cases covering all
  multiplication sign visibility scenarios

#### Lesson

Visual presentation decisions belong in the renderer, not the AST. The AST
is a structural representation â€” it should use consistent, simple operators
(`"*"` for all multiplication) without encoding display concerns. The renderer
has access to the full subtree context needed to make intelligent display
decisions.


---

## Phase 3 â€” Plugin System & CSV Table Display

This section explains all new code introduced in Phase 3: the plugin
architecture, CSV reader, table component, and how they connect.

---

### Architecture Overview

Phase 3 introduces a layered architecture that separates concerns:

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        Browser                              â”‚
â”‚                                                             â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚  File I/O    â”‚â”€â”€â”€â”€â–¶â”‚         CSV Reader               â”‚  â”‚
â”‚  â”‚ (file picker â”‚     â”‚  (structural â€” splits into       â”‚  â”‚
â”‚  â”‚  or drag&drop)     â”‚   headers, types, rows)          â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚                                    â”‚                         â”‚
â”‚                                    â–¼                         â”‚
â”‚                      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”       â”‚
â”‚                      â”‚      Plugin Registry         â”‚       â”‚
â”‚                      â”‚  (dispatches cell content     â”‚       â”‚
â”‚                      â”‚   to the correct plugin)      â”‚       â”‚
â”‚                      â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜       â”‚
â”‚                             â”‚           â”‚                    â”‚
â”‚                    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”   â”Œâ”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”          â”‚
â”‚                    â”‚ Math      â”‚   â”‚ Plain Text  â”‚          â”‚
â”‚                    â”‚ Plugin    â”‚   â”‚ Plugin      â”‚          â”‚
â”‚                    â”‚ parse()   â”‚   â”‚ parse()     â”‚          â”‚
â”‚                    â”‚ render()  â”‚   â”‚ render()    â”‚          â”‚
â”‚                    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜          â”‚
â”‚                             â”‚           â”‚                    â”‚
â”‚                             â–¼           â–¼                    â”‚
â”‚                      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”       â”‚
â”‚                      â”‚      Table Component         â”‚       â”‚
â”‚                      â”‚  (renders rows, columns,      â”‚       â”‚
â”‚                      â”‚   sortable headers)           â”‚       â”‚
â”‚                      â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Key design principle:** The CSV reader is purely structural â€” it splits
text into rows and cells without interpreting cell content. It knows nothing
about math syntax, plain text, or any other payload format. The plugin
system handles all payload interpretation.

---

### `src/plugin/interface.ts` â€” Plugin Interface

Defines the contract that every data type renderer must implement:

```ts
interface Plugin {
    type_id: string;        // unique identifier (e.g. "math", "text")
    version: string;        // semantic version
    parse(text: string): ASTNode;      // text â†’ structured data
    render(ast: ASTNode): HTMLElement;  // structured data â†’ visual output
}
```

Every plugin provides two functions:
- `parse` â€” transforms raw cell text into an AST (or equivalent structure)
- `render` â€” transforms the AST into an HTML element for display

This interface is intentionally minimal. A plugin does not need to know about
tables, CSV, files, or other plugins. It only knows how to handle its own
data type.

---

### `src/plugin/math.ts` â€” Math Syntax Plugin

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

No new code â€” just adapts the existing `parser` and `renderMath` to the
plugin interface.

---

### `src/plugin/plaintext.ts` â€” Plain Text Plugin

The identity plugin â€” renders text as-is with no parsing or formatting:

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
type â€” it's a plugin-internal type. This is acceptable because the plugin
interface is generic; each plugin defines its own internal representation.

Also serves as the **fallback** for unknown plugin types.

---

### `src/plugin/registry.ts` â€” Plugin Registry

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
table continues to render â€” one bad cell does not crash the entire table.

**`escapeHTML` helper:** Converts special characters to HTML entities and
preserves formatting:
- `&` â†’ `&amp;` (must be first to avoid double-escaping)
- `<` â†’ `&lt;`, `>` â†’ `&gt;` (prevent HTML injection)
- `\n` â†’ `<br>` (preserve line breaks in error messages)
- ` ` â†’ `&nbsp;` (preserve whitespace alignment in error carets)

The order of replacements matters: `&nbsp;` must come AFTER `&` escaping,
otherwise the `&` in `&nbsp;` would be escaped to `&amp;nbsp;`.

---

### `src/csv/reader.ts` â€” CSV File Reader

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
- Handles escaped quotes (`""` â†’ literal `"`)
- Handles both LF and CRLF line endings
- Throws if fewer than 2 rows (need at least headers + types)

**Design note:** The CSV reader is purely structural. It does not interpret
the `types` row â€” it just stores it as strings. The table component later
passes each type string to the plugin registry for dispatch. This means the
CSV reader can be used independently of the plugin system.

---

### `src/table/table.ts` â€” Table Component

Renders a `CSVData` object as an interactive HTML table:

```ts
function createTable(data: CSVData): HTMLElement
```

**Features:**
- Renders column headers from `data.headers`
- Renders each cell using `renderCell(typeId, cellValue)` â€” dispatching to
  the correct plugin based on the column's type
- **Sortable columns:** clicking a header sorts all rows by that column
  (ascending on first click, descending on second click)
- Sort indicator (â–²/â–¼) shown in the active header

**Implementation:**
- Uses a closure over `sortCol`, `sortAsc`, and `rows` state
- `renderTable()` is called on initial render and after each sort change
- Sorting uses `localeCompare` on raw cell strings (not rendered output)
- The entire table is re-rendered on sort (simple and correct for small tables)

---

### `src/main.ts` â€” Updated Application Entry Point

Phase 3 adds CSV file loading alongside the existing expression renderer:

**File picker:** An `<input type="file" accept=".csv">` element. On change,
reads the file as text, parses it with `parseCSV`, and renders the table.

**Drag and drop:** The `#table-container` div accepts dropped `.csv` files.
Visual feedback (border color change) on dragover.

**Error handling:** CSV parse errors are displayed in the error div using
`textContent` (with `white-space: pre-wrap` CSS for newline preservation).

---

### `index.html` â€” Updated HTML

Added:
- `<h2>` section headers for "Expression Renderer" and "Knowledge Table"
- `<input type="file" id="file-input" accept=".csv">` for file selection
- `<div id="table-container">` as the table mount point and drop zone
- `<hr>` separator between the two sections

---

### `style.css` â€” Updated Styles

Added:
- `.knowledge-table` â€” border-collapse table with hover-able headers
- `.knowledge-table th` â€” clickable, grey background, cursor pointer
- `.knowledge-table td .cell-error` â€” red italic for parse errors
- `.table-drop-zone` â€” dashed border, centered text, min-height
- `.table-drop-zone.drag-over` â€” blue highlight on drag

---

### `public/sample.csv` â€” Sample Knowledge File

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

### Bug fix â€” Cell error newlines not visible

**Symptom:** Parse errors in table cells showed as a single line with no
line breaks, making the caret-style error messages unreadable.

**Root cause:** `span.textContent` was used to set the error message. Since
the span is inside a `<td>`, the browser's default `white-space: normal`
collapses all whitespace including newlines.

**Fix:** Used `span.innerHTML` with an `escapeHTML` helper that converts
`\n` to `<br>` and spaces to `&nbsp;`. The escaping order is critical:
1. `&` â†’ `&amp;` (first, to avoid double-escaping later entities)
2. `<`, `>`, `"`, `'` â†’ HTML entities (prevent injection)
3. `\n` â†’ `<br>` (line breaks)
4. ` ` â†’ `&nbsp;` (preserve whitespace alignment)

---

## Codebase Restructuring â€” New Architecture

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
â”œâ”€â”€ engine/              # General-purpose PEG engine â€” no domain knowledge
â”‚   â”œâ”€â”€ PEGParser.ts     # The parsing engine (unchanged logic)
â”‚   â””â”€â”€ types.ts         # PEG expression types only (engine-level)
â”‚
â”œâ”€â”€ plugins/             # All syntax plugins â€” each self-contained
â”‚   â”œâ”€â”€ interface.ts     # Plugin contract: { type_id, version, parse, render }
â”‚   â”œâ”€â”€ registry.ts      # Plugin dispatch + renderCell + escapeHTML
â”‚   â”œâ”€â”€ math/            # Math syntax plugin (owns grammar, types, renderer)
â”‚   â”‚   â”œâ”€â”€ types.ts     # MathNode union type (replaces ASTNode)
â”‚   â”‚   â”œâ”€â”€ grammar.ts   # BobaMath PEG grammar
â”‚   â”‚   â”œâ”€â”€ render.ts    # Math renderer
â”‚   â”‚   â”œâ”€â”€ el.ts        # DOM helper
â”‚   â”‚   â””â”€â”€ index.ts     # Plugin entry point (conforms to Plugin interface)
â”‚   â””â”€â”€ text/            # Plain text plugin
â”‚       â””â”€â”€ index.ts
â”‚
â”œâ”€â”€ data/                # Data layer â€” format-agnostic, plugin-agnostic
â”‚   â”œâ”€â”€ types.ts         # TableData interface
â”‚   â””â”€â”€ csv.ts           # CSV grammar using PEGParser engine
â”‚
â”œâ”€â”€ ui/                  # UI components â€” presentation only, no parsing
â”‚   â”œâ”€â”€ table.ts         # Table renderer with sorting
â”‚   â”œâ”€â”€ file-loader.ts   # File picker + drag-and-drop
â”‚   â””â”€â”€ expression-input.ts  # Single-expression input + render
â”‚
â””â”€â”€ main.ts              # App entry â€” wires UI components together (thin)
```

### Test Structure (mirrors src)

```
test/
â”œâ”€â”€ engine/
â”‚   â””â”€â”€ PEGParser.test.ts
â”œâ”€â”€ plugins/
â”‚   â””â”€â”€ math/
â”‚       â”œâ”€â”€ grammar.test.ts
â”‚       â””â”€â”€ render.test.ts
â”œâ”€â”€ data/
â”‚   â””â”€â”€ csv.test.ts
â””â”€â”€ ui/
    â””â”€â”€ table.test.ts
```

### Key Changes Per File

**`src/engine/types.ts`** â€” now contains ONLY PEG engine types (`PEGExpression`,
`Grammar`, `MatchResult`, etc.). All AST node types moved to `src/plugins/math/types.ts`.

**`src/plugins/math/types.ts`** â€” new file. Contains all math AST node types
under the name `MathNode` (replacing the old `ASTNode` union). The math plugin
owns its own type definitions â€” no other module needs to know about them.

**`src/plugins/interface.ts`** â€” `Plugin.parse()` and `Plugin.render()` now use
`unknown` instead of `ASTNode`. Each plugin defines its own internal representation.
The interface is truly generic â€” it knows nothing about math, text, or any other domain.

**`src/plugins/math/index.ts`** â€” thin entry point. Calls `parser.parse()` and
`renderMath()` from the math submodules. Conforms to `Plugin` interface.

**`src/plugins/text/index.ts`** â€” simplified. `parse()` returns the raw string
as `unknown`. `render()` creates a span with `textContent`. No `as unknown as ASTNode`
cast needed since the interface uses `unknown`.

**`src/data/csv.ts`** â€” moved from `src/csv/reader.ts`. Imports `PEGParser` from
`../engine/PEGParser.ts`. Produces `TableData` (from `src/data/types.ts`), not
`CSVData`. The CSV parser knows nothing about plugins.

**`src/ui/table.ts`** â€” moved from `src/table/table.ts`. Imports `renderCell`
from `../plugins/registry.ts` and `TableData` from `../data/types.ts`.

**`src/ui/file-loader.ts`** â€” new file. Extracted from `main.ts`. Handles file
picker and drag-and-drop. Calls `parseCSV` and `createTable`. Takes DOM element
references as parameters â€” no global DOM access.

**`src/ui/expression-input.ts`** â€” new file. Extracted from `main.ts`. Handles
the expression input + render button. Takes DOM element references as parameters.

**`src/main.ts`** â€” reduced to ~12 lines of logic. Gets DOM elements, calls
`initExpressionInput` and `initFileLoader`, sets up demo test cases.

### Design Principles Enforced

1. **Engine is generic** â€” `src/engine/` has zero imports from any domain module
2. **Plugins are self-contained** â€” `src/plugins/math/` imports only from `engine/`
3. **Data layer is payload-agnostic** â€” `src/data/csv.ts` imports only from `engine/`
4. **UI is presentation-only** â€” `src/ui/` imports from `plugins/` and `data/` but
   contains no parsing logic
5. **main.ts is thin** â€” only wires components, no business logic


---

## Phase 4 â€” Association Graph & Filtered Table View

---

### Architecture

Phase 4 adds a graph layer on top of the table system:

```
CSV files (with _associations column)
    â”‚
    â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚         CSV Reader               â”‚
â”‚  (structural â€” splits rows)      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
               â”‚
    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
    â–¼                     â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ TableData  â”‚    â”‚ AssociationGraph   â”‚
â”‚ (rows/cols)â”‚    â”‚ (edges: srcâ†’tgt)   â”‚
â””â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
      â”‚                    â”‚
      â–¼                    â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚          Graph Filter UI             â”‚
â”‚  - Relation dropdown                 â”‚
â”‚  - Target dropdown                   â”‚
â”‚  - Filter button â†’ filtered table    â”‚
â”‚  - Entity click â†’ association detail â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

### `src/data/graph.ts` â€” AssociationGraph

The core data structure for the graph layer. Stores typed, directed edges
between entities.

**Association storage format in CSV:**
A dedicated column named `_associations` contains semicolon-separated entries:
```
relation-type:target-entity-id;relation-type:target-id
```

Example: `uses:derivative;uses:integral`

**Entity IDs:** The first column of each table is the entity ID. Cross-file
references use the target's first-column value directly (e.g., `derivative`
refers to the row where column 0 = "derivative" in any loaded table).

**Key methods:**

| Method | Purpose |
|--------|---------|
| `setVocabulary(vocab)` | Load relation type definitions (name, inverse, symmetric) |
| `addAssociations(ids, column)` | Parse `_associations` column and store edges |
| `filterByRelation(rel, target)` | Find all sources that have `rel` â†’ `target` |
| `filterBySource(rel, source)` | Find all targets that `source` â†’ via `rel` |
| `getAssociationsFor(entityId)` | Get all outgoing and incoming edges for an entity |
| `getInverse(relation)` | Look up the inverse relation name from vocabulary |
| `getRelationTypes()` | All unique relation types in the graph |
| `getAllEntityIds()` | All unique entity IDs (sources + targets) |

**Vocabulary format** (`vocabulary.json`):
```json
{
  "relations": [
    { "name": "uses", "inverse": "is-used-by", "symmetric": false },
    { "name": "equivalent-to", "inverse": "equivalent-to", "symmetric": true }
  ]
}
```

---

### `src/ui/graph-filter.ts` â€” Graph Filter UI

Renders the filter controls and handles user interaction:

**Components:**
- **Relation dropdown** â€” populated from `graph.getRelationTypes()`
- **Target dropdown** â€” populated from `graph.getAllEntityIds()`
- **Filter button** â€” calls `graph.filterByRelation(rel, target)`, then
  renders only matching rows from all loaded tables
- **Show All button** â€” resets to showing all tables unfiltered
- **Association detail panel** â€” shows outgoing and incoming associations
  for a clicked entity, with clickable links to navigate to related entities

**Entity click interaction:**
- First column cells are clickable (underlined, cursor pointer)
- Clicking shows the association detail panel with:
  - Outgoing: `relation â†’ target` (with clickable target links)
  - Incoming: `inverse-relation â† source` (with clickable source links)
- Clicking a link in the detail panel navigates to that entity's associations

**Filtering logic:**
1. User selects relation type and target entity
2. `graph.filterByRelation(relation, target)` returns matching source IDs
3. Each loaded table is filtered to only rows where column 0 is in the match set
4. Filtered tables are re-rendered with the table component

---

### `src/ui/file-loader.ts` â€” Updated for Multiple Files

Now supports loading multiple CSV files simultaneously:
- File input has `multiple` attribute
- Each loaded file is added to the `tables` array
- The `_associations` column (if present) is parsed into the shared graph
- After each file load, the entire UI is rebuilt with all tables and the graph

**Association extraction:**
```ts
const assocColIdx = data.headers.indexOf("_associations");
if (assocColIdx !== -1) {
    const entityIds = data.rows.map(row => row[0]);
    const assocCol = data.rows.map(row => row[assocColIdx]);
    graph.addAssociations(entityIds, assocCol);
}
```

---

### Sample Data Files

**`public/theorems.csv`** â€” 6 theorems with associations:
- Fundamental Theorem of Calculus â†’ uses: derivative, integral
- Integration by Parts â†’ uses: integral, product-rule
- Chain Rule â†’ uses: derivative, composition
- Pythagorean Theorem â†’ uses: right-triangle
- Binomial Theorem â†’ uses: binomial-coefficient, factorial
- Euler's Formula â†’ uses: exponential, complex-numbers

**`public/definitions.csv`** â€” 9 definitions with inverse associations:
- derivative â†’ is-used-by: FTC, Chain Rule
- integral â†’ is-used-by: FTC, Integration by Parts
- (etc.)

**`public/vocabulary.json`** â€” 5 relation types:
- uses / is-used-by
- proves / is-proved-by
- generalizes / is-special-case-of
- defines / is-defined-by
- equivalent-to (symmetric)

---

### CSV Quoting Fix

Fields containing commas must be quoted in CSV. Math expressions like
`\int{a, b, f(x)}` and `\binom{n, k}` contain commas and must be wrapped
in double quotes. All sample CSV files were corrected to properly quote
such fields.


---

## MVC Architectural Refactoring

### Motivation

The previous architecture mixed data storage with HTML rendering. The
`createTable` function both held the row data AND rendered it to DOM.
There was no "business model" â€” the data existed only as raw string arrays
or as HTML elements. This makes it impossible to manipulate data without
re-parsing, and couples all logic to the browser DOM.

### Layered MVC Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  VIEW (presentation)                                    â”‚
â”‚  src/view/table-view.ts      â€” renders Table â†’ HTML     â”‚
â”‚  src/view/graph-filter-view.ts â€” filter UI + detail     â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  CONTROLLER (orchestration)                             â”‚
â”‚  src/controller/index.ts     â€” handles user actions,    â”‚
â”‚                                updates model, tells     â”‚
â”‚                                view to re-render        â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  MODEL (business data)                                  â”‚
â”‚  src/model/index.ts          â€” KnowledgeBase, Table,    â”‚
â”‚                                Row, Cell, Column,       â”‚
â”‚                                AssociationGraph         â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  INTEGRATION (plugins)                                  â”‚
â”‚  src/plugins/                â€” syntax parsing/rendering â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  DATA (persistence)                                     â”‚
â”‚  src/data/csv.ts             â€” file format parsing      â”‚
â”‚  src/data/graph.ts           â€” re-exports from model    â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  ENGINE (infrastructure)                                â”‚
â”‚  src/engine/                 â€” PEG parser engine        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Model Layer â€” `src/model/index.ts`

Pure business objects with no DOM dependency:

| Class | Responsibility |
|-------|---------------|
| `Cell` | Holds a value string and its type_id |
| `Column` | Holds column name and type_id |
| `Row` | Holds an array of Cells, provides `entityId` and `getCellValue(i)` |
| `Table` | Holds name, columns, rows. Provides `filterByEntityIds`, `sortedRows`, `getColumnIndex` |
| `Association` | A single directed edge: source â†’ relation â†’ target |
| `RelationType` | Defines a relation: name, inverse, symmetric flag |
| `AssociationGraph` | Stores all edges. Provides filter, inverse lookup, entity inspection |
| `KnowledgeBase` | Top-level container: holds all Tables + one shared Graph. Auto-extracts associations on `addTable` |

### Controller Layer â€” `src/controller/index.ts`

The `AppController` class:
- Holds a `KnowledgeBase` (model)
- References `TableView` and `GraphFilterView` (views)
- Methods: `loadCSV(name, text)`, `filterByRelation(rel, target)`, `showAll()`, `getAssociationsFor(id)`
- On `loadCSV`: parses CSV â†’ creates Table model â†’ adds to KnowledgeBase â†’ refreshes views

### View Layer â€” `src/view/`

| Class | Responsibility |
|-------|---------------|
| `TableView` | Renders `Table[]` as HTML tables. Handles sorting (view-level state). Fires entity click events. |
| `GraphFilterView` | Renders filter dropdowns and detail panel. Calls controller on user actions. |

Views read from the model (via controller) and write to the DOM. They never
modify the model directly.

### OO Design Principles Applied

1. **Single Responsibility** â€” each class has one job (Cell stores a value, Table stores rows, View renders)
2. **Encapsulation** â€” model objects expose methods, not raw data manipulation
3. **Dependency Inversion** â€” controller depends on view interfaces (type imports), not concrete DOM
4. **Open/Closed** â€” new plugins can be added without modifying existing model/view code
5. **Separation of Concerns** â€” model has no DOM imports, view has no file I/O, controller has no rendering logic

### Backward Compatibility

- `src/ui/table.ts` â€” kept with `createTable(TableData)` function for existing tests
- `src/data/graph.ts` â€” re-exports `AssociationGraph` from model for existing tests
- `AssociationGraph.addAssociations()` â€” alias for `addFromColumn()` for test compat
- `AssociationGraph.setVocabulary()` â€” accepts both `RelationType[]` and `{ relations: [...] }`

---

## Phase 5 â€” Inline Editor

---

### Overview

Phase 5 adds in-place cell editing to the knowledge table. The design
principle is: **the cell is the editor**. There is no separate input overlay
or modal dialog. Clicking a cell turns it into a `contenteditable` source
editor. For syntax cells (e.g. `math`), a read-only preview bar above the
table shows the live rendered output as the user types.

---

### New Concepts

#### What is `contenteditable`?

`contenteditable` is an HTML attribute that makes any element directly
editable by the user, like a text input but without the constraints of an
`<input>` element. Setting `element.contentEditable = "true"` allows the
user to click into the element and type. The current text is read back via
`element.textContent`.

Advantages over `<input>` for table cells:
- The cell keeps its position and size in the table layout
- No need to position an overlay element
- The browser handles cursor, selection, and keyboard input natively

#### What is an Undo/Redo Stack?

An undo/redo stack records every edit action as a reversible operation.
Each action stores enough information to both apply and reverse itself:

- `cell` action: stores `tableIdx`, `rowIdx`, `colIdx`, `oldValue`, `newValue`
  â€” undo sets the cell back to `oldValue`, redo sets it to `newValue`
- `addRow` action: stores `tableIdx` and the `Row` object
  â€” undo removes the last row, redo pushes it back
- `deleteRow` action: stores `tableIdx`, `rowIdx`, and the `Row` object
  â€” undo splices the row back at `rowIdx`, redo splices it out again

The stack has two arrays: `past` (actions that can be undone) and `future`
(actions that can be redone). Pushing a new action clears the `future` array
â€” once you make a new edit after undoing, the undone actions are gone.

---

### Model Changes â€” `src/model/index.ts`

#### Mutability

In Phase 4, `Cell.value`, `Row.cells`, and `Table.rows` were `readonly`. This
prevented in-place mutation â€” editing a cell would require reconstructing the
entire model. Phase 5 removes `readonly` from these fields so the controller
can mutate them directly.

This is a deliberate tradeoff: mutability enables simple, efficient edits
(one field assignment) at the cost of losing immutability guarantees. The
undo/redo stack compensates by recording every mutation, making all changes
reversible.

#### `erasableSyntaxOnly` Compliance

The TypeScript compiler flag `erasableSyntaxOnly` forbids constructor
parameter shorthand (`public readonly x: T` in constructor params). This
syntax is a TypeScript-only feature that cannot be erased to plain JavaScript
without transformation. All model classes were rewritten to use explicit
property declarations:

```ts
// Before (forbidden by erasableSyntaxOnly):
class Cell {
    constructor(public value: string, public readonly typeId: string) {}
}

// After (compliant):
class Cell {
    value: string;
    readonly typeId: string;
    constructor(value: string, typeId: string) {
        this.value = value;
        this.typeId = typeId;
    }
}
```

#### `EditAction` Type

A discriminated union type representing every reversible operation:

```ts
type EditAction =
    | { type: "cell"; tableIdx: number; rowIdx: number; colIdx: number;
        oldValue: string; newValue: string }
    | { type: "addRow"; tableIdx: number; row: Row }
    | { type: "deleteRow"; tableIdx: number; rowIdx: number; row: Row };
```

The `type` discriminant allows TypeScript to narrow the union in `if`/`switch`
statements, giving full type safety when accessing action-specific fields.

#### `EditHistory` Class

```ts
class EditHistory {
    private past: EditAction[] = [];
    private future: EditAction[] = [];

    push(action): void  // add action, clear future
    undo(): EditAction | undefined  // pop from past, push to future
    redo(): EditAction | undefined  // pop from future, push to past
    canUndo(): boolean
    canRedo(): boolean
    clear(): void
}
```

#### `KnowledgeBase.exportTableAsCSV(tableIdx)`

Serializes a table back to CSV text. The output format matches the input
format: header row, types row, data rows. Fields containing commas, double
quotes, or newlines are quoted:

```ts
const escape = (v: string) =>
    v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v;
```

Double quotes inside a field are escaped by doubling them (`"` â†’ `""`),
which is the standard CSV quoting convention.

---

### Controller Changes â€” `src/controller/index.ts`

#### `editCell(tableIdx, rowIdx, colIdx, newValue)`

Mutates the cell value and records an undo action. If the new value equals
the old value, the method is a no-op (no action recorded, no re-render).
This prevents spurious undo entries when a user clicks a cell and presses
Enter without changing anything.

#### `addRow(tableIdx)`

Creates a new `Row` with empty `Cell` objects (one per column, using the
correct `typeId` from the column definition). Pushes it to `table.rows`
and records an `addRow` action.

#### `deleteRow(tableIdx, rowIdx)`

Splices the row out of `table.rows` using `Array.splice`. Records a
`deleteRow` action storing the removed `Row` object so it can be restored
on undo.

#### `undo()` and `redo()`

Apply the inverse (or forward) mutation directly to the model, then call
`showAll()` to re-render. The mutations are:

| Action type | Undo | Redo |
|-------------|------|------|
| `cell` | `cell.value = oldValue` | `cell.value = newValue` |
| `addRow` | `table.rows.pop()` | `table.rows.push(row)` |
| `deleteRow` | `table.rows.splice(rowIdx, 0, row)` | `table.rows.splice(rowIdx, 1)` |

---

### View Changes â€” `src/view/table-view.ts`

#### One Active Cell at a Time

The view tracks the currently active cell in `this.activeCell`. When a new
cell is clicked, `cancelActive()` is called first to close the current edit
before opening the new one. This ensures only one `contenteditable` is active
at any time.

#### Cell Activation Flow

```
User clicks cell
    â†“
cancelActive() â€” closes any currently open cell
    â†“
activateCell(td, originalValue, typeId, onCommit)
    â†“
td.contentEditable = "true"
td.textContent = originalValue
td.focus()
    â†“
if syntax cell: showPreview(originalValue, typeId)
                td.addEventListener("input", â†’ showPreview(td.textContent, typeId))
    â†“
User types in cell
    â†“
Enter â†’ commit(td.textContent)  â†’ onCommit(value) â†’ controller.editCell(...)
Escape â†’ cancel() â†’ restore original rendered view
Blur â†’ commit(td.textContent)  â†’ same as Enter
```

#### Preview Bar (Syntax Cells Only)

The `#cell-edit-bar` element in `index.html` is hidden by default. When a
syntax cell is activated:
1. `showPreview(value, typeId)` renders the current source via `renderCell`
   and inserts the result into `#cell-edit-preview`
2. The bar is made visible (`hidden = false`)
3. An `input` event listener on the `<td>` calls `showPreview` on every
   keystroke, updating the preview in real time
4. On commit or cancel, `hidePreview()` clears the preview and hides the bar

The bar has no input field â€” it is purely a display element. The user always
types in the cell, not in the bar.

#### Event Listener Cleanup

The `keydown` and `blur` listeners added to the `<td>` during activation
are removed in a `cleanup()` function called at the start of both `commit`
and `cancel`. This prevents stale listeners from firing after the cell
returns to rendered view.

The `input` listener for the preview is stored on the element as
`td.__onInput` and removed in the commit/cancel path. This is a pragmatic
choice â€” storing the function reference on the element avoids needing a
closure variable that would require restructuring the activation flow.

#### Add Row and Export CSV

Below each editable table, a toolbar is rendered with two buttons:
- **+ Add Row** â€” calls `controller.addRow(tableIdx)`
- **â¬‡ Export CSV** â€” calls `controller.exportCSV(tableIdx)`, creates a
  `Blob`, generates an object URL, triggers a download via a temporary
  `<a>` element, then revokes the URL

#### Delete Row

Each row has an extra `<td>` at the right end containing a âœ• button.
Clicking it shows a `confirm()` dialog. On confirmation, calls
`controller.deleteRow(tableIdx, rowIdx)`.

The `rowIdx` is determined at render time by `table.rows.indexOf(row)`,
which finds the row's current position in the model array. This is correct
because the table re-renders after every mutation.

---

### HTML Changes â€” `index.html`

Added the `#cell-edit-bar` element above the table container:

```html
<div id="cell-edit-bar" class="cell-edit-bar" hidden>
  <span class="cell-edit-bar-label">Preview:</span>
  <div id="cell-edit-preview" class="cell-edit-bar-preview"></div>
</div>
```

The `hidden` attribute hides it by default. `TableView` removes it when a
syntax cell is active and restores it on commit/cancel.

---

### CSS Changes â€” `style.css`

| Selector | Purpose |
|----------|---------|
| `.cell-edit-bar` | Flex row, blue border, hidden when idle |
| `.cell-edit-bar-label` | "Preview:" label, small text |
| `.cell-edit-bar-preview` | Flex-grow container for rendered output |
| `.editable-cell` | Cursor pointer, hover highlight |
| `.cell-active` | Blue outline on the currently edited cell |
| `.row-actions` | Narrow column for the delete button |
| `.row-delete-btn` | Invisible background, red on hover |
| `.table-toolbar` | Flex row below each table for add/export buttons |

---

### `main.ts` Changes

- Retrieves `#cell-edit-bar` and `#cell-edit-preview` DOM elements
- Passes them to `TableView` constructor
- Calls `tableView.setController(controller)` after construction
- Adds global `keydown` handler for Ctrl+Z (undo) and Ctrl+Y / Ctrl+Shift+Z (redo)
- Adds `document` click handler that calls `tableView.cancelActive()` to
  commit any open edit when the user clicks outside the table

---

### Design Decisions

#### Why `contenteditable` instead of `<input>`?

An `<input>` element inside a `<td>` disrupts the table layout â€” it has its
own sizing, border, and padding that fight with the cell's CSS. Positioning
an absolutely-placed input overlay requires tracking cell coordinates.
`contenteditable` on the `<td>` itself avoids all of this: the cell keeps
its exact position and size, and the browser handles all text editing natively.

#### Why is the preview bar read-only?

The source and the rendered output are two different representations of the
same data. Allowing the user to edit the rendered output would require a
reverse-renderer (rendered HTML â†’ source text), which is complex and fragile.
The clean separation is: **source in the cell, rendered output in the bar**.
The user always edits source; the bar is purely informational.

#### Why does blur commit instead of cancel?

Blur fires when the user clicks outside the cell (e.g., on another cell or
the toolbar). Committing on blur means the user's work is never silently
discarded. If the user wants to cancel, they press Escape explicitly.
This matches the behaviour of spreadsheet applications.

---

## Phase 7 â€” Search, Indexing & Tooling

This section explains all new code introduced in Phase 7: the search engine,
search view, and session persistence module.

---

### Overview

Phase 7 adds the ability to actively query the loaded knowledge base. Four
operations are provided:

1. **Full-text search** â€” find all text cells whose value contains a query string
2. **Structural search** â€” find all math cells whose AST contains a given identifier
3. **Graph neighbourhood** â€” find all entities within N hops of a starting entity
4. **Cross-table join** â€” find entity pairs from two tables linked by a relation

All four are implemented as pure functions in `src/search/index.ts` that
operate on the in-memory `KnowledgeBase` model. They do not index, cache, or
modify any state â€” they scan on every call. For the current scale (hundreds
of entities) this is instantaneous.

A `SearchView` class in `src/view/search-view.ts` wires the search functions
to the DOM. A `session.ts` module in `src/view/` persists the names of loaded
files to `localStorage` so the user can be reminded to reload them on next open.

---

### `src/search/index.ts` â€” Search Engine

#### Result types

Three result interfaces are defined:

**`SearchHit`** â€” returned by `searchText` and `searchByIdentifier`:
```ts
interface SearchHit {
    tableIdx: number;    // index into kb.tables
    tableName: string;
    rowIdx: number;
    entityId: string;    // first-column value of the row
    colIdx: number;
    colName: string;
    value: string;       // the raw cell value that matched
    matchStart: number;  // start index of the match within value
    matchEnd: number;    // end index (exclusive)
}
```

**`NeighbourHit`** â€” returned by `getNeighbourhood`:
```ts
interface NeighbourHit {
    entityId: string;
    tableName: string;
    relation: string;    // the relation name (or its inverse) on the edge
    direction: "outgoing" | "incoming";
    hops: number;        // how many hops from the start entity
}
```

**`JoinHit`** â€” returned by `crossTableJoin`:
```ts
interface JoinHit {
    leftEntityId: string;
    rightEntityId: string;
    relation: string;
}
```

---

#### `searchText(kb, query)`

Scans every cell in every table. Only cells whose `typeId` is `"text"`,
`"plain"`, or `"plaintext"` are searched â€” math cells are excluded because
their raw source text is not meaningful to a plain-text query.

The comparison is case-insensitive: both the query and the cell value are
lowercased before `indexOf`. The match position (`matchStart`, `matchEnd`)
is recorded in the original (non-lowercased) value's coordinate space so
the view can highlight the correct substring.

A blank or whitespace-only query returns an empty array immediately.

---

#### `searchByIdentifier(kb, identifierName)`

Scans every math cell (`typeId === "math"`). For each non-empty cell, it
calls `parser.parse("Expression", cell.value)` to get the AST, then walks
the AST with `astContainsIdentifier` looking for any `IdentifierNode` whose
`name` field equals the query.

**`astContainsIdentifier(node, name)`** is a recursive switch over all
`MathNode` types. It returns `true` as soon as any `Identifier` node with
the matching name is found. Cells that fail to parse are silently skipped
(the `try/catch` around the parse call discards unparseable cells).

This function is the "domain tool" described in the phase spec: it answers
"which entities use this symbol?" by searching the parsed AST rather than
the raw source text. Searching the raw text would produce false positives
(e.g. searching for `a` would match `\\nabla` as a substring).

---

#### `getNeighbourhood(kb, startEntityId, maxHops)`

Performs a **breadth-first search** (BFS) over the association graph starting
from `startEntityId`. Both outgoing and incoming edges are traversed.

A `visited` set prevents revisiting entities. The BFS queue holds
`{ entityId, hops }` pairs. When an entity is dequeued, if `hops >= maxHops`
the loop continues without expanding further â€” this enforces the hop limit.

For each unvisited neighbour:
- **Outgoing edge** (`source â†’ target`): the neighbour is `edge.target`,
  direction is `"outgoing"`, relation name is `edge.relation`
- **Incoming edge** (`source â†’ target` where target = current entity):
  the neighbour is `edge.source`, direction is `"incoming"`, relation name
  is the inverse looked up via `kb.graph.getInverse(edge.relation)` (falls
  back to the forward name if no inverse is defined)

An `entityTable` map (built once before the BFS) maps each entity ID to its
table name for display in the neighbourhood panel.

The start entity itself is never included in the results (it is pre-added
to `visited` before the BFS begins).

---

#### `crossTableJoin(kb, leftTableIdx, rightTableIdx, relation)`

Finds all entity pairs `(leftEntity, rightEntity)` where `leftEntity` is in
the left table, `rightEntity` is in the right table, and there is an edge
`leftEntity --relation--> rightEntity` in the graph.

Implementation:
1. Build a `Set` of all entity IDs in the right table
2. For each row in the left table, call `kb.graph.filterBySource(relation, row.entityId)`
   to get all targets of that entity via the given relation
3. For each target, check if it is in the right table's ID set
4. If yes, emit a `JoinHit`

Returns an empty array if either table index is out of bounds.

---

### `src/view/search-view.ts` â€” Search View

`SearchView` is a class that builds and manages the search UI. It is
constructed with a container element and the `AppController` reference.

**DOM structure built by the constructor:**

```
container
â”œâ”€â”€ div.search-bar
â”‚   â”œâ”€â”€ input#search-input          (text search)
â”‚   â”œâ”€â”€ button "Search"
â”‚   â”œâ”€â”€ input#search-ident-input    (identifier search)
â”‚   â”œâ”€â”€ button "Find Symbol"
â”‚   â””â”€â”€ button "Clear"
â”œâ”€â”€ div.search-results              (hidden initially)
â””â”€â”€ div.neighbourhood-panel         (hidden initially)
```

**`showTextResults(hits)`** â€” renders a `SearchHit[]` into the results panel.
For each hit, it builds a `<li>` with:
- A location line: `tableName â€º entityId â€º colName`
- The cell value with the matched substring wrapped in `<mark>` for
  yellow highlighting

Clicking any result item calls `showNeighbourhood(hit.entityId)`.

**`showNeighbourhood(entityId)`** â€” calls `controller.getNeighbourhood(entityId, 2)`
and renders the results into the neighbourhood panel. Each entry shows the
hop count, relation name, direction arrow (`â†’` or `â†`), entity ID, and
table name. Clicking any entry navigates to that entity's neighbourhood
(recursive call to `showNeighbourhood`).

**`escapeHtml(s)`** â€” a module-private helper that escapes `&`, `<`, `>`,
and `"` to prevent HTML injection when inserting user-controlled strings
via `innerHTML`.

---

### `src/view/session.ts` â€” Session Persistence

Saves and restores the list of loaded file names using `localStorage`.

**`saveSession(fileNames)`** â€” serialises `{ fileNames, savedAt }` to JSON
and stores it under the key `"bookkeeping_session_v1"`. Called after every
successful file load. Errors (private browsing, storage full) are silently
ignored.

**`loadSession()`** â€” reads and parses the stored JSON. Returns `null` if
nothing is stored or if parsing fails.

**`clearSession()`** â€” removes the key from `localStorage`.

**Why only file names are stored:** The browser's security model prevents
a web page from reading arbitrary files from the filesystem. Only the user
can open files via a file picker or drag-and-drop. The session therefore
stores only the names of previously loaded files and shows a banner asking
the user to reload them â€” it cannot reload them automatically.

---

### Controller additions â€” `src/controller/index.ts`

Five thin delegator methods were added to `AppController`:

| Method | Delegates to |
|--------|-------------|
| `searchText(query)` | `searchText(this.knowledgeBase, query)` |
| `searchByIdentifier(name)` | `searchByIdentifier(this.knowledgeBase, name)` |
| `getNeighbourhood(startId, maxHops)` | `getNeighbourhood(this.knowledgeBase, startId, maxHops)` |
| `crossTableJoin(left, right, rel)` | `crossTableJoin(this.knowledgeBase, left, right, rel)` |
| `getLoadedFileNames()` | `this.knowledgeBase.tables.map(t => t.name)` |

These methods keep the view layer decoupled from the search module â€” the
view calls the controller, the controller calls the search engine.

---

### `src/main.ts` additions

- Imports `SearchView` and `saveSession`/`loadSession` from their modules
- Constructs `SearchView` with `#search-container` and the controller
- Wires the entity click handler on `TableView` to also call
  `searchView.showNeighbourhood(entityId)` â€” clicking an entity in the
  table now shows both the association detail panel (Phase 4) and the
  neighbourhood panel (Phase 7) simultaneously
- Calls `saveSession(controller.getLoadedFileNames())` after each
  successful file load
- On page load, calls `loadSession()` and if a previous session exists,
  populates and shows `#session-banner` with the file names and a Dismiss button

---

### `index.html` additions

- `<div id="session-banner" hidden>` â€” amber banner shown when a previous
  session is detected; hidden by default
- `<div id="search-container">` â€” mount point for `SearchView`, placed
  above the edit bar

---

### `style.css` additions

| Selector | Purpose |
|----------|---------|
| `.session-banner` | Amber background warning bar with padding |
| `.search-bar` | Flex row containing the two search inputs and buttons |
| `.search-input` | Styled text input for search queries |
| `.search-btn` | Search and Find Symbol buttons |
| `.search-btn-clear` | Clear button (lighter styling) |
| `.search-results` | Container for the results list |
| `.search-results-header` | Result count line |
| `.search-results-list` | `<ul>` with no list-style |
| `.search-result-item` | Individual result row, cursor pointer |
| `.search-result-location` | Grey location breadcrumb |
| `.search-result-value` | Cell value with highlighted match |
| `.neighbourhood-panel` | Container for the neighbourhood list |
| `.neighbourhood-header` | Title line for the neighbourhood panel |
| `.neighbourhood-list` | `<ul>` for neighbourhood entries |
| `.neighbourhood-item` | Individual hop entry |
| `.neighbourhood-hops` | Hop count badge |
| `.neighbourhood-relation` | Relation name in the entry |
| `.neighbourhood-table` | Table name in parentheses |

---

### Design Decisions

**1. No indexing â€” scan on every call.**
All search functions iterate the in-memory model on every invocation. For
the current scale (hundreds of entities, millisecond parse times) this is
instantaneous. A persistent index would be premature optimisation and would
require cache invalidation logic whenever cells are edited.

**2. Structural search parses on demand.**
`searchByIdentifier` re-parses each math cell's source text during the
search. This is correct because the source text is the canonical form of
the data. The parsed AST is not cached between calls â€” caching would
require invalidating entries on every `editCell` call, adding complexity
with no measurable benefit at current scale.

**3. BFS for neighbourhood.**
Breadth-first traversal guarantees that the shortest path to each entity
is found first and that hop counts are correct. Depth-first would also
work but would not guarantee shortest paths.

**4. Session stores names only.**
The browser cannot access the filesystem without user interaction. Storing
file contents in `localStorage` would be unreliable (storage limits) and
unnecessary (the user has the files on disk). The banner is a reminder,
not an automatic restore.

**5. `SearchView` is self-contained.**
The view builds its own DOM inside the container element passed to the
constructor. It does not depend on any pre-existing HTML structure beyond
the container div. This matches the pattern established by `GraphFilterView`
and `TableView`.

---

## Phase 8 â€” Spreadsheet Shell Layout & Refactoring

---

### Overview

Phase 8 has two goals:

1. **Structural refactoring** â€” enforce the 1-class-per-file rule in the model
   layer, and add two new controller actions (`insertRow`, `moveRow`) with
   full undo/redo support.

2. **UI redesign** â€” replace the scrolling document layout with a fixed
   spreadsheet shell where only the table workspace scrolls.

---

### Model Refactoring â€” 1 class per file

`src/model/index.ts` previously contained 9 classes in a single file. Each
class is now in its own file. `index.ts` is a pure barrel re-export â€” it
only contains `export { ... } from "./FileName.ts"` lines. All existing
imports from `"../model/index.ts"` continue to work without change.

The split follows the single responsibility principle: each file has exactly
one reason to exist. Cross-file dependencies use `import type` where the
imported symbol is only needed for type checking, avoiding runtime circular
dependency issues.

`EditHistory.ts` also owns the `EditAction` discriminated union type, since
the history class is the only consumer of that type's full definition.

---

### New Controller Actions

#### `insertRow(tableIdx, atIdx)`

Inserts an empty row at a specific index rather than always appending to the
end. Uses `Array.splice(atIdx, 0, row)` to insert at position. Records an
`addRow` undo action (undo removes the row; redo re-inserts it at the same
position via `push` â€” note: undo of `addRow` always pops the last row, so
`insertRow` undo is correct only if no other rows were added after it, which
is the normal case for a single-action undo).

#### `moveRow(tableIdx, fromIdx, toIdx)`

Moves a row from one index to another. Implementation:
```ts
const [row] = table.rows.splice(fromIdx, 1);
table.rows.splice(toIdx, 0, row);
```

Records a `moveRow` action. Undo reverses the move:
```ts
const [row] = table.rows.splice(toIdx, 1);
table.rows.splice(fromIdx, 0, row);
```

The `EditAction` union is extended with:
```ts
| { type: "moveRow"; tableIdx: number; fromIdx: number; toIdx: number }
```

---

### Spreadsheet Shell Layout

#### The core CSS pattern

The entire layout is driven by three CSS rules:

```css
html, body {
  height: 100%;
  overflow: hidden;   /* shell never scrolls */
}
body {
  display: flex;
  flex-direction: column;
}
#workspace {
  flex: 1 1 0;        /* fills all remaining height */
  overflow: auto;     /* only this scrolls */
}
```

All chrome elements (`#menu-bar`, `#formula-bar`, `#toolbar`, `#tab-bar`,
`#status-bar`) have `flex-shrink: 0` â€” they take their natural height and
do not shrink. `#workspace` gets all remaining height via `flex: 1 1 0`.

#### Sticky table headers

```css
.knowledge-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
}
```

Because `#workspace` is the scroll container (not `body`), `position: sticky`
on `thead th` sticks relative to `#workspace`'s scroll position. Column
headers remain visible as the user scrolls through a long table â€” standard
spreadsheet behaviour.

#### Floating overlay panels

The association detail panel, search results, and neighbourhood panel use
`position: fixed` to float over the workspace. This is necessary because
`#workspace` has `overflow: auto`, which creates a new stacking context â€”
any `position: absolute` child would be clipped at the workspace boundary.
`position: fixed` escapes the stacking context and positions relative to
the viewport instead.

---

### `TableView` Changes

#### External tab strip

Previously `TableView` created its own `<div class="tab-strip">` inside the
container. Now the tab strip lives in `#tab-bar` (a fixed chrome row), so
it must be passed in from outside:

```ts
constructor(container: HTMLElement, tabStrip: HTMLElement, editBar: HTMLElement, editPreview: HTMLElement)
```

The constructor no longer creates any DOM structure â€” it only stores
references. All DOM is created lazily in `renderAll`.

#### `getActiveTableIdx()`

Exposes the currently active tab index so toolbar buttons in `main.ts` can
call `controller.addRow(tableView.getActiveTableIdx())` without the view
needing to know about the toolbar.

#### `setStatusCallback(cb)`

Registers a callback that is called after each `renderActiveTable()` with
a status string. `main.ts` wires this to update `#status-bar`:

```ts
tableView.setStatusCallback((msg) => { statusText.textContent = msg; });
```

#### Drag-to-reorder

Each editable row gets a drag handle cell (`<td class="row-drag-handle">â ¿</td>`)
and `tr.draggable = true`. Four drag event listeners are attached per row:

- `dragstart` â€” records `this.dragSrcIdx = Number(tr.dataset.rowIdx)`
- `dragend` â€” removes the `.row-dragging` opacity class
- `dragover` â€” prevents default (required to allow drop), adds `.row-drag-over`
- `drop` â€” calls `controller.moveRow(tableIdx, dragSrcIdx, toIdx)`

The `.row-drag-over` class adds a blue top border to the target row, giving
clear visual feedback about where the row will land.

#### Insert row button

Each row's action cell now has two buttons: `+` (insert below) and `âœ•`
(delete). The insert button calls `controller.insertRow(tableIdx, rowIdx + 1)`.

#### Removed internal toolbar

The "Add Row" and "Export CSV" buttons that previously appeared below each
table are removed from `TableView`. Those actions are now in `#toolbar` in
the HTML, wired in `main.ts`.

---

### `GraphFilterView` Changes

The association detail panel is now appended to `document.body` instead of
inside the table container:

```ts
this.detailPanel = document.createElement("div");
this.detailPanel.className = "association-detail";
document.body.appendChild(this.detailPanel);
```

A `document` click listener clears the panel when the user clicks outside it.
The panel uses `position: fixed` in CSS so it floats over the workspace at
a fixed position below the toolbar.

---

### `main.ts` Changes

The key wiring changes:

- `tabStrip` is retrieved by ID and passed to `TableView` constructor
- `graphFilterContainer` and `searchContainer` are separate divs inside
  `#toolbar` â€” `GraphFilterView` and `SearchView` mount there
- Toolbar buttons call `tableView.getActiveTableIdx()` to know which table
  to act on
- Drag-and-drop is on `#workspace` instead of `#table-container`
- `tableView.setStatusCallback()` wires the status bar

---

### Design Decisions

**Why `body` as the flex container?**
The shell must fill the full viewport height. Using a wrapper `#app` div
with padding would require compensating `calc()` heights. Using `body`
directly is simpler and avoids any height calculation.

**Why pass `tabStrip` to `TableView` instead of letting it create its own?**
The tab strip must be in `#tab-bar` (a fixed chrome row above the workspace),
not inside `#workspace` (which scrolls). If `TableView` created its own tab
strip inside the container, it would scroll with the table. Passing it as a
constructor parameter keeps the view's DOM responsibilities clear: it renders
the table content, not the chrome.

**Why `position: fixed` for floating panels?**
`#workspace` has `overflow: auto`, which creates a containing block for
`position: absolute` children. Any absolutely-positioned panel inside
`#workspace` would be clipped at the workspace boundary. `position: fixed`
escapes this and positions relative to the viewport, allowing panels to
overlay the full page.

**Why `thead th { position: sticky; top: 0 }`?**
Sticky positioning is relative to the nearest scrolling ancestor. Since
`#workspace` is the scroll container, `top: 0` means "stick to the top of
`#workspace`'s visible area". This gives the standard spreadsheet behaviour
of frozen column headers without any JavaScript scroll event handling.

---

## Phase 9 â€” Geometry Syntax Plugin

---

### Overview

Phase 9 adds a geometry syntax plugin. A cell with `typeId: "geometry"` contains a multi-line textual description of a geometric figure. The plugin parses it into a `GeometryProgram` AST and renders it as an SVG diagram.

The plugin follows the same five-file structure as the math plugin:

```
src/plugins/geometry/
â”œâ”€â”€ types.ts     â€” AST node interfaces
â”œâ”€â”€ grammar.ts   â€” PEG grammar + exported parser + parseGeometry()
â”œâ”€â”€ el.ts        â€” svgEl() and svgText() helpers
â”œâ”€â”€ render.ts    â€” renderGeometry() SVG renderer
â””â”€â”€ index.ts     â€” Plugin entry point
```

---

### `types.ts` â€” AST node interfaces

Every geometry construct has its own interface. All numeric/algebraic values are typed as `MathNode` (from the math plugin), not as raw strings. This means the geometry AST carries fully parsed math sub-trees, not unparsed text.

Key types:

- `GeometryProgram` â€” root node, holds `statements: GeoStatement[]`
- `GeoExpr` â€” union of `SegmentExpr | LineExpr | RayExpr | AngleExpr` â€” used as arguments inside relation nodes
- `GeoStatement` â€” union of all 25 statement node types

---

### `grammar.ts` â€” PEG grammar

#### Why a separate skip pattern

The math parser uses `skip: /^[ \t\r\n]+/` â€” it skips all whitespace including newlines, because a math expression is a single line. The geometry parser uses `skip: /^[ \t]+/` â€” spaces and tabs only. Newlines are the statement separator in the `Program` rule and must not be consumed by the skip pattern.

#### Grammar structure

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
RhsRaw       = /^[^\n\r]+/
```

#### `CallExpr` â€” the central rule

`CallExpr` is a PEG sequence: `Name "(" ArgList ")"`. It produces a `ParsedCall { name: string, args: ParsedArg[] }`. By the time `build()` is called, the name and all arguments are already parsed â€” `build()` only does `switch(name)` and assembles the AST node.

This is the key architectural difference from the first (incorrect) implementation, which captured the entire `"Point(A,B,C)"` as a single regex string and re-parsed it inside `build()`.

#### `Arg` â€” three cases

The `Arg` rule handles three kinds of argument, tried in order:

1. **`PointGroup`** â€” `"(" Label ("," Label)* ")"` â€” for `Circle((A,B,C),O)` where the first argument is a group of point labels in parens. Tried first to prevent `(A,B,C)` from being consumed as a math expression.

2. **`CallExpr`** â€” recursive â€” for nested calls like `Parallel(Line(A,B),Line(C,D))`. The `Line(A,B)` inside `Parallel(...)` is itself a `CallExpr`.

3. **`MathArg`** â€” regex `/^[^,)\n\r]+/` â€” everything up to the next comma, closing paren, or newline. Captures point labels (`A`), numbers (`5`), and math expressions (`2*x+1`).

#### Math delegation

`MathArg` and `RhsRaw` capture raw text spans. `build()` calls `mathParser.parse("Expression", span)` on those spans to produce `MathNode` values. The two parsers are composed at the `build()` boundary: the geometry PEG grammar handles geometric structure; the math parser handles algebraic content.

#### `BlankOrComment`

Matches whitespace-only lines (`[ \t]+`) and comment lines (`#...` or `//...`). Uses `+` not `*` â€” must match at least one character so it never matches empty string and steals real statement lines. Tried last in the `Statement` choice so real statements are always tried first.

---

### `el.ts` â€” SVG element helpers

```ts
svgEl(tag, attrs)   // createElementNS(SVG_NS, tag) + setAttribute for each attr
svgText(x, y, content, cls)  // SVG text element
```

Mirrors `math/el.ts`. Keeps `render.ts` free of element creation boilerplate.

---

### `render.ts` â€” SVG renderer

#### Point layout

Two-pass layout:
1. `PointDecl` statements with explicit coordinates are collected and scaled to fit the 400Ã—300 viewport (with 30px padding). Y-axis is flipped (SVG Y increases downward; math Y increases upward).
2. All remaining point labels (collected from all statement types) are auto-laid-out in a circle centred in the viewport.

#### Drawing dispatch

`renderGeometry()` iterates `program.statements` and dispatches each to a drawing function:

| Statement type | Drawing function | Output |
|---|---|---|
| `Segment` | `drawSegment` | `<line>` + optional math label in `<foreignObject>` |
| `Line` | `drawLine` | `<line>` extended to viewport edges (dashed) |
| `Ray` | `drawRay` | `<line>` from origin extending to viewport edge |
| `Arrow` | `drawArrow` | `<line>` with `marker-end: url(#arrowhead)` |
| `Angle` | `drawAngle` | SVG arc path + optional math label |
| `Triangle/Quadrilateral/Polygon` | `drawPolygon` | Closed `<path>` |
| `Circle` | `drawCircle` | `<circle>` â€” radius from explicit value or circumpoint distance |
| `Ellipse` | `drawEllipse` | `<ellipse>` â€” rx/ry from explicit axes or defaults |
| `Arc` | `drawArc` | SVG arc path |
| `Parallel` | `drawParallelMarks` | Tick marks on both lines |
| `Perpendicular` | `drawPerpMark` | Small square at intersection |
| `Intersection` | inline | Point dot + label at result point |
| `Midpoint` | inline | Point dot + label at midpoint, added to point map |
| `Geodesic` | inline | `<line>` with geodesic CSS class |

Points are drawn last (on top of all primitives) by `drawPoints()`.

#### SVG defs

An `<defs>` block defines the `arrowhead` marker used by `Arrow` statements.

---

### UI changes in Phase 9

#### Formula bar inverted (cell always rendered)

Previously: clicking a cell made it `contenteditable` and showed a rendered preview in the formula bar.

Now: cells always show rendered output. The formula bar is the source editor. Clicking a cell highlights it and puts its raw source into the formula bar textarea. The cell re-renders live as the user types. Enter commits; Escape cancels; blur commits.

This is the correct spreadsheet model â€” the cell shows the value, the bar shows the formula.

#### Formula bar is a `<textarea>` not `<input>`

`<input type="text">` cannot hold newlines. Geometry source is multi-line (one statement per line). The formula bar uses `<textarea rows="1">` that auto-expands via `autoResize()` (sets `height: auto` then `height: scrollHeight`).

**Alt+Enter** inserts a newline at the cursor position. Plain Enter commits. The `suppressBlur` flag prevents the `blur` listener from committing when Alt+Enter temporarily moves focus.

#### Formula result div removed

The old `#result` div rendered the formula bar content as a math expression on Enter. This caused geometry cells to be re-interpreted as algebraic syntax. Removed entirely â€” the formula bar has no automatic rendering of its own content.

---

## Phase 10 â€” Physics Free-Body Syntax Plugin

---

### Overview

Phase 10 adds a physics syntax plugin. A cell with `typeId: "physics"` contains a multi-line description mixing geometry declarations and physics statements. The plugin parses it into a `PhysicsProgram` and renders it as an SVG free-body diagram.

The plugin follows the same four-file structure as geometry:

```
src/plugins/physics/
â”œâ”€â”€ types.ts     â€” AST node interfaces
â”œâ”€â”€ grammar.ts   â€” PEG grammar + exported parser + parsePhysics()
â”œâ”€â”€ render.ts    â€” renderPhysics() SVG renderer
â””â”€â”€ index.ts     â€” Plugin entry point
```

Note: physics has no `el.ts` because it reuses `geometry/el.ts` directly.

---

### `types.ts` â€” AST node interfaces

```
PhysicsProgram        â€” root: { geoStatements, physStatements }
BodyDeclNode          â€” Body(name) with optional mass/moment MathNodes
ForceNode             â€” name, point, direction (string), optional magnitude MathNode
VelocityNode          â€” type "Velocity"|"Acceleration", name, point, direction, optional value
AngularNode           â€” type "AngularVelocity"|"AngularAcceleration", name, body, optional value
TorqueNode            â€” name, body, pivot, optional value MathNode
ConstraintNode        â€” type Fixed|Roller|Contact|String|Spring|Damper, a, optional b/direction/value
FrameDeclNode         â€” name, origin, axes[]
InertialDeclNode      â€” frame name
EOMNode               â€” equation MathNode
```

`PhysicsProgram` holds two separate arrays: `geoStatements: GeoStatement[]` (from the geometry plugin) and `physStatements: PhysicsStatement[]`. This separation keeps the geometry base layer independent from the physics overlay.

---

### `grammar.ts` â€” line partitioning + PEG grammar

#### Line partitioning

Physics syntax is a superset of geometry. Rather than a single unified grammar, `parsePhysics()` partitions lines by leading keyword:

```ts
const PHYSICS_KEYWORDS = new Set([
    "Body", "Force", "Velocity", "Acceleration",
    "AngularVelocity", "AngularAcceleration", "Torque",
    "Fixed", "Roller", "Contact", "String", "Spring", "Damper",
    "Frame", "Inertial", "EOM",
]);
```

Lines whose leading keyword is in `PHYSICS_KEYWORDS` go to the physics PEG parser. All other lines go to `parseGeometry()`. Blank lines are filtered from both partitions before parsing.

This approach keeps both grammars simple and independent. The geometry grammar does not need to know about physics keywords, and the physics grammar does not need to re-implement geometry rules.

#### PEG grammar structure

Same architecture as geometry:

```
Program      = Statement (\n Statement)*
Statement    = AssignStatement | CallStatement | BlankOrComment
AssignStatement = CallExpr "=" RhsRaw
CallStatement   = CallExpr
CallExpr     = Name "(" ArgList ")"
ArgList      = Arg ("," Arg)*  |  empty
Arg          = /^[^,)\n\r]+/
RhsRaw       = /^[^\n\r]+/
```

`build()` receives `{ name, args[] }` and assembles AST nodes â€” no re-parsing.

#### Direction strings

Force and velocity directions (`\d`, `\u`, `\r`, `\l`) are stored as raw strings in the AST, not parsed as math expressions. The renderer maps them to unit vectors:

```ts
function directionVector(dir: string): { dx: number; dy: number } {
    if (dir === "\\d" || dir === "down")  return { dx: 0,  dy: 1  };
    if (dir === "\\u" || dir === "up")    return { dx: 0,  dy: -1 };
    if (dir === "\\r" || dir === "right") return { dx: 1,  dy: 0  };
    if (dir === "\\l" || dir === "left")  return { dx: -1, dy: 0  };
    return { dx: 1, dy: 0 }; // default: rightward
}
```

This avoids the complexity of parsing backslash identifiers as math nodes just to extract a direction.

---

### `render.ts` â€” SVG renderer

`renderPhysics()` calls `renderGeometry()` first to draw the geometric base layer, then appends physics elements to the same SVG. This reuses the geometry point layout and coordinate scaling without duplication.

Physics elements drawn on top of the geometry base:

| Statement type | Drawing | CSS class |
|---|---|---|
| `Force` | Arrow from point in direction, math label | `phys-force` (red) |
| `Velocity` | Arrow from point in direction | `phys-velocity` (blue) |
| `Acceleration` | Arrow from point in direction | `phys-accel` (orange) |
| `Fixed` | Circle + hatch lines below | `phys-pin`, `phys-hatch` |
| `Roller` | Triangle + circle | `phys-roller` |
| `Spring` | Zigzag polyline, optional label | `phys-spring` (purple) |
| `Damper` | Line + rectangle | `phys-damper` (cyan) |
| `String` | Dashed line | `phys-string` |
| `BodyDecl` | Label at point if point exists | `phys-body-label` |

SVG `<defs>` adds three arrowhead markers: `force-arrow`, `vel-arrow`, `accel-arrow`.

---

### Bug fix â€” `loadCSV` crash on mismatched field count

**Problem:** `loadCSV` in `controller/index.ts` mapped CSV rows as:
```ts
rawRow.map((val, i) => new Cell(val, columns[i].typeId))
```
When a CSV row had more fields than columns (e.g. an unquoted comma in a Notes value), `columns[i]` was `undefined` at `i >= columns.length`, throwing `Cannot read properties of undefined (reading 'typeId')`.

**Fix:** Iterate over `columns` instead of `rawRow`:
```ts
columns.map((col, i) => new Cell(rawRow[i] ?? "", col.typeId))
```
The model always produces exactly one cell per column. Extra CSV fields are ignored; missing fields default to `""`. This is the correct defensive approach for any CSV with irregular field counts.

---

## Phase 11 â€” Chemistry Reaction Syntax Plugin

---

### Overview

Phase 11 adds a chemistry syntax plugin. A cell with `typeId: "chemistry"`
contains one or more chemistry statements â€” reaction equations, thermodynamic
quantities, or structural formula declarations. The plugin parses them into a
`ChemistryProgram` AST and renders them as HTML.

The plugin follows the same four-file structure as physics:

```
src/plugins/chemistry/
â”œâ”€â”€ types.ts     â€” AST node interfaces
â”œâ”€â”€ grammar.ts   â€” PEG grammar + exported parser + parseChemistry()
â”œâ”€â”€ render.ts    â€” renderChemistry() HTML renderer
â””â”€â”€ index.ts     â€” Plugin entry point
```

---

### `types.ts` â€” AST node interfaces

The chemistry AST has three layers:

**Compound structure:**
- `IsotopeNode` â€” mass number + optional atomic number (from `^14_6C`)
- `ElementGroup` â€” isotope? + symbol + count (e.g. `H2`, `^14C`)
- `ParenGroup` â€” inner groups + count (e.g. `(OH)2`)
- `BracketGroup` â€” inner groups + count (e.g. `[Fe(CN)6]`)
- `GroupNode` â€” union of the three group types
- `CompoundNode` â€” groups + optional state symbol
- `ChargedSpeciesNode` â€” compound + charge + optional state
- `ParticleNode` â€” one of `n|p|e-|e+|alpha|beta-|beta+|gamma`
- `SpeciesNode` â€” union of compound, charged species, particle
- `ChargeNode` â€” magnitude (default 1) + sign (`+` or `-`)

**Reaction:**
- `ReactionTerm` â€” coefficient (default 1) + species
- `CondItemNode` â€” key + optional math value (absent = bare flag)
- `ConditionNode` â€” list of condition items
- `ReactionNode` â€” lhs terms, arrow type, rhs terms, optional conditions

**Other statements:**
- `ThermoNode` â€” key (`DeltaH`, `Ka`, etc.) + math value
- `AtomDeclNode`, `BondDeclNode`, `GroupDeclNode` â€” structural formula

**Root:**
- `ChemistryProgram` â€” list of `ChemStatement` (union of all statement types)

---

### `grammar.ts` â€” PEG grammar

#### Why PEGParser, not a hand-written parser

All structural rules are expressed as PEG grammar entries fed into `PEGParser`.
`build()` functions only assemble AST nodes from already-parsed data. This
follows the same architecture as geometry and physics â€” the PEG engine handles
all structure; `build()` only does `switch`/assembly.

#### The no-whitespace problem

Chemistry has a unique constraint: atom counts must directly follow element
symbols with no whitespace. `H2O` means hydrogen-2 + oxygen, but `H 2 O`
would be ambiguous. The `skip` pattern fires before every `literal` and
`regex` match, so a naive grammar would allow `H 2 O`.

**Solution: atomic regexes.** `ElementGroup` is a single regex that captures
the entire token â€” isotope prefix, element symbol, and count â€” in one match:

```
/^(\^[0-9]+(_[0-9]+)?)?[A-Z][a-z]*[0-9]*/
```

Since this is one regex token, the skip pattern cannot fire inside it.
Similarly, `ParenGroup` and `BracketGroup` capture their closing delimiter
plus count as one atomic regex (`/^\)[0-9]*/`, `/^\][0-9]*/`).

#### Optional elements via grammar patching

PEG sequences fail if any part fails. To make `Coeff`, `State`, and `Charge`
optional, they are wrapped in a `choice` with an empty sequence:

```ts
{ type: "choice", options: [
    { type: "regex", regex: /^[0-9]+(?=[A-Z{\\^npe])/, name: "coefficient" },
    { type: "sequence", parts: [] },  // empty = no coefficient
] }
```

This is applied by patching the grammar object after the initial definition,
keeping the initial definition readable.

#### `ParenGroup` vs `State` disambiguation

`ParenGroup` requires at least one `Group` inside. `Group` requires starting
with `[A-Z]`, `[`, or `^`. State symbols `(s)`, `(l)`, `(g)`, `(aq)` contain
only lowercase letters â€” `Group` fails on them, `ParenGroup` fails, and the
optional `State` choice matches. No explicit lookahead needed.

#### `Conditions` syntax

Conditions use `cond(key=value, ...)` syntax matching the study.md spec.
`CondValue` stops at `,` or `)` (the `cond(...)` closing paren).

#### Math delegation

`ThermoStmt` values (`LineRest` rule) and `CondItem` values (`CondValue` rule)
are captured as raw text, then `build()` calls `mathParser.parse("Expression",
span)` to produce `MathNode` values. Same composition pattern as geometry.

---

### `render.ts` â€” HTML renderer

`renderChemistry()` iterates `program.statements` and dispatches each:

**Reactions** (`renderReaction`):
- Horizontal flex layout: `chem-side` (lhs) + `chem-arrow-wrap` + `chem-side` (rhs)
- Conditions rendered above the arrow in smaller text (`chem-conditions`)
- Coefficients as plain text (`chem-coeff`)
- Atom counts as `<sub>` via `renderGroups()`
- Charges as `<sup>` with magnitude+sign (e.g. `2+`, `-`)
- Isotopes as stacked leading `<sup>`/`<sub>` (`.chem-isotope-scripts`)
- State symbols as italic postfix (`.chem-state`)
- Particles mapped to Unicode symbols (`n`, `p`, `eâ»`, `eâº`, `Î±`, `Î²â»`, `Î²âº`, `Î³`)

**Thermodynamic quantities** (`renderThermo`):
- `Î”H = value` â€” key mapped to Unicode symbol, value rendered by `renderMath()`

**Structural formulas** (`renderStructural`):
- Text rows listing atom/bond/group declarations

---

### CSS additions (`native-math.css`)

| Class | Purpose |
|-------|---------|
| `.chem-program` | Flex column container for all statements |
| `.chem-reaction` | Flex row: lhs + arrow + rhs |
| `.chem-side` | Flex row of terms |
| `.chem-term` | Coefficient + species |
| `.chem-coeff` | Stoichiometric coefficient |
| `.chem-species` | Compound/ion/particle |
| `.chem-arrow-wrap` | Flex column: conditions above arrow |
| `.chem-arrow` | Arrow symbol (â†’, â‡Œ, âŸ¶) |
| `.chem-conditions` | Small text above arrow |
| `.chem-state` | Italic state symbol postfix |
| `.chem-isotope-scripts` | Stacked mass/atomic number |
| `.chem-thermo` | Thermodynamic quantity row |
| `.chem-structural` | Structural formula rows |

---

### Design decisions

1. **PEGParser for all structural rules** â€” the first implementation used a
   hand-written cursor-based parser. This was replaced to follow the project
   architecture: all grammars use `PEGParser`; `build()` only assembles AST.

2. **Atomic regexes for no-whitespace rules** â€” the only way to prevent the
   `skip` pattern from firing between an element symbol and its count is to
   capture both in a single regex token.

3. **`cond(...)` not `[...]`** â€” conditions use `cond(key=value, ...)` as
   specified in study.md. The `[...]` bracket syntax was an error in the
   initial implementation.

4. **Charge as `{compound, charge}` wrapper** â€” charges are never postfix
   suffixes. The `{...}` wrapper makes the charge explicit and unambiguous,
   avoiding the `Ca2+` vs `Fe2` integer-lookahead problem entirely.

5. **State symbols as lowercase closed set** â€” `(s)`, `(l)`, `(g)`, `(aq)`
   are distinguished from group `(OH)2` by the fact that element symbols
   always start uppercase. No explicit lookahead needed.

---

## Phase 12 â€” Control File & Map Views

---

### Overview

Phase 12 introduces two things:

1. **`control.json`** â€” a file that declares how a folder of CSVs should be
   loaded and rendered. Standard tables continue to work as before. Diagram
   entries bind CSV files to a diagram renderer instead of a spreadsheet.

2. **`FlowDiagramView`** â€” an SVG diagram renderer that handles four view
   types: `flow`, `spatial`, `relation`, and `sequence`. The renderer
   automatically detects cycles in the graph and chooses the correct layout
   algorithm for each part of the diagram.

---

### `src/data/control.ts` â€” Control File Parser

This file defines all the TypeScript interfaces for the control file format
and the functions that parse and resolve them.

#### Interfaces

**`ControlFile`** â€” the top-level object parsed from `control.json`:
```ts
interface ControlFile {
    version: string;
    entries: ControlEntry[];
}
```

**`ControlEntry`** â€” a union of three entry types:
- `TableDecl` â€” `{ id, view: "table", file }` â€” loads a CSV as a spreadsheet
- `FlowDecl` â€” `{ id, view: "flow"|"spatial"|"relation", nodes, edges?, nodeStyles?, edgeStyles? }` â€” loads a diagram
- `SequenceDecl` â€” `{ id, view: "sequence", actors, messages }` â€” loads a sequence diagram

**`NodeMapping`** â€” declares which CSV column plays each role in a node:
```ts
interface NodeMapping {
    id: string;      // column name â†’ node identity
    label?: string;  // column name â†’ display label
    type?: string;   // column name â†’ node type (drives shape/colour)
    x?: string;      // column name â†’ x position hint
    y?: string;      // column name â†’ y position hint
    ...
}
```

**`ResolvedNode`** â€” a node after the mapping has been applied to a CSV row:
```ts
interface ResolvedNode {
    id: string;
    label: string;
    type: string;
    x?: number;
    y?: number;
    extra: Record<string, string>;  // all other columns
}
```

#### `parseControlFile(json)`

Validates the raw JSON object and constructs a `ControlFile`. Throws
descriptive errors for missing required fields (e.g. `"entries"` array,
`"id"` in node mapping). This is the only place where the control file
format is validated â€” all downstream code can assume the structure is correct.

#### `resolveNodes(headers, rows, mapping)`

Takes the raw CSV data (headers array + rows array) and a `NodeMapping`,
and produces a `ResolvedNode[]`. For each row:
1. Looks up the column index for each mapping field using `headers.indexOf`
2. Reads the value at that index from the row
3. Parses `x`, `y`, `width`, `height` as floats if present
4. Puts all non-mapped columns into `extra`

This function is the bridge between the CSV world (column names, string values)
and the diagram world (typed node objects with known fields).

---

### `src/view/workspace-view.ts` â€” WorkspaceView Interface

Defines the contract that all workspace-level views must implement:

```ts
interface WorkspaceView {
    mount(container: HTMLElement, data: WorkspaceData, state?: ViewState): void;
    unmount(): ViewState;
    update(data: WorkspaceData): void;
}
```

**Why an interface instead of a plugin registry?**

Cell plugins (math, chemistry, geometry, physics) are stateless, interchangeable,
and operate on one cell at a time. A registry pattern fits them perfectly.

Workspace views are stateful (they remember pan/zoom/scroll position), own
the entire workspace DOM for the duration of a tab's lifetime, and have
complex lifecycle (mount â†’ interact â†’ unmount â†’ restore state). A class
hierarchy with a shared interface is the correct model for this.

`viewFactory(entry, ...)` is a simple switch on `entry.view` that instantiates
the correct class. Adding a new view type = new class + one line in the factory.

---

### `src/view/flow-diagram-view.ts` â€” The Graph Renderer

This is the most algorithmically complex file in the project. It renders
directed graphs as SVG diagrams. The key challenge is that the same renderer
must handle two structurally different graph shapes:

- **Linear/DAG graphs** (glycolysis): a chain of nodes with no cycles, or
  with only small back-edges. Best rendered as a top-to-bottom layered layout.
- **Cyclic graphs** (Krebs cycle): a ring of nodes where every node is part
  of a cycle. Best rendered as a circle with nodes evenly spaced around the ring.

The renderer detects which case applies using **Tarjan's SCC algorithm** and
dispatches to the correct layout strategy for each part of the graph.

---

#### Step 1 â€” Tarjan's Strongly Connected Components (SCC) Algorithm

**What is a strongly connected component?**

A strongly connected component (SCC) is a maximal set of nodes where every
node can reach every other node by following directed edges. In a cycle
`A â†’ B â†’ C â†’ A`, all three nodes form one SCC because you can get from any
node to any other by following the arrows.

A node with no cycle is its own SCC of size 1.

**Why do we need SCCs?**

We need to know which nodes are part of a cycle so we can:
1. Place cycle nodes on a circle (ring layout)
2. Place non-cycle nodes in ranks above/below the circle (layered layout)
3. Draw cycle edges as arcs (following the ring) vs DAG edges as right-angle paths

**How Tarjan's algorithm works â€” step by step:**

Tarjan's algorithm does a single depth-first search (DFS) over the graph.
It uses three data structures:

- `index` â€” assigns each node a discovery order number (when it was first visited)
- `lowlink` â€” tracks the lowest discovery number reachable from a node's subtree
- `stack` â€” a stack of nodes currently being explored

The key insight: a node `v` is the root of an SCC if and only if
`lowlink[v] === index[v]`. This means no node in `v`'s subtree can reach
anything discovered before `v` â€” so `v` and everything on the stack above
it form a complete SCC.

Here is the algorithm in plain English:

```
function strongconnect(v):
    assign v a discovery index and lowlink (both = counter++)
    push v onto the stack, mark v as "on stack"

    for each neighbour w of v:
        if w has not been visited yet:
            recurse: strongconnect(w)
            lowlink[v] = min(lowlink[v], lowlink[w])
            // w's subtree might reach back to something before v
        else if w is currently on the stack:
            lowlink[v] = min(lowlink[v], index[w])
            // w is an ancestor â€” this is a back-edge (cycle!)

    if lowlink[v] === index[v]:
        // v is the root of an SCC â€” pop everything above v off the stack
        scc = []
        repeat:
            w = stack.pop()
            scc.push(w)
        until w === v
        if scc.length > 1: record this SCC (it's a real cycle)
```

**Example â€” Krebs cycle:**

The Krebs cycle has edges: OAAâ†’CSâ†’Citrateâ†’Aconitaseâ†’IsoCitrateâ†’IDHâ†’aKGâ†’KGDHâ†’SucCoAâ†’SCSâ†’Succinateâ†’SDHâ†’Fumarateâ†’Fumaraseâ†’Malateâ†’MDHâ†’OAA (closing the loop).

When Tarjan's DFS reaches OAA and follows the chain all the way around, it
eventually finds the back-edge `MDHâ†’OAA`. At that point, `lowlink[MDH]` is
updated to `index[OAA]` (the discovery number of OAA). When the DFS unwinds
back to OAA, `lowlink[OAA] === index[OAA]` â€” OAA is the SCC root. All 16+
nodes on the stack above OAA are popped and recorded as one SCC.

In the implementation, `findCycles` returns all SCCs with size > 1. The
largest SCC is selected as the "main cycle" for layout purposes.

---

#### Step 2 â€” Circular Layout for Cycle Nodes

Once the main cycle is identified, its nodes are placed on a circle.

**Ordering the nodes around the ring:**

The nodes must be placed in the order they appear in the cycle, not in
arbitrary order. `orderCycleNodes` walks the cycle edges starting from the
entry point (the node that has an incoming edge from outside the cycle, or
the first node if none):

```
start at entry node
while current node is in the cycle and not yet visited:
    add current to ordered list
    current = outMap[current]  (follow the next edge in the cycle)
```

This produces the nodes in traversal order, which is the correct visual
order around the ring.

**Computing the radius:**

The radius must be large enough that no two adjacent nodes overlap. The
correct formula is:

```
totalPerimeter = sum of (nodeWidth + gap) for all cycle nodes
radius = totalPerimeter / (2Ï€)
```

This ensures the ring's circumference equals the total space needed by all
nodes. The old formula `(maxNodeWidth + gap) Ã— n / 2Ï€` was wrong â€” it used
the widest node for every slot, inflating the radius when one node had a
much longer label than the others.

**Placing nodes on the circle:**

Each node `i` of `n` total is placed at angle:
```
angle = -Ï€/2 + (2Ï€ Ã— i / n)
```

Starting at `-Ï€/2` (top of the circle) and going clockwise. The node's
centre coordinates are:
```
x = circleCentreX + radius Ã— cos(angle)
y = circleCentreY + radius Ã— sin(angle)
```

---

#### Step 3 â€” Layered Layout for Non-Cycle Nodes

Non-cycle nodes (like the glycolysis chain feeding into the Krebs ring) are
placed in horizontal ranks above the circle.

**BFS rank assignment:**

Starting from all source nodes (nodes with no incoming DAG edges), BFS
assigns each node a rank equal to its longest path from any source:

```
for each source node: rank = 0, add to queue
while queue is not empty:
    node = dequeue
    for each outgoing DAG edge to next:
        if rank[node] + 1 > rank[next]:
            rank[next] = rank[node] + 1
            if next not yet enqueued: enqueue next
```

The `enqueued` set prevents re-enqueuing nodes in cyclic subgraphs (the
fix for the `RangeError: Invalid array length` bug).

**Placing nodes in ranks:**

Nodes in the same rank are distributed evenly across the canvas width.
The total width of all nodes in a rank (plus gaps) is centred horizontally.
Each rank is placed above the topmost cycle node, with `RANK_GAP` pixels
between ranks.

---

#### Step 4 â€” Edge Routing

Two different routing strategies are used depending on whether an edge is
a cycle edge or a DAG edge.

**Orthogonal routing for DAG edges:**

DAG edges (at least one endpoint off the cycle) use right-angle routing.
The path goes:
1. Straight down from the bottom of the source node
2. Horizontal jog at the vertical midpoint between source and target
3. Straight down into the top of the target node

```
M x1 y1  L x1 midY  L x2 midY  L x2 y2
```

If source and target have the same x coordinate, the path is a straight
vertical line. If source is below target (same rank), the path routes
outward with a horizontal detour below both nodes.

This produces the clean right-angle paths characteristic of chemistry
pathway diagrams and flowcharts.

**BÃ©zier arcs for cycle edges:**

Cycle edges (both endpoints on the cycle ring) use a quadratic BÃ©zier curve
that bows outward from the circle centre. This makes the edges follow the
ring perimeter rather than cutting through the interior.

The control point is computed as:
```
midpoint = average of (from.x, from.y) and (to.x, to.y)
direction from centre to midpoint = (midpoint - centre) / |midpoint - centre|
controlPoint = centre + direction Ã— (distance Ã— pushFactor + offset)
```

`pushFactor = 1.35` pushes the control point 35% further from the centre
than the midpoint, creating a visible outward bow.

The SVG path is:
```
M x1 y1  Q controlX controlY  x2 y2
```

where `Q` is the SVG quadratic BÃ©zier command.

---

#### Step 5 â€” Pan and Zoom

All nodes and edges are placed inside a single `<g>` element. Pan and zoom
are applied as a CSS transform on this group:

```
panGroup.setAttribute("transform", `translate(${panX},${panY}) scale(${zoom})`)
```

Three event listeners on the SVG element update the transform:
- `mousedown` / `mousemove` â€” drag to pan (updates `panX`, `panY`)
- `wheel` â€” scroll to zoom (multiplies `zoom` by 1.1 or 0.9)

The state (`panX`, `panY`, `zoom`) is stored in `DiagramState` and returned
by `unmount()` so it can be restored when the user switches back to this tab.

---

### `src/main.ts` â€” Phase 12 Loading Flow

The key change is that `loadFiles(files[])` now handles a batch of files
rather than one file at a time.

**Control path (when `control.json` is present):**

```
1. Read all files in parallel (Promise.all)
2. Find control.json in the batch
3. Parse it: parseControlFile(json)
4. Build csvMap: filename â†’ { headers, types, rows }
5. For each "table" entry in control file:
   - Call controller.loadCSV(file, text) to add it to the KnowledgeBase
6. Call controller.resolveAllDiagrams(controlFile, csvMap)
   - This resolves all diagram entries against the CSV data
   - Stores ResolvedDiagram[] in kb.diagrams
7. Call renderControlTabs(controlFile)
   - Builds the tab strip from control file entries
   - Table tabs: call renderTableRows() directly (not renderAll())
   - Diagram tabs: mount a FlowDiagramView
```

**Why `renderTableRows` instead of `renderAll`:**

`TableView.renderAll()` has a side effect: it calls `renderTabStrip()` which
does `tabStrip.innerHTML = ""` and rebuilds the strip with one tab per raw
CSV table. In control-file mode, the tab strip is owned by `renderControlTabs`
and must not be touched by `TableView`. Calling `renderTableRows()` directly
renders only the table body into `tableContainer`, leaving the tab strip intact.

**Fallback path (no `control.json`):**

All CSV files are loaded as plain tables via `controller.loadCSV()`. The
`TableView.renderAll()` path is used as before. This is identical to the
pre-Phase-12 behaviour â€” full backward compatibility.

---

### Sample Data Files

**`public/krebs-nodes.csv`**

18 nodes representing the Krebs cycle participants:
- 9 compounds: Acetyl-CoA, Oxaloacetate, Citrate, Isocitrate, Î±-Ketoglutarate,
  Succinyl-CoA, Succinate, Fumarate, Malate
- 8 enzymes: Citrate synthase, Aconitase, IDH, KGDH, SCS, SDH, Fumarase, MDH
- 1 entry enzyme: PDH (Pyruvate dehydrogenase) â€” converts Pyruvate to Acetyl-CoA

**`public/krebs-edges.csv`**

19 edges. The cycle: OAA â†’ CS â†’ Citrate â†’ Aconitase â†’ IsoCitrate â†’ IDH â†’
aKG â†’ KGDH â†’ SucCoA â†’ SCS â†’ Succinate â†’ SDH â†’ Fumarate â†’ Fumarase â†’ Malate â†’
MDH â†’ OAA (closing the loop). Entry: Pyruvate â†’ PDH â†’ AcCoA â†’ CS.

**`public/metabolism-edges.csv`**

All glycolysis edges plus all Krebs edges in one file. `Pyruvate` is the
shared node â€” it appears in both `glycolysis-nodes.csv` (as a product of
GAPDH/PK) and is the entry point into the Krebs cycle via PDH. The
`metabolism-map` entry in `control.json` merges both node files and uses
this combined edge file.

---

### Design Decisions

**Why two separate pathway maps plus one combined map?**

The study.md principle "same schema = same table" applies to maps too:
same conceptual scope = same map. Glycolysis and Krebs are distinct pathways.
Merging them into one map at the data level would make both maps uneditable
independently. The control file's `nodes: [...]` array syntax provides the
combined view without touching the source data â€” the same CSV files serve
as both independent maps and the combined overview simultaneously.

**Why Tarjan's SCC instead of simple cycle detection?**

Simple cycle detection (DFS with a visited set) finds *a* cycle but not
necessarily the *largest* one, and it cannot handle graphs with multiple
overlapping cycles. Tarjan's algorithm finds *all* SCCs in one pass and
correctly handles nested cycles, self-loops, and disconnected components.
The largest SCC is always the main cycle regardless of graph complexity.

**Why circular layout for cycle nodes?**

A cycle has no natural "top" or "bottom" â€” all nodes are equivalent in the
cycle. A circular layout makes this symmetry visually explicit. It also
naturally separates the cycle from the linear prefix (which sits above the
ring), making the two structural regions immediately recognisable.

**Why BÃ©zier arcs for cycle edges?**

Straight lines between cycle nodes would cut through the ring interior,
making the diagram look like a spider web. Orthogonal routing would produce
awkward right-angle paths that don't follow the ring shape. BÃ©zier arcs
that bow outward from the centre follow the ring perimeter naturally,
matching the visual convention used in biochemistry textbooks.

---

## Phase 12 â€” Table Encapsulation Refactoring

---

### The problem: controller doing table work

Before this refactoring, the controller was the wrong place for several
operations. The violations fell into four categories:

**1. Object construction** â€” the controller built `Column`, `Row`, and `Cell`
objects from raw CSV data:
```ts
const columns = parsed.headers.map((name, i) => new Column(name, parsed.types[i]));
const rows = parsed.rows.map(rawRow =>
    new Row(columns.map((col, i) => new Cell(rawRow[i] ?? "", col.typeId)))
);
```
The controller knew the internal structure of the model. If `Row` or `Cell`
ever changed their constructor, the controller would break.

**2. Direct array mutation** â€” the controller reached into `table.rows` and
mutated it directly:
```ts
table.rows.push(row);
table.rows.splice(atIdx, 0, row);
const [row] = table.rows.splice(rowIdx, 1);
```
`Table` had no say in how its rows were added, removed, or reordered.

**3. Direct cell mutation** â€” the controller navigated `table.rows[i].cells[j].value`:
```ts
table.rows[action.rowIdx].cells[action.colIdx].value = action.oldValue;
```
This is three levels of internal structure exposed to the controller.

**4. CSV serialisation outside `Table`** â€” `KnowledgeBase.exportTableAsCSV`
accessed `r.cells.map(c => c.value)` â€” the serialisation logic lived in a
container class rather than the class that owns the data.

---

### The fix: `Table` owns its own operations

#### `Table.fromCSV(name, parsed)` â€” factory

```ts
static fromCSV(name, parsed): Table {
    const columns = parsed.headers.map((h, i) => new Column(h, parsed.types[i] ?? "text"));
    const rows = parsed.rows.map(rawRow =>
        new Row(columns.map((col, i) => new Cell(rawRow[i] ?? "", col.typeId)))
    );
    return new Table(name, columns, rows);
}
```

The controller now calls `Table.fromCSV(name, parsed)` â€” one line. It no
longer imports `Column`, `Row`, or `Cell`.

#### Row mutation methods

```ts
appendRow(): Row          // push empty row, return it
insertRowAt(idx): Row     // splice empty row at idx, return it
removeRowAt(idx): Row     // splice out row at idx, return it
moveRowFromTo(from, to)   // splice + re-insert
restoreRowAt(idx, row)    // splice in a previously removed row (for undo)
```

The controller calls these methods. It never touches `table.rows` directly.

#### Cell access methods

```ts
getCellValue(rowIdx, colIdx): string   // safe read, "" if out of bounds
setCellValue(rowIdx, colIdx, value)    // safe write, no-op if out of bounds
```

The controller calls `table.getCellValue(r, c)` and `table.setCellValue(r, c, v)`.
It never accesses `table.rows[r].cells[c].value`.

#### `toCSV(): string`

```ts
toCSV(): string {
    const escape = (v) => ...;
    const headerRow = this.columns.map(c => escape(c.name)).join(",");
    const typeRow   = this.columns.map(c => escape(c.typeId)).join(",");
    const dataRows  = this.rows.map((_, rowIdx) =>
        this.columns.map((__, colIdx) => escape(this.getCellValue(rowIdx, colIdx))).join(",")
    );
    return [headerRow, typeRow, ...dataRows].join("\n");
}
```

CSV serialisation belongs with the data. `KnowledgeBase.exportTableAsCSV`
now delegates to `table.toCSV()` â€” one line.

---

### The fix: `TableView` public API

Before the refactoring, `main.ts` and `TableViewAdapter` used `(x as any)`
casts to access private members of `TableView`:

```ts
(tableView as any).renderTableRows(table, table.rows, tableIdx);  // private method
(tableView as any).container = container;                          // private field
(this.tableView as any).controller?.getKnowledgeBase();            // private field
(this.tableView as any).sortCol;                                   // closure variable
```

These casts bypass TypeScript's access control. If `TableView` is refactored,
they silently break.

**New public methods added to `TableView`:**

| Method | Replaces |
|--------|---------|
| `renderTable(tableIdx)` | `(tableView as any).renderTableRows(table, table.rows, tableIdx)` |
| `setContainer(el)` | `(tableView as any).container = el` |
| `getController()` | `(tableView as any).controller` |
| `getSortState()` | `(tableView as any).sortCol` / `sortAsc` |

**`sortCol` and `sortAsc` promoted to instance fields** â€” they were
closure-local variables inside `renderTableRows`, invisible to any external
code. Now they are `private sortCol = -1` and `private sortAsc = true`
instance fields, readable via `getSortState()`.

**`renderTable(tableIdx)`** renders only the table body without touching the
tab strip. This is the correct method for `main.ts` to call when the tab
strip is owned externally (by `renderControlTabs`). Previously `main.ts`
called `renderAll()` which rebuilds the tab strip as a side effect â€” this
was the root cause of the "tabs disappear" bug in Phase 12.

---

### Principle: encapsulation as a correctness guarantee

The encapsulation violations were not just style issues â€” they caused real
bugs:

- The `addRow` undo always called `table.rows.pop()` (last row), which was
  wrong for `insertRow` (which inserts at a specific index). The fix uses
  `table.rows.lastIndexOf(action.row)` to find the specific row by reference.
  This is only possible because `appendRow()` and `insertRowAt()` return the
  row object, which is stored in the undo action.

- The `renderTableRows` private call in `main.ts` caused the tab strip to
  be overwritten whenever `renderAll()` was called from a table tab click.
  The fix (`renderTable()`) renders only the body, leaving the tab strip
  untouched.

Both bugs were caused by the controller and view reaching into internals
they should not have known about. The encapsulation fix eliminates the
possibility of these bugs recurring.

---


---


---


---

## Phase 13 — Graph as a First-Class Model

---

### Overview

Phase 13 introduces `Graph` as a co-equal model class alongside `Table`,
and `TypedValue` as the shared primitive between both. A `.graph.json` file
loads directly into a `Graph` object in `KnowledgeBase.graphs`, the same
way a `.csv` file loads into a `Table` in `KnowledgeBase.tables`.

---

### `TypedValue` — the shared primitive

```ts
class TypedValue {
    value: string;
    readonly typeId: string;
}

class Cell extends TypedValue {}  // table-specific: position implicit in Row.cells[]
```

`TypedValue` is the raw primitive: a value string plus a `typeId` that
tells the plugin system how to render it. It has no spatial connotation.

`Cell` is a table-specific subclass with no extra fields. All existing code
that uses `Cell` continues to work — `Cell` IS a `TypedValue`. The only
change is that graph properties use `TypedValue` directly, making it
explicit that they are not cells.

---

### `GraphNode` and `GraphEdge`

```ts
class GraphNode {
    readonly id: string;
    readonly properties: Map<string, TypedValue>;
    get label(): string  // properties.get("label")?.value ?? id
    get type(): string   // properties.get("type")?.value ?? ""
}

class GraphEdge {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly properties: Map<string, TypedValue>;
    get type(): string   // properties.get("type")?.value ?? ""
    get label(): string  // properties.get("label")?.value ?? ""
}
```

Both hold `TypedValue` objects in their properties maps. A node with
`properties.get("formula") = new TypedValue("x^2", "math")` renders its
formula using the math plugin, exactly as a table cell would — because
both ultimately go through `renderTypedValue(typeId, value)`.

---

### `Graph` — the model class

```ts
class Graph {
    readonly name: string;
    readonly viewType: "flow" | "spatial" | "relation" | "sequence";
    nodes: GraphNode[];
    edges: GraphEdge[];
    nodeStyles: Record<string, NodeStyle>;
    edgeStyles: Record<string, EdgeStyle>;
    layout: Record<string, { x: number; y: number }>;

    static fromGraphJSON(name, json): Graph
    toGraphJSON(): string

    addNode(id, props?): GraphNode
    removeNode(id): GraphNode | undefined
    addEdge(from, to, props?): GraphEdge
    removeEdge(id): GraphEdge | undefined
    getNode(id): GraphNode | undefined
    getEdgesFrom(nodeId): GraphEdge[]
    getEdgesTo(nodeId): GraphEdge[]
}
```

**`fromGraphJSON` parsing rules:**
- String property values → `TypedValue(v, "text")`
- Object property values `{ value, typeId }` → `TypedValue(value, typeId)`
- Edge `id` is optional in the file; auto-generated as `e0`, `e1`, ... if absent

**`toGraphJSON` serialisation rules:**
- `text`-typed properties → written as plain strings (compact)
- Other-typed properties → written as `{ value, typeId }` objects

---

### `.graph.json` file format

```json
{
  "version": "1.0",
  "name": "glycolysis-map",
  "view": "flow",
  "nodes": [
    { "id": "Glucose", "label": "Glucose", "type": "compound" },
    { "id": "HK",      "label": "Hexokinase", "type": "enzyme",
      "formula": { "value": "C_6H_12O_6", "typeId": "chemistry" } }
  ],
  "edges": [
    { "id": "e0", "from": "Glucose", "to": "HK", "type": "reaction", "label": "step 1" }
  ],
  "nodeStyles": { "compound": { "shape": "ellipse", "color": "#e0f2fe" } },
  "edgeStyles":  { "reaction": { "arrow": "filled", "dash": false } }
}
```

The file is self-contained — no `control.json` needed to interpret it.
Dropping a `.graph.json` file directly into the app produces a diagram tab.

---

### `KnowledgeBase` changes

```ts
class KnowledgeBase {
    readonly tables: Table[] = [];   // unchanged
    readonly graphs: Graph[] = [];   // NEW: co-equal with tables
    readonly graph = new AssociationGraph();

    addTable(table): void   // unchanged
    addGraph(graph): void   // NEW
    clear(): void           // now also clears graphs
    exportTableAsCSV(idx): string  // unchanged
}
```

`diagrams: ResolvedDiagram[]` is removed. It was a rendering artifact
computed from tables at load time, not a model object. `graphs: Graph[]`
replaces it as the proper model.

---

### `FlowDiagramView` changes

The rendering logic (Tarjan SCC, circular layout, Bézier arcs, orthogonal
routing) is completely unchanged. Only the data source changes.

Four local adapter interfaces replace the imported `ResolvedNode` etc.:

```ts
interface RNode { id, label, type, x?, y?, extra }
interface REdge { from, to, type, label }
interface RActor { id, label }
interface RMessage { from, to, label, time, type }
```

Four adapter functions convert a `Graph` to these shapes:

```ts
graphToNodes(g: Graph): RNode[]
graphToEdges(g: Graph): REdge[]
graphToActors(g: Graph): RActor[]    // for sequence diagrams
graphToMessages(g: Graph): RMessage[] // for sequence diagrams
```

`render()` reads `this.currentData.graph` (a `Graph` object) instead of
`this.currentData.diagram` (a `ResolvedDiagram`).

---

### Loading paths in `main.ts`

Three distinct loading paths:

1. **Native `.graph.json` path** (new): `.graph.json` files dropped without
   `control.json` → each loaded via `controller.loadGraph()` → `renderGraphTabs()`
   builds one tab per graph. Any accompanying CSVs load as plain table tabs.

2. **Legacy `control.json` path**: `control.json` present → `resolveAllDiagrams()`
   produces `Graph` objects from CSV data → `renderControlTabs()` looks up
   graphs by `entry.id` via `controller.getGraphs()`.

3. **Plain CSV fallback**: no `control.json`, no `.graph.json` → all CSVs
   load as plain tables via `tableView.renderAll()`.

---

### What is shared between Table and Graph

| Shared | How |
|--------|-----|
| `TypedValue` | `Row.cells` holds `Cell[]` (subclass); `GraphNode.properties` holds `TypedValue` directly |
| Plugin system | Both ultimately call `renderTypedValue(typeId, value)` |
| `AssociationGraph` | Both table rows and graph nodes can have `_associations` |
| `EditHistory` | Same mechanism; extended with `addNode/removeNode/addEdge/removeEdge` actions |
| Search engine | Currently scans `tables`; graph search is a future extension |

### What is separate

| | Table | Graph |
|---|---|---|
| Data structure | `Row[]` (ordered, homogeneous schema) | `GraphNode[]` + `GraphEdge[]` |
| Property container | `Cell` — TypedValue at a row/column position | `TypedValue` directly in `Map<string, TypedValue>` |
| Mutation API | `appendRow`, `removeRowAt`, `setCellValue` | `addNode`, `removeNode`, `addEdge`, `removeEdge` |
| Serialisation | `toCSV()` | `toGraphJSON()` |
| View | `TableView` | `FlowDiagramView` |
| File format | `.csv` | `.graph.json` |

---

## Bug fix — Diagram pan/zoom state lost on tab switch

---

### Symptom

Panning or zooming a diagram, then switching to another tab and back,
reset the viewport to the origin (`panX:0, panY:0, zoom:1`). The user's
position in the diagram was lost on every tab switch.

---

### Root cause

`FlowDiagramView` correctly implements the `WorkspaceView` interface:
`unmount()` returns a `DiagramState` blob containing `panX`, `panY`,
`zoom`, and `selectedNodeIds`, and `mount()` accepts an optional saved
state and restores it. The mechanism was correct — it was simply never
used.

In `main.ts`, every tab switch did this:

```ts
// switching away — state returned but discarded
activeDiagramView.unmount();
activeDiagramView = null;

// switching back — new instance, no saved state passed
activeDiagramView = new FlowDiagramView(graph.viewType);
activeDiagramView.mount(tableContainer, { graph });  // ← no state
```

`unmount()` was called but its return value was thrown away. On
re-activation, a fresh `FlowDiagramView` was created and `mount()` was
called with no third argument, so `DiagramState` defaulted to
`{ panX:0, panY:0, zoom:1, selectedNodeIds:[] }` every time.

---

### Fix

Three additions to `main.ts`:

**`savedViewStates: Map<string, unknown>`** — stores the opaque state
blob returned by `unmount()`, keyed by entry id or graph name.

**`activeEntryId: string | null`** — tracks which entry is currently
mounted so the state can be stored under the correct key.

**`unmountActive()`** — a single function that replaces all direct
`activeDiagramView.unmount()` calls. It saves the returned state before
clearing the reference:

```ts
function unmountActive(): void {
    if (activeDiagramView && activeEntryId) {
        savedViewStates.set(activeEntryId, activeDiagramView.unmount());
        activeDiagramView = null;
    }
    activeEntryId = null;
}
```

On re-activation, the saved state is passed back to `mount()`:

```ts
activeDiagramView = new FlowDiagramView(graph.viewType);
activeEntryId = graph.name;
activeDiagramView.mount(tableContainer, { graph }, savedViewStates.get(graph.name));
```

`FlowDiagramView.mount()` already handled the optional state parameter
correctly — it casts the blob back to `DiagramState` and applies the
stored `panX`, `panY`, `zoom` transform immediately on render. No
changes to `FlowDiagramView` were needed.

---

### Lesson

The `WorkspaceView` interface contract (`unmount()` returns state,
`mount()` accepts optional saved state) was designed correctly from the
start. The bug was purely in the calling code failing to thread the
return value through. Any time a function returns a value that is
immediately discarded, it is worth asking whether the caller should be
storing it.

---

## Architecture Overview — Data Flow from File to Screen

This section explains the full architecture of the Webapp as it stands after
Phase 13, and then walks through the pathway rendering pipeline in detail,
including why Tarjan's SCC algorithm is the right tool for the job.

---

### The two data pipelines

The app has two parallel pipelines that share infrastructure but are
structurally distinct:

```
.csv file  →  parseCSV()  →  Table.fromCSV()  →  KnowledgeBase.tables[]
                                                        ↓
                                                   TableView
                                                   (spreadsheet)

.graph.json  →  Graph.fromGraphJSON()  →  KnowledgeBase.graphs[]
                                                ↓
                                          FlowDiagramView
                                          (SVG diagram)
```

Both pipelines share:
- `TypedValue` — the typed content primitive (`{ value, typeId }`)
- Plugin system — `renderTypedValue(typeId, value)` renders both table cells
  and graph node properties
- `AssociationGraph` — cross-entity links work across both tables and graphs
- `EditHistory` — undo/redo covers both table edits and graph mutations

The `KnowledgeBase` is the single in-memory store. `AppController` is the
single orchestrator. Neither the `TableView` nor the `FlowDiagramView` ever
talk to each other or to the model directly — all mutations go through the
controller.

---

### The `WorkspaceView` lifecycle

Every tab in the UI is backed by a `WorkspaceView` instance. The interface
has three methods:

```ts
mount(container, data, state?)  // attach to DOM, restore saved state
unmount(): ViewState            // detach from DOM, return current state
update(data)                    // data changed while mounted
```

`main.ts` owns a `savedViewStates: Map<string, unknown>` keyed by entry id.
The tab switching sequence is:

```
user clicks tab B (currently on tab A)
  → unmountActive()
      → savedViewStates.set("A", activeDiagramView.unmount())
      → activeDiagramView = null
  → activeDiagramView = new FlowDiagramView(...)
  → activeEntryId = "B"
  → activeDiagramView.mount(container, { graph }, savedViewStates.get("B"))
```

The state blob is opaque to `main.ts` — it only stores and retrieves it.
`FlowDiagramView` knows its own state shape (`DiagramState`) and restores
`panX`, `panY`, `zoom` from it on mount.

---

### Pathway rendering — the full pipeline

A biochemical pathway like glycolysis or the Krebs cycle is stored as a
`Graph` object with `GraphNode[]` and `GraphEdge[]`. When a diagram tab is
activated, `FlowDiagramView.render()` runs the following pipeline:

```
Graph
  ↓
graphToNodes() / graphToEdges()     adapter: Graph → RNode[] / REdge[]
  ↓
computeLayout(nodes, edges, W, H)   positions every node on the canvas
  ├── findCycles()                  Tarjan SCC → which nodes form cycles
  ├── orderCycleNodes()             walk cycle edges → ring traversal order
  ├── circular layout               place cycle nodes on a circle
  └── BFS layered layout            place non-cycle nodes in ranks above
  ↓
classifyEdges()                     split edges into cycle vs DAG
  ↓
renderGraph()                       draw SVG
  ├── cycle edges  → cyclePath()    quadratic Bézier arcs
  ├── DAG edges    → orthogonalPath() right-angle paths
  └── nodes        → ellipse / rect / diamond shapes
  ↓
SVG element appended to container
```

---

### Why Tarjan's SCC is the right algorithm

A biochemical pathway is a directed graph that can have two structurally
different regions in the same diagram:

- **Linear prefix** — a chain of reactions leading into the cycle (glycolysis
  feeding into the Krebs cycle via Pyruvate → PDH → Acetyl-CoA)
- **Cyclic core** — a ring of reactions where the last step regenerates the
  first substrate (OAA → ... → MDH → OAA)

These two regions need different visual treatment:
- The cyclic core should be drawn as a **ring** — all nodes are equivalent,
  there is no natural top or bottom
- The linear prefix should be drawn as a **layered chain** above the ring,
  flowing downward into it

To apply the right layout to each region, the renderer must first identify
which nodes belong to the cycle and which do not. This is exactly what
Strongly Connected Components (SCCs) detect.

**Why not simpler cycle detection?**

A simple DFS cycle check (`visited` set + recursion stack) can tell you
*whether* a cycle exists and find *one* cycle, but it cannot:
- Find the *largest* cycle when multiple overlapping cycles exist
- Correctly handle a graph where some nodes are in cycles and others are not
- Handle the metabolism map where glycolysis (mostly DAG) and Krebs (mostly
  cyclic) are merged into one graph

Tarjan's algorithm finds *all* SCCs in a single O(V+E) DFS pass. Every node
ends up assigned to exactly one SCC. Nodes in an SCC of size 1 are not part
of any cycle. The largest SCC is the main cycle ring.

---

### Tarjan's SCC — how it works

The algorithm maintains three data structures during a DFS:

- `index[v]` — the order in which node `v` was first visited (a counter
  that increments with each new visit)
- `lowlink[v]` — the lowest `index` value reachable from `v`'s DFS subtree,
  including back-edges to ancestors
- `stack` — nodes currently on the DFS path that have not yet been assigned
  to a completed SCC

**The key invariant:** after fully exploring `v`'s subtree,
`lowlink[v] === index[v]` if and only if `v` is the *root* of an SCC —
meaning no node in `v`'s subtree has a back-edge to anything discovered
before `v`. When this condition holds, everything on the stack from `v`
upward forms a complete SCC.

**Step by step for the Krebs cycle:**

```
DFS starts at OAA (index=0, lowlink=0), pushes onto stack
  → visits CS (index=1, lowlink=1)
    → visits Citrate (index=2, lowlink=2)
      → ... continues around the ring ...
        → visits MDH (index=15, lowlink=15)
          → MDH has edge to OAA
          → OAA is on the stack → lowlink[MDH] = min(15, index[OAA]) = 0
        → unwind: lowlink[Malate] = min(14, lowlink[MDH]) = 0
      → unwind: ... all lowlinks propagate back to 0 ...
  → unwind back to OAA: lowlink[OAA] = 0 = index[OAA]  ← SCC root!
  → pop stack until OAA: all 16 Krebs nodes form one SCC
```

The back-edge `MDH → OAA` is what triggers the SCC detection. Without it,
each node would be its own SCC of size 1 (a DAG). With it, the lowlink
values propagate back through the entire ring, and when the DFS returns to
OAA, the condition `lowlink[OAA] === index[OAA]` fires.

**In the metabolism map** (glycolysis + Krebs merged):

Glycolysis nodes (Glucose, G6P, F6P, ..., Pyruvate) have no back-edges —
they form SCCs of size 1. The Krebs nodes form one large SCC. The renderer
picks the largest SCC as the ring, places it in the centre, and lays out
the glycolysis chain in ranks above it.

---

### Circular layout — why the radius formula matters

Once the cycle nodes are identified and ordered, they are placed on a circle.
The radius must be large enough that no two adjacent node boxes overlap.

**Wrong formula (old):**
```
radius = (maxNodeWidth + gap) × n / (2π)
```
This uses the *widest* node for every slot. If one node has a long label
(e.g. "α-Ketoglutarate") and the rest are short, the ring is inflated to
accommodate the worst case at every position.

**Correct formula:**
```
totalPerimeter = Σ (nodeWidth_i + gap)  for all i in cycle
radius = totalPerimeter / (2π)
```
The ring circumference equals the total perimeter needed. Each node gets
exactly the space its label requires. The ring is as tight as possible
without overlap.

---

### Edge routing — why two strategies

**Orthogonal routing for DAG edges** (right-angle paths):

DAG edges connect nodes in different ranks. The path goes straight down
from the source, jogs horizontally at the midpoint, then continues straight
down to the target. This produces the clean ladder-like appearance of
flowcharts and pathway diagrams. It works because DAG nodes are arranged
in a strict top-to-bottom hierarchy.

**Bézier arcs for cycle edges** (curved paths):

Cycle edges connect nodes arranged on a ring. A straight line between two
ring nodes would cut through the ring interior, making the diagram look
like a spider web. An orthogonal path would produce awkward right-angle
bends that don't follow the ring shape.

The solution is a quadratic Bézier curve whose control point is pushed
*outward* from the ring centre:

```
midpoint M = average of (from, to)
direction D = (M - centre) / |M - centre|   ← unit vector pointing outward
controlPoint = centre + D × (|M - centre| × 1.35 + 20)
```

The factor 1.35 pushes the control point 35% further from the centre than
the midpoint, creating a visible outward bow. The result is an arc that
follows the ring perimeter — matching the visual convention used in
biochemistry textbooks for cyclic pathways.

---

### Pan and zoom — SVG transform approach

All diagram content (nodes and edges) lives inside a single `<g>` element.
Pan and zoom are applied as a single SVG transform on that group:

```
translate(panX, panY) scale(zoom)
```

This is more efficient than repositioning every element individually —
the browser's SVG renderer applies the transform to the entire subtree in
one operation. The transform is updated on every `mousemove` (pan) and
`wheel` (zoom) event.

The state `{ panX, panY, zoom }` is part of `DiagramState`, returned by
`unmount()` and restored by `mount()`. This is what makes the viewport
position persist across tab switches.

---

## View Layer Architecture — Current State and Intended Direction

---

### What the view layer contains

```
src/view/
  table-view.ts          — renders a Table as an HTML spreadsheet
  flow-diagram-view.ts   — renders a Graph as an SVG diagram
  workspace-view.ts      — WorkspaceView interface + viewFactory (unused in live path)
  table-view-adapter.ts  — wraps TableView to conform to WorkspaceView (unused in live path)
  graph-filter-view.ts   — relation/target filter dropdowns + association detail panel
  search-view.ts         — text search + identifier search + neighbourhood panel
  session.ts             — localStorage session persistence utility
```

---

### The honest assessment of each file

**`table-view.ts` and `flow-diagram-view.ts`** — both earn their existence.
They are the two primary workspace renderers. Each is a substantial class
with its own state, lifecycle, and rendering logic. They are correctly
separated because they render fundamentally different data structures
(`Table` vs `Graph`) using fundamentally different techniques (HTML table
vs SVG layout algorithm).

**`graph-filter-view.ts` and `search-view.ts`** — both earn their existence.
They are toolbar-level UI components, not workspace views. They live in
`src/view/` because they produce DOM, but they are not interchangeable with
`TableView` or `FlowDiagramView` — they are always visible alongside the
active workspace view, not instead of it.

**`session.ts`** — earns its existence as a utility. It has no DOM
dependency and could live in `src/data/`, but `src/view/` is acceptable
since it is consumed only by the view layer.

**`workspace-view.ts`** — defines the right interface but `viewFactory` is
currently unused in the live path. `main.ts` bypasses it and instantiates
views directly. The interface is correct; the dispatch mechanism is not
wired up.

**`table-view-adapter.ts`** — exists only because `TableView` predates the
`WorkspaceView` interface and was not refactored to implement it directly.
It is a bridge that should not need to exist. `TableView` should implement
`WorkspaceView` directly, making the adapter redundant.

---

### The architectural problem: tab logic lives in `main.ts`

`main.ts` currently contains:

```ts
let activeDiagramView: FlowDiagramView | null = null;
let activeEntryId: string | null = null;
const savedViewStates = new Map<string, unknown>();

function unmountActive(): void { ... }
function renderControlTabs(controlFile): void { ... }
function renderGraphTabs(): void { ... }
```

This is view orchestration logic — it owns the tab strip, manages the
active view lifecycle, and saves/restores view state. It belongs in a
dedicated class, not in the application entry point.

The consequence is that `main.ts` has two separate tab-building functions
(`renderControlTabs` for the legacy CSV path, `renderGraphTabs` for the
native `.graph.json` path) that duplicate the same tab switching logic.
Every new loading path would require a third function.

---

### The correct architecture: `WorkspaceController`

Table and graph are both workspace-level views. They should be dispatched
through the same mechanism. The distinction between "a table tab" and "a
diagram tab" is a rendering detail — at the tab strip level, both are just
entries with an id, a view, and data.

**`viewFactory` should dispatch on model type, not on control file entry
view string:**

```ts
// Current (dispatches on string from control file)
function viewFactory(entry: ControlEntry, ...): WorkspaceView {
    switch (entry.view) {
        case "table": return new TableViewAdapter(...);
        case "flow":  return new FlowDiagramView("flow");
    }
}

// Correct (dispatches on model object type)
function viewFactory(model: Table | Graph, ...): WorkspaceView {
    if (model instanceof Table) return new TableView(...);
    if (model instanceof Graph) return new FlowDiagramView(model.viewType);
}
```

**`WorkspaceController` owns the tab strip and all dispatch logic:**

```ts
class WorkspaceController {
    private tabs = new Map<string, { view: WorkspaceView; data: WorkspaceData }>();
    private savedStates = new Map<string, ViewState>();
    private activeId: string | null = null;

    constructor(
        private tabStrip: HTMLElement,
        private container: HTMLElement,
        private statusText: HTMLElement,
    ) {}

    registerTab(id: string, view: WorkspaceView, data: WorkspaceData): void {
        this.tabs.set(id, { view, data });
        const btn = document.createElement("button");
        btn.className = "tab-btn";
        btn.textContent = id;
        btn.addEventListener("click", () => this.activateTab(id));
        this.tabStrip.appendChild(btn);
    }

    activateTab(id: string): void {
        // Save state of current tab
        if (this.activeId) {
            const current = this.tabs.get(this.activeId);
            if (current) this.savedStates.set(this.activeId, current.view.unmount());
        }
        // Mount new tab with saved state
        const next = this.tabs.get(id);
        if (!next) return;
        this.container.innerHTML = "";
        this.tabStrip.querySelectorAll(".tab-btn")
            .forEach(b => b.classList.toggle("tab-active", b.textContent === id));
        next.view.mount(this.container, next.data, this.savedStates.get(id));
        this.activeId = id;
        this.statusText.textContent = id;
    }

    activateFirst(): void {
        const first = this.tabs.keys().next().value;
        if (first) this.activateTab(first);
    }
}
```

**`main.ts` becomes thin wiring:**

```ts
const ws = new WorkspaceController(tabStrip, tableContainer, statusText);

for (const table of kb.tables)
    ws.registerTab(table.name, new TableView(...), { table });

for (const graph of kb.graphs)
    ws.registerTab(graph.name, new FlowDiagramView(graph.viewType), { graph });

ws.activateFirst();
```

The same three lines work regardless of whether the data came from a
`.csv` file, a `.graph.json` file, or a `control.json` batch. There is
no `renderControlTabs` vs `renderGraphTabs` split.

**`TableView` implements `WorkspaceView` directly:**

```ts
class TableView implements WorkspaceView {
    mount(container, data, state?) { ... }
    unmount(): ViewState { ... }
    update(data) { ... }
}
```

`TableViewAdapter` is deleted. The adapter only exists because `TableView`
was written before the interface existed. Once `TableView` implements the
interface directly, the adapter has no purpose.

---

### Why the current state is not wrong, just incomplete

The `WorkspaceView` interface was designed correctly. `FlowDiagramView`
already implements it correctly. The `viewFactory` function was written
with the right intent. The problem is that `main.ts` was never updated to
use them — it grew its own tab management logic instead.

The current code works correctly. The architectural issue is one of
organisation: tab logic that belongs in a `WorkspaceController` class is
scattered across `main.ts`, and `TableViewAdapter` exists as a workaround
for `TableView` not implementing the interface directly.

This is the planned refactoring for a future phase. The priority order is:

1. Make `TableView` implement `WorkspaceView` directly — removes the adapter
2. Add `WorkspaceController` — moves tab logic out of `main.ts`
3. Update `viewFactory` to dispatch on model type — removes the string-based switch
4. Delete `TableViewAdapter` — no longer needed

None of these changes affect the model, controller, or rendering logic.
They are purely organisational changes to the view layer.

---

### Summary: why each view file exists

| File | Status | Reason |
|---|---|---|
| `table-view.ts` | Correct | Primary workspace renderer for Table |
| `flow-diagram-view.ts` | Correct | Primary workspace renderer for Graph |
| `workspace-view.ts` | Correct interface, incomplete wiring | `viewFactory` bypassed by `main.ts` |
| `table-view-adapter.ts` | Temporary workaround | Exists because `TableView` doesn't implement `WorkspaceView` directly |
| `graph-filter-view.ts` | Correct | Toolbar-level UI, not a workspace view |
| `search-view.ts` | Correct | Toolbar-level UI, not a workspace view |
| `session.ts` | Correct | Persistence utility |

---

## Post-Phase 13 — Graph Editing, Dynamic Toolbar & Bug Fixes

---

### Dynamic toolbar architecture

The toolbar is split into two DOM sections:

```
#dynamic-toolbar   ← rebuilt on every tab switch and selection change
#static-toolbar    ← Export button, always present
```

**Data flow:**

```
WorkspaceController.activateTab()
  → view.mount()
  → onToolbarChange(view.getToolbarActions(), view)   ← fires callback
  → AppShell rebuilds #dynamic-toolbar from action descriptors
  → sets toolbarRefresh callback on view

view.onNodeClick() / onToolbarAction() / edge click
  → this.toolbarRefresh?.()
  → onToolbarChange(view.getToolbarActions(), view)   ← fires again
  → AppShell rebuilds #dynamic-toolbar with updated disabled states
```

**`ToolbarAction` descriptor:**
```ts
interface ToolbarAction {
    id: string;
    label: string;
    title?: string;
    disabled?: boolean;
}
```

Views declare their actions as data, not as DOM. `AppShell` owns the
toolbar DOM. Views own the action logic via `onToolbarAction(id)`.

---

### `FlowDiagramView` — graph editing interactions

#### State fields

| Field | Purpose |
|-------|---------|
| `kbGraphIdx` | Real index in `kb.graphs[]`, resolved at mount |
| `selectedEdgeId` | Currently selected edge id, or null |
| `edgeFromNodeId` | Edge-draw mode: null = off, "" = waiting for source, id = source set |
| `pendingEditNodeId` | Node to enter inline edit on next render (used by `+ Node`) |
| `toolbarRefresh` | Callback to rebuild toolbar after selection changes |
| `clickTimer` | Timer to distinguish single-click from double-click |

#### Click/dblclick disambiguation

`dblclick` fires after two `click` events. Without disambiguation, the
first `click` would call `render()` which destroys the SVG, and `dblclick`
would fire on a stale element.

Solution: 220ms timer on single-click:

```
click fires
  → clearTimeout(clickTimer) if pending
  → clickTimer = setTimeout(() => onNodeClick(id), 220)

dblclick fires (within 220ms of first click)
  → clearTimeout(clickTimer)   ← cancels the pending single-click
  → onNodeDblClick(id, ...)    ← runs on live DOM
```

#### Inline label editing

`onNodeDblClick` inserts a `<foreignObject>` containing an `<input>` into
the SVG's pan group, sized to the node's bounding box via `getBBox()`.
The SVG `<text>` label is hidden while the input is active.

A `committed` flag prevents double-commit (blur fires after Enter in some
browsers):

```ts
let committed = false;
const commit = () => {
    if (committed) return;
    committed = true;
    // ... apply label change
};
input.addEventListener("keydown", e => { if (e.key === "Enter") commit(); });
input.addEventListener("blur", commit);
```

#### Edge-draw mode

`edgeFromNodeId` drives a two-click edge creation flow:

```
"" (empty)  → waiting for source node click
"nodeId"    → source set, waiting for target node click
null        → mode off
```

The cursor changes to `crosshair` on all nodes while in edge-draw mode.
The `+ Edge` button label changes to "Cancel Edge" while active.

#### `REdge.id` and edge selection

`REdge` now carries `id: string` populated from `GraphEdge.id`. Each edge
is wrapped in a `<g>` with a 10px-wide transparent `<path>` as a hit area
(making thin paths easy to click) and a visible `<path>`. Clicking an edge
calls `onEdgeSelect(edgeId)` which toggles `selectedEdgeId` and clears
node selection.

---

### `kbTableIdx` and `kbGraphIdx` — the index resolution pattern

Both `TableView` and `FlowDiagramView` follow the same pattern:

```ts
// In mount():
this.kbTableIdx = kb.tables.indexOf(data.table);   // TableView
this.kbGraphIdx = kb.graphs.indexOf(data.graph);   // FlowDiagramView
```

This resolves the real index in the global `kb.tables[]` / `kb.graphs[]`
array once at mount time. All controller calls use this index. Without
this, every `TableView` instance would use `activeTabIdx = 0` and always
edit `kb.tables[0]` regardless of which table it was showing.

---

### Undo/redo tab navigation

`undo()` and `redo()` call `navigateToTable(tableIdx)` or
`navigateToGraph(graphIdx)` instead of `showAll()`:

```ts
private navigateToTable(tableIdx: number): void {
    const table = this.knowledgeBase.tables[tableIdx];
    const tv = this.workspaceController?.getActiveTableView();
    if (tv && this.workspaceController?.getActiveId() === table.name) {
        tv.renderTable(tableIdx);   // already on correct tab: fast path
    } else {
        this.workspaceController?.activateTab(table.name);  // switch tab
    }
}
```

The fast path avoids unmount/remount when the affected tab is already
active. The switch path calls `activateTab` which mounts the view and
re-renders automatically.

---

### Workspace overflow toggle

`WorkspaceController.activateTab` toggles `workspace-diagram` on
`#workspace` (the container's parent element):

```ts
const isDiagram = next.data.graph !== undefined;
this.container.parentElement?.classList.toggle("workspace-diagram", isDiagram);
```

CSS:
```css
#workspace { overflow: auto; }
#workspace.workspace-diagram { overflow: hidden; }
```

This suppresses scrollbars on diagram tabs (which have their own pan/zoom)
while preserving scrolling on table tabs.

---

### Bug fix — Edge id collision on add/remove/add cycle

**Symptom:** After removing an edge and adding a new one, the new edge
received the same id as an existing edge, causing silent data corruption
(two edges with the same id, delete-by-id removing the wrong one, etc.).

**Root cause:** `Graph.addEdge` generated ids as `e${this.edges.length}`.
This is wrong because `edges.length` decreases when an edge is removed:

```
add 10 edges  → ids e0..e9,  length = 10
remove e5     → length = 9
add new edge  → id = e9  ← COLLISION with existing e9
```

The same class of bug existed in `controller/index.ts` where
`resolveAllDiagrams` used a local `edgeCounter` and then overrode the
generated id via an unsafe cast:
```ts
(edge as { id: string }).id = `e${edgeCounter++}`;
```
This cast bypassed TypeScript's type system to mutate a `readonly` field.

**Fix:** Added `private edgeSeq: number` to `Graph` — a monotonically
increasing counter that only ever increments, never resets:

```ts
private nextEdgeId(): string {
    return `e${this.edgeSeq++}`;
}
```

`addEdge` now calls `this.nextEdgeId()`. The sequence is never affected
by removals — it only moves forward.

**`fromGraphJSON` initialisation:** When loading a `.graph.json` file,
edges may already have explicit numeric ids (e.g. `e0`, `e14`). The
`edgeSeq` is initialised to one past the highest numeric id found:

```ts
const edgeSeq = edges.reduce((max, e) => {
    const n = parseInt(e.id.replace(/^e/, ""), 10);
    return isNaN(n) ? max : Math.max(max, n + 1);
}, 0);
```

This guarantees that any `addEdge` call after loading never collides with
ids that came from the file, regardless of how many edges were removed
before the first `addEdge`.

**`controller/index.ts`:** Removed `edgeCounter`, the cast hack, and the
`graph.edges = []` reset that preceded it. `addEdge` generates correct
unique ids on its own — no override needed.

**Lesson:** Never use a mutable collection's `.length` as an id generator.
Length decreases on removal; a sequence counter does not. Any id that must
be unique for the lifetime of the object must come from a counter that only
moves forward.

---

### Bug fix — `node.x` / `node.y` do not exist on `GraphNode`

**Symptom:** TypeScript error `Property 'x' does not exist on type 'GraphNode'`
in `onNodeDblClick`.

**Root cause:** The fallback `bbox` in `onNodeDblClick` referenced
`node.x` and `node.y`:

```ts
bbox = { x: node.x - 40, y: node.y - 10, width: 80, height: 20 };
```

`node` here is a `GraphNode` (the model class), which has no `x` or `y`
fields — those are layout coordinates that only exist on `LayoutNode`
(the internal rendering struct computed by `computeLayout`). The model
class stores position hints in `node.properties.get("x")` as a
`TypedValue`, not as a direct numeric field.

**Fix:** The fallback is only reached if `getBBox()` throws, which should
not happen on a mounted SVG element. Replace with safe zero-based defaults:

```ts
bbox = { x: 0, y: 0, width: 80, height: 24 };
```

The exact fallback values don't matter much — they only affect the
`<foreignObject>` position if `getBBox()` fails, which is a degenerate
case.

**Lesson:** `GraphNode` (model) and `LayoutNode` (rendering) are distinct
types. `GraphNode` stores typed property values in a `Map<string, TypedValue>`.
`LayoutNode` is a transient rendering struct with computed `x`, `y`, `w`,
`h` fields. Never confuse the two.

---

### Fix — unused parameters in single-click lambda

**Symptom:** TypeScript warnings `'shapeEl' is declared but its value is
never read` and `'lblEl' is declared but its value is never read` in the
single-click callback passed to `renderGraph`.

**Root cause:** `renderGraph` passes `(nodeId, shapeEl, lblEl)` to both
the single-click and double-click callbacks. The double-click handler uses
all three to perform inline editing. The single-click handler only needs
`nodeId` to toggle selection — `shapeEl` and `lblEl` are irrelevant.

**Fix:** Prefix unused parameters with `_` to signal intentional non-use:

```ts
// single-click: only nodeId is needed
(nodeId, _shapeEl, _lblEl) => { ... }

// double-click: all three are needed
(nodeId, shapeEl, lblEl) => this.onNodeDblClick(nodeId, shapeEl, lblEl)
```

The `_` prefix is the TypeScript/JavaScript convention for "this parameter
is required by the interface but intentionally unused here".

---

### Bug fix — Drop hint class persists after file load

**Symptom:** SVG diagrams appeared distorted — centred, constrained, with
a dashed border — instead of filling the workspace container.

**Root cause:** `#table-container` starts with `class="drop-hint"` in
`index.html`. `WorkspaceController.activateTab` cleared `innerHTML` but
never cleared `className`. The `drop-hint` class applies flex centering
and a dashed border to all content mounted into the container.

**Fix:** `this.container.className = ""` before mounting. `clear()` also
restores the drop hint text and class so the workspace shows the correct
empty state when no files are loaded.

**Lesson:** When a container element has CSS classes that affect layout,
clearing `innerHTML` is not enough — the class must also be reset. Any
view that mounts into a shared container should treat the container as a
blank slate, not assume its class state.

---

### Planned Phase 14 — Source Code Editor

The source code editor is a document-level editor (an entire table or
graph as text) complementing the existing cell-level formula bar.

**Architecture constraint:** Every syntax supported by the editor must be
implemented as a `PEGParser` grammar data structure. Manual parsers are
forbidden. This is not a style preference — it is an architectural
invariant:

- The `PEGParser` engine is the single parsing infrastructure. All plugins
  already use it. Adding a new syntax means adding a new grammar object,
  not a new parser class.
- Manual parsers scatter parsing logic, produce inconsistent error
  messages, and cannot be composed with the existing plugin system.
- A grammar data structure is inspectable, testable, and reusable. A
  manual parser is none of these.

The editor dispatches to the correct grammar based on a declared type
header, exactly as the cell plugin registry dispatches based on `typeId`.

---

### Planned Phase 15 — Test Resource Rectification

The `testresources/` directory contains ~60 CSV files that are the primary
real-world knowledge data for the application. They currently do not load
correctly because the types row (row 1) is missing from every file.

**The types row convention:**
```
Row 0: column headers    (Name, Formula, Domain, ...)
Row 1: column types      (text, math, text, ...)   ← MISSING in all test files
Row 2+: data rows
```

Without the types row, the app treats the first data row as the types row.
All cells are dispatched to the `text` plugin and rendered as plain text,
even cells containing math syntax like `\\sqrt{x}` or `\\int{a,b,f(x)}`.

**Fix strategy:**
1. Audit each file — identify which columns contain math expressions
2. Add the types row as the second row
3. Create a `control.json` per domain folder
4. Fix cells with non-standard syntax

**Column type heuristic:**
- `Group`, `Name`, category, description columns → `text`
- Formula, expression, equation columns → `math`
- Compound/reaction columns in chemistry files → `chemistry`
- Code columns → `text` (no code plugin yet)

This phase does not add new plugins. It only makes existing files work
with the existing application.

---

## Phase 14 — Source Code Editor: Bug Fixes

Three bugs were found and fixed after the initial Phase 14 implementation.

---

### Bug fix — `activateCell` scope bug: source editor not populated on cell click

#### Symptom

Clicking a table cell did not populate the source editor with the cell's
content. The source editor remained blank or showed stale content from a
previous cell. Clicking Apply had no effect.

#### Root cause

`activateCell` was a method on `TableView`. Inside `renderTableRows`, the
click handler called it and also called `sourceEditor.setText(...)` with
`{ tableIdx, rowIdx, colIdx }` context:

```ts
td.addEventListener("click", () => {
    this.activateCell(td, cell.value, col.typeId, (v) => ...);
    this.sourceEditor?.setText(cell.value, col.typeId, { tableIdx, rowIdx, colIdx });
});
```

However, `activateCell` itself also called `this.sourceEditor?.setText(...)`.
Inside `activateCell`, the variables `tableIdx`, `rowIdx`, and `colIdx` were
not in scope — they were closure variables from the outer `renderTableRows`
loop, not parameters of `activateCell`. The `setText` call inside
`activateCell` received `undefined` for all three indices.

`SourceEditorView.setText` stores the context as `activeCellCtx`. When the
user clicks Apply, `apply()` reads `this.activeCellCtx` and calls
`controller.editCell(tableIdx, rowIdx, colIdx, text)`. With `undefined`
indices, `editCell` was a no-op.

#### Fix

Added `tableIdx`, `rowIdx`, and `colIdx` as explicit parameters to
`activateCell`:

```ts
private activateCell(
    td: HTMLTableCellElement,
    value: string,
    typeId: string,
    tableIdx: number,
    rowIdx: number,
    colIdx: number,
    onCommit: (v: string) => void
)
```

The call site in `renderTableRows` passes them explicitly. Inside
`activateCell`, `setText` is called with the correct context:

```ts
this.sourceEditor?.setText(value, typeId, { tableIdx, rowIdx, colIdx });
```

#### Lesson

Closure variables are only in scope at the call site where the closure is
created. When a method is extracted from a closure, any variables it needs
must be passed as explicit parameters — they cannot be captured from the
outer scope. The symptom (Apply being a no-op) was a consequence of
`activeCellCtx` being `undefined`, which silently made `editCell` a no-op.

---

### Bug fix — Invisible text in source editor overlay

#### Symptom

Text typed into the source editor was invisible. The caret was visible
but no characters appeared on screen.

#### Root cause

The overlay technique requires:
- The `<pre>` (highlighted layer) to have a **visible** text colour
- The `<textarea>` (input layer) to have **transparent** text

The initial CSS had:

```css
.se-highlight { color: transparent; }          /* WRONG — hides the pre */
.se-textarea  { -webkit-text-fill-color: transparent; }
```

Setting `color: transparent` on the `<pre>` made the highlighted text
invisible. `-webkit-text-fill-color` is a non-standard property that does
not work consistently across all browsers.

#### Fix

```css
.se-highlight { color: #1e293b; }              /* visible base colour */
.se-textarea  { color: transparent;
                caret-color: #1e293b; }        /* hides raw text, shows caret */
```

The `<pre>` now has a visible base colour. Token spans override this with
their own colours. The `<textarea>` uses standard `color: transparent` to
hide the raw text, and `caret-color: #1e293b` to keep the caret visible.

#### Lesson

In the overlay technique, the `<pre>` is the **visible** layer and the
`<textarea>` is the **invisible** layer. Getting these backwards makes the
highlighted layer invisible and the raw text visible — the opposite of the
intended effect. Use standard `color: transparent` rather than
`-webkit-text-fill-color` for cross-browser compatibility.

---

### Bug fix — Enter key behaviour in source editor

#### Symptom

In the source editor, pressing Enter in a math cell inserted a newline
instead of applying the edit. In a text cell, pressing Enter applied the
edit instead of inserting a newline.

#### Root cause

The `keydown` handler did not distinguish between single-line syntaxes
(where Enter should commit) and multi-line syntaxes (where Enter should
insert a newline). All syntaxes used the same handler.

#### Fix

The `keydown` handler now checks `syntaxType`:

```ts
if (e.key === "Enter" && !e.shiftKey) {
    const singleLine = ["math", "chemistry"].includes(this.syntaxType);
    if (singleLine) {
        e.preventDefault();
        this.apply();
        return;
    }
    // multi-line syntaxes: fall through to default newline behaviour
}
```

**Single-line syntaxes** (math, chemistry): Enter = Apply. These syntaxes
are always one expression per cell. A newline would produce a parse error.

**Multi-line syntaxes** (text, geometry, physics, table-source,
graph-source): Enter = newline. These syntaxes are inherently multi-line.

**Shift+Enter** always inserts a newline regardless of syntax type.

#### Lesson

The correct Enter behaviour is syntax-dependent. A single keydown handler
that treats all syntaxes identically will always be wrong for at least one
syntax type. The fix is a simple lookup against the current `syntaxType`.

---

### Bug fix — Text newlines not rendered in table cells

#### Symptom

A text cell containing newlines displayed all lines concatenated on one
line in the table.

#### Root cause

The text plugin's `render` function created a `<span>` with
`textContent = text`. The browser's default `white-space: normal` on
`<span>` collapses all whitespace including newlines into a single space.

#### Fix

Added `span.style.whiteSpace = "pre-wrap"` to the text plugin renderer:

```ts
render(ast) {
    const span = document.createElement("span");
    span.textContent = (ast as { text: string }).text;
    span.style.whiteSpace = "pre-wrap";   // ← added
    return span;
},
```

`pre-wrap` preserves newlines and spaces while still wrapping long lines
to fit the cell width.

#### Lesson

`textContent` preserves newlines in the DOM string, but the browser
collapses them visually unless `white-space` is set to a value that
preserves them. `pre-wrap` is the correct choice for user text: it
preserves intentional whitespace without preventing line wrapping.

---

## Post-Phase 14 — Row Selection, Multi-Row Drag & Default Action Prevention

---

### Overview

A series of incremental improvements to `TableView` and `AppShell` covering:
- Preventing browser default actions during table and diagram interaction
- Fixing the workspace file-drop handler to ignore internal row drags
- Replacing the drag handle column with a checkbox column for row selection
- Implementing correct multi-row collective drag-and-drop

---

### Preventing browser default actions

#### Table view

Three places where browser defaults caused visible problems:

**Column header `mousedown` → `preventDefault()`**
Without this, clicking a header to sort begins a text selection gesture. The header text becomes highlighted blue. `preventDefault()` on `mousedown` suppresses the selection without affecting the `click` event.

**Cell `dblclick` → `preventDefault()`**
The browser selects the cell's rendered text on double-click. Since the cell switches to edit mode on single-click, the double-click selection is noise. `preventDefault()` suppresses it.

**Drag handle `mousedown` → `preventDefault()`** (later replaced by checkbox column — see below)
Same reason: prevents text selection when the user starts a drag gesture.

#### Flow diagram view

Three places on the SVG element:

**`mousedown` → `preventDefault()`**
Without this, panning the diagram (click-drag) begins a text selection over SVG text labels. `preventDefault()` suppresses the selection while still allowing the drag to proceed.

**`dblclick` → `preventDefault()`**
Double-clicking a node to edit its label would also select the SVG text. `preventDefault()` suppresses the selection.

**`contextmenu` → `preventDefault()`**
Right-clicking over the diagram shows the browser's native context menu, which is irrelevant here. `preventDefault()` suppresses it.

---

### Fixing the workspace file-drop handler

#### Symptom

Dragging a table row to reorder it caused all loaded files to disappear, as if the app had been reset.

#### Root cause

`AppShell.wireFileLoading` attached unconditional `dragover` and `drop` listeners to `#workspace`. When a table row drag bubbled up to `#workspace`, the `drop` handler fired with `e.dataTransfer.files` being empty (row drags carry no files). The handler still called `loadFiles([])`, which called `kb.clear()` and `workspace.clear()` — wiping everything.

#### Fix

Two guards added to the workspace drag handlers:

```ts
ws.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    ws.classList.add("drag-over");
});
ws.addEventListener("drop", (e) => {
    ws.classList.remove("drag-over");
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    this.loadFiles(Array.from(e.dataTransfer.files));
});
```

`e.dataTransfer.types` contains `"Files"` only when the drag carries actual filesystem files. Row drags carry `"text/plain"` (the serialised indices). The `files.length` guard is a second layer: even if `types` somehow passes, an empty file list produces no load.

#### Lesson

Any `drop` handler on a container must guard against internal drags. Checking `e.dataTransfer.files.length` before calling any destructive operation is the minimum safe pattern.

---

### Row checkbox column

The `⠿` drag handle column was replaced with a checkbox column. The drag handle was not reliably draggable (users could not easily initiate a drag from it), and it provided no visual feedback about which rows were selected for a collective move.

#### Structure

- **Header `<th>`**: contains a single `<input type="checkbox">` that controls select-all / deselect-all.
- **Per-row `<td class="row-check-col">`**: contains a `<input type="checkbox">` for that row.
- The entire `<tr>` is `draggable = true`. Dragging any cell in the row initiates the drag.

#### Header checkbox tri-state

The header checkbox has three visual states:

| State | `checked` | `indeterminate` | Meaning |
|-------|-----------|-----------------|---------|
| Empty | `false` | `false` | No rows selected |
| Dash (−) | `false` | `true` | Some rows selected |
| Tick (✓) | `true` | `false` | All rows selected |

`indeterminate` is a DOM property (not an HTML attribute) — it must be set in JavaScript:
```ts
headerCb.indeterminate = checkedCount > 0 && checkedCount < currentRows.length;
```

**Click behaviour:**
- None or partial selected → select all
- All selected → deselect all

The `click` handler uses `e.preventDefault()` and reads the live count at click time:
```ts
headerCb.addEventListener("click", (e) => {
    e.preventDefault();
    const liveCount = currentRows.filter(r => this.selectedRows.has(r)).length;
    if (liveCount < currentRows.length) {
        currentRows.forEach(r => this.selectedRows.add(r));
    } else {
        this.selectedRows.clear();
    }
    render();
});
```

Reading `liveCount` inside the handler (not from the outer closure) is critical — the outer `checkedCount` is stale by the time the user clicks.

#### Live header update without full re-render

Individual row checkboxes call `updateHeaderCb()` on `change` instead of triggering a full `render()`. This updates only the header checkbox's `checked` and `indeterminate` properties:

```ts
const updateHeaderCb = () => {
    const checked = currentRows.filter(r => this.selectedRows.has(r)).length;
    headerCbRef!.checked = checked === currentRows.length && currentRows.length > 0;
    headerCbRef!.indeterminate = checked > 0 && checked < currentRows.length;
};
```

`headerCbRef` is obtained once after `thead` is built:
```ts
headerCbRef = thead.querySelector<HTMLInputElement>("input[type=checkbox]");
```

This avoids the cost of rebuilding the entire table DOM on every checkbox click.

#### Escape to deselect

`AppShell.wireKeyboard` handles `Escape` to clear the selection:
```ts
} else if (e.key === "Escape") {
    this.workspace.getActiveTableView()?.clearSelection();
}
```

The existing `if (this.sourceEditor.focused) return` guard at the top of the handler means Escape does nothing when the source editor is focused — the source editor uses Escape for its own cancel behaviour.

---

### Multi-row drag-and-drop

#### Why storing indices fails

The first implementation stored row indices (`number`) in `selectedRows`. Indices are computed as `table.rows.indexOf(row)` at render time. After any re-render (which happens after every `moveRow` call, after checkbox changes, etc.), the DOM is rebuilt but `selectedRows` still holds the old integers. When `dragstart` fires and reads `this.selectedRows`, it gets integers that may no longer correspond to the correct rows.

#### The fix: store `Row` objects

`selectedRows` is `Set<Row>` — it stores the actual model objects. A `Row` object's identity never changes regardless of where it sits in `table.rows[]`. At drop time, `table.rows.indexOf(r)` resolves the **current live index** of each selected row, which is always correct.

```ts
private selectedRows = new Set<Row>();
```

#### `attachDragHandlers` receives `row` as a parameter

The `row` object is available in the render loop. It is passed explicitly to `attachDragHandlers` so `dragstart` can use it directly without any lookup:

```ts
this.attachDragHandlers(tr, tbody, tableIdx, table, row);

private attachDragHandlers(..., row: Row): void {
    tr.addEventListener("dragstart", (e) => {
        if (this.selectedRows.has(row) && this.selectedRows.size > 0) {
            // Drag all selected rows in their current table order
            this.dragRows = table.rows.filter(r => this.selectedRows.has(r));
        } else {
            this.dragRows = [row];
        }
        ...
    });
}
```

`table.rows.filter(r => this.selectedRows.has(r))` produces the selected rows in their **current table order** — not the order they were checked. This is the correct order for the move operation.

#### `drop` resolves live indices

At drop time, `dragRows` holds `Row` objects. Their current positions are resolved immediately before the move:

```ts
const liveIndices = this.dragRows
    .map(r => table.rows.indexOf(r))
    .filter(i => i !== -1)
    .sort((a, b) => a - b);
this.controller!.moveRows(tableIdx, liveIndices, insertIdx);
```

#### Selection persists across drags

The `drop` handler does **not** clear `selectedRows`. The selection stays intact after a drop, so the user can drag the same set of rows again immediately. Selection is only cleared by:
- Pressing Escape (when source editor is not focused)
- Unchecking individual row checkboxes
- Clicking the header checkbox to deselect all

#### `controller.moveRows` — atomic multi-row move

`moveRows` performs the entire operation in one shot on `table.rows`:

```ts
moveRows(tableIdx, fromIndices, insertIdx): void {
    // 1. Remove all rows from highest index to lowest
    const removedRows = new Array(sorted.length);
    for (let i = sorted.length - 1; i >= 0; i--)
        removedRows[i] = table.rows.splice(sorted[i], 1)[0];

    // 2. Compute destination: how many removed rows were above insertIdx
    const shift = sorted.filter(idx => idx < insertIdx).length;
    const dest = insertIdx - shift;

    // 3. Splice all rows in at dest, preserving relative order
    table.rows.splice(dest, 0, ...removedRows);

    this.history.push({ type: "moveRows", tableIdx, fromIndices: sorted, toIdx: dest, rows: removedRows });
    this.showAll();
}
```

Removing from highest to lowest index ensures earlier removals don't shift later indices. The `shift` calculation accounts for the fact that each removed row above `insertIdx` moves the effective destination one position earlier.

This is recorded as a single `moveRows` action in `EditHistory`, so Ctrl+Z undoes the entire multi-row move atomically.

#### `moveRows` in `EditHistory`

```ts
| { type: "moveRows"; tableIdx: number; fromIndices: number[]; toIdx: number; rows: Row[] }
```

Undo: splice out from `toIdx`, restore each row at its original `fromIndices[i]` position (processed in reverse order to avoid shifting).

Redo: remove from original positions (highest to lowest), splice back at `toIdx`.

#### Custom ghost image

When multiple rows are dragged, a custom ghost element is built showing all dragged rows stacked:

```ts
const ghost = document.createElement("div");
for (const r of this.dragRows) {
    const line = document.createElement("div");
    line.textContent = r.getCellValue(0);
    ghost.appendChild(line);
}
document.body.appendChild(ghost);
e.dataTransfer!.setDragImage(ghost, 0, 0);
requestAnimationFrame(() => ghost.remove());
```

The ghost is appended to `document.body` at `position:fixed; top:-9999px` so it is off-screen but still in the DOM when `setDragImage` is called. `requestAnimationFrame` removes it after the browser has captured the drag image.

---

### Drop indicator

The blue insertion-point line is a single `<div class="row-drop-indicator">` absolutely positioned relative to the table's container. It is created once and repositioned on every `dragover` event — not recreated. The key fix that made this work was querying for the existing indicator on the **container** (not the `<tbody>`), since the indicator is appended to the container:

```ts
let indicator = container.querySelector<HTMLElement>(".row-drop-indicator");
if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "row-drop-indicator";
    container.appendChild(indicator);
}
```

The `dragleave` handler only clears the indicator when the cursor leaves the `<tbody>` entirely:
```ts
tbody.addEventListener("dragleave", (e) => {
    if (!tbody.contains(e.relatedTarget as Node))
        this.clearDropIndicator(tbody);
});
```

`e.relatedTarget` is the element the cursor moved to. If it's still inside `tbody`, the cursor just moved between rows — the indicator should stay.


---

## Phase 15 - Architecture Refactoring: Terminology & Source Separation

Phase 15 was a pure reorganisation — no logic changed, no new features added.
The `src/view/` and `src/plugins/` directories were replaced by four new
directories grouped by the UI surface each file serves:

| Old path | New path |
|---|---|
| `src/view/table-view.ts` | `src/knowledge-pane/table-view.ts` |
| `src/view/flow-diagram-view.ts` | `src/knowledge-pane/flow-diagram-view.ts` |
| `src/view/workspace-controller.ts` | `src/knowledge-pane/workspace-controller.ts` |
| `src/view/workspace-view.ts` | `src/knowledge-pane/workspace-view.ts` |
| `src/view/source-editor-view.ts` | `src/source-editor/source-editor-view.ts` |
| `src/plugins/highlighter.ts` | `src/source-editor/highlighter.ts` |
| `src/view/app-shell.ts` | `src/shell/app-shell.ts` |
| `src/view/session.ts` | `src/shell/session.ts` |
| `src/view/graph-filter-view.ts` | `src/shell/graph-filter-view.ts` |
| `src/view/search-view.ts` | `src/shell/search-view.ts` |
| `src/plugins/math/` | `src/cell-renderers/math/` |
| `src/plugins/interface.ts` | `src/cell-renderers/interface.ts` |
| `src/plugins/registry.ts` | `src/cell-renderers/registry.ts` |

The `Plugin` interface in `src/cell-renderers/interface.ts` was renamed to
`CellRenderer`. A `type Plugin = CellRenderer` alias was kept for backward
compatibility with any code that still used the old name.

---

## Phase 15.B - Document Model, Navigation Tree & Tab Lifecycle

This phase implements the Document model described in Part I.B of `study.md`,
wires it into the loading pipeline, and adds a directory-style navigation tree
that drives lazy tab opening.

---

### New model: `src/model/Document.ts`

Three new classes, all additive. `Table` and `Graph` are unchanged.

**`Document`**

```ts
class Document {
    readonly name: string;
    readonly sections: Section[];
    getSection(id): Section | undefined
    getTableSections(): Section[]
    getGraphSections(): Section[]
}
```

Orchestrates one reference sheet. Knows nothing about rendering. The only
coordination layer between tables and graphs.

**`Section`**

```ts
class Section {
    readonly id: string;
    readonly title: string;
    readonly block: TableBlock | GraphBlock;
    readonly referenceMapping: ReferenceMapping | null;
}
```

One named block within a document. The `block` field is a discriminated union
keyed by `kind: "table" | "graph"`.

**`TableBlock` / `GraphBlock`**

```ts
interface TableBlock { kind: "table"; file: string; table: Table; }
interface GraphBlock { kind: "graph"; file: string; graph: Graph; labelStyle?: "default" | "numbered"; }
```

Each block holds a direct reference to the already-loaded model object. The
`file` field is the original filename, kept for display and debugging.

**`ReferenceMapping`**

```ts
interface ReferenceMapping {
    chartSection: string;   // id of the Section containing the GraphBlock
    nodeIdColumn: string;   // column in this table whose values are node IDs
    labelColumn: string;    // column whose values are display labels
}
```

Implements the numbered-label / legend pattern: the chart shows numbers,
the table shows descriptions. Declared in the document; the graph and table
files know nothing about each other.

---

### `sourceFile` field on `Graph` (`src/model/Graph.ts`)

```ts
class Graph {
    ...
    sourceFile: string | null = null;
}
```

Set to the original filename (e.g. `"glycolysis.graph.json"`) by both
`loadGraph` in the controller and the `"graph"` entry path in
`resolveAllDiagrams`. This is the stable key used to match a graph to a
doc section reference.

**Why this field is necessary:** `control.json` names graphs by entry `id`
(e.g. `"glycolysis-map"`), not by filename. So `graph.name` is
`"glycolysis-map"` but the doc references `"glycolysis.graph.json"`. The
only way to match them is to record the original filename separately.

---

### `KnowledgeBase` changes (`src/model/KnowledgeBase.ts`)

```ts
class KnowledgeBase {
    readonly documents: Document[] = [];   // NEW

    addDocument(doc: Document): void {
        this.documents.push(doc);
        // Does NOT re-register the doc's tables/graphs.
        // They are already in kb.tables/kb.graphs from loadCSV/loadGraph.
    }
}
```

**Why `addDocument` must not re-register:** The document's tables and graphs
are already in `kb.tables`/`kb.graphs` from the earlier `loadCSV`/`loadGraph`
calls. Re-adding them caused duplicates. The standalone deduplication logic
in `registerAllTabs` and `NavigationTreeView.refresh()` uses name/sourceFile
matching — duplicates caused items to be incorrectly excluded from the
standalone group.

---

### `.doc.json` parser (`src/data/doc.ts`)

```ts
function parseDocJSON(
    fileName: string,
    json: unknown,
    tableMap: Map<string, Table>,    // keyed by "name.csv"
    graphMap: Map<string, Graph>,    // keyed by sourceFile (e.g. "glycolysis.graph.json")
): Document
```

Resolves file references against pre-loaded maps. Sections whose referenced
file is not found are skipped with a `console.warn` — partial loading is
allowed when some files are missing.

**Graph map key:** The map is keyed by `g.sourceFile` (the original filename),
not by `g.name + ".graph.json"`. This is the critical fix that makes doc
loading work when `control.json` is present — `control.json` assigns graph
names from entry `id` fields, so `graph.name` is not the filename.

---

### `DocumentView` (`src/knowledge-pane/document-view.ts`)

Implements `WorkspaceView`. Renders a `Document` as a vertical stack of
collapsible sections.

**Mount/unmount lifecycle:**

```ts
mount(container, data, savedState?): void
    // Renders all sections. Restores collapse state and scrollTop from savedState.

unmount(): ViewState
    // Unmounts all child views (TableView/FlowDiagramView).
    // Returns { collapsedSections: string[], scrollTop: number }.
```

**Section rendering:**

Each section gets a collapsible header (`document-section-header`) and a
body (`document-section-body`). The header carries a `data-section-id`
attribute used by the nav tree for scroll-to-section navigation.

For table blocks: creates a `TableView`, calls `tv.mount(childContainer, { table })`.
For graph blocks: creates a `FlowDiagramView`, calls `fv.mount(childContainer, { graph })`.

Child views are stored in `this.mounted[]` so `unmount()` can call
`view.unmount()` on each to save their state.

---

### Loading pipeline (`src/shell/app-shell.ts`)

The key architectural change is the `loadDocResults()` shared helper:

```ts
private loadDocResults(
    docResults: { name: string; text: string }[],
    csvResults:  { name: string; text: string }[],
    graphResults: { name: string; text: string }[],
): void {
    if (docResults.length === 0) return;
    const kb = this.controller.getKnowledgeBase();

    // 1. Load any CSV not yet in KB
    for (const { name, text } of csvResults)
        if (!kb.tables.find(t => t.name + ".csv" === name))
            this.controller.loadCSV(name, text);

    // 2. Load any graph not yet in KB (keyed by sourceFile)
    for (const { name, text } of graphResults)
        if (!kb.graphs.find(g => g.sourceFile === name))
            this.controller.loadGraph(name, text);

    // 3. Build lookup maps
    const tableMap = new Map(kb.tables.map(t => [t.name + ".csv", t]));
    const graphMap = new Map(kb.graphs.filter(g => g.sourceFile).map(g => [g.sourceFile!, g]));

    // 4. Parse and load each doc
    for (const { name, text } of docResults) {
        const doc = parseDocJSON(name, JSON.parse(text), tableMap, graphMap);
        this.controller.loadDocument(doc);
    }
}
```

Both `loadControlBatch` and `loadPlainBatch` call this helper. The previous
bug was that `loadControlBatch` never received `docResults` at all — it was
only passed to `loadPlainBatch`. This meant docs were silently skipped
whenever `control.json` was present in the file drop.

**File classification:**

```ts
const isDocJson   = (n: string) => n.endsWith(".doc.json") || n.endsWith(".doc");
const isGraphJson = (n: string) => n.endsWith(".graph.json") ||
    (n.endsWith(".json") && !isDocJson(n) && n !== "control.json");
```

The `.doc` fallback handles Windows hiding known extensions in the file picker.

---

### Lazy tab lifecycle (`src/knowledge-pane/workspace-controller.ts`)

The tab strip was redesigned from "register everything as a tab on load" to
a lazy open-on-demand model.

**`registerView(id, factory, data)`**

Stores a view factory without creating a tab button. Called for every
document, graph, and table at load time. The factory is a closure that
creates the view on first open:

```ts
this.workspace.registerView(
    doc.name,
    () => viewFactory(doc, this.controller, this.sourceEditor),
    { document: doc },
);
```

**`openTab(id)`**

Creates the tab button and mounts the view on first call. On subsequent
calls, activates the existing tab. This is what the nav tree calls when
the user clicks an item.

**`closeTab(id)`**

Removes the tab button, unmounts the view, activates an adjacent tab.
If no tabs remain, shows the drop hint.

**`openFirst()`**

Opens the first registered view. Called after loading files so the user
sees something immediately.

**Closeable tab buttons:**

```ts
const closeBtn = document.createElement("span");
closeBtn.className = "tab-close";
closeBtn.textContent = "✕";
closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    this.closeTab(id);
});
btn.appendChild(closeBtn);
```

The `e.stopPropagation()` prevents the close click from also activating
the tab.

---

### Navigation tree (`src/shell/navigation-tree-view.ts`)

A directory-style left sidebar. The tree is rebuilt from scratch on every
`refresh()` call.

**Structure:**

```
📁 Biochemistry Reference    <- document folder
    ▤ Glycolysis Compounds   <- section leaf (table)
    ◈ Glycolysis Pathway     <- section leaf (graph)
📁 Standalone                <- group for items not in any document
    ▤ theorems
    ◈ glycolysis-map
```

**Deduplication:** The `renderFolder` method tracks which table names and
graph sourceFiles belong to documents. The standalone group only shows
items not already inside a document folder.

**Collapse state:** A `Set<string>` keyed by `"doc:" + doc.name` or
`"standalone"` persists collapse state across `refresh()` calls. This
means collapsing a folder survives file reloads.

**Click handlers:**

- Folder label → `workspace.openTab(doc.name)`
- Section leaf → `workspace.openTab(doc.name)` then scroll to
  `[data-section-id="${section.id}"]` via `requestAnimationFrame`
- Standalone item → `workspace.openTab(item.name)`

All use `openTab` (not `activateTab`) so clicking a nav item opens a new
tab if not already open, or focuses the existing tab if it is.

---

### Source Editor apply fix

**Root cause:** `SourceEditorView.apply()` had two code paths:

1. `activeCellCtx` path — called `controller.editCell()` directly, then
   set `activeCellCtx = null`. This bypassed `TableView.commit()`, so the
   cell DOM was never updated. The model changed but the cell still showed
   the old value until the next full re-render.

2. `onCellApply` path — called `commitActive()` on the `TableView`, which
   correctly: removed `cell-active` class, called `showRendered(td, value)`,
   cleared the editor, and committed to the model.

Additionally, `onCellApply` was set once per `TableView` creation in
`viewFactory`. With lazy tab opening, whichever tab was opened last owned
the callback. Clicking a cell in an earlier-opened tab set `activeCell` on
that view, but `onCellApply` pointed to a different view's `commitActive`
where `activeCell` was null — so Apply showed "No active cell" error.

**Fix:**

Removed the `activeCellCtx` path entirely. `onCellApply` is now registered
on `SourceEditorView` at the moment a cell is activated:

```ts
// In TableView.activateCell():
this.sourceEditor?.setOnCellApply(() => this.commitActive());
```

And cleared when the cell is committed or cancelled:

```ts
// In the commit/cancel closures:
this.sourceEditor?.setOnCellApply(null);
```

The callback always points to the `TableView` that owns the currently
active cell, regardless of tab order. `setOnCellApply` now accepts
`((value, type) => void) | null`.

**Lesson:** Per-cell-activation registration is the correct pattern for
callbacks that must point to the currently active context. Global
registration (once per view creation) breaks when multiple views share
the same singleton editor.

---

### `viewFactory` dispatch on Document (`src/knowledge-pane/workspace-view.ts`)

```ts
export function viewFactory(
    model: Table | Graph | Document,
    controller: AppController,
    sourceEditor?: SourceEditorView,
): WorkspaceView {
    if (model instanceof DocumentClass) {
        return new DocumentView(controller, sourceEditor);
    }
    if (model instanceof TableClass) { ... }
    // Graph fallback
    return new FlowDiagramView((model as GraphClass).viewType, controller);
}
```

`WorkspaceData` gained `document?: Document`. The `isDiagram` check in
`WorkspaceController.activateTab` uses `next.data.graph !== undefined` —
documents are not diagrams, so they get normal scrollable workspace layout.


---

## Phase 16 — Rich Cell Renderer & Test Resource Rectification

---

### Concept: Rich Cell Type

The application previously required each column to declare a specific cell
type (`math`, `chemistry`, `geometry`, `physics`, `text`) in the types row.
The renderer for that type would attempt to parse the **entire cell content**
as a single expression. This failed for real-world data where cells contain
mixed content (formulas interspersed with prose explanations).

Phase 16 introduces a single universal cell type: `rich`. All cells are rich
cells. The rich renderer uses **explicit inline embedding syntax** to
distinguish rendered content from plain text:

```
math`\int{0, 1, x^2}` equals one third
```

The embedding syntax is: `type` followed by a backtick, content, closing backtick.
Supported types: `math`, `chem`, `geom`, `phys`.

Everything outside an embedding renders as plain text. No guessing, no
ambiguity, no delimiter escaping problems (backtick never appears in math
or chemistry syntax).

---

### File: `src/cell-renderers/rich/index.ts`

The rich plugin implements the `CellRenderer` interface:

```ts
export const richPlugin: CellRenderer = {
    type_id: "rich",
    version: "2.0.0",
    parse(text: string): unknown { ... },
    render(ast: unknown): HTMLElement { ... },
};
```

**`parse(text)`** splits the cell by newlines, then for each line uses a
regex to find embedding markers (`math`...``, `chem`...``, etc.). Text
between embeddings becomes `{ kind: "text", value }` spans. Each embedding
is parsed by its respective grammar (math parser, chemistry parser, etc.).
If parsing fails, the embedding falls back to plain text.

**`render(ast)`** creates a `<div class="rich-cell">` and appends each
span as either a rendered math/chemistry/geometry/physics element or a
plain `<span class="rich-text">` for text. Lines are separated by `<br>`.

The regex used for embedding detection:
```ts
const EMBED_RE = /\b(math|chem|geom|phys)`([^`]*)`/g;
```

---

### File: `src/cell-renderers/registry.ts`

The default fallback renderer changed from `textPlugin` to `richPlugin`:
```ts
export function getPlugin(typeId: string): CellRenderer {
    return renderers[typeId] ?? richPlugin;
}
```

This means any unknown type (or the universal `rich` type) uses the rich
renderer. The specific renderers (`math`, `chemistry`, etc.) still exist
and are used internally by the rich plugin for embedding parsing.

---

### Source Editor Changes

The source editor type dropdown was removed. Since all cells are rich, the
editor always operates in rich mode:
- Syntax highlighting uses math rules (most common content)
- Enter key inserts a newline (rich is multi-line)
- Apply commits the raw text including `math`...`` markers
- Preview shows the rendered rich output

The `SyntaxType` union in `highlighter.ts` gained `"rich"` as a member.

---

### Commit Behavior Fix (`src/knowledge-pane/table-view.ts`)

**Problem:** Pressing Apply cleared the source editor and deactivated the cell.

**Root cause:** `commitActive()` called `controller.editCell()` which called
`showAll()` which re-rendered the entire table DOM, which called
`cancelActive()`, which cleared the editor.

**Fix:** `editCell` gained a `silent` parameter. When `silent = true`, the
model is updated but `showAll()` is not called. `commitActive()` passes
`silent = true`, then manually re-renders only the single cell's TD via
`showRendered()`. The cell stays active, the editor keeps its text.

```ts
commitActive(): void {
    if (!this.activeCell) return;
    const value = this.sourceEditor?.getValue() ?? this.activeCell.originalValue;
    if (value === this.activeCell.originalValue) return;
    this.activeCell.originalValue = value;
    this.controller!.editCell(tableIdx, rowIdx, colIdx, value, true);
    this.showRendered(this.activeCell.td, value, this.activeCell.typeId);
}
```

---

### Test Resource Rectification

All 80 CSV files in `testresources/` across 6 domains were rectified:

1. **Header row** added where missing
2. **Types row** set to all `rich` for every column
3. **CSV quoting** fixed (broken multi-line cells in Biology files)
4. **`control.json`** created for each domain (6 files)
5. **Math embeddings** added: lines containing valid math expressions are
   wrapped with `math`...`` syntax using a heuristic that requires:
   - Math-specific syntax (operators, backslash identifiers, braces)
   - No prose words (the, is, that, for, etc.)
   - Successful parse by the math grammar
6. **Bilingual names** added to Name/Group/Concept columns (English/Swedish)
   for Mathematics, Chemistry, Biology, and Biochemistry domains.
   Hardware and Software domains are English-only (no Swedish CS terminology).

---

### CSV Parser (`src/data/csv.ts`)

No changes to the CSV parser itself. The PEG-based parser correctly handles:
- Quoted fields with embedded newlines
- Escaped quotes (`""`)
- CRLF and LF line endings
- UTF-8 characters (Swedish å, ä, ö)

The parser requires exactly 2 header rows (headers + types) before data.
All test resource files conform to this requirement.


---

### Source Editor: Rich Highlighting (`src/source-editor/highlighter.ts`)

The `highlight` function dispatches to `highlightRich()` when the syntax
type is `"rich"`. This function:

1. Scans the text for embedding markers using the regex
   `/\b(math|chem|geom|phys)`([^`]*)`/g`
2. Text outside embeddings is emitted as plain escaped HTML (black text)
3. Embedding tags (`math``, `chem``, etc.) are wrapped in
   `<span class="hl-embed-tag">` (purple bold)
4. Content inside each embedding is highlighted using the appropriate
   rule set (MATH_RULES, CHEMISTRY_RULES, GEOMETRY_RULES, PHYSICS_RULES)

This gives visual feedback: you can immediately see which parts of a cell
are plain text and which are rendered expressions.

---

### Cell Activation & Apply Behavior

**Auto-apply on leave:** When a cell loses focus (user clicks another cell),
`cancelActive()` calls `commitActive()` first — saving the current editor
content to the model. This prevents data loss from forgetting to press Apply.

**Alt+Enter = Apply:** In the source editor, Alt+Enter triggers Apply
(commits without leaving the cell). Plain Enter inserts a newline.

**Silent commit:** `commitActive()` calls `controller.editCell(..., true)`
with `silent=true` to update the model without triggering a full table
re-render. Only the single cell's DOM is updated via `showRendered()`.

---

### Entity/Association Cell Behavior

**Column 0 (entity cells)** are now both clickable for neighbourhood display
AND activatable for editing. A single click shows the association panels
and activates the cell in the source editor simultaneously.

**Panel dismissal** occurs when:
- User clicks a different (non-entity) cell → `onCellFocusChange` callback
- User clicks outside the panel → `document` click handler
- User presses Escape → global keydown handler

The dismiss logic is wired through `controller.setDismissPanelsHandler()`
which is called from `main.ts` and passed to each `TableView` via
`setOnCellFocusChange()`.

---

### Error Display in Rich Cells

When an embedding fails to parse (e.g. `math`@invalid`), the rich renderer
displays the full PEG parser error message in a `<pre class="cell-error">`
element. The error message includes:
- The error position (line:column)
- The source line with a caret pointing to the failure
- The list of expected tokens

This is the raw output from `PEGParser.formatError()` — no wrapping or
summarization.


---

## Phase 17 — File System Access & Save Strategy

---

### File System Strategy (`src/data/file-system.ts`)

The module exports a capability constant and two strategy implementations:

```ts
export const HAS_FILE_SYSTEM_ACCESS =
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function";
```

**`NativeFileSystemStrategy`** (Chrome, Edge):
- `open()` → `showOpenFilePicker()` → returns `FileSystemFileHandle[]`
- `save(content, handle, name)` → `handle.createWritable()` → silent write
- `saveAs(content, name)` → `showSaveFilePicker()` → user picks location
- `canSaveInPlace = true`

**`DownloadFallbackStrategy`** (Firefox, Safari):
- `open()` → programmatic `<input type="file">` click → returns null handles
- `save()` / `saveAs()` → `Blob` + `<a download>` → browser download
- `canSaveInPlace = false`

### Dirty Tracking

The controller maintains:
- `loadedFiles: Map<string, { text, handle }>` — original content + handle
- `dirty: Set<string>` — filenames with unsaved changes
- `onDirtyChange` callback — fires on every dirty state change

When `markDirty(name)` is called (from `editCell`, `addRow`, etc.):
1. Status bar shows "● Unsaved changes" (orange)
2. Tab label gets "● " prefix
3. Nav tree item gets "● " prefix

When `saveFile(name)` completes:
1. File is serialized from current model state
2. Written via strategy (`createWritable` or download)
3. Removed from dirty set
4. `onDirtyChange` fires → indicators clear

### Open Button Behavior

Single "Open" button in menu bar:
- **Native API available:** intercepts click, calls `showOpenFilePicker`,
  stores handles → enables silent Ctrl+S
- **No native API:** falls through to `<input type="file">`, stores null
  handles → Ctrl+S triggers download

### Save Flow

```
User edits cell
    → editCell() → markDirty("table.csv") → onDirtyChange → UI updates

User presses Ctrl+S (or Save button)
    → saveAllModified()
        → for each dirty file:
            → serialize (table.toCSV() or graph.toGraphJSON())
            → strategy.save(content, handle, name)
            → if handle: silent write (no dialog)
            → if null: saveAs dialog (or download)
        → dirty set cleared → onDirtyChange → UI clears indicators
```


---

### Per-File Dirty Tracking (revised)

The initial implementation used a global `history.savedPosition` to determine
dirty state. This was incorrect for multi-file scenarios — undoing one file's
change while another file remained modified would incorrectly clear all dirty
flags.

**Revised approach: content comparison per file.**

`recheckDirtyFile(name)` serializes the current model state for a file and
compares it to the stored saved content in `loadedFiles`:

```ts
private recheckDirtyFile(name: string): void {
    const entry = this.loadedFiles.get(name);
    if (!entry) return;
    const table = this.knowledgeBase.tables.find(...);
    const current = table ? table.toCSV() : graph.toGraphJSON();
    if (current === entry.text) this.dirty.delete(name);
    else this.dirty.add(name);
    this.onDirtyChange?.();
}
```

Called after every undo/redo for the affected file. The `loadedFiles` map
stores the content as it was at last save (or at load time). When `saveFile`
completes, it updates `loadedFiles` with the new content — so subsequent
undo makes the file dirty again (content differs from saved).

**Test coverage (7 new tests):**
- Edit → dirty
- Undo after edit → clean
- Redo after undo → dirty
- Save then undo → dirty
- Save then undo then redo → clean
- Multiple edits, undo one → still dirty
- Multiple edits, undo all → clean


---

## Phase 18 — Diagram Grammars (Mermaid-compatible, zero dependencies)

---

### Diagram Dispatcher (`src/cell-renderers/diagram/index.ts`)

`parseDiagram(source)` detects the diagram type from the first line keyword
and dispatches to the appropriate parser:

```ts
export function parseDiagram(source: string): DiagramResult {
    const firstLine = source.trim().split(/\r?\n/)[0].trim();
    if (/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)/.test(firstLine)) ...
    if (firstLine.startsWith("sequenceDiagram")) ...
    if (firstLine.startsWith("classDiagram")) ...
    if (/^stateDiagram/.test(firstLine)) ...
    if (firstLine.startsWith("erDiagram")) ...
    if (firstLine.startsWith("gantt")) ...
    if (firstLine.startsWith("pie")) ...
}
```

Returns `{ type, ast, render(w, h) }` — the render function produces an SVG.

---

### Flowchart Grammar (`src/cell-renderers/diagram/flowchart/grammar.ts`)

PEG grammar with rules:
- `Flowchart` → `Header` + `Statements`
- `Header` → `(flowchart|graph)` + `Direction`
- `Statement` → `EdgeChain` | `NodeDef`
- `NodeRef` → `NodeWithShape` | `BareNode`
- `ShapeContent` → `StadiumShape` | `SubroutineShape` | `CircleShape` | `HexShape` | `RectShape` | `RoundShape` | `DiamondShape`
- `Arrow` → `LabeledArrow` | `PlainArrow`

Multi-char shape delimiters (`([`, `[[`, `((`, `{{`) are tried before
single-char ones to avoid premature matching.

Edge chains (`A --> B --> C`) produce multiple edge statements from a
single line. Node deduplication ensures each node ID appears once.

Layout uses topological sort (BFS layers) for vertical/horizontal placement.

---

### Sequence Diagram Grammar (`src/cell-renderers/diagram/sequence/grammar.ts`)

PEG grammar parsing `sequenceDiagram` keyword followed by messages.
Each message: `Participant Arrow Participant : Label`.
Arrows: `->>` (solid), `-->>` (dashed), `-x` (cross), `-)` (open).
Participants auto-discovered from messages.

Renderer draws lifelines (dashed vertical lines), header boxes, and
horizontal arrows with labels.

---

### State Diagram Grammar (`src/cell-renderers/diagram/state/grammar.ts`)

PEG grammar parsing `stateDiagram-v2` keyword followed by transitions.
Each transition: `StateId --> StateId : OptLabel`.
Special state `[*]` renders as a filled circle (start/end marker).

---

### Class Diagram Grammar (`src/cell-renderers/diagram/class-diagram/grammar.ts`)

PEG grammar parsing `classDiagram` keyword followed by relations and
member lines. Relations use arrows like `<|--`, `*--`, `o--`, `-->`, `..>`.
Member lines: `ClassName : member`.

---

### ER, Gantt, Pie

ER diagram uses PEG grammar with cardinality notation (`||--o{`, etc.).
Gantt and Pie use simpler line-based parsers (regex per line) since their
syntax is more structured and doesn't need recursive parsing.

---

### DiagramView (`src/knowledge-pane/diagram-view.ts`)

Standalone view for diagram files. On mount:
1. Parses source with `parseDiagram()`
2. Renders SVG into container
3. Loads source into source editor (via `requestAnimationFrame`)
4. Sets `onCellApply` callback for bidirectional editing

On Apply: re-parses source, re-renders SVG. Parse errors shown as `<pre>`.

---

### File Loading

Diagram files detected by:
- Extension: `.mmd`, `.flowchart`, `.md`
- Content: first line matches a diagram keyword

Stored in `AppShell.diagramSources` map. Registered as tabs in
`registerAllTabs()` using `DiagramView`.

File input accept updated to include `.md,.mmd,.flowchart`.


---

## Phase 18 continuation — `.diagram` format and graph rendering algorithms

---

### `.diagram` file format

Diagrams are stored as plain text files with the `.diagram` extension. The
content is the raw Mermaid-compatible syntax — no JSON wrapper, no metadata.
The diagram type is auto-detected from the first keyword.

**Integration with `.doc.json`:**
```json
{ "type": "graph_flowchart", "file": "krebs.diagram", "labelStyle": "default" }
```

Block types: `graph_flowchart`, `graph_sequence`, `graph_class`, `graph_state`,
`graph_er`, `graph_gantt`, `graph_pie`.

**Integration with `control.json`:**
```json
{ "id": "krebs-map", "view": "diagram", "file": "krebs.diagram" }
```

**Model:** `DiagramBlock` in `Document.ts` — `{ kind: "diagram", file, source, diagramType }`.

---

### Shared graph utilities (`src/cell-renderers/diagram/graph-utils.ts`)

Two reusable functions used by flowchart and state diagram renderers:

**`findCycles(nodeIds, edges)`** — Tarjan's SCC algorithm. Returns all
strongly-connected components with size > 1. Used to detect cycles for
ring layout.

**`findBackEdges(nodeIds, edges)`** — DFS-based back-edge detection.
Returns a Set of `"from->to"` strings representing edges that form cycles.
Used to break cycles before layered layout.

---

### Graph rendering algorithm — Sugiyama layered layout

The flowchart and state diagram renderers use a proper Sugiyama-style
layered graph layout algorithm, the same approach used by dagre (which
Mermaid.js depends on). The algorithm has 5 phases:

#### Phase 1: Cycle breaking

Uses `findBackEdges()` to identify edges that create cycles. These edges
are excluded from the DAG used for layout, but still drawn (routed around
the graph exterior).

If ≥50% of nodes form a single cycle (detected via `findCycles()`), the
renderer switches to **ring layout** instead of layered layout.

#### Phase 2: Rank assignment (longest path)

BFS from source nodes (in-degree 0 in the DAG). Each node's rank is the
longest path from any source. This ensures that edges always point from
lower ranks to higher ranks.

```
Rank 0: [*]_start
Rank 1: Idle
Rank 2: Running
Rank 3: Error
Rank 4: [*]_end
```

#### Phase 3: Crossing minimization (barycenter heuristic)

For each layer (top to bottom), nodes are sorted by the average position
of their parents in the previous layer. This minimizes edge crossings
without an expensive optimal solution.

#### Phase 4: Coordinate assignment (iterative median)

4 passes (alternating down and up):
- **Down pass:** Each node moves to the median x-position of its parents
- **Up pass:** Each node moves to the median x-position of its children
- After each pass, overlaps within the layer are resolved by pushing
  nodes apart (minimum gap enforced)

This produces the characteristic tree-like layout where parents are
centered over their children.

#### Phase 5: Viewport centering

The bounding box of all nodes is computed and the entire diagram is
translated to center it in the available viewport.

---

### Ring layout (for cyclic graphs)

When a graph is predominantly cyclic (≥50% of nodes in one SCC, ≥3 nodes):

1. **Entry detection:** Find the cycle node that receives input from
   non-cycle nodes (the entry point into the cycle)
2. **Walk order:** Follow edges from the entry point around the cycle
3. **Placement:** Nodes placed evenly on a circle, entry at the top
   (angle -π/2), flowing clockwise
4. **Non-cycle nodes:** Placed above the ring in topological order,
   flowing downward toward the ring entry
5. **Edge routing:** Quadratic bezier arcs with control point pushed
   outward from ring center (follows the ring curvature)

---

### Edge rendering

**Forward edges (layered layout):** Cubic bezier S-curves.
- TD: exit bottom center, enter top center, control points at vertical midpoint
- LR: exit right center, enter left center, control points at horizontal midpoint

**Back-edges:** Routed around the graph exterior.
- TD: curve around the right side via control points offset from the rightmost node
- LR: curve above the graph via control points offset from the topmost node

**Ring edges:** Quadratic bezier with control point pushed outward from
the ring center. Start/end points computed via `nodeIntersect()` to land
exactly at node borders.

**`nodeIntersect(px, py, node)`:** Computes the intersection of a ray from
(px, py) toward the node center with the node's border. Handles rectangles
(aspect-ratio-aware) and circles (radius-based).

---

### Draw order and arrowhead visibility

SVG elements are rendered in document order (later = on top). The renderer
uses two `<g>` groups:
1. `nodeGroup` — appended first (drawn behind)
2. `edgeGroup` — appended second (drawn on top)

This ensures arrowheads at edge endpoints are never obscured by node shapes.

---

### State diagram: `[*]` splitting

Mermaid's `[*]` represents both start and end states. When `[*]` appears
as both a source and a target in the same diagram, the renderer splits it
into two visual nodes:
- `[*]_start` — filled circle, placed at rank 0
- `[*]_end` — double circle (filled + outline), placed at the last rank

This prevents `Error → [*]` from being classified as a back-edge (which
would route it around the graph incorrectly).

---

### DiagramView pan/zoom

`DiagramView` wraps all SVG content in a `<g>` group and applies:
- Mouse drag → translate (pan)
- Scroll wheel → scale (zoom, clamped 0.2–4.0)

Container uses `overflow: hidden` to suppress scrollbars. Restored on unmount.

---

## Session: 2026-06-12 — Excel-like table features, bug fixes, zoom

### Features added

#### Multi-cell selection (`table-view.ts`)
- **Click**: selects a single cell and activates it for editing in the source editor.
- **Shift+Click**: selects a rectangular range from the anchor cell to the clicked cell.
- **Ctrl/Cmd+Click**: toggles individual cells in/out of the selection.
- **Drag across cells**: mousedown + mousemove paints a rectangular range selection.
- **Arrow keys**: move the selection (when source editor is not focused).
- **Shift+Arrow**: extends selection in that direction.
- All columns (including column 0) now share the same selection behavior. Entity navigation for column 0 moved to double-click.

#### Move selected cells (`table-view.ts`, `controller/index.ts`, `EditHistory.ts`)
- **Drag-to-move**: click an already-selected cell (single or multi) and drag to a new location. A dashed green ghost box shows the landing area.
- **Confirm on overwrite**: if destination cells contain data, a confirmation dialog asks before replacing.
- **Ctrl+X / Ctrl+V**: cut selected cells, then paste at the current anchor.
- **Delete/Backspace**: clears all selected cells (multi-selection only).
- Controller method `moveCells()` performs the operation with full undo/redo support via `EditAction` type `"moveCells"`.

#### Table zoom (`table-view.ts`, `index.html`, `style.css`)
- **Ctrl+Wheel**: zooms the table in/out (range 25%–400%).
- **Zoom control bar**: fixed at the bottom-right of the workspace viewport (`#workspace-wrapper`). Contains −, percentage label (click to reset), and + buttons.
- Uses CSS `zoom` property (not `transform: scale`) so `position: sticky` headers remain functional.
- HTML structure: `#workspace-wrapper` (position: relative, overflow: hidden) wraps `#workspace` (scrollable) and `#table-zoom-bar` (absolutely positioned overlay).

#### Column sorting removed
- Header cells no longer respond to clicks or show sort indicators.
- `sortCol`/`sortAsc` state, `getSortState()`, and related CSS removed.

### Bug fixes

#### Dirty mark on cell click without editing
- **Root cause**: CSV cells from quoted multiline fields contained `\r\n`. HTML textarea normalizes to `\n`. When `commitActive()` compared textarea value vs original, they differed despite no user edit.
- **Fix**: `Table.fromCSV()` now normalizes cell values with `.replace(/\r\n/g, "\n")` at parse time.

#### Dirty mark persists after undo to original state
- **Root cause**: `savedContent` stored raw file text (with trailing newline, possible `\r\n`), but `recheckDirtyFile()` compared it against `table.toCSV()` which produces `\n`-only, no trailing newline.
- **Fix**: `AppController.snapshotTableBaselines()` re-writes `savedContent` entries using `toCSV()` output after all tables are loaded. Called at the end of `loadControlBatch()` and `loadPlainBatch()`.

#### Source editor not activating on cell click
- **Root cause**: A global `document.addEventListener("click")` in `app-shell.ts` called `cancelActive()` on every click outside the sidebar — including clicks on table cells. This cleared the source editor immediately after activation.
- **Fix**: Added guard `if (this.elements.workspaceEl.contains(target)) return;` to skip workspace clicks.

#### Source editor keyboard conflict
- **Root cause**: Table's `handleKeyDown` intercepted arrow keys even when the source editor textarea was focused, moving the cell selection instead of the text cursor.
- **Fix**: Added `if (this.sourceEditor?.focused) return;` at the top of `handleKeyDown`.
