# Study — Design & Planning

---

## Part I — Bookkeeping: The Superproduct

This section defines the full product vision. The Webapp is one delivery
vehicle of this larger system. Understanding the superproduct is necessary
to make good decisions about the Webapp.

---

### Target Definition

**Bookkeeping** is a personal knowledge storage system. Its purpose is to
store, organise, and retrieve all of the owner's known knowledge across
scientific and technical domains — mathematics, physics, chemistry,
biochemistry, biology, computer science, hardware, software, and firmware.

The core insight driving the design is:

> Every knowledge concept entity can be described by a set of internal
> properties and a set of associations to other concept entities.

This produces a tuple: `(internal properties, associations)`. Many concept
entities share the same set of property types, so they can be grouped into
a table where each row is one concept and each column is one property variant.
Properties that are constant across a group can be factored out into a
superordinate structure, creating a hierarchical association. Rows within a
table are sorted. This structure naturally reflects:

- **Chemistry / physics tables** — each compound, reaction, or physical
  constant is one row; properties are its characteristics
- **Mathematics** — each concept entity is a theorem, a formal definition,
  or a trick (an informal, non-general, heterogeneous solution to a subset
  of problems, e.g. integration techniques for expressions with roots)
- **Any domain** — the same tuple model applies

This is described as a **table + graph hybrid model**. The table is the
primary view for homogeneous entity collections; the graph captures
associations between entities across collections. The two are not in
conflict — they are complementary layers of the same underlying data.

---

### Knowledge Entity Model

```
Knowledge Entity
├── Internal properties     (scalar values, expressions, text, diagrams)
│   ├── Property A
│   ├── Property B
│   └── ...
└── Associations            (links to other entities, typed by vocabulary)
    ├── → Entity X  (type: "is-special-case-of")
    ├── → Entity Y  (type: "used-in-proof-of")
    └── ...
```

Entities of the same kind share a property schema → they form a **table**.
Tables can be linked to other tables via explicit associations → they form
a **graph of tables**.

Constant properties shared across a table can be factored into a
**superplace** (a parent node in the hierarchy), reducing redundancy and
making the structure more compact.

#### Table as view, not as model

The table is a *view* projected over a collection of entities that share
the same property schema. It is not the canonical data model. The same
entity participates in the graph regardless of which table it belongs to.
This distinction is critical: it means heterogeneous entity types (theorems,
tricks, definitions) are not forced into the same table just because they
are all "math concepts" — they each have their own table, and the graph
connects them.

#### Collation rule

> Same internal property tuple schema = same table.

If two entities do not share a schema, they belong in different tables.
There is no pressure to unify heterogeneous entities into one sparse table.
The graph handles the cross-type relationships.

#### Malleable schema

Table schemas are soft, not rigidly enforced. New columns can be added to
a table at any time; existing rows treat new columns as absent/null. The
schema is versioned per table so that old files remain readable. This
avoids the schema migration pain of strict relational databases while
preserving enough structure for consistent querying.

#### Querying: graph-filtered table projection

Querying the system means asking the graph to filter and reorder entities,
then projecting the result as a table. For example:

- "Show all theorems that use integration by parts" →
  graph traversal (filter by relation type `uses`, target = integration-by-parts entity)
  → project matching entities as a table
- "Show all entities related to the Fundamental Theorem of Calculus" →
  graph neighbourhood query → project as a table

This is a hybrid database model: graph storage + tabular projection. Basic
filtering (by property value or relation type) is the primary query pattern.
Full graph traversal queries are deferred to a later phase.

---

### Association Vocabulary

Associations are not free-text labels. Each association type is drawn from
a **controlled per-domain vocabulary** of named, directed relation pairs.
This ensures consistency without requiring a constraint engine.

Each relation type has:
- A **name** (the forward direction)
- An **inverse name** (the reverse direction), or marked **symmetric** if
  the relation is the same in both directions
- The **domain** it belongs to

Example vocabularies:

```
Math relations:
  generalizes          ↔  is-special-case-of
  proves               ↔  is-proved-by
  uses                 ↔  is-used-by
  defines              ↔  is-defined-by
  equivalent-to            (symmetric)

Chemistry relations:
  reacts-with              (symmetric)
  produces             ↔  is-produced-by
  is-isomer-of             (symmetric)
  catalyzes            ↔  is-catalyzed-by
```

New relation types are added to the vocabulary as needed. The vocabulary
is curated, not inferred — consistency is maintained by the controlled set
of names, not by a rules engine.

---

### Entity Granularity

Granularity cannot be defined by a single universal rule. It is
domain-dependent and refined empirically as data is entered. The guiding
principle is:

> An entity is the smallest unit that is independently referable and
> reusable across the graph. Anything that is only ever contained within
> one parent and never referenced from anywhere else is a property of
> that parent, not a separate entity.

For mathematics, the natural granularity is:

| Concept | Status | Reason |
|---------|--------|--------|
| Theorem | Entity | Referenced by proofs, corollaries, applications |
| Definition | Entity | Referenced by theorems, examples |
| Lemma | Entity | Referenced by theorem proofs |
| Trick | Entity | Referenced by problem types |
| Proof | Property of its theorem | Unless the proof technique is independently referenced |
| Corollary | Entity if cross-referenced, otherwise property | Depends on usage |
| Example | Property of its parent concept | Unless it is a canonical example referenced widely |

This table is a starting point. Granularity decisions are revisited when
the same sub-concept appears in multiple places (too coarse — split it)
or when navigating to a single fact requires too many hops (too fine —
merge it).

---

### Data Representation

Knowledge data must be stored in a way that is both human-readable for
debugging and compact for performance. Two representations are planned:

#### Human-readable format (CSV / DSL text)
- Plain text, UTF-8
- Mathematical expressions, chemical equations, diagrams etc. are written
  in domain-specific syntax — math syntax is the first, covering algebra,
  calculus, and linear algebra
- Suitable for version control, manual editing, and debugging
- CSV files are the transitional storage format

#### Binary format (custom encoding)
- Designed for low entropy and fast parsing
- Plain text blobs remain UTF-8
- Structured data blobs (math expressions, diagrams, etc.) use a custom
  binary encoding per data type
- The encoding is versioned and tied to the DSL syntax version
- Example sketch for mathematical expressions:
  - `0x00` — NULL (reserved, essential)
  - `0x01` — addition operator
  - `0x02` — subtraction operator
  - `0b10XXXXXX` — start of integer limb, XXXXXX = value bits
  - `0b0XXXXXXX` — intermediate limb
  - `0b1XXXXXXX` — terminating limb
  - Latin letters, Greek letters, operators, skews — assigned sequentially
- The exact encoding scheme has not been fully designed yet

#### Relationship between the two formats
The human-readable and binary formats are two representations of the same
data. A tool must be able to convert between them losslessly. The DSL syntax
is the human-facing surface; the binary encoding is the storage-optimised
surface. Both are governed by the same versioned schema.

---

### Grammar Ecosystem

The syntax family is named by domain. Each domain has its own grammar,
parser, and renderer, delivered as a plugin. The grammars are not
extensions of each other — they are independent, but they share a common
base layer.

**Math syntax is the base layer.** All other domain grammars embed math
syntax expressions for numeric and algebraic values (coefficients,
magnitudes, coordinates, rates, etc.). Math syntax is therefore a declared
dependency of every other grammar plugin.

```
Base layer
  Math syntax     — algebra, calculus, linear algebra
      ↑ embedded by all domain grammars for scalar/algebraic values

Domain grammar plugins
  Geometry syntax     — points, lines, angles, constructions, proofs
  Physics syntax      — free-body diagrams: forces, vectors, bodies, constraints
  Chemistry syntax    — reactions: compounds, arrows, stoichiometry, states
  Pathway syntax      — biological/chemical pathways: nodes, activation/inhibition
  Structural syntax   — engineering: members, loads, supports, joints
  (others TBD)
```

The plugin interface must support **grammar composition**: a plugin
declares which other plugins it embeds for sub-expressions. The PEG
engine supports this naturally — a grammar rule can delegate to another
grammar's rules if they share the same parser instance. The plugin system
formalises this as a declared dependency list.

Each domain grammar is designed and implemented in its own phase, after
math syntax is stable. The order of domain grammars is determined by
which knowledge domains are populated first.

---

### Plugin Architecture

The rendering and parsing of data blobs is designed to be **plugin-based**:

- Each data type (math expression, chemical equation, diagram, plain text,
  etc.) is handled by a dedicated plugin
- A plugin provides: a parser (text → internal representation), a renderer
  (internal representation → visual output), and optionally a binary encoder/
  decoder
- Plugins can be composed — a table cell can contain a math expression blob
  rendered by the math syntax plugin, inside a table rendered by the table plugin
- Math syntax (the math expression DSL + renderer) is the first plugin

This architecture allows the system to be extended with new data types without
modifying the core storage or table engine.

---

### Future Directions (Unresolved)

- **Table compression** — exploiting the shared-schema structure to compress
  repeated or similar values across rows/columns. Not yet designed.
- **Tooling around the data** — using the stored knowledge for computation,
  search, cross-referencing, or other useful operations. Not yet scoped.
- **Advanced graph queries** — full graph traversal, multi-hop path queries,
  and inference over the association vocabulary. Deferred to a later phase.

---

### Open Questions

These are genuine unresolved design questions. They should be revisited as
the project matures.

1. **How should the binary encoding be versioned?**
   The encoding must be tied to the DSL syntax version so that old files
   remain readable. The versioning scheme is not yet designed. Binary
   encoding is deferred until the system has real data and real performance
   measurements — premature optimization here would create technical debt.

2. **How should associations be physically stored?**
   Foreign-key style references, embedded copies, or a separate association
   table? Each has different tradeoffs for query performance and data
   integrity. Not yet decided.

3. **How should the plugin system be formalised?**
   The minimal interface is: `{ type_id, version, parse(), render() }` with
   `encode()`/`decode()` added in the binary format phase. Full versioning,
   discovery, and sandboxing are not yet defined.

---

## Part II — Webapp: Delivery Vehicle

The Webapp is the web-browser-based implementation of the Bookkeeping
superproduct. It delivers the full Bookkeeping feature set as a client-side
web application.

In the current phase, only the **expression rendering** subsystem is
implemented. The Webapp will grow to include the full table editor, file
reader, and plugin system as later phases are completed.

---

### Webapp Target Definition

A browser-based application that:
- Reads Bookkeeping data files (CSV in early phases, binary in later phases)
- Displays knowledge tables with proper visual rendering of all data types
- Allows the user to navigate, search, and edit knowledge entities
- Renders mathematical expressions, diagrams, and other structured data
  using the plugin system

The Webapp uses the domain-specific syntax family for data input and
rendering. Math syntax is the first implemented, covering algebra,
calculus, and linear algebra, designed for fast keyboard input without
requiring LaTeX.

#### Identifier System (Math Syntax)

The parser is responsible only for syntactic structure. It does not know
about Greek, Hebrew, Persian, or any other script. It does not know what
`sin`, `alpha`, `ha`, or `fa` mean. All backslash identifiers are treated
identically by the parser — they are just tokens with a raw name and an
optional skew modifier.

The semantic renderer is responsible for meaning. Given a raw name, it
calls a glyph lookup function that maps the name to the correct Unicode
character. If no mapping exists, the name is rendered as-is.

**Parser produces — `IdentifierNode`:**
```ts
interface IdentifierNode {
    type: "Identifier";
    raw: string;         // everything after the prefix: "fa", "sin", "ha", "a"
    skew: "none" | "left" | "right";
    blackboard: boolean; // true for \\R, \\N etc.
}
```

**Grammar rules — six patterns, no script knowledge:**

| Rule | Regex | Produces |
|------|-------|---------|
| `BlackboardBoldIdentifier` | `/^\\\\[A-Z]/` | `{ raw: "R", blackboard: true }` |
| `SkewedBackslashIdentifier` | `/^\\[0-9]+[a-zA-Z][a-zA-Z0-9]*/` | `{ raw: "fa", skew: "right" }` |
| `BackslashIdentifier` | `/^\\[a-zA-Z][a-zA-Z0-9]*/` | `{ raw: "fa", skew: "none" }` |
| `RightSkewLatinIdentifier` | `` /^`[0-9]+[a-zA-Z]/ `` | `{ raw: "T", skew: "right" }` |
| `LeftSkewLatinIdentifier` | `` /^`[a-zA-Z]/ `` | `{ raw: "a", skew: "left" }` |
| `PlainIdentifier` | `/^[a-zA-Z]/` | `{ raw: "a", skew: "none" }` |

**Renderer resolves meaning via `GLYPH_TABLE`:**
```ts
function resolveGlyph(raw: string): string {
    return GLYPH_TABLE[raw] ?? raw;
}
```

Examples:
- `\a` → `{ raw: "a" }` → `GLYPH_TABLE["a"]` → `α`
- `\fa` → `{ raw: "fa" }` → `GLYPH_TABLE["fa"]` → no entry → renders `fa`
- `\faa` → `{ raw: "faa" }` → `GLYPH_TABLE["faa"]` → `ا` (Persian alef)
- `\ha` → `{ raw: "ha" }` → `GLYPH_TABLE["ha"]` → `ℵ`
- `\sin` → `{ raw: "sin" }` → no entry → renders `sin` ✓
- `\pm` → `{ raw: "pm" }` → `GLYPH_TABLE["pm"]` → `±`
- `\1fa` → `{ raw: "fa", skew: "right" }` → `ا` with right-skew CSS

Skew is used in physics to disambiguate conflicting symbols. For example,
`T` is period time and `` `1T `` is temperature — visually distinct,
unambiguously encoded in ASCII.

unambiguously encoded in ASCII. The skew index is open for future
extension to additional variants without breaking the grammar.

#### Vector/Matrix Name Decorator

`[a]` denotes the **vector or matrix named `a`**, rendered with an arrow
over it (`a⃗`). It is a name decorator, not a container literal. The
brackets signal that `a` is a vector/matrix quantity, visually
distinguishing it from the scalar `a`.

The parser distinguishes by content inside `[...]`:
- `[single_identifier]` — name decorator → `VectorNameNode`, renders as `a⃗`
- `[expr, expr, ...]` — row vector literal → `MatrixNode`
- `[[row], [row], ...]` — matrix literal → `MatrixNode`

Name decorators only accept a single identifier (with optional skew
prefix). `[a+b]` is not a name decorator — it is a 1-element row vector.

#### Math Syntax — Phase 1 Scope

| Input | Meaning |
|-------|---------|
| `2+3` | Addition |
| `2-3` | Subtraction |
| `2*3` | Explicit multiplication |
| `2x` | Implicit multiplication |
| `2/3` | Division (rendered as fraction) |
| `x^2` | Exponentiation (right-associative) |
| `x^2^3` | Right-associative chain: x^(2^3) |
| `-x` | Unary negation |
| `(x+1)` | Grouping parentheses |
| `f(x)` | Function call |
| `x_i` | Subscript |
| `` `a `` | Left-skewed (italic) identifier |
| `` `1T `` | Right-skewed identifier (e.g. temperature T) |
| `\a` | Greek letter α |
| `\1a` | Right-skewed Greek α |
| `\int{a, b, f(x)}` | Integral with bounds and body |
| `\sqrt{x}` | Square root |
| `\name{...}` | Generic control expression |

---

### Feasibility Analysis

#### What is straightforward
- PEG parsers are well-understood and easy to implement from scratch in
  TypeScript without dependencies
- HTML/CSS can render fractions, superscripts, and subscripts natively
- Vite provides instant hot-reload for rapid iteration
- The plugin concept maps cleanly to TypeScript modules

#### What requires care
- **Operator precedence** must be encoded correctly in the grammar rule hierarchy
- **Implicit multiplication** interacts subtly with unary signs — a naive
  implementation steals `+` and `-` from the additive level
- **Right-associativity** of `^` requires a right-fold, not the default left-fold
- **Parenthesisation in rendering** must be computed from the AST, not the input
- **Binary file format** design is non-trivial and must be done carefully to
  avoid future incompatibility
- **Plugin interface** must be stable enough to not require breaking changes
  as new plugins are added

#### What is out of scope for Phase 1
- File reading (CSV or binary)
- Table display and editing
- Multi-line expressions
- Equation editing (cursor, selection)
- Matrix and piecewise notation (CSS is prepared but not wired)
- Vector name decorator `[a]`
- Binary encoding
- Plugin formalisation

---

### Implementation Proposal

Use a hand-written **PEG parser** with a grammar defined as a plain TypeScript
data structure. The grammar drives a recursive descent engine (`PEGParser`)
that produces an **AST**. The AST is walked by a **renderer** that produces
`HTMLElement` nodes inserted into the DOM.

This approach was chosen because:
- No build-time code generation step needed
- The grammar is inspectable and modifiable at runtime
- TypeScript types enforce correctness of AST node shapes
- No external dependencies beyond Vite
- The parser/renderer separation already anticipates the plugin architecture

---

### Phase Breakdown

Each phase ends with a concrete demo that can be run in the browser.
A phase is not complete until its demo works end-to-end.

---

#### Phase 1 — Math Syntax: Expression Parser & Renderer ✅ *complete*

**Goal:** Prove that math syntax notation can be parsed and rendered
correctly in the browser with no external dependencies.

**Concrete tasks:**
- [x] Implement the PEG engine: `PEGParser` class with literal, regex,
      sequence, choice, repeat, and rule-reference match types
- [x] Implement whitespace skipping and structured error reporting
      (line, column, caret, expected tokens)
- [x] Define the math syntax grammar covering: additive, multiplicative
      (explicit and implicit), power (right-associative), unary prefix,
      postfix (call, control, subscript), primary (number, identifier,
      parenthesised expression)
- [x] Implement plain Latin identifier (`a`), left-skewed (`` `a ``),
      right-skewed (`` `1a ``), Greek (`\a`), right-skewed Greek (`\1a`)
- [x] Implement the HTML renderer for all AST node types: number,
      identifier (with skew rendering and GLYPH_TABLE lookup), binary expression (with
      automatic parenthesisation), unary, call, control (`\int`,
      `\sqrt`, generic), subscript
- [x] Wire up the basic UI: text input, Render button, result div,
      error message div
- [x] Verify correct operator precedence and right-associativity of `^`
- [x] Verify implicit multiplication does not steal unary signs from additive

**Completion criteria:**
- All grammar rules parse without error
- Operator precedence is mathematically correct
- Skewed and backslash identifiers parse and render with correct visual form
- Parse errors produce a readable message with location
- The renderer produces visually correct HTML for all node types

**Demo:** Single-page app with a text input. Type a math syntax expression
and click Render. The expression appears formatted below the input.
Error messages appear in red if the input is invalid.

Demo inputs to show:
| Input | Expected visual |
|-------|-----------------|
| `-2*(3+5)*4e^x^2` | `(-2)(3 + 5)(4)(e`^`(x`^`2))` |
| `a/b + c/d` | stacked fractions joined by `+` |
| `\int{0, 1, x^2}` | integral symbol with bounds 0, 1 and body `x²` |
| `\sqrt{x+1}` | radical over `x + 1` |
| `` `1T / `1t `` | right-skewed T over right-skewed t |
| `\a + \1b` | α + right-skewed β |

---

#### Phase 2 — Math Syntax: Linear Algebra, Rollout Notation & Metavariables

**Goal:** Extend math syntax to cover linear algebra constructs (vector
name decorator, matrix literals, dot product, index notation), rollout
operators (`+{...}`, `*{...}`), piecewise functions, and the metavariable
annotation model.

##### Design decisions for this phase

**Vector/matrix name decorator `[a]`**

`[a]` denotes the vector or matrix **named** `a`, rendered with an arrow
over it (`a⃗`). It is a name decorator, not a container. The brackets
signal that `a` is a vector/matrix quantity, visually distinguishing it
from the scalar `a`.

The parser distinguishes by content inside `[...]`:
- `[single_identifier]` — name decorator → `VectorNameNode`, renders as `a⃗`
- `[expr, expr, ...]` — row vector literal → `MatrixNode`
- `[[row], [row], ...]` — matrix literal → `MatrixNode`

Name decorators only accept a single identifier (with optional skew
prefix). `[a+b]` is not a name decorator — it is a 1-element row vector.

Edge cases:
- `[`1T`]` — right-skewed identifier inside decorator → valid, treated as
  name decorator for the right-skewed identifier `` `1T ``
- `[a_i]` — `a_i` is a `SubscriptExpression`, not a bare identifier, so
  this is a 1-element row vector, not a name decorator. To subscript a
  vector name, write `[a]_i` instead
- `[[a]]` — outer `[` sees inner `[a]` as its first element, which is a
  `VectorNameNode` not a plain identifier, so this is a 1×1 matrix
  containing the vector named `a`

---

**Array / vector / matrix literals**

Vectors and matrices are unified under one construct: a rectangular array
of expressions. Shape is determined by nesting depth:

```
[a]                  →  vector/matrix named a, renders as a⃗
[a, b, c]            →  1×3 row vector literal
[[a], [b], [c]]      →  3×1 column vector literal
(a, b, c)            →  equivalent to [[a], [b], [c]], column vector
[[a, b], [c, d]]     →  2×2 matrix literal
```

The `(a, b, c)` column vector convention reuses the parenthesis character.
The parser disambiguates by comma presence at the top level:
- `(expr)` — no commas → grouping, unwrap to inner expression
- `(expr, expr, ...)` — commas present → column vector / `MatrixNode`
- `(expr)` with one element and no commas → grouping (not a 1×1 vector)

Edge cases that must be explicitly rejected:
- `(a,)` — trailing comma → parse error
- `()` — empty parens as standalone Primary → parse error (empty argument
  list is only valid inside a function call suffix)

---

**Dot product `.`**

`u.v` is the dot product. The `.` is a binary operator at multiplicative
precedence. Rendered as `u · v` (centre dot `·`).

*Issue — `digit.identifier` edge case:*
The number regex `/^([0-9]+(\.[ 0-9]*)?|\.[0-9]+)/` matches `3.` as the
number `3.0` (zero fractional digits). So `3.v` is parsed as the number
`3.0` implicitly multiplied by `v`, not as `3 · v`. This is technically
an ambiguity, but in practice dot product of a bare scalar literal with
a vector (`3.v`) is unusual and arguably ill-typed. The behaviour is
acceptable and consistent.

*Resolution:* Document the edge case. If `3 · v` is ever needed with a
literal coefficient, write `3 .v` (space before dot) or `(3).v`. The
space causes the number token to be fully consumed before the dot is seen.

---

**Cross product and scalar multiplication**

`u * v` is parsed identically whether the operands are vectors or scalars.
The AST node is always `BinaryExpression(*)`. The semantic layer (above
the parser) resolves whether `*` means cross product or scalar multiplication
based on operand types. The renderer shows `×` for vector×vector and
juxtaposition for scalar×vector, driven by type annotation, not syntax.

---

**Index notation `A[k]`**

`A[k]` is array indexing — the k-th element of A. This is semantically
distinct from the subscript label `A_k`. The AST node is `IndexExpression`
(not `SubscriptExpression`). The renderer displays it as `A_k` (subscript)
but the node type preserves the indexing semantics for the evaluator.
`[` is currently unused in the grammar so there is no conflict.

`[a][k]` — vector named `a` indexed by `k` — parses as
`IndexExpression(VectorNameNode(a), k)`, which is the k-th element of
vector `a`. Semantically correct.

---

**Determinant**

`det(A)` is used for determinant. `|expr|` is reserved for absolute value
only. This avoids the `|...|` ambiguity (absolute value vs determinant)
entirely. `det(A - \l*I)` for eigenvalue equations is already supported
by the existing function call syntax.

---

**Rollout operators `+{...}` and `*{...}`**

```
+{k=0, n, A[k]}    →  A[0] + A[1] + ... + A[n]
*{k=0, n, A[k]}    →  A[0] * A[1] * ... * A[n]
```

*Issue — whitespace breaks the lookahead approach:*
The original design proposed detecting `+` or `*` followed by `{` as a
lookahead at the `Additive`/`Multiplicative` level. This fails because
the parser skips whitespace before each token. By the time `+` is seen
at the `Additive` level, it has already been committed to as an additive
operator. `+ {k=0, n, A[k]}` (with a space) would parse `+` as additive
and then fail on `{`.

*Solution — match `+{` and `*{` atomically at the `Primary` level:*
Add a `RolloutExpression` rule as a new option in `Primary`, tried before
`Number` and `Identifier`. It matches the two-character sequence `+{` or
`*{` as a single regex `/^[+*]\{/` with no whitespace skip between the
operator and the brace. Because `Primary` is evaluated before `Additive`
and `Multiplicative` ever see the `+` or `*`, the rollout form is consumed
whole and the operator never reaches the additive/multiplicative rules.

```
Primary → RolloutExpression | Number | Identifier | ( Expression ) | ...

RolloutExpression:
  regex /^[+*]\{/ — matches opening token atomically (no skip inside)
  then: ArgumentList
  then: literal "}"
  → ControlExpression { name: "+" or "*", args: [...] }
```

The AST node is `ControlExpression` with `name: "+"` or `name: "*"`,
consistent with `\int`, `\sqrt`, and other control expressions. The
renderer handles `name === "+"` and `name === "*"` as rollout operators,
rendering them with large operator symbols and index bounds.

Important: `+{...}` must be written without a space between `+` and `{`.
This is a deliberate syntactic constraint, not a limitation.

---

**Combined subscript and superscript: `x_i^2`**

*Issue — current grammar gives `(x_i)^2` not `x_i^2`:*
In the current grammar, `Postfix` collects suffixes left-to-right, so
`x_i` becomes `SubscriptExpression(x, i)`. Then `Power` wraps the whole
result: `BinaryExpression(^, SubscriptExpression(x, i), 2)`. This renders
as `(x_i)^2` — the subscripted expression raised to a power — not as `x`
with subscript `i` and superscript `2` simultaneously on the same base.

Mathematically `x_i^2` means `x` with `i` as subscript and `2` as
superscript both attached to the same base character `x`. These are
distinct: `(x_i)^2` squares the subscripted variable, while `x_i^2`
is a notational convention for a variable with two decorators.

*Solution — `SubSuperscriptExpression` node produced in `Power`'s build:*
Add a new AST node:
```ts
interface SubSuperscriptExpression {
    type: "SubSuperscriptExpression";
    base: ASTNode;
    subscript: ASTNode;
    superscript: ASTNode;
}
```

In `Power`'s `build` function, after right-folding the exponent chain,
check if the left operand is a `SubscriptExpression`. If so, instead of
wrapping it in a `BinaryExpression(^)`, produce a `SubSuperscriptExpression`
that combines the base, subscript, and superscript into one node:

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

This requires no grammar rule changes — only the `build` function and a
new AST node type. The renderer produces:
```html
<span class="subsuperscript">
  [base]
  <span class="scripts">
    <sup>[superscript]</sup>
    <sub>[subscript]</sub>
  </span>
</span>
```
With CSS stacking `<sup>` above `<sub>` on the right of the base.

Note: `(x_i)^2` (explicit parentheses) still produces
`BinaryExpression(^, SubscriptExpression(x, i), 2)` and renders as a
power of a subscripted expression, which is the correct interpretation
when the user explicitly groups with parentheses.

---

**Metavariables**

Metavariables are syntactically identical to regular identifiers. The
parser produces the same `Identifier` AST node for both. The distinction
is semantic and declared at the knowledge-entity level, not inline in
the expression syntax. A metadata field on the entity lists which
identifiers are metavariables in that expression. A semantic annotation
pass walks the AST after parsing and tags `Identifier` nodes accordingly.
The renderer styles metavariables distinctly (e.g. bold or coloured).

Example — generic fractional equation solution schema:
```
+{k=0, n, B[k]R[k]=S}
```
Here `k`, `n`, `B`, `R`, `S` are all metavariables. The expression
describes a class of equations, not a specific one.

---

**Math symbol reference and notation**

All symbols below are rendered-based: the parser produces a node, and the
renderer maps it to the correct Unicode glyph or HTML structure. The syntax
is designed to be concise and typeable on a standard keyboard.

*Relation operators* — new precedence level below additive.
`Relational → Additive (rel_op Additive)?` — not chained, since
`a = b = c` is not standard math notation.

| Syntax | Symbol | Meaning |
|--------|--------|---------|
| `=` | = | equals |
| `!=` | ≠ | not equal |
| `<` | < | less than |
| `>` | > | greater than |
| `<=` | ≤ | less or equal |
| `>=` | ≥ | greater or equal |
| `~=` | ≈ | approximately equal |
| `:=` | ≡ | defined as / identical |
| `~` | ∝ | proportional to |
| `<<` | ≪ | much less than |
| `>>` | ≫ | much greater than |
| `->` | → | approaching / function mapping |
| `\sub` | ⊂ | subset |
| `\supset` | ⊃ | superset (`\sup` reserved for supremum) |
| `\sube` | ⊆ | subset or equal |
| `\supe` | ⊇ | superset or equal |

*Set operators* — `\inter` binds tighter than `\union` (mirrors `*` vs `+`).
`\in` and `\notin` are relation operators.

| Syntax | Symbol | Meaning | Type |
|--------|--------|---------|------|
| `\union` | ∪ | union | binary |
| `\inter` | ∩ | intersection | binary |
| `\diff` | ∖ | set difference | binary |
| `\cross` | × | Cartesian product | binary |
| `\comp` | ∁ | complement | unary prefix |


| `\empty` | ∅ | empty set | constant |
| `\pow` | 𝒫 | power set | unary prefix |

*Blackboard bold number sets* — double backslash `\\` prefix to avoid
conflict with single-backslash Greek letters (`\N`=Ν Nu, `\Z`=Ζ Zeta,
`\R`=Ρ Rho, `\C`=Χ Chi, `\H`=Η Eta, `\P`=Π Pi).

| Syntax | Symbol | Meaning |
|--------|--------|---------|
| `\\N` | ℕ | natural numbers |
| `\\Z` | ℤ | integers |
| `\\Q` | ℚ | rationals |
| `\\R` | ℝ | reals |
| `\\C` | ℂ | complex numbers |
| `\\H` | ℍ | quaternions |
| `\\P` | ℙ | primes / projective space |

Grammar rule: `BlackboardBoldIdentifier` matches `/^\\\\[A-Z]/` (two
backslashes followed by one uppercase letter), tried before `BackslashIdentifier`.

*Logic operators* — `\and` binds tighter than `\or`.

| Syntax | Symbol | Meaning | Type |
|--------|--------|---------|------|
| `\and` | ∧ | logical and | binary |
| `\or` | ∨ | logical or | binary |
| `\not` | ¬ | logical not | unary prefix |
| `\imp` | ⟹ | implies | binary |
| `\iff` | ⟺ | if and only if | binary |
| `\all` | ∀ | for all | quantifier prefix |
| `\ex` | ∃ | there exists | quantifier prefix |
| `\nex` | ∄ | there does not exist | quantifier prefix |

*Calculus and analysis*

| Syntax | Symbol | Meaning | Notes |
|--------|--------|---------|-------|
| `\inf` | ∞ | infinity | |
| `\d` | d | differential | plain upright d, used as `\d x` in integrals |
| `\\d` | ∂ | partial derivative | double backslash to distinguish from `\d` |
| `\nabla` | ∇ | nabla / gradient | |
| `\S{...}` | Σ | summation | `\S` = uppercase Sigma, used as control expression |
| `\P{...}` | Π | product | `\P` = uppercase Pi, used as control expression |
| `\lim{x->a, f(x)}` | lim | limit | `->` means approaching |
| `\pm` | ± | plus-minus | backslash identifier, maps to ± |
| `\mp` | ∓ | minus-plus | backslash identifier, maps to ∓ |

Note: `->` serves dual purpose — as a relation operator meaning "approaching"
in limits (`x -> a`), and as function mapping (`f: A -> B`). The parser
produces the same `BinaryExpression(->)` node in both cases; the semantic
layer distinguishes the two uses from context.

*Absolute value and norm* — both use `|...|` syntax. The renderer
automatically distinguishes them by the inner node type:
- `|x|` where `x` is a scalar → renders as `|x|` (absolute value)
- `|[x]|` where `[x]` is a `VectorNameNode` or `MatrixNode` → renders
  as `‖x‖` (norm with double bars)

No separate `\abs` or `\norm` syntax is needed.

*Miscellaneous*

| Syntax | Symbol | Meaning |
|--------|--------|---------|
| `\floor{x}` | ⌊x⌋ | floor |
| `\ceil{x}` | ⌈x⌉ | ceiling |
| `x!` | x! | factorial (postfix suffix) |
| `\binom{n,r}` | ⁿCᵣ | binomial coefficient |
| `->` | → | function mapping (same token as approaching) |
| `\circ` | ∘ | function composition |
| `\oplus` | ⊕ | direct sum / XOR |
| `\otimes` | ⊗ | tensor product |
| `\inner{x,y}` | ⟨x,y⟩ | inner product |
| `\bar{x}` | x̄ | overline / complex conjugate |
| `\hat{x}` | x̂ | hat |
| `\tilde{x}` | x̃ | tilde |

---

**Extended identifier scripts**

The parser has no concept of scripts. All backslash identifiers are one
token. The `GLYPH_TABLE` in the renderer is the sole place where script
conventions are encoded. Adding a new script = adding entries to the
table. No grammar change ever needed.

The naming convention for multi-script entries uses a short prefix in the
raw name to namespace each script:

| Raw name prefix | Script | Example raw | Glyph |
|----------------|--------|-------------|-------|
| (single letter) | Greek | `a` | α |
| `h` + letter | Hebrew | `ha` | ℵ |
| `cy` + letter | Cyrillic | `cya` | а |
| `am` + letter | Armenian | `ama` | Ա |
| `gn` + letter | Georgian | `gna` | ა |
| `fa` + letter | Persian/Farsi | `faa` | ا |

These are naming conventions in the lookup table, not grammar rules.
`\fa` is a perfectly valid backslash identifier with raw name `fa`.
It does not conflict with `\f` (phi) + `a` because the greedy regex
consumes `\fa` as one token. `GLYPH_TABLE["fa"]` has no entry, so
`\fa` renders as the text `fa`. `GLYPH_TABLE["faa"]` = `ا`, so
`\faa` renders as Persian alef.

Skew index comes immediately after `\`, before the raw name:
`\1ha` → `{ raw: "ha", skew: "right" }` → right-skewed ℵ.

*Hebrew letters used in mathematics:*

| Input | Skewed | Glyph | Name | Use |
|-------|--------|-------|------|-----|
| `\ha` | `\1ha` | ℵ | aleph | cardinal numbers (ℵ₀, ℵ₁, ...) |
| `\hb` | `\1hb` | ℶ | beth | beth numbers |
| `\hg` | `\1hg` | ℷ | gimel | gimel function |
| `\hd` | `\1hd` | ℸ | dalet | dalet function |

*Extended scripts — use cases and priority:*

- **Hebrew** (`h` prefix) — Phase 2: needed for set theory cardinal numbers
- **Cyrillic** (`cy` prefix) — later phase: metavariables when Latin+Greek exhausted
- **Armenian** (`am` prefix) — later phase: architectural metavariables
- **Georgian** (`gn` prefix) — later phase: second-tier architectural metavariables
- **Persian** (`fa` prefix) — later phase: third-tier or domain-specific extension

*Implicit multiplication between backslash identifiers:*

The `BackslashIdentifier` regex `/^\\[a-zA-Z][a-zA-Z0-9]*/` is greedy
and consumes the entire alphanumeric run as one token. After consuming
`\ca`, the parser position is at `\cb`, which starts a new identifier.
The `ImplicitPower` rule starts from `Postfix` → `Primary` → `Identifier`,
so a `\`-prefixed identifier is a valid implicit factor.

`\ca\cb\cg` parses as `\ca * \cb * \cg` — implicit multiplication works
between backslash identifiers without explicit `*`. Explicit `*` also
accepted: `\ca*\cb*\cg` produces the same AST.


---

**Phase 2 grammar audit — gaps and conflicts**

The following issues were identified by reviewing all Phase 2 rules against
each other and against the existing Phase 1 grammar. Each issue is recorded
with its root cause and resolution.

*Gap 1 — `->` has no grammar rule*

`->` appears in the symbol table and in `\lim{x->a, f(x)}` but no grammar
rule defines it. Resolution: add `->` as a two-character literal in the
`Relational` operator choices, tried before `>` to prevent `>` consuming
the second character.

*Gap 2 — `|...|` absolute value / norm has no grammar rule*

`|x|` and `|[x]|` are described in the symbol table but `|` is currently
unused in the grammar. Resolution: add `AbsoluteValueExpression` as a new
`Primary` option: `| Expression |` → `AbsoluteValueNode`. The renderer
checks the inner node type: `VectorNameNode` or `MatrixNode` → norm `‖x‖`,
otherwise → absolute value `|x|`.

*Gap 3 — `x!` factorial has no grammar rule*

Listed as a postfix suffix but no `FactorialSuffix` rule is defined.
Resolution: add `FactorialSuffix` to `Postfix`'s suffix choices, matching
the literal `!` and producing `FactorialExpression(base)`.

*Gap 4 — Named parameter `n=0` in control expressions is unparseable*

`\sum{n=0, \inf, f(n)}` requires `n=0` to parse as an assignment argument.
The current `ArgumentList` only accepts `Expression` items, and `=` is a
relational operator that would parse `n=0` as `BinaryExpression(=, n, 0)`.
Resolution: this is actually fine — `n=0` parses as a relational expression
`BinaryExpression(=, n, 0)`. The renderer for `\sum` and `\lim` interprets
the first argument as a bound specification and renders it accordingly.
No grammar change needed; the renderer handles the convention.

*Gap 5 — `BlackboardBoldIdentifier` rule not defined*

`\\N`, `\\Z`, `\\R` etc. are described but no grammar rule is specified.
Resolution: add `BlackboardBoldIdentifier` rule matching `/^\\\\[A-Z]/`
(two literal backslashes + one uppercase letter), tried before
`BackslashIdentifier` in the `Identifier` choice list. The `raw` field stores
the uppercase letter; the renderer maps it to the blackboard bold glyph.

*Gap 6 — `Expression` top level not updated to include `Relational`*

The `Expression` rule currently points to `Additive`. With relation
operators added, `Expression` must point to `Relational`, which points to
`Additive`. This makes `=`, `<`, `->` etc. valid at the top level and
inside `ArgumentList` (enabling `x->a` inside `\lim{...}`).
Resolution: `Expression → Relational → Additive → Multiplicative → ...`

*Gap 7 — `\mapsto` in symbol table but not in concrete tasks*

`\mapsto` (↦) appears in the miscellaneous table but is absent from the
It is a backslash identifier with raw name `mapsto` that maps to the mapsto glyph in the renderer.


*Conflict 1 — `~` vs `~=` ordering*

Both start with `~`. If `~` is tried first, `~=` would parse as `~`
(proportional) followed by `=` (equals relation). Resolution: in the
`Relational` operator choices, try `~=` before `~`.

*Conflict 2 — `<<` vs `<`, `>>` vs `>`*

`<<` and `>>` must be tried before `<` and `>` respectively in the
relational operator choices. Resolution: order choices longest-first.

*Conflict 3 — `\not` vs `\notin`*

`\notin` starts with `\not`. The `BackslashIdentifier` regex is greedy and
would consume `\notin` as a single identifier named `notin`. This is
actually correct — `\notin` is a backslash identifier that maps
to ∉, and `\not` maps to ¬. No conflict at the grammar level since both
are consumed as full identifiers by the greedy regex. The renderer
distinguishes them by name. ✓ Not a real conflict.

*Conflict 4 — `\inner` vs `\in` vs `\inter` vs `\inf`*

All start with `\in`. The greedy `BackslashIdentifier` regex
`/^\\[a-zA-Z][a-zA-Z0-9]*/` consumes the longest match, so `\inner`,
`\inter`, `\inf`, `\in` are all consumed as distinct full identifiers.
The renderer maps each name to its symbol. No grammar conflict — the
greedy regex handles ordering automatically. ✓ Not a real conflict.

*Conflict 5 — `\supset` vs `\sube` vs `\supe`*

Same as Conflict 4 — all consumed as full identifiers by the greedy regex.
`\supset` → ⊃, `\sube` → ⊆, `\supe` → ⊇. ✓ Not a real conflict.

*Conflict 6 -- resolved by the glyph lookup architecture*

The original Conflict 6 described restricting script modifier letter names
to one character in separate grammar rules (e.g. `/^\\cy[a-z]/`). Under
the new architecture there are no separate script grammar rules at all.
The `BackslashIdentifier` regex consumes the full token greedily. The
`GLYPH_TABLE` maps `"cya"` -> Cyrillic a, `"cyan"` -> no entry -> renders
as `cyan`. No grammar restriction needed. Conflict 6 is fully resolved
by the architecture change.

*Conflict 7 -- resolved by the glyph lookup architecture*

Under the new architecture there are no separate grammar rules for
Persian, Hebrew, Cyrillic, Armenian, or Georgian. There is one
`BackslashIdentifier` rule that matches everything after `\`. The
`GLYPH_TABLE` in the renderer is the sole place where `faa` -> Persian
alef, `ha` -> aleph, etc. are defined.

There is no grammar conflict to resolve. `\fa` is a backslash identifier
with raw name `fa`. `\faa` is a backslash identifier with raw name `faa`.
The renderer looks up `GLYPH_TABLE["faa"]` and gets the Persian alef.
No rule ordering, no script-specific rules, no conflicts.

*Conflict 8 -- factorial `!` vs not-equal `!=`*

`!=` starts with `!`. `FactorialSuffix` in `Postfix` matches `!` as a
postfix operator. So `x!=y` would parse as `FactorialExpression(x)` then
`= y`, giving `(x!) = y` instead of the intended `x != y`.

Resolution: change `FactorialSuffix` regex from `/^!/` to `/^!(?!=)/`
(negative lookahead: matches `!` only when NOT followed by `=`).
So `x!` matches factorial, but `x!=y` leaves `!=` for the Relational level.

*Summary of actions required:*

| Issue | Action |
|-------|--------|
| Gap 1 | Add `->` literal to `Relational` choices, before `>` |
| Gap 2 | Add `AbsoluteValueExpression` to `Primary` |
| Gap 3 | Add `FactorialSuffix` to `Postfix` |
| Gap 4 | No change needed — `n=0` parses as relational expression |
| Gap 5 | Add `BlackboardBoldIdentifier` rule |
| Gap 6 | Update `Expression → Relational → Additive` |
| Gap 7 | Add `\mapsto` to concrete tasks |
| Conflict 1 | Order `~=` before `~` in relational choices |
| Conflict 2 | Order `<<` before `<`, `>>` before `>` |
| Conflicts 3-5 | No action — greedy regex handles automatically |
| Conflict 8 | Change FactorialSuffix regex to /^!(?!=)/ (negative lookahead) |
| Conflict 6 | Resolved by glyph lookup architecture -- no grammar restriction needed |
| Conflict 7 | Resolved by glyph lookup architecture -- no script-specific rules needed |


---

**Missing mathematical notation — coverage gaps**

The following symbols are not covered by the rules defined above and
need to be added to Phase 2.

*Two important semantic conflicts to document:*

- `\inf` = ∞ (infinity) conflicts with infimum (greatest lower bound).
  Resolution: keep `\inf` = ∞, use `\infimum` for the infimum operator.
- `(a, b)` = column vector conflicts with ordered pair notation. These
  are syntactically identical. The semantic layer decides from context.
  Document this explicitly — the parser cannot distinguish them.

*Algebra*

| Syntax | Symbol | Meaning |
|--------|--------|---------|
| `...` | … | ellipsis (sequences: `a_1, ..., a_n`) |
| `\mod` | mod | modulo operator |
| `\div` | ÷ | integer division |

*Number theory*

| Syntax | Symbol | Meaning |
|--------|--------|---------|
| `\divides` | ∣ | divides (`a \divides b`) |
| `\ndivides` | ∤ | does not divide |
| `\cong` | ≅ | congruence (`a \cong b \mod n`) |

*Calculus / analysis*

| Syntax | Symbol | Meaning | Notes |
|--------|--------|---------|-------|
| `'` postfix | ′ | derivative prime | `f'(x)`, `f''(x)` |
| `\eval{expr, var=val}` | ❙ | evaluated at | `f(x)\|_{x=a}` |
| `\infimum` | inf | infimum | distinct from `\inf` = ∞ |
| `\supremum` | sup | supremum | distinct from `\sup` reserved |
| `\limsup` | lim sup | limit superior | control expression |
| `\liminf` | lim inf | limit inferior | control expression |
| `\oint` | ∮ | contour integral | control expression |
| `\iint` | ∬ | double integral | control expression |
| `\iiint` | ∭ | triple integral | control expression |

*Linear algebra*

| Syntax | Symbol | Meaning |
|--------|--------|---------|
| `\had` | ⊙ | Hadamard (element-wise) product |
| `\kron` | ⊗ | Kronecker product (distinct from `\otimes` tensor) |
| `\Id` | I | identity matrix (bold I) |
| `\0` | 0 | zero vector/matrix (bold 0) |

*Set theory*

| Syntax | Symbol | Meaning |
|--------|--------|---------|
| `\psub` | ⊊ | proper subset |
| `\psupset` | ⊋ | proper superset |
| `\symdiff` | △ | symmetric difference |
| `\\U` | 𝕌 | universal set (blackboard bold U) |
| `\given` | ∣ | conditional bar: `P(A \given B)` = `P(A|B)` | â€” shares glyph âˆ£ with `\divides`; semantic layer distinguishes

*Geometry*

| Syntax | Symbol | Meaning |
|--------|--------|---------|
| `\angle` | ∠ | angle |
| `\tri` | △ | triangle |
| `\parallel` | ∥ | parallel |
| `\perp` | ⊥ | perpendicular |
| `\sim` | ∼ | similar (geometric) |
| `\arc{AB}` | ⌢ | arc |

*Structural / display*

| Syntax | Symbol | Meaning |
|--------|--------|---------|
| `\ul{x}` | x̲ | underline |
| `\ubrace{expr, label}` | ⏟ | underbrace with label |
| `\obrace{expr, label}` | ⏞ | overbrace with label |
| `\cancel{x}` | x̶ | strikethrough / cancel |

*Already covered by existing syntax (no new rules needed):*
- Transpose `A^T`, conjugate transpose `A^*` — via superscript ✓
- Trig: `\sin(x)`, `\cos(x)`, `\arctan(x)`, `\sinh(x)` — via multi-letter
  identifier + function call ✓
- Cardinality `|A|` — via absolute value ✓
- Big-O `O(f(n))` — via function call ✓
- Leibniz derivative `\d y / \d x` — via existing rules ✓
- Complex: `\Re{z}`, `\Im{z}`, `\arg{z}` — via function call ✓

---

**Glyph lookup table architecture**

The previous identifier system used separate grammar rules per script.
The new architecture replaces all of them with a single `BackslashIdentifier`
rule and a `GLYPH_TABLE` in the renderer. No grammar change is ever needed
to add a new symbol or script.


*Grammar layer — one rule for all backslash identifiers*

The grammar has a single `BackslashIdentifier` rule:
```
/^\\[a-zA-Z][a-zA-Z0-9]*/
```

This produces `IdentifierNode { raw: "...", skew: "none" }` where
`raw` is everything after the `\`. The grammar records the token verbatim.

Separate rules still exist for structural prefixes that change the
grammar behaviour:
- `BlackboardBoldIdentifier` `/^\\\\[A-Z]/` — double backslash, one
  uppercase letter → `blackboard: true`
- `RightSkewBackslashIdentifier` `/^\\[0-9]+[a-zA-Z]+/` — skew index before
  name → `skew: "right"`

*Renderer layer — flat glyph lookup table*

The renderer has a single flat lookup table keyed by the full name string
after `\`. If a name is found, its Unicode glyph is used. If not, the
name is rendered as-is (which handles `\sin`, `\cos`, `\lim` etc.
naturally — they have no entry and render as the text `sin`, `cos`, `lim`).

```ts
const GLYPH_TABLE: Record<string, string> = {
    // Greek single-letter (a=α, b=β, ...)
    "a": "α", "b": "β", "g": "γ", "d": "δ", "e": "ε",
    "z": "ζ", "h": "η", "q": "θ", "i": "ι", "k": "κ",
    "l": "λ", "m": "μ", "n": "ν", "x": "ξ", "o": "ο",
    "p": "π", "r": "ρ", "s": "σ", "t": "τ", "u": "υ",
    "f": "φ", "c": "χ", "y": "ψ", "w": "ω",
    "A": "Α", "B": "Β", "G": "Γ", "D": "Δ", "E": "Ε",
    "Z": "Ζ", "H": "Η", "Q": "Θ", "I": "Ι", "K": "Κ",
    "L": "Λ", "M": "Μ", "N": "Ν", "X": "Ξ", "O": "Ο",
    "P": "Π", "R": "Ρ", "S": "Σ", "T": "Τ", "U": "Υ",
    "F": "Φ", "C": "Χ", "Y": "Ψ", "W": "Ω",

    // Hebrew (h prefix)
    "ha": "ℵ", "hb": "ℶ", "hg": "ℷ", "hd": "ℸ",

    // Cyrillic (cy prefix)
    "cya": "а", "cyb": "б", "cyv": "в", "cyg": "г",
    "cyd": "д", "cye": "е", "cyz": "з", "cyi": "и",
    "cyk": "к", "cyl": "л", "cym": "м", "cyn": "н",
    "cyo": "о", "cyp": "п", "cyr": "р", "cys": "с",
    "cyt": "т", "cyu": "у", "cyf": "ф", "cyh": "х",
    "cyc": "ц", "cysh": "ш", "cyya": "я",

    // Armenian (am prefix)
    "ama": "Ա", "amb": "Բ", "amg": "Գ", "amd": "Դ",
    "ame": "Ե", "amz": "Զ", "amh": "Հ",

    // Georgian (gn prefix)
    "gna": "ა", "gnb": "ბ", "gng": "გ", "gnd": "დ",
    "gne": "ე", "gnv": "ვ", "gnz": "ზ",

    // Persian/Farsi (fa prefix)
    "faa": "ا", "fab": "ب", "fap": "پ", "fat": "ت",
    "fas": "س", "faf": "ف", "faq": "ق", "fak": "ک",
    "fag": "گ", "fal": "ل", "fam": "م", "fan": "ن",
    "fav": "و", "fah": "ه", "fay": "ی",

    // Operators and symbols
    "pm": "±", "mp": "∓", "inf": "∞",
    "nabla": "∇", "partial": "∂",
    "union": "∪", "inter": "∩", "diff": "∖",
    "cross": "×", "comp": "∁", "in": "∈", "notin": "∉",
    "empty": "∅", "pow": "𝒫",
    "sub": "⊂", "supset": "⊃", "sube": "⊆", "supe": "⊇",
    "psub": "⊊", "psupset": "⊋", "symdiff": "△",
    "and": "∧", "or": "∨", "not": "¬",
    "imp": "⟹", "iff": "⟺",
    "all": "∀", "ex": "∃", "nex": "∄",
    "circ": "∘", "oplus": "⊕", "otimes": "⊗",
    "had": "⊙", "kron": "⊗",
    "mapsto": "↦",
    "parallel": "∥", "perp": "⊥", "sim": "∼",
    "angle": "∠", "tri": "△",
    "divides": "∣", "ndivides": "∤", "cong": "≅",
    "given": "∣",
    "mod": "mod", "div": "÷",
    "infimum": "inf", "supremum": "sup",
    "limsup": "lim sup", "liminf": "lim inf",
    "oint": "âˆ®", "iint": "âˆ¬", "iiint": "âˆ­",
    // Note: \given and \divides both map to âˆ£ (U+2223)
    // The semantic layer distinguishes them by context.
    // Structural decorators (rendered as wrappers, not glyphs):
    // \ul, \ubrace, \obrace, \cancel are control expressions
    // handled by the renderer directly, not via GLYPH_TABLE.
}
```

The renderer function becomes:
```ts
function resolveGlyph(name: string): string {
    return GLYPH_TABLE[name] ?? name;
}
```

The skew modifier applies a CSS transform to the resolved glyph,
independent of what the glyph is.

*Benefits of this architecture:*
- Adding a new symbol = one line in `GLYPH_TABLE`, no grammar change
- Adding a new script = adding entries with the script prefix, no grammar change
- `\fa` alone → lookup `"fa"` → no entry → renders as `fa` (acceptable)
- `\faa` → lookup `"faa"` → `ا` (Persian alef) ✓
- `\ha` → lookup `"ha"` → `ℵ` ✓
- `\sin` → lookup `"sin"` → no entry → renders as `sin` ✓
- `\pm` → lookup `"pm"` → `±` ✓
- Unknown symbols render as their name, never crash

*Blackboard bold remains a separate rule* because `\\` (double backslash)
is a structurally different prefix that requires its own regex. Its glyph
lookup uses a separate `BLACKBOARD_TABLE`:
```ts
const BLACKBOARD_TABLE: Record<string, string> = {
    "N": "ℕ", "Z": "ℤ", "Q": "ℚ", "R": "ℝ", "C": "ℂ",
    "H": "ℍ", "P": "ℙ", "U": "𝕌", "d": "∂",
}
```

---

**Concrete tasks:**
- [ ] Update `Expression` rule: `Expression → Relational → Additive`
      (Gap 6 fix — makes relation operators valid at top level and inside
      ArgumentList, enabling `x->a` inside `\lim{...}`)
- [ ] Add `Relational` grammar level below `Additive`: operators `=`, `!=`,
      `<=`, `>=`, `~=`, `:=`, `~`, `<<`, `>>`, `->`, `\sub`, `\supset`,
      `\sube`, `\supe`, `\in`, `\notin`, `\divides`, `\ndivides`, `\cong`, `\parallel`, `\perp`, `\sim` — ordered longest-first to resolve
      conflicts: `~=` before `~`, `<<` before `<`, `>>` before `>`,
      `->` before `>`, `!=` before `!`
- [ ] Add `AbsoluteValueExpression` to `Primary`: `| Expression |` →
      `AbsoluteValueNode`; renderer checks inner node type: `VectorNameNode`
      or `MatrixNode` → norm `‖x‖`, otherwise → `|x|` (Gap 2 fix)
- [ ] Add `FactorialSuffix` to `Postfix` suffix choices: regex `/^!(?!=)/`
      (negative lookahead: does not match `!=`) -> `FactorialExpression(base)` (Gap 3 + Conflict 8 fix)
- [ ] Add `BlackboardBoldIdentifier` rule: regex `/^\\\\[A-Z]/`, tried
      before `BackslashIdentifier`; renderer maps letter to blackboard bold
      glyph: N→ℕ, Z→ℤ, Q→ℚ, R→ℝ, C→ℂ, H→ℍ, P→ℙ (Gap 5 fix)
- [ ] Add vector name decorator: `[single_identifier]` → `VectorNameNode`,
      renders with arrow over the identifier
- [ ] Add array literal grammar rule: `[expr, expr, ...]` and
      `[[row], [row], ...]` as a new `Primary` option → `MatrixNode`
- [ ] Add column vector shorthand: `(expr, expr, ...)` in `Primary`,
      disambiguated from grouping by comma presence; reject `(a,)` and
      standalone `()`
- [ ] Add index expression postfix suffix: `base[expr]` → `IndexExpression`
- [ ] Add `\mod` and `\div` operators at multiplicative level (same precedence
      as `*` and `/`): `\mod` -> `BinaryExpression(mod)`, `\div` -> `BinaryExpression(div)`
- [ ] Add dot product operator `.` at multiplicative level →
      `BinaryExpression(.)`; document `3.v` edge case
- [ ] Add `RolloutExpression` as a new `Primary` option matching `/^[+*]\{/`
      atomically, consuming `ArgumentList` and `}` →
      `ControlExpression { name: "+" or "*", args }`
- [ ] Add `SubSuperscriptExpression` AST node
      `{ type, base, subscript, superscript }`
- [ ] Update `Power` build function: when left operand is
      `SubscriptExpression`, produce `SubSuperscriptExpression` instead
      of `BinaryExpression(^, SubscriptExpression, exponent)`
- [ ] Add matrix renderer using `.matrix` / `.matrix-row` / `.matrix-cell`
      CSS classes (already defined in `native-math.css`)
- [ ] Add piecewise grammar rule: `\piecewise{expr, cond; expr, cond}`
- [ ] Add piecewise renderer using the existing `.piecewise` CSS classes
- [ ] Add renderer for `SubSuperscriptExpression`: base with stacked
      `<sup>` and `<sub>` on the right using `.subsuperscript` CSS
- [ ] Implement set operators as backslash identifiers in renderer:
      `\union`→∪, `\inter`→∩, `\diff`→∖, `\cross`→×, `\comp`→∁,
      `\empty`→∅, `\pow`→𝒫
- [ ] Implement logic operators as backslash identifiers in renderer:
      `\and`→∧, `\or`→∨, `\not`→¬, `\imp`→⟹, `\iff`→⟺,
      `\all`→∀, `\ex`→∃, `\nex`→∄
- [ ] Implement calculus/misc identifiers in renderer:
      `\nabla`→∇, `\pm`→±, `\mp`→∓, `\circ`→∘, `\oplus`→⊕,
      `\otimes`→⊗, `\mapsto`→↦ (Gap 7 fix)
- [ ] Implement decorator control expressions in renderer:
      `\floor{x}`→⌊x⌋, `\ceil{x}`→⌈x⌉, `\bar{x}`→x̄, `\hat{x}`→x̂,
      `\tilde{x}`→x̃, `\inner{x,y}`→⟨x,y⟩, `\binom{n,r}`→ⁿCᵣ
- [ ] Implement `\S{...}` and `\P{...}` as summation and product renderers
      (Sigma and Pi used as control expression names)
- [ ] Implement `\lim{...}` renderer
- [ ] Add `BlackboardBoldIdentifier` renderer: N→ℕ, Z→ℤ, Q→ℚ, R→ℝ,
      C→ℂ, H→ℍ, P→ℙ, d→∂ (for `\\d`)
- [ ] Add Hebrew entries to `GLYPH_TABLE`: ha->aleph, hb->beth, hg->gimel, hd->dalet
- [ ] Add Cyrillic, Armenian, Georgian, Persian entries to `GLYPH_TABLE` when needed
      (no grammar changes required â€” table entries only)
- [ ] Verify `Identifier` choice list order: `BlackboardBold` -> `SkewedBackslash`
      -> `Backslash` -> `RightSkewLatin` -> `LeftSkewLatin` -> `Plain`





- [ ] Implement semantic annotation pass: accept a metavariable declaration
      list, walk AST, tag `Identifier` nodes as metavariable or concrete
- [ ] Add prime derivative postfix suffix: `f` followed by one or more `'`
      characters -> `DerivativeNode(base, order)` where order = count of primes
- [ ] Add ellipsis primary: `...` -> `EllipsisNode`, renders as `â€¦`
- [ ] Add `\eval{expr, var=val}` control expression renderer: renders as
      `expr|_{var=val}` with a vertical bar and subscript
- [ ] Add `\0` and `\Id` to `GLYPH_TABLE`: `\0` -> bold 0, `\Id` -> bold I

- [ ] Extend error messages to name the specific grammar rule that failed

**Completion criteria:**
- `[a]` parses as `VectorNameNode`, renders as `a⃗`
- `[a_i]` parses as a 1-element row vector, not a name decorator
- `[[a, b], [c, d]]` renders as a 2×2 matrix grid
- `(a, b, c)` renders as a 3×1 column vector
- `(a,)` and standalone `()` produce parse errors
- `A[k]` parses as `IndexExpression`, renders as `A` with subscript `k`
- `u.v` parses as `BinaryExpression(.)`, renders as `u · v`
- `3.v` parses as `3.0` implicitly multiplied by `v` (documented edge case)
- `+{k=0, n, A[k]}` parses as `ControlExpression` with `name: "+"`,
  not as binary `+` applied to `{...}`; space variant `+ {k=0, n, A[k]}`
  produces a parse error
- `*{k=0, n, A[k]}` likewise
- `x_i^2` parses as `SubSuperscriptExpression(x, i, 2)`, renders with
  subscript `i` and superscript `2` stacked on the same base `x`
- `(x_i)^2` still parses as `BinaryExpression(^, SubscriptExpression(x,i), 2)`
- Piecewise renders with left brace and aligned rows
- Metavariable identifiers render with distinct styling when declared
- Relation operators parse and render correctly: `a <= b`, `x != y`,
  `A \sub B`
- Set operators parse and render: `A \union B`, `\comp A`, `x \in S`
- Logic operators parse and render: `p \and q`, `\not p`, `p \imp q`
- Hebrew identifiers render correct glyphs: `\ha` → ℵ
- `\ha_0` renders as ℵ with subscript 0 (aleph-null)
- All new constructs produce correct parse errors on malformed input

**Demo:** Extend the Phase 1 demo page with additional test inputs:

| Input | Expected visual |
|-------|-----------------|
| `[a]` | a with arrow over it (a⃗) |
| `[[a, b], [c, d]]` | 2×2 matrix |
| `(a, b, c)` | 3×1 column vector |
| `A[k]` | A with subscript k |
| `u.v` | u · v |
| `+{k=0, n, A[k]}` | rollout sum with index bounds |
| `*{k=0, n, A[k]}` | rollout product with index bounds |
| `\piecewise{x, x>=0; -x, x<0}` | absolute value piecewise |
| `x_i^2` | x with subscript i and superscript 2 |
| `a <= b` | a ≤ b |
| `A \union B` | A ∪ B |
| `x \in \\R` | x ∈ ℝ |
| `p \and q` | p ∧ q |
| `\ha_0` | ℵ with subscript 0 (aleph-null) |

Additionally, load an expression with declared metavariables and show
that the metavariable identifiers render with distinct styling compared
to concrete variable identifiers in the same expression.

**Phase 2 — Summary and Conclusion**

Phase 2 extends the math syntax parser and renderer established in Phase 1
into a complete mathematical notation system. The following is a consolidated
record of all design decisions, resolved issues, and the final state ready
for implementation.

*What Phase 2 adds to the grammar:*

| Addition | Type | Notes |
|----------|------|-------|
| `Relational` level | New grammar level | Sits between `Expression` and `Additive`; not chained |
| `->` | Relational operator | Two-char literal; tried before `>` |
| `=`, `!=`, `<`, `>`, `<=`, `>=`, `~=`, `:=`, `~`, `<<`, `>>` | Relational operators | Ordered longest-first |
| `\sub`, `\supset`, `\sube`, `\supe`, `\in`, `\notin`, `\divides`, `\ndivides`, `\cong`, `\parallel`, `\perp`, `\sim` | Relational operators | Backslash identifiers at Relational level |
| `\mod`, `\div` | Multiplicative operators | Same precedence as `*` and `/` |
| `[a]` | VectorNameNode | Name decorator; single identifier only |
| `[expr, ...]`, `[[row], ...]` | MatrixNode | Row vector and matrix literals |
| `(expr, expr, ...)` | MatrixNode (column vector) | Disambiguated from grouping by comma presence |
| `base[expr]` | IndexExpression | Postfix suffix |
| `.` | BinaryExpression(.) | Dot product at multiplicative level |
| `+{...}`, `*{...}` | ControlExpression | Rollout operators; matched atomically at Primary level |
| `\|...\|` | AbsoluteValueNode | New Primary option; renderer auto-detects norm vs abs |
| `x!` | FactorialExpression | Postfix suffix; regex `/^!(?!=)/` to avoid `!=` conflict |
| `'` postfix | DerivativeNode | One or more primes; order = count |
| `...` | EllipsisNode | New Primary option |
| `BlackboardBoldIdentifier` | IdentifierNode (blackboard: true) | `/^\\\\[A-Z]/`; tried before BackslashIdentifier |
| `SubSuperscriptExpression` | AST node | Produced by Power build when left is SubscriptExpression |
| `\piecewise{...}` | ControlExpression | Semicolon-separated rows |

*What Phase 2 adds to the renderer (GLYPH_TABLE and control expressions):*

- All Greek single-letter and multi-letter symbols via GLYPH_TABLE
- Hebrew letters: `\ha` ℵ, `\hb` ℶ, `\hg` ℷ, `\hd` ℸ
- All set, logic, calculus, geometry, and miscellaneous operators via GLYPH_TABLE
- Blackboard bold: `\\N` ℕ, `\\Z` ℤ, `\\Q` ℚ, `\\R` ℝ, `\\C` ℂ, `\\H` ℍ, `\\P` ℙ, `\\d` ∂
- Control expression renderers: `\S{...}` Σ, `\P{...}` Π, `\lim{...}`, `\floor{...}`,
  `\ceil{...}`, `\bar{...}`, `\hat{...}`, `\tilde{...}`, `\inner{...}`,
  `\binom{...}`, `\eval{...}`, `\ubrace{...}`, `\obrace{...}`, `\ul{...}`, `\cancel{...}`
- Matrix, piecewise, SubSuperscript, VectorName, AbsoluteValue/Norm renderers
- Metavariable annotation pass and distinct styling

*All audit issues resolved:*

| Issue | Resolution |
|-------|------------|
| Gap 1 — `->` missing | Added to Relational choices before `>` |
| Gap 2 — `\|...\|` missing | AbsoluteValueExpression added to Primary |
| Gap 3 — `x!` missing | FactorialSuffix added to Postfix |
| Gap 4 — `n=0` named param | No change — parses as relational expression |
| Gap 5 — BlackboardBold missing | BlackboardBoldIdentifier rule added |
| Gap 6 — Expression not updated | Expression → Relational → Additive |
| Gap 7 — `\mapsto` missing | Added to GLYPH_TABLE and concrete tasks |
| Conflict 1 — `~` vs `~=` | `~=` tried before `~` |
| Conflict 2 — `<<`/`>>` vs `<`/`>` | Longest-first ordering |
| Conflicts 3–5 | Not real conflicts — greedy regex handles automatically |
| Conflict 6 | Resolved by glyph lookup architecture |
| Conflict 7 | Resolved by glyph lookup architecture |
| Conflict 8 — `!=` vs `!` | FactorialSuffix uses `/^!(?!=)/` negative lookahead |

*Key architectural decisions made in Phase 2:*

1. **Parser is script-agnostic.** The parser records `{ raw, skew, blackboard }`
   verbatim. It does not know about Greek, Hebrew, Persian, or any other script.
   All semantic meaning lives in the renderer's `GLYPH_TABLE`.

2. **GLYPH_TABLE is the single source of truth.** Adding a symbol or script
   requires one line in the table. No grammar change ever needed.

3. **Table as view, not model** (carried from superproduct design). The same
   principle applies here: the syntax is a view over the underlying mathematical
   meaning. The parser captures structure; the renderer assigns meaning.

4. **`(a, b)` is syntactically a column vector.** The semantic layer decides
   whether it is an ordered pair or a vector based on context. The parser
   cannot and does not distinguish them.

5. **`\inf` = ∞ (infinity), `\infimum` = inf (infimum).** These are distinct
   symbols with distinct raw names. No conflict.

*Phase 2 is ready for implementation.* All grammar rules are defined,
all conflicts are resolved, all symbols are accounted for in either the
grammar tasks or the GLYPH_TABLE, and the architecture is internally
consistent.

---

---

#### Phase 3 — Plugin System & CSV Table Display

**Goal:** Formalise the plugin interface and load a real CSV knowledge
file, displaying it as a rendered table where math cells are rendered
by the math syntax plugin.

**Concrete tasks:**
- [ ] Define the plugin interface:
      `{ type_id: string, version: string, parse(text): AST,
         render(ast): HTMLElement }`
- [ ] Refactor math syntax parser + renderer into a conforming plugin module
- [ ] Implement a plain-text plugin (identity: renders text as-is)
- [ ] Implement a CSV file reader that parses a `.csv` file into a
      list of rows, each row a list of typed cell values
- [ ] Define the CSV cell type annotation convention: how a cell declares
      which plugin should render it (e.g. a header row convention or
      a sidecar schema file)
- [ ] Implement the table component: renders rows and columns, applies
      the correct plugin renderer per cell, supports column sorting
- [ ] Implement a file open UI: drag-and-drop or file picker to load a
      `.csv` file into the table component
- [ ] Define and create a sample CSV knowledge file (e.g. a small
      mathematics definitions table with math syntax cells)

**Completion criteria:**
- The plugin interface is documented and math syntax conforms to it
- A CSV file with mixed plain-text and math syntax cells loads and renders
  correctly
- Columns can be sorted by clicking the header
- An unknown plugin type falls back to plain-text rendering gracefully

**Demo:** Load the sample CSV file via the file picker. The table appears
with math cells rendered as formatted expressions and plain-text cells
as text. Click a column header to sort. Show that a cell with an invalid
math syntax expression displays an inline error rather than crashing the table.

---

#### Phase 4 — Association Graph & Filtered Table View

**Goal:** Add the graph layer. Entities in the CSV can declare associations
to other entities. The UI can filter and reorder the table by traversing
the graph.

**Concrete tasks:**
- [ ] Define the association storage format in CSV: a dedicated column
      (or sidecar file) that lists `relation-type:target-entity-id` pairs
      per row
- [ ] Define the association vocabulary format: a separate file listing
      all valid relation types, their inverses, and their domain
- [ ] Implement an in-memory graph built from the loaded CSV associations
- [ ] Implement graph-filtered table projection:
      given a relation type and a target entity, return all entities
      that have that relation to the target, displayed as a table
- [ ] Implement a basic filter UI: select a relation type and a target
      entity from dropdowns, click Filter, table updates
- [ ] Implement inverse relation lookup: clicking an entity shows all
      entities that point to it via any relation type
- [ ] Load multiple CSV files simultaneously and resolve cross-file
      entity references

**Completion criteria:**
- Associations are loaded from CSV and stored in the graph
- Filtering by relation type + target entity produces the correct subset
  of rows
- Inverse relations are navigable
- Cross-file references resolve correctly

**Demo:** Load two CSV files (e.g. a theorems table and a definitions
table). Select relation type `uses` and target entity `integration-by-parts`.
The table updates to show only theorems that use that technique. Click
an entity to see all its associations listed. Navigate to a related entity
in the other table.

---

#### Phase 5 — Inline Editor

**Goal:** Allow the user to edit cell values directly in the rendered
table, with live re-rendering and undo/redo.

**Concrete tasks:**
- [ ] Implement cell edit mode: double-click a cell to switch it from
      rendered view to a text input pre-filled with the raw source
- [ ] Implement live re-render: as the user types in the edit input,
      re-parse and re-render the preview in real time
- [ ] Implement inline validation: show parse errors inside the cell
      without blocking the edit
- [ ] Implement commit/cancel: Enter commits the edit, Escape cancels
- [ ] Implement undo/redo stack: Ctrl+Z / Ctrl+Y across all cell edits
      in the current session
- [ ] Implement add row: a button or keyboard shortcut appends a new
      empty row to the current table
- [ ] Implement delete row: select a row and delete it with confirmation
- [ ] Implement export: save the current in-memory table state back to
      a CSV file (download)

**Completion criteria:**
- Cells can be edited and the rendered output updates live
- Parse errors appear inline without crashing the table
- Undo/redo works across multiple edits
- The exported CSV round-trips correctly back into the table

**Demo:** Open the sample CSV. Double-click a math cell and edit the
expression — the rendered preview updates as you type. Introduce a
syntax error and observe the inline error. Press Enter to commit.
Press Ctrl+Z to undo. Export the file and reload it — the table is
identical to before export.

---

#### Phase 6 — Binary Format ⚠️ *skipped*

> **This phase was skipped due to planning constraints and implementation
> cost exceeding the current business target. The goals and tasks below
> are preserved as the original specification for future reference.
> Performance and disk storage efficiency are sacrificed as a result.
> The system currently supports CSV only.**

**Goal:** Define and implement the binary file format for compact storage.
The system can read and write binary files and round-trip losslessly
with the CSV/DSL format.

**Concrete tasks:**
- [ ] ~~Design the binary file format: file header (magic bytes, format
      version, schema version), table section, association section,
      blob section (typed binary blobs per cell)~~ *skipped*
- [ ] ~~Design the binary encoding for math syntax expressions: opcode
      assignments for operators, identifiers, numbers; variable-length
      integer encoding; versioned encoding tied to grammar version~~ *skipped*
- [ ] ~~Implement binary writer: serialize in-memory table + graph to
      binary file~~ *skipped*
- [ ] ~~Implement binary reader: deserialize binary file back to in-memory
      table + graph~~ *skipped*
- [ ] ~~Implement lossless round-trip test: CSV → in-memory → binary →
      in-memory → CSV, compare before and after~~ *skipped*
- [ ] ~~Add binary file support to the file open UI (detect by file
      extension or magic bytes)~~ *skipped*
- [ ] ~~Document the binary format specification in `codebase_analysis.md`~~
      *skipped*

**Completion criteria:**
- ~~Binary files are smaller than equivalent CSV files for non-trivial tables~~
- ~~Round-trip is lossless: no data is lost or corrupted~~
- ~~Binary files from an older format version are still readable~~
- ~~The format version is visible in the file header~~

**Demo:** ~~Load a CSV file, export it as binary, reload the binary file.
The table is identical. Show the file sizes side by side. Open a hex
dump of the binary file and identify the header, a math expression blob,
and an association entry by their byte offsets.~~ *skipped*

**Why skipped:** The binary format specification proved too ambiguous and
too costly to implement correctly within the current planning horizon.
Multiple design iterations were explored (flat TLV, block-offset format,
1KiB columnar block format with token streams) but none reached a stable,
unambiguous byte-level specification that could be implemented without
further extended design work. The implementation cost exceeded the
business target for this phase.

**Accepted tradeoffs:**
- CSV is the sole file format — no compact binary storage
- Math expressions are re-parsed from source text on every load
- Files are larger than necessary; disk storage is not optimised
- Load performance is not optimised

**Future:** Revisit when the grammar is fully stable, real knowledge data
exists to measure actual file sizes, and sufficient design time is
available to specify the format unambiguously from byte level upward.

---

#### Phase 7 — Search, Indexing & Tooling

**Goal:** Make the stored knowledge actively useful. Full-text and
structural search across all loaded tables, plus the first domain-specific
tool built on top of the data.

**Concrete tasks:**
- [ ] Implement full-text search across all plain-text cell values
- [ ] Implement structural search: find all entities where a specific
      property matches a pattern (e.g. all theorems whose statement
      contains a specific identifier)
- [ ] Implement graph neighbourhood view: given an entity, show a
      visual map of all entities within N hops
- [ ] Implement cross-table join view: given two tables and a shared
      relation type, show a merged view
- [ ] Define and implement the first domain tool (TBD based on what
      knowledge data has been entered by this phase — candidate:
      a formula lookup tool that finds all theorems containing a
      given symbol)
- [ ] Implement a persistent session: remember the last loaded files
      and restore them on next open (using `localStorage`)

**Completion criteria:**
- Search returns correct results across all loaded tables
- Graph neighbourhood view renders without performance issues for
  graphs up to ~500 entities
- The domain tool produces a useful result on real knowledge data
- Session state persists across browser refreshes

**Demo:** Load a multi-table knowledge base. Search for a symbol (e.g.
`\int`) and see all entities that reference it. Click an entity and
view its graph neighbourhood. Use the domain tool to look up all
theorems involving a specific function. Close and reopen the browser
— the files reload automatically.

---

### System Architecture (Phase 1)

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│                                                     │
│  ┌──────────┐    ┌────────────┐    ┌─────────────┐  │
│  │  Input   │───▶│  Parser    │───▶│  Renderer   │  │
│  │ (string) │    │            │    │             │  │
│  └──────────┘    │ PEGParser  │    │ render()    │  │
│                  │ + grammar  │    │ renderMath()│  │
│                  └─────┬──────┘    └──────┬──────┘  │
│                        │                  │         │
│                        ▼                  ▼         │
│                  ┌──────────┐      ┌─────────────┐  │
│                  │   AST    │      │  DOM output │  │
│                  │ (nodes)  │      │  (#result)  │  │
│                  └──────────┘      └─────────────┘  │
└─────────────────────────────────────────────────────┘
```

#### Target architecture (future phases)

```
┌──────────────────────────────────────────────────────────────┐
│                          Browser                             │
│                                                              │
│  ┌─────────────┐     ┌──────────────────────────────────┐   │
│  │  File I/O   │────▶│           Table Engine           │   │
│  │ CSV / binary│     │  rows, columns, sort, hierarchy  │   │
│  └─────────────┘     └────────────────┬─────────────────┘   │
│                                       │                      │
│                                       ▼                      │
│                      ┌────────────────────────────────┐      │
│                      │         Plugin System          │      │
│                      │                                │      │
│                      │  ┌──────────┐  ┌───────────┐  │      │
│                      │  │ Math syntax │  │ Plain text│  │      │
│                      │  │ plugin   │  │ plugin    │  │      │
│                      │  └──────────┘  └───────────┘  │      │
│                      │  ┌──────────┐  ┌───────────┐  │      │
│                      │  │ Diagram  │  │  (future) │  │      │
│                      │  │ plugin   │  │  plugins  │  │      │
│                      │  └──────────┘  └───────────┘  │      │
│                      └────────────────────────────────┘      │
│                                       │                      │
│                                       ▼                      │
│                             ┌──────────────────┐             │
│                             │   DOM / UI       │             │
│                             └──────────────────┘             │
└──────────────────────────────────────────────────────────────┘
```

---

### Deployment Illustration

```
Developer machine
│
├── npm run dev
│     └── Vite dev server (localhost:5173)
│           ├── Serves index.html
│           ├── Transpiles src/main.ts on-the-fly (no tsc emit)
│           └── Hot-reloads on file save
│
└── npm run build
      ├── tsc (type-check only, noEmit: true)
      └── Vite bundles → dist/
            ├── index.html
            ├── assets/main-[hash].js
            └── assets/style-[hash].css
```

The production build in `dist/` is a fully static site — no server required.
It can be hosted on any static file host (GitHub Pages, S3, Netlify, etc.).

---

### File Structure

```
Webapp/
├── docs/                        ← all documentation (this folder)
│   ├── docs_guide.md
│   ├── study.md
│   ├── codebase_analysis.md
│   ├── testing.md
│   ├── demos.md
│   ├── history.md
│   └── environment_setup.md
├── public/                      ← static assets served as-is
│   ├── favicon.svg
│   └── icons.svg
├── src/                         ← all TypeScript source
│   ├── parser/
│   │   ├── types.ts             ← PEG engine types + AST node interfaces
│   │   ├── PEGParser.ts         ← recursive descent PEG engine
│   │   └── grammar.ts           ← math syntax grammar + exported parser instance
│   ├── render/
│   │   ├── el.ts                ← el() DOM element helper
│   │   └── render.ts            ← AST → HTMLElement renderer
│   └── main.ts                  ← app entry point, DOM wiring
├── index.html                   ← HTML shell
├── native-math.css              ← math rendering styles
├── style.css                    ← app-level styles
├── package.json
├── package-lock.json
├── tsconfig.json
└── .prettierrc
```
