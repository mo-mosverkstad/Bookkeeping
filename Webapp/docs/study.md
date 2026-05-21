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

Identifiers carry a prefix that encodes their visual form, allowing a
single ASCII input to unambiguously specify the exact symbol intended,
including Greek letters and skew variants.

| Prefix | Meaning | Example | Renders as |
|--------|---------|---------|------------|
| (none) | Plain Latin, upright | `a` | a |
| `` ` `` | Left-skewed Latin (standard italic) | `` `a `` | *a* |
| `` `1 `` | Right-skewed Latin | `` `1T `` | *T* (right skew) |
| `\` | Greek letter, upright | `\a` | α |
| `\1` | Greek letter, right-skewed | `\1a` | *α* (right skew) |

Skew is used in physics to disambiguate conflicting symbols. For example,
`T` is period time and `` `1T `` is temperature — visually distinct,
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
      identifier (with skew/Greek rendering), binary expression (with
      automatic parenthesisation), unary, call, control (`\int`,
      `\sqrt`, generic), subscript
- [x] Wire up the basic UI: text input, Render button, result div,
      error message div
- [x] Verify correct operator precedence and right-associativity of `^`
- [x] Verify implicit multiplication does not steal unary signs from additive

**Completion criteria:**
- All grammar rules parse without error
- Operator precedence is mathematically correct
- Skewed and Greek identifiers parse and render with correct visual form
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

**Dot product**

`u.v` is the dot product. The `.` is a binary operator at multiplicative
precedence. There is no ambiguity with decimal numbers because the number
regex is greedy — after a number token is consumed, a following `.` belongs
to the next token. After an identifier, `.` is always dot product.
Rendered as `u · v` (centre dot `·`).

**Cross product and scalar multiplication**

`u * v` is parsed identically whether the operands are vectors or scalars.
The AST node is always `BinaryExpression(*)`. The semantic layer (above
the parser) resolves whether `*` means cross product or scalar multiplication
based on operand types. The renderer shows `×` for vector×vector and
juxtaposition for scalar×vector, driven by type annotation, not syntax.

**Index notation `A[k]`**

`A[k]` is array indexing — the k-th element of A. This is semantically
distinct from the subscript label `A_k`. The AST node is `IndexExpression`
(not `SubscriptExpression`). The renderer displays it as `A_k` (subscript)
but the node type preserves the indexing semantics for the evaluator.
`[` is currently unused in the grammar so there is no conflict.

**Determinant**

`det(A)` is used for determinant. `|expr|` is reserved for absolute value
only. This avoids the `|...|` ambiguity (absolute value vs determinant)
entirely. `det(A - \l*I)` for eigenvalue equations is already supported
by the existing function call syntax.

**Rollout operators `+{...}` and `*{...}`**

```
+{k=0, n, A[k]}    →  A[0] + A[1] + ... + A[n]
*{k=0, n, A[k]}    →  A[0] * A[1] * ... * A[n]
```

These are control expressions with operator symbols as names. They are
**not** the same as the `+` and `*` binary operators. The parser
distinguishes them by lookahead: `+` or `*` followed immediately by `{`
is a rollout control expression; otherwise it is a binary operator.
Argument structure: `{index=start, end, body}`.
Rendered as a large `+` or `×` with index bounds, similar to `\sum` and
`\prod` but semantically distinct — these are rollout/expansion notation,
not summation/product in the traditional sense.

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

**Concrete tasks:**
- [ ] Add vector name decorator: `[single_identifier]` → `VectorNameNode`,
      renders with arrow over the identifier
- [ ] Add array literal grammar rule: `[expr, expr, ...]` and
      `[[row], [row], ...]` as a new `Primary` option → `MatrixNode`
- [ ] Add column vector shorthand: `(expr, expr, ...)` in `Primary`,
      disambiguated from grouping by comma presence
- [ ] Add index expression postfix suffix: `base[expr]` → `IndexExpression`
- [ ] Add dot product operator `.` at multiplicative level → `BinaryExpression(.)`
- [ ] Add rollout control expressions: `+{...}` and `*{...}` with
      lookahead to distinguish from binary `+` and `*`
- [ ] Add matrix renderer using `.matrix` / `.matrix-row` / `.matrix-cell`
      CSS classes (already defined in `native-math.css`)
- [ ] Add piecewise grammar rule: `\piecewise{expr, cond; expr, cond}`
- [ ] Add piecewise renderer using the existing `.piecewise` CSS classes
- [ ] Add combined superscript+subscript: `x_i^2`
- [ ] Add named parameter support to control expressions:
      `\sum{n=0, \inf, f(n)}` where `n=0` is a named lower bound
- [ ] Implement semantic annotation pass: accept a metavariable
      declaration list, walk AST, tag `Identifier` nodes
- [ ] Update renderer to style metavariable `Identifier` nodes distinctly
- [ ] Extend error messages to name the specific grammar rule that failed

**Completion criteria:**
- `[a]` parses as `VectorNameNode`, renders as `a⃗`
- `[[a, b], [c, d]]` renders as a 2×2 matrix grid
- `(a, b, c)` renders as a 3×1 column vector
- `A[k]` parses as `IndexExpression`, renders as `A` with subscript `k`
- `u.v` parses as `BinaryExpression(.)`, renders as `u · v`
- `+{k=0, n, A[k]}` parses as a rollout control expression, not as
  binary `+` applied to `{...}`
- `*{k=0, n, A[k]}` likewise
- Piecewise renders with left brace and aligned rows
- `x_i^2` renders with `i` as subscript and `2` as superscript simultaneously
- Metavariable identifiers render with distinct styling when declared
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

Additionally, load an expression with declared metavariables and show
that the metavariable identifiers render with distinct styling compared
to concrete variable identifiers in the same expression.

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

#### Phase 6 — Binary Format

**Goal:** Define and implement the binary file format for compact storage.
The system can read and write binary files and round-trip losslessly
with the CSV/DSL format.

**Concrete tasks:**
- [ ] Design the binary file format: file header (magic bytes, format
      version, schema version), table section, association section,
      blob section (typed binary blobs per cell)
- [ ] Design the binary encoding for math syntax expressions: opcode
      assignments for operators, identifiers, numbers; variable-length
      integer encoding; versioned encoding tied to grammar version
- [ ] Implement binary writer: serialize in-memory table + graph to
      binary file
- [ ] Implement binary reader: deserialize binary file back to in-memory
      table + graph
- [ ] Implement lossless round-trip test: CSV → in-memory → binary →
      in-memory → CSV, compare before and after
- [ ] Add binary file support to the file open UI (detect by file
      extension or magic bytes)
- [ ] Document the binary format specification in `codebase_analysis.md`

**Completion criteria:**
- Binary files are smaller than equivalent CSV files for non-trivial tables
- Round-trip is lossless: no data is lost or corrupted
- Binary files from an older format version are still readable
- The format version is visible in the file header

**Demo:** Load a CSV file, export it as binary, reload the binary file.
The table is identical. Show the file sizes side by side. Open a hex
dump of the binary file and identify the header, a math expression blob,
and an association entry by their byte offsets.

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
