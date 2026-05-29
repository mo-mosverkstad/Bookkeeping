# Syntax Manual

This document describes how to write cell content in the Bookkeeping
application. All cells use the **rich** format — plain text by default,
with inline embeddings for rendered expressions.

---

## Plain Text

Any text without embedding markers renders as plain text:

```
This is plain text. Numbers like 42 and symbols like + stay as-is.
```

Multiple lines are supported. Each line renders on its own line in the cell.

---

## Embedding Syntax

To render an expression with a specific grammar, use the embedding syntax:

```
type`content`
```

Where `type` is one of: `math`, `chem`, `geom`, `phys`.

The content between the backticks is parsed and rendered by the
corresponding grammar. If parsing fails, the full parser error message
is displayed in the cell.

---

## Math Embeddings — `math`...``

Renders mathematical expressions with proper formatting (fractions,
superscripts, subscripts, Greek letters, integrals, etc.).

### Operators

| Syntax | Renders as |
|--------|-----------|
| `+`, `-`, `*`, `/` | Arithmetic operators |
| `^` | Superscript (exponent) |
| `_` | Subscript |
| `=`, `!=`, `<=`, `>=` | Relational operators |
| `->` | Right arrow → |
| `~=` | Approximately ≈ |
| `:=` | Defined as ≡ |

### Greek Letters

Prefix with backslash: `\alpha` → α, `\beta` → β, `\gamma` → γ, etc.

| Syntax | Letter |
|--------|--------|
| `\a` | α |
| `\b` | β |
| `\g` | γ |
| `\d` | δ |
| `\e` | ε |
| `\p` | π |
| `\s` | σ |
| `\t` | τ |
| `\w` | ω |
| `\D` | Δ |
| `\S` | Σ |
| `\G` | Γ |
| `\inf` | ∞ |
| `\nabla` | ∇ |
| `\partial` | ∂ |

### Blackboard Bold

Double backslash: `\\R` → ℝ, `\\N` → ℕ, `\\Z` → ℤ, `\\C` → ℂ, `\\Q` → ℚ

### Functions

Standard function call syntax: `f(x)`, `sin(x)`, `cos(x)`, `tan(x)`,
`log(x)`, `ln(x)`, `sqrt(x)`, `exp(x)`

### Control Expressions (special forms)

Use curly braces for control expressions:

| Syntax | Meaning |
|--------|---------|
| `lim{x->a, f(x)}` | Limit as x approaches a |
| `\int{a, b, f(x)}` | Definite integral from a to b |
| `\S{k=0, n, a_k}` | Summation Σ from k=0 to n |
| `+{k=0, n, a_k}` | Summation (alternate) |
| `*{k=0, n, a_k}` | Product Π from k=0 to n |
| `\binom{n, k}` | Binomial coefficient |

### Matrices and Vectors

Square brackets with comma-separated rows:

```
[[1, 0], [0, 1]]        — 2×2 identity matrix
[a, b, c]               — row vector
[v]                     — vector name (bold)
```

### Absolute Value

Pipe characters: `|x - a|`

### Factorial

Exclamation mark: `n!`

### Derivatives

Prime notation: `f'(x)`, `f''(x)`, `f'''(x)`

### Ellipsis

Three dots: `...` renders as …

### Examples

```
math`x^2 + y^2 = r^2`
math`\int{0, 1, x^2} = 1/3`
math`lim{x->\inf, (1 + 1/x)^x} = e`
math`f'(x) = lim{h->0, (f(x+h) - f(x))/h}`
math`\\R^n -> \\R^m`
math`\S{k=0, \inf, a_k*x^k}`
math`[[a, b], [c, d]]`
```

---

## Chemistry Embeddings — `chem`...``

Renders chemical formulas, reactions, and equations.

### Compounds

Elements are uppercase letter optionally followed by lowercase:
`H2O`, `NaCl`, `H2SO4`, `C6H12O6`

Subscript numbers follow elements automatically.

### Charges

Parenthesized charges: `Na+`, `SO4(2-)`, `Fe(3+)`

### Reactions

Arrow operators:

| Syntax | Meaning |
|--------|---------|
| `->` | Forward reaction |
| `<->` | Reversible reaction |
| `<=>` | Equilibrium |

### State Symbols

Parenthesized: `(s)` solid, `(l)` liquid, `(g)` gas, `(aq)` aqueous

### Examples

```
chem`2H2 + O2 -> 2H2O`
chem`NaOH(aq) + HCl(aq) -> NaCl(aq) + H2O(l)`
chem`CH3COOH <=> CH3COO- + H+`
```

---

## Geometry Embeddings — `geom`...``

Renders geometric constructions as SVG diagrams.

### Primitives

| Syntax | Meaning |
|--------|---------|
| `Point(A, x, y)` | Named point at coordinates |
| `Segment(A, B)` | Line segment between points |
| `Line(A, B)` | Infinite line through points |
| `Ray(A, B)` | Ray from A through B |
| `Circle(C, r)` | Circle with center and radius |
| `Arc(C, r, start, end)` | Circular arc |
| `Triangle(A, B, C)` | Triangle |
| `Polygon(A, B, C, ...)` | Polygon |
| `Angle(A, B, C)` | Angle at vertex B |

### Constraints

| Syntax | Meaning |
|--------|---------|
| `Parallel(L1, L2)` | Lines are parallel |
| `Perpendicular(L1, L2)` | Lines are perpendicular |
| `Midpoint(M, A, B)` | M is midpoint of AB |
| `Intersection(P, L1, L2)` | P is intersection |

### Example

```
geom`Point(A, 0, 0)
Point(B, 4, 0)
Point(C, 2, 3)
Triangle(A, B, C)
Segment(A, B)`
```

---

## Physics Embeddings — `phys`...``

Renders physics diagrams (free body diagrams, mechanical systems).

### Bodies and Forces

| Syntax | Meaning |
|--------|---------|
| `Body(name, mass)` | Define a body |
| `Force(body, Fx, Fy)` | Apply force to body |
| `Velocity(body, vx, vy)` | Set velocity |
| `Acceleration(body, ax, ay)` | Set acceleration |
| `Fixed(point)` | Fixed support |
| `Roller(point, angle)` | Roller support |
| `Spring(A, B, k)` | Spring between points |
| `Damper(A, B, c)` | Damper between points |

### Example

```
phys`Body(block, 5)
Fixed(A)
Spring(A, block, 100)
Force(block, 0, -9.81*5)`
```

---

## Mixing Text and Embeddings

Embeddings can appear inline with text on the same line:

```
The Pythagorean theorem states math`a^2 + b^2 = c^2` for right triangles.
```

Multiple embeddings on one line:

```
Given math`x = 3` and math`y = 4`, then math`x + y = 7`.
```

Different embedding types on the same line:

```
The reaction chem`2H2 + O2 -> 2H2O` releases math`\DeltaH = -572 kJ/mol`.
```

---

## Keyboard Shortcuts (Source Editor)

| Shortcut | Action |
|----------|--------|
| Alt+Enter | Apply (commit cell without leaving) |
| Enter | Insert newline |
| Ctrl+Z | Undo (local to editor) |
| Ctrl+Y / Ctrl+Shift+Z | Redo (local to editor) |
| Escape | Dismiss association panels |

---

## Cell Behavior

- **Click a cell** → activates it, loads content into source editor
- **Edit + Apply (or Alt+Enter)** → updates cell, stays active
- **Click another cell** → auto-applies current cell, activates new cell
- **Click entity cell (column 0)** → shows association panels AND activates for editing

---

## Types Row

The second row of every CSV file is the types row. All cells use `rich`:

```csv
Name,Formula,Description
rich,rich,rich
Pythagorean theorem,math`a^2 + b^2 = c^2`,Right triangle relationship
```

The `rich` type is the universal default. Even if the types row says
something else (or is missing), cells fall back to rich rendering.
