# Theoretical Foundation

This document explains the computer science theory behind the BobaMath
parser and grammar system. It is written for readers with no prior knowledge
of parsing theory, formal languages, or compiler construction. Every concept
is introduced from first principles.

---

## Table of Contents

1. [Related Academic Fields](#related-academic-fields)
2. [What is a Formal Language?](#what-is-a-formal-language)
3. [What is a Grammar?](#what-is-a-grammar)
4. [The Chomsky Hierarchy](#the-chomsky-hierarchy)
5. [Context-Free Grammars (CFG)](#context-free-grammars-cfg)
6. [Ambiguity in Grammars](#ambiguity-in-grammars)
7. [Parsing Expression Grammars (PEG)](#parsing-expression-grammars-peg)
8. [PEG vs CFG — Key Differences](#peg-vs-cfg--key-differences)
9. [Recursive Descent Parsing](#recursive-descent-parsing)
10. [How Our PEG Engine Works](#how-our-peg-engine-works)
11. [The BobaMath Grammar — Design Philosophy](#the-bobamath-grammar--design-philosophy)
12. [Operator Precedence via Grammar Structure](#operator-precedence-via-grammar-structure)
13. [Associativity — Left vs Right](#associativity--left-vs-right)
14. [Implicit Multiplication — The Hard Problem](#implicit-multiplication--the-hard-problem)
15. [The Identifier System — Script-Agnostic Parsing](#the-identifier-system--script-agnostic-parsing)
16. [Tokenisation vs Scannerless Parsing](#tokenisation-vs-scannerless-parsing)
17. [Abstract Syntax Trees (AST)](#abstract-syntax-trees-ast)
18. [From AST to Visual Output — The Rendering Pipeline](#from-ast-to-visual-output--the-rendering-pipeline)
19. [Why Not Use an Existing Tool?](#why-not-use-an-existing-tool)
20. [Summary of Design Principles](#summary-of-design-principles)
21. [Appendix A — Academic Discipline Map](#appendix-a--academic-discipline-map)
    - [Where Do Parsers Belong?](#where-do-parsers-belong)
    - [Where Do Programming Languages and Mathematical Notations Belong?](#where-do-programming-languages-and-mathematical-notations-belong)
    - [Prerequisite Dependency Chain](#prerequisite-dependency-chain)
    - [Mathematical Foundations in Detail](#mathematical-foundations-in-detail)
    - [Concept-to-Course Reference Table](#concept-to-course-reference-table)
    - [How Parsing Algorithms Work Mathematically](#how-parsing-algorithms-work-mathematically)
    - [The Mathematical Structure of Our Grammar](#the-mathematical-structure-of-our-grammar)
    - [Formal Properties of the BobaMath Language](#formal-properties-of-the-bobamath-language)

---

## Related Academic Fields

This project draws from several areas of computer science and software
engineering. If you were studying these topics formally, they would appear
in the following university courses:

| Course | What it covers relevant to this project |
|--------|----------------------------------------|
| **Formal Languages & Automata Theory** | Alphabets, strings, languages, grammars, the Chomsky hierarchy, regular expressions, context-free grammars, pushdown automata |
| **Compiler Construction / Compilers** | Lexical analysis (tokenisation), parsing (syntax analysis), abstract syntax trees, semantic analysis, code generation |
| **Programming Language Theory** | Language design, syntax specification, type systems, operational semantics |
| **Discrete Mathematics** | Sets, relations, trees, graphs, induction — the mathematical foundation for all of the above |
| **Data Structures & Algorithms** | Trees (AST representation), recursion (recursive descent), pattern matching |
| **Human-Computer Interaction (HCI)** | Input design, notation systems, visual rendering of structured data |

The most directly relevant course is **Compiler Construction**. A compiler
transforms source code (text) into executable instructions. Our system does
the same thing conceptually: it transforms math notation (text) into a
visual representation (HTML). The pipeline is:

```
Source text  →  Parser  →  AST  →  Renderer  →  Visual output
```

This is identical to the front-end of a compiler:

```
Source code  →  Parser  →  AST  →  Code generator  →  Machine code
```

The difference is only in the final stage: we produce HTML instead of
machine instructions.

---

## What is a Formal Language?

In everyday life, a "language" is something like English or Japanese — a
system of communication with words, grammar rules, and meaning. In computer
science, a **formal language** is a much more precise concept:

> A formal language is a set of strings over an alphabet.

- An **alphabet** (Σ) is a finite set of symbols. For example: `{0, 1}`,
  `{a, b, c, ..., z}`, or `{+, -, *, /, 0, 1, ..., 9, a, ..., z, (, )}`.

- A **string** is a finite sequence of symbols from the alphabet. For example:
  `"2+3"`, `"x^2"`, `"\\int{0, 1, x}"`.

- A **language** (L) is a set of strings that are considered "valid" or
  "well-formed". For example, `"2+3"` is in the language of arithmetic
  expressions, but `"2++3"` is not.

The central question of parsing is: **given a string, is it in the language?**
And if so, **what is its structure?**

For BobaMath, the language is "all valid mathematical expressions that can
be typed in our notation system". The parser's job is to determine whether
an input string belongs to this language and, if so, to produce a tree
representing its structure.

---

## What is a Grammar?

A grammar is a finite set of rules that **defines** a language. Instead of
listing every valid string (which would be infinite for most useful languages),
we describe the patterns that valid strings must follow.

A grammar has four components:

1. **Terminal symbols** — the actual characters that appear in the input.
   For BobaMath: `+`, `-`, `*`, `/`, `^`, `(`, `)`, digits, letters, etc.

2. **Non-terminal symbols** — abstract categories that represent groups of
   valid sub-strings. For BobaMath: `Expression`, `Additive`, `Number`, etc.

3. **Production rules** — rules that say how a non-terminal can be expanded
   into a sequence of terminals and non-terminals.

4. **Start symbol** — the non-terminal that represents a complete valid input.
   For BobaMath: `Expression`.

Example grammar for simple addition:

```
Expression → Number "+" Number
Number     → [0-9]+
```

This grammar says: "a valid Expression is a Number, followed by `+`, followed
by another Number". And "a Number is one or more digits". So `"2+3"` is valid,
`"42+7"` is valid, but `"2++"` is not.

---

## The Chomsky Hierarchy

Noam Chomsky (a linguist) classified grammars into four types based on how
powerful (and how complex to parse) they are:

| Type | Name | Power | Parsing complexity |
|------|------|-------|-------------------|
| Type 3 | Regular | Least powerful | O(n) — linear, very fast |
| Type 2 | Context-Free | More powerful | O(n³) worst case |
| Type 1 | Context-Sensitive | Even more powerful | Exponential worst case |
| Type 0 | Unrestricted | Most powerful | Undecidable in general |

Each type is strictly more powerful than the one above it — every regular
language is also context-free, every context-free language is also
context-sensitive, etc.

**Regular languages** (Type 3) can be described by regular expressions.
They can match patterns like "one or more digits" or "a letter followed by
letters or digits", but they CANNOT handle nested structures like balanced
parentheses. You cannot write a regex that matches `((()))` but rejects `(()`.

**Context-free languages** (Type 2) CAN handle nesting and recursion. This
is why programming languages and mathematical expressions need context-free
grammars — they have nested parentheses, nested function calls, nested
expressions within expressions.

BobaMath uses a **context-free grammar** (specifically, a PEG, which is a
deterministic subset of context-free grammars). This gives us the power to
handle arbitrary nesting while keeping parsing efficient.

---

## Context-Free Grammars (CFG)

A context-free grammar (CFG) is the standard tool for defining programming
language syntax. The "context-free" part means: a non-terminal can be
expanded the same way regardless of what surrounds it. The rule
`Number → [0-9]+` applies whether the Number appears after `+` or after `*`.

Here is a CFG for arithmetic with correct precedence:

```
Expression → Additive
Additive   → Additive "+" Multiplicative
           | Additive "-" Multiplicative
           | Multiplicative
Multiplicative → Multiplicative "*" Primary
               | Multiplicative "/" Primary
               | Primary
Primary    → Number
           | "(" Expression ")"
Number     → [0-9]+
```

This grammar encodes that `*` binds tighter than `+` by making `Multiplicative`
a "deeper" rule than `Additive`. To parse `2 + 3 * 4`:

1. Start with `Expression` → `Additive`
2. `Additive` → `Additive "+" Multiplicative`
3. Left `Additive` → `Multiplicative` → `Primary` → `Number` → `2`
4. Right `Multiplicative` → `Multiplicative "*" Primary`
5. Left `Multiplicative` → `Primary` → `Number` → `3`
6. Right `Primary` → `Number` → `4`

Result: `2 + (3 * 4)` — multiplication is deeper in the tree.

---

## Ambiguity in Grammars

A grammar is **ambiguous** if the same string can be parsed in more than one
way. For example, this naive grammar:

```
Expr → Expr "+" Expr | Expr "*" Expr | Number
```

The string `2 + 3 * 4` can be parsed as either `(2 + 3) * 4` or `2 + (3 * 4)`.
Both are valid parse trees under this grammar. This is a problem because we
need exactly ONE interpretation.

Traditional CFGs solve ambiguity by:
1. Restructuring the grammar (as shown above with separate Additive/Multiplicative levels)
2. Adding disambiguation rules external to the grammar

PEG grammars solve ambiguity differently — they are **inherently unambiguous**
by definition, as we'll see next.

---

## Parsing Expression Grammars (PEG)

A **Parsing Expression Grammar** (PEG), introduced by Bryan Ford in 2004,
is an alternative to CFGs that is specifically designed for parsing. The key
difference:

> In a PEG, the choice operator `/` is **ordered** — it tries alternatives
> in order and commits to the first one that succeeds.

In a CFG, the choice `|` means "either of these could be valid" (ambiguous).
In a PEG, the choice `/` means "try the first option; if it fails, try the
second; if that fails, try the third" (deterministic).

This makes PEGs **inherently unambiguous** — every string has at most one
parse tree. There is never a question of "which interpretation is correct"
because the grammar's ordering decides.

### PEG operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `"abc"` | Literal string | Match exactly `abc` |
| `[a-z]` | Character class | Match one lowercase letter |
| `e1 e2` | Sequence | Match e1 then e2 |
| `e1 / e2` | Ordered choice | Try e1; if it fails, try e2 |
| `e*` | Zero-or-more | Match e repeatedly (greedy) |
| `e+` | One-or-more | Match e at least once |
| `e?` | Optional | Match e or nothing |
| `&e` | Positive lookahead | Succeed if e matches, but don't consume |
| `!e` | Negative lookahead | Succeed if e does NOT match |

### PEG for arithmetic

```
Expression  ← Additive
Additive    ← Multiplicative (('+' / '-') Multiplicative)*
Multiplicative ← Primary (('*' / '/') Primary)*
Primary     ← Number / '(' Expression ')'
Number      ← [0-9]+
```

Notice the difference from the CFG version:
- No left recursion (`Additive → Additive "+" ...` is replaced by iteration `*`)
- The choice `/` is ordered (try `Number` before `(Expression)`)
- The repetition `*` handles chains naturally

---

## PEG vs CFG — Key Differences

| Aspect | CFG | PEG |
|--------|-----|-----|
| Choice operator | `\|` (unordered, ambiguous) | `/` (ordered, deterministic) |
| Ambiguity | Possible — must be resolved externally | Impossible by construction |
| Left recursion | Allowed (and common) | NOT allowed (causes infinite loop) |
| Parsing algorithm | Various (LL, LR, Earley, CYK) | Recursive descent with backtracking |
| Worst-case time | O(n³) for general CFG | O(n) with memoisation (packrat) |
| Expressiveness | Can express some languages PEG cannot | Can express some languages CFG cannot |
| Practical use | Formal language theory, parser generators | Direct implementation, scannerless parsing |

**Why we chose PEG over CFG:**

1. **No ambiguity** — we never need to worry about multiple parse trees
2. **Direct implementation** — the grammar IS the parser (no separate parser generator step)
3. **Scannerless** — no separate tokenisation phase needed
4. **Predictable** — the ordered choice makes behaviour easy to reason about
5. **Efficient** — O(n) with memoisation, O(n²) worst case without

---

## Recursive Descent Parsing

**Recursive descent** is a parsing technique where each grammar rule becomes
a function. To parse a rule, you call its function. If a rule references
another rule, you call that function recursively.

```
function parseAdditive():
    left = parseMultiplicative()
    while next token is '+' or '-':
        op = consume token
        right = parseMultiplicative()
        left = BinaryExpression(op, left, right)
    return left
```

This is exactly what our `PEGParser` does. Each rule in the grammar object
corresponds to a `matchRule` call. The `match` function dispatches to
`matchSequence`, `matchChoice`, `matchRepeat`, etc. — each implementing
one PEG operator.

**Advantages of recursive descent:**
- Simple to implement (no complex table-driven algorithms)
- Easy to debug (the call stack shows exactly where you are in the grammar)
- Good error messages (you know which rule failed and where)
- Natural fit for PEG grammars

**The backtracking issue:** When a choice option fails partway through, the
parser must "backtrack" to the position before that option started and try
the next option. In our implementation, this is handled by the `matchChoice`
function always trying each option at the same starting position.

---

## How Our PEG Engine Works

Our `PEGParser` class is a **data-driven recursive descent parser**. Instead
of writing a separate function for each grammar rule, we define the grammar
as a data structure (a JavaScript object) and have one generic engine that
interprets it.

### The grammar data structure

```ts
const grammar: Grammar = {
    "Additive": {
        peg: {
            type: "sequence",
            parts: [
                { type: "rule", name: "Multiplicative" },
                { type: "repeat", expr: {
                    type: "sequence",
                    parts: [
                        { type: "choice", options: [
                            { type: "literal", value: "+" },
                            { type: "literal", value: "-" },
                        ]},
                        { type: "rule", name: "Multiplicative" },
                    ]
                }}
            ]
        },
        build([left, rest]) { /* fold into AST */ }
    },
    // ... more rules
};
```

Each rule has:
- `peg` — a tree of PEG expression nodes describing what to match
- `build` — a function that transforms the raw match result into an AST node

### The matching engine

The `match(expr, position)` function dispatches on `expr.type`:

| Expression type | What it does |
|----------------|--------------|
| `literal` | Skip whitespace, check if input starts with the string |
| `regex` | Skip whitespace, try regex match at current position |
| `sequence` | Match each part in order; fail if any part fails |
| `choice` | Try each option at the same position; return first success |
| `repeat` | Match the inner expression repeatedly until it fails |
| `rule` | Look up the named rule and recursively match it |

### Whitespace handling

The parser has a configurable `skip` pattern (regex `/^[ \t\r\n]+/`). Before
every `literal` and `regex` match, the parser advances past any whitespace.
This means whitespace is ignored between tokens but NOT inside tokens (e.g.,
the rollout `+{` must have no space between `+` and `{`).

### Error reporting

The parser tracks the "best error" — the failure that reached the furthest
position in the input. This heuristic works well because the furthest failure
is usually the one closest to what the user intended. The error message shows
the line, column, a caret pointing to the problem, and what was expected.

---

## The BobaMath Grammar — Design Philosophy

The BobaMath grammar is designed to parse mathematical notation that is:
1. **Typeable on a standard keyboard** — no special input methods needed
2. **Unambiguous** — every valid input has exactly one interpretation
3. **Precedence-correct** — `2 + 3 * x` means `2 + (3 * x)` automatically
4. **Extensible** — new operators and constructs can be added without breaking existing ones
5. **Fast to type** — common operations require minimal keystrokes

### Why not just use LaTeX?

LaTeX is the standard for typesetting mathematics, but it has drawbacks as
an input format for a knowledge system:

| Aspect | LaTeX | BobaMath |
|--------|-------|----------|
| Fractions | `\frac{a}{b}` (10 chars) | `a/b` (3 chars) |
| Superscript | `x^{2}` (5 chars) | `x^2` (3 chars) |
| Integral | `\int_{0}^{1} x^2 \, dx` (23 chars) | `\int{0, 1, x^2}` (16 chars) |
| Greek | `\alpha` (6 chars) | `\a` (2 chars) |
| Implicit multiply | Not supported (must write `\cdot`) | `2x` (2 chars) |
| Parsing | Requires TeX engine | Simple PEG parser |

BobaMath is designed for **fast keyboard input** in a knowledge storage system,
not for typesetting documents. The notation is optimised for the common case:
writing mathematical expressions quickly while reading them back clearly.

### The grammar as a precedence tower

The grammar is structured as a **tower of precedence levels**. Each level
wraps the one below it. The deeper a rule is in the tower, the tighter it
binds:

```
Level 0 (loosest):  Relational    — a = b, x < y
Level 1:            Additive      — a + b, a - b
Level 2:            Multiplicative — a * b, a / b, 2x
Level 3:            Power         — a ^ b
Level 4:            Unary         — -x, +x
Level 5:            Postfix       — f(x), x_i, x!, x'
Level 6 (tightest): Primary       — numbers, identifiers, (expr), |expr|
```

When the parser encounters `2 + 3 * x ^ 2`:
1. It starts at `Relational` (no relational op found, passes through)
2. At `Additive`: parses left `Multiplicative`, sees `+`, parses right `Multiplicative`
3. Right `Multiplicative`: parses `Power` → `3`, sees implicit multiplication, parses `ImplicitPower`
4. `ImplicitPower`: parses `Postfix` → `Primary` → `x`, sees `^`, parses `Unary` → `2`
5. Result: `2 + (3 * (x ^ 2))`

The tree structure naturally encodes the precedence without any explicit
precedence numbers or disambiguation rules.

---

## Operator Precedence via Grammar Structure

This is the most important design principle in the grammar. Instead of
assigning numeric precedence values to operators (as some parser generators
do), we encode precedence **structurally** — by the nesting depth of rules.

### How it works

Consider the rules:
```
Additive       → Multiplicative (('+' / '-') Multiplicative)*
Multiplicative → Power (('*' / '/') Power)*
```

To parse `a + b * c`:
1. `Additive` calls `Multiplicative` for the left operand
2. `Multiplicative` calls `Power` → gets `a`. No `*` or `/` follows `a` (next is `+`). Returns `a`.
3. Back in `Additive`: sees `+`. Calls `Multiplicative` for the right operand.
4. `Multiplicative` calls `Power` → gets `b`. Sees `*`. Calls `Power` → gets `c`. Returns `b * c`.
5. `Additive` returns `a + (b * c)`.

The key insight: `Multiplicative` is called FROM `Additive`. So by the time
`Additive` sees the `+`, everything at the multiplicative level and below has
already been consumed into a single node. This is why `*` binds tighter — it
is resolved first, at a deeper level of the call stack.

### Why this is elegant

- No precedence tables to maintain
- No ambiguity to resolve
- Adding a new precedence level = inserting a new rule between two existing ones
- The grammar IS the specification of precedence

---

## Associativity — Left vs Right

**Left-associativity** means `a - b - c = (a - b) - c`. Most operators are
left-associative. In the grammar, this is achieved by the `*` (repeat)
operator combined with a left-fold in the build function:

```ts
// PEG: Multiplicative (('+' / '-') Multiplicative)*
// Match produces: [left, [[op1, right1], [op2, right2], ...]]

build([left, rest]) {
    let node = left;
    for (const [op, right] of rest) {
        node = BinaryExpression(op, node, right);  // left-fold
    }
    return node;
}
```

For `a - b - c`: left=`a`, rest=`[[-, b], [-, c]]`
- Iteration 1: node = `(a - b)`
- Iteration 2: node = `((a - b) - c)` ✓

**Right-associativity** means `a ^ b ^ c = a ^ (b ^ c)`. Exponentiation is
right-associative. The build function uses a right-fold instead:

```ts
// PEG: Unary ('^' Unary)*
// Match produces: [left, [[^, a], [^, b], ...]]

build([left, rest]) {
    if (rest.length === 0) return left;
    let node = rest[rest.length - 1][1];  // start from the right
    for (let i = rest.length - 2; i >= 0; i--) {
        node = BinaryExpression('^', rest[i][1], node);  // right-fold
    }
    return BinaryExpression('^', left, node);
}
```

For `a ^ b ^ c`: left=`a`, rest=`[[^, b], [^, c]]`
- Start: node = `c`
- Iteration (i=0): node = `(b ^ c)`
- Final: `(a ^ (b ^ c))` ✓

The grammar structure (PEG rules) is the same for both — the difference is
entirely in the `build` function's folding direction.

---

## Implicit Multiplication — The Hard Problem

Implicit multiplication (`2x` meaning `2 * x`) is the most challenging
aspect of the BobaMath grammar. It is difficult because:

1. **No operator token** — the parser must recognise that two adjacent
   parseable things means "multiply", without any explicit `*` character
2. **Conflicts with unary operators** — in `3+5`, the `+` is additive, but
   implicit multiplication could try to consume it as a unary `+`
3. **Conflicts with other constructs** — `f(x)` is a function call, not
   `f * (x)`; `x_i` is a subscript, not `x * _i`

### The solution: `ImplicitPower`

The grammar uses a special rule `ImplicitPower` for the implicit multiplication
branch. It is identical to `Power` except it starts from `Postfix` instead of
`Unary`:

```
Power         → Unary ('^' Unary)*        ← can consume leading +/-
ImplicitPower → Postfix ('^' Unary)*      ← CANNOT consume leading +/-
```

In the `Multiplicative` repeat, the choice is:
```
Multiplicative → Power ((MultiplicativeOp Power) | ImplicitPower)*
```

The first option handles explicit operators (`*`, `/`, `.`, `\mod`, `\div`).
The second option handles implicit multiplication. Because `ImplicitPower`
starts from `Postfix` (not `Unary`), it cannot consume a leading `+` or `-`.
This means in `3 + 5`, after parsing `3`, the implicit multiplication branch
tries `Postfix` → `Primary` → but `+` is not a valid Primary start, so it
fails. The `+` is left for `Additive` to handle correctly.

### Why this was hard to get right (Issue 2 from Phase 1)

The original implementation used `Power` for implicit multiplication. This
caused `(3+5)` to be parsed as `3*(+5)`:

1. `Multiplicative` parses `3` as the initial Power
2. Repeat: tries implicit `Power` → `Unary` → sees `+`, consumes it as unary plus
3. `Unary` recursively parses `5)` → gets `5`
4. Result: `3 * (+5)` — WRONG!

The fix (`ImplicitPower` starting from `Postfix`) prevents step 2 from
consuming the `+` because `Postfix` → `Primary` cannot match `+`.

---

## The Identifier System — Script-Agnostic Parsing

### The problem

Mathematical notation uses symbols from many scripts: Latin (a, b, x),
Greek (α, β, γ), Hebrew (ℵ), blackboard bold (ℝ, ℤ), and potentially
Cyrillic, Armenian, Georgian, and Persian. A naive approach would create
separate grammar rules for each script. This is fragile and requires grammar
changes whenever a new symbol is added.

### The solution: separation of concerns

The system separates **parsing** (syntax) from **rendering** (semantics):

**Parser** — knows only about syntactic prefixes:
- No prefix → plain Latin identifier (`a`, `x`)
- Backtick prefix → skewed Latin (`` `a ``, `` `1T ``)
- Single backslash → backslash identifier (`\a`, `\sin`, `\ha`, `\pm`)
- Double backslash → blackboard bold (`\\R`, `\\N`)
- Digit after prefix → right-skew variant (`\1a`, `` `1T ``)

The parser produces `IdentifierNode { name: "ha", prefix: "greek" }` without
knowing or caring that `ha` means Hebrew aleph.

**Renderer** — knows about meaning via a lookup table:
```ts
GLYPH_TABLE["ha"] = "ℵ"   // Hebrew aleph
GLYPH_TABLE["a"]  = "α"   // Greek alpha
GLYPH_TABLE["sin"] = undefined  // no entry → renders as "sin"
```

### Why this architecture is powerful

- **Adding a symbol** = one line in `GLYPH_TABLE`. No grammar change.
- **Adding a script** = adding entries with a naming prefix. No grammar change.
- **Unknown symbols** render as their name (never crash). `\foo` → "foo".
- **The grammar is frozen** — it never needs to change for new symbols.
- **The parser is fast** — one regex per identifier form, no script detection.

---

## Tokenisation vs Scannerless Parsing

Traditional compilers have two phases:
1. **Lexer/Tokeniser** — reads characters, produces tokens (e.g., `NUMBER(42)`, `PLUS`, `IDENTIFIER("x")`)
2. **Parser** — reads tokens, produces AST

Our system is **scannerless** — there is no separate tokenisation phase. The
PEG parser reads characters directly. The `skip` pattern handles whitespace,
and each rule's `literal` or `regex` expressions handle token recognition
inline.

### Advantages of scannerless parsing

- **Simpler architecture** — one phase instead of two
- **Context-sensitive tokenisation** — the same character can mean different
  things depending on grammar context (e.g., `|` is absolute value delimiter
  in Primary but could be something else in a future context)
- **No token conflicts** — no need to resolve "is `<=` one token or two?"
  at the lexer level; the grammar handles it via ordered choice

### Disadvantages

- **Whitespace handling** — must be explicit (the `skip` pattern)
- **Performance** — slightly slower than a separate lexer for very large inputs
  (not relevant for single-line math expressions)

---

## Abstract Syntax Trees (AST)

The AST is the central data structure of the system. It represents the
**meaning** of an expression, stripped of syntactic details like whitespace
and parentheses.

### Why "abstract"?

The AST is "abstract" because it discards information that is syntactically
necessary but semantically irrelevant:

| Present in input | Present in AST? | Why? |
|-----------------|-----------------|------|
| `2 + 3` (spaces) | No | Whitespace is formatting, not meaning |
| `(2 + 3)` (parens) | No | Parens affect structure, which is already encoded in the tree |
| `2 + 3` (operator) | Yes | The `+` is the meaning |
| `2`, `3` (operands) | Yes | The values are the meaning |

### Tree structure encodes precedence

```
Input: 2 + 3 * 4

AST:
    BinaryExpression(+)
    ├── NumberLiteral(2)
    └── BinaryExpression(*)
        ├── NumberLiteral(3)
        └── NumberLiteral(4)
```

The `*` node is deeper (a child of the `+` node). When evaluating or
rendering, deeper nodes are processed first. This naturally gives `*` higher
precedence than `+`.

### Node types in BobaMath

Each node type represents one kind of mathematical construct:

| Node type | Represents | Example input |
|-----------|-----------|---------------|
| `NumberLiteral` | A numeric constant | `42`, `3.14` |
| `Identifier` | A named symbol | `x`, `\alpha`, `\\R` |
| `BinaryExpression` | Two operands + operator | `a + b`, `x ^ 2` |
| `UnaryExpression` | One operand + prefix op | `-x`, `+y` |
| `CallExpression` | Function application | `f(x)`, `sin(x)` |
| `ControlExpression` | Special notation | `\int{0,1,x}`, `\sqrt{x}` |
| `SubscriptExpression` | Label subscript | `x_i` |
| `SubSuperscriptExpression` | Combined sub+super | `x_i^2` |
| `VectorName` | Vector decorator | `[a]` |
| `Matrix` | Array of expressions | `[[a,b],[c,d]]` |
| `IndexExpression` | Array access | `A[k]` |
| `AbsoluteValue` | Absolute value/norm | `|x|` |
| `FactorialExpression` | Factorial | `n!` |
| `Derivative` | Prime derivative | `f'`, `f''` |
| `Ellipsis` | Sequence continuation | `...` |
| `Piecewise` | Piecewise function | `\piecewise{...}` |

---

## From AST to Visual Output — The Rendering Pipeline

The renderer walks the AST and produces HTML elements. Each node type has
a dedicated rendering function that knows how to produce the correct visual
representation.

### The pipeline

```
"2 + 3/x"
    │
    ▼  [Parser]
BinaryExpression(+)
├── NumberLiteral(2)
└── BinaryExpression(/)
    ├── NumberLiteral(3)
    └── Identifier(x)
    │
    ▼  [Renderer]
<span class="native-math">
  <span>2</span>
  <span> + </span>
  <span class="fraction">
    <span class="top">3</span>
    <span class="bottom">x</span>
  </span>
</span>
    │
    ▼  [Browser CSS]
         3
  2  +  ─
         x
```

### Key rendering decisions

1. **Division → stacked fraction** — `a/b` renders as a vertical fraction,
   not as `a ÷ b`. This matches standard mathematical typesetting.

2. **Multiplication → juxtaposition** — `a*b` renders as `ab` with no
   visible operator. This matches how mathematicians write products.

3. **Automatic parenthesisation** — the renderer adds parentheses only when
   needed for clarity, based on comparing operator precedences between parent
   and child nodes.

4. **Glyph resolution** — identifiers are resolved to their visual form at
   render time, not parse time. This keeps the AST clean and the parser simple.

---

## Why Not Use an Existing Tool?

There are many parser generators and math rendering libraries available.
Here is why we built our own:

| Existing tool | Why not used |
|--------------|--------------|
| **PEG.js / Peggy** | Requires a build step (generates parser code from a `.pegjs` file). Our grammar is a runtime data structure — inspectable, modifiable, composable. |
| **ANTLR** | Heavy dependency, Java-based toolchain, generates code. Overkill for a single-expression parser. |
| **MathJax / KaTeX** | Render LaTeX, not a custom notation. Cannot parse BobaMath syntax. Would require converting to LaTeX first, losing the direct AST. |
| **math.js** | Evaluates expressions (computes results). We need to RENDER them visually, not evaluate them. Different goal entirely. |
| **Nearley** | Earley parser — handles ambiguous grammars. We don't want ambiguity; PEG's determinism is a feature. |

### Benefits of our approach

- **Zero dependencies** — no external parsing library to install, update, or debug
- **Full control** — we can add any syntax feature without waiting for upstream support
- **Runtime grammar** — the grammar object can be inspected, composed with other grammars (future plugin system), or modified at runtime
- **Tight integration** — parser and renderer share type definitions; no serialisation boundary
- **Small size** — the entire parser engine is ~150 lines of TypeScript

---

## Summary of Design Principles

1. **Precedence is structural** — encoded by grammar rule nesting, not numeric tables
2. **Determinism over ambiguity** — PEG's ordered choice eliminates all ambiguity
3. **Separation of syntax and semantics** — parser handles structure, renderer handles meaning
4. **Script-agnostic parsing** — one grammar rule for all backslash identifiers; a lookup table for glyphs
5. **Scannerless** — no separate tokenisation phase; the grammar handles everything
6. **Data-driven** — the grammar is a data structure interpreted by a generic engine, not hand-written recursive functions
7. **Composable** — the grammar object can be extended or composed with other grammars for the future plugin system
8. **Minimal** — every rule exists because it solves a specific problem; no speculative abstractions

These principles ensure the system remains maintainable, extensible, and
correct as new phases add more syntax (linear algebra, geometry, chemistry,
etc.) on top of the existing foundation.


---

## Appendix A — Academic Discipline Map

This section maps every concept in this project to its academic home: which
field of mathematics or computer science it belongs to, what courses teach it,
and what prerequisites are needed.

---

### Where Do Parsers Belong?

Parsers belong to **Computer Science**, specifically to the subfield called
**Theory of Computation** (also called **Theoretical Computer Science**). Within
that, they sit at the intersection of two areas:

```
Mathematics
└── Discrete Mathematics
    └── Set Theory, Logic, Relations, Functions
        └── Formal Language Theory (pure math)
            └── Automata Theory (abstract machines)

Computer Science
└── Theory of Computation
    ├── Formal Languages & Automata (theoretical foundation)
    └── Compiler Construction (practical application)
        └── Parsing (the specific technique)
```

**Parsing** is the practical engineering application of formal language theory.
The theory tells us what languages exist and what machines can recognise them.
Parsing is the act of building such a machine for a specific language.

---

### Where Do Programming Languages and Mathematical Notations Belong?

Programming languages and mathematical notation systems (like BobaMath) are
**formal languages** — they belong to the field of **Formal Language Theory**
in mathematics, and to **Programming Language Theory** in computer science.

```
Natural languages (English, Japanese, ...)
  → studied by Linguistics
  → not formal — ambiguous, context-dependent, evolving

Formal languages (Python, C, BobaMath, regex, ...)
  → studied by Mathematics (Formal Language Theory)
  → studied by Computer Science (Compiler Construction, PL Theory)
  → precise — every string is either in the language or not
  → defined by a grammar (a finite set of rules)
```

A mathematical notation like BobaMath is a formal language in exactly the same
sense as Python or C. It has:
- An alphabet (the characters you can type)
- A grammar (the rules defining valid expressions)
- A semantics (what each valid expression means)

The grammar is studied by formal language theory. The semantics is studied by
programming language theory (denotational semantics, operational semantics).

---

### Prerequisite Dependency Chain

To fully understand parsing and formal languages, you need concepts from
several prerequisite fields. Here is the dependency chain:

```
Level 0 — High School Mathematics
├── Basic logic (and, or, not, implication)
├── Set notation ({}, ∈, ⊂, ∪, ∩)
├── Functions (domain, codomain, composition)
└── Proof techniques (direct, contradiction, induction)

Level 1 — Discrete Mathematics (university year 1-2)
├── Set theory (formal: power sets, Cartesian products, relations)
├── Mathematical logic (propositional, predicate, proof systems)
├── Relations and functions (injective, surjective, bijective)
├── Graph theory (directed graphs, trees, paths)
├── Combinatorics (counting, recursion)
└── Mathematical induction (weak, strong, structural)

Level 2 — Formal Languages & Automata Theory (university year 2-3)
├── Alphabets, strings, languages (formal definitions)
├── Regular languages and finite automata (DFA, NFA)
├── Regular expressions (formal, not programming regex)
├── Context-free languages and pushdown automata
├── Context-free grammars (production rules, derivations)
├── The Chomsky hierarchy (Type 0-3)
├── Parsing algorithms (LL, LR, Earley, CYK)
├── Decidability and undecidability
└── The pumping lemma (proving a language is NOT regular/CF)

Level 3 — Compiler Construction (university year 3-4)
├── Lexical analysis (tokenisation, regular expressions)
├── Syntax analysis (parsing, grammar design)
├── Abstract syntax trees
├── Semantic analysis (type checking, scope resolution)
├── Intermediate representations
├── Code generation
└── Optimisation

Level 3 (parallel) — Programming Language Theory (year 3-4)
├── Syntax specification (BNF, EBNF, PEG)
├── Denotational semantics
├── Operational semantics
├── Type theory
├── Lambda calculus
└── Language design principles
```

**For this project specifically**, you need:
- Level 0: basic logic and sets (to understand grammar rules)
- Level 1: trees and recursion (to understand ASTs and recursive descent)
- Level 2: formal languages, CFGs, the Chomsky hierarchy (to understand WHY
  the grammar is structured the way it is)
- Level 3 (Compilers): parsing techniques (to understand the PEG engine)

---

### Mathematical Foundations in Detail

#### Sets, Relations, and Functions (Discrete Mathematics)

**Course:** Discrete Mathematics / Set Theory
**Prerequisite for:** Everything else in formal language theory

A **set** is a collection of distinct objects: `S = {a, b, c}`.
A **relation** R on sets A and B is a subset of A × B (the Cartesian product).
A **function** f: A → B is a relation where each element of A maps to exactly
one element of B.

**Relevance to parsing:**
- An alphabet Σ is a set
- A language L is a set of strings
- A grammar defines a function from derivations to strings
- The parse function maps strings to ASTs (a partial function — undefined for
  invalid inputs)

#### Strings and String Operations (Formal Language Theory)

**Course:** Formal Languages & Automata Theory
**Prerequisite:** Set theory

Given an alphabet Σ = {a, b, c, ...}:
- A **string** (or **word**) is a finite sequence of symbols from Σ
- The **empty string** is denoted ε (epsilon) — it has length 0
- **Σ\*** (Kleene star) is the set of ALL possible strings over Σ, including ε
- **Σ⁺** is Σ* minus ε (all non-empty strings)
- **Concatenation**: if w = "ab" and v = "cd", then wv = "abcd"
- **Length**: |w| is the number of symbols in w. |"abc"| = 3, |ε| = 0

A **language** L is any subset of Σ*: L ⊆ Σ*

Examples:
- L₁ = {strings of balanced parentheses} = {"", "()", "(())", "()()", ...}
- L₂ = {valid BobaMath expressions} = {"2+3", "x^2", "\int{0,1,x}", ...}
- L₃ = {all binary strings with equal 0s and 1s} = {"", "01", "10", "0011", ...}

#### Formal Definition of a Grammar (Formal Language Theory)

**Course:** Formal Languages & Automata Theory
**Prerequisite:** Sets, strings

A **grammar** is a 4-tuple G = (N, Σ, P, S) where:
- **N** = finite set of non-terminal symbols (abstract categories)
- **Σ** = finite set of terminal symbols (actual characters), N ∩ Σ = ∅
- **P** = finite set of production rules
- **S** ∈ N = the start symbol

For a **context-free grammar** (Type 2), each production rule has the form:
```
A → α
```
where A ∈ N (a single non-terminal) and α ∈ (N ∪ Σ)* (any sequence of
terminals and non-terminals, including ε).

**Example — BobaMath simplified:**
```
G = (N, Σ, P, S) where:
  N = {Expr, Add, Mul, Prim, Num, Id}
  Σ = {0,1,...,9, a,...,z, +, -, *, /, ^, (, )}
  S = Expr
  P = {
    Expr → Add,
    Add  → Mul (('+' | '-') Mul)*,
    Mul  → Prim (('*' | '/') Prim)*,
    Prim → Num | Id | '(' Expr ')',
    Num  → [0-9]+,
    Id   → [a-z],
  }
```

#### Derivations and Parse Trees (Formal Language Theory)

**Course:** Formal Languages & Automata Theory
**Prerequisite:** Grammars

A **derivation** is a sequence of rule applications that transforms the start
symbol into a string of terminals:

```
Expr ⟹ Add ⟹ Mul ⟹ Mul '*' Prim ⟹ Prim '*' Prim ⟹ Num '*' Prim
     ⟹ '2' '*' Prim ⟹ '2' '*' Id ⟹ '2' '*' 'x'
```

Each `⟹` replaces one non-terminal with the right side of one of its rules.

A **parse tree** (or derivation tree) is the tree representation of a
derivation. Each internal node is a non-terminal, each leaf is a terminal,
and the children of a node correspond to the right side of the rule used.

An **abstract syntax tree** (AST) is a simplified parse tree that discards
nodes which carry no semantic information (like grouping parentheses and
intermediate non-terminals that just pass through).

#### Automata — The Machines That Recognise Languages (Automata Theory)

**Course:** Formal Languages & Automata Theory
**Prerequisite:** Sets, relations, state machines

Each level of the Chomsky hierarchy corresponds to a type of abstract machine:

| Language type | Machine | Description |
|--------------|---------|-------------|
| Regular (Type 3) | Finite Automaton (DFA/NFA) | Fixed number of states, no memory |
| Context-Free (Type 2) | Pushdown Automaton (PDA) | Finite states + one stack (unlimited memory in LIFO order) |
| Context-Sensitive (Type 1) | Linear Bounded Automaton | Turing machine with tape limited to input length |
| Recursively Enumerable (Type 0) | Turing Machine | Unlimited tape, unlimited computation |

**Why this matters for parsing:**

A parser is an implementation of the machine that recognises a language. Our
PEG parser is essentially a **pushdown automaton** — it uses the call stack
as its stack memory. Each recursive call to `matchRule` pushes a frame onto
the stack; each return pops it. This is why recursive descent parsing can
handle context-free languages (which require a stack) but not context-sensitive
languages (which require more).

The call stack during parsing of `2 + 3 * x`:
```
matchRule("Expression")
  matchRule("Relational")
    matchRule("Additive")
      matchRule("Multiplicative")
        matchRule("Power")
          matchRule("Unary")
            matchRule("Postfix")
              matchRule("Primary")
                matchRule("Number")     ← matches "2"
```

The depth of this stack corresponds to the depth of the grammar hierarchy.
This is the pushdown automaton's stack in action.

#### Regular Expressions — Formal vs Practical (Automata Theory + Compilers)

**Course:** Formal Languages & Automata Theory (formal definition),
Compiler Construction (practical use)
**Prerequisite:** Finite automata

In formal language theory, a **regular expression** over alphabet Σ is defined
inductively:
- ε is a regular expression (matches the empty string)
- For each a ∈ Σ, `a` is a regular expression (matches the single character a)
- If r and s are regular expressions, then:
  - `rs` is a regular expression (concatenation)
  - `r|s` is a regular expression (alternation/choice)
  - `r*` is a regular expression (Kleene star: zero or more repetitions)

That's it — formal regular expressions have only three operators:
concatenation, alternation, and Kleene star.

**Programming regex** (like JavaScript's `/^[0-9]+(\.[0-9]*)?/`) adds many
extensions: character classes `[...]`, quantifiers `+`, `?`, `{n,m}`,
anchors `^`, `$`, lookaheads `(?=...)`, backreferences `\1`. Some of these
(like backreferences) make the language MORE powerful than regular — they can
match some context-free or even context-sensitive patterns.

In our parser, we use programming regex for **token-level matching** (numbers,
identifiers) but the overall expression structure is handled by the PEG grammar
(which is context-free). This is a common hybrid approach.

#### Computability and Decidability (Theory of Computation)

**Course:** Theory of Computation / Computability Theory
**Prerequisite:** Automata theory, mathematical logic

A problem is **decidable** if there exists an algorithm that always terminates
and gives the correct yes/no answer. A problem is **undecidable** if no such
algorithm exists.

**Relevance to parsing:**
- "Is string w in language L?" is decidable for regular and context-free
  languages (we can always determine if an input is valid)
- "Is grammar G ambiguous?" is UNDECIDABLE for general CFGs (there is no
  algorithm that can determine if an arbitrary CFG has ambiguous strings)
- "Do grammars G₁ and G₂ generate the same language?" is undecidable for CFGs

This is why PEG's inherent unambiguity is valuable — we never need to answer
the undecidable question "is my grammar ambiguous?" because PEGs cannot be
ambiguous by construction.

#### Complexity — How Fast Can We Parse? (Algorithms / Theory of Computation)

**Course:** Algorithms & Complexity / Theory of Computation
**Prerequisite:** Asymptotic notation (Big-O), basic algorithms

| Parsing algorithm | Time complexity | Space | Grammar type |
|-------------------|----------------|-------|-------------|
| DFA (regex) | O(n) | O(1) | Regular only |
| LL(k) | O(n) | O(n) | Subset of CFG |
| LR(k) | O(n) | O(n) | Larger subset of CFG |
| Earley | O(n³) worst, O(n) for unambiguous | O(n²) | All CFGs |
| CYK | O(n³) | O(n²) | All CFGs (in CNF) |
| PEG recursive descent | O(n²) worst | O(n) | PEG languages |
| PEG packrat (memoised) | O(n) | O(n) | PEG languages |

Our parser uses **recursive descent without memoisation**. For typical
mathematical expressions (short strings, <100 characters), the O(n²) worst
case is irrelevant — parsing is instantaneous. If performance ever became an
issue (e.g., parsing very long expressions), adding memoisation (packrat
parsing) would make it O(n).

#### Fixed-Point Theory and Grammar Semantics (Programming Language Theory)

**Course:** Programming Language Theory / Denotational Semantics
**Prerequisite:** Set theory, lattice theory, topology (basics)

A grammar with recursive rules (like `Expression → ... Expression ...`) defines
a language as the **least fixed point** of a monotone function on sets of
strings. This is the mathematical justification for why recursive grammars
work:

Define F: 𝒫(Σ*) → 𝒫(Σ*) where F(L) applies one step of all grammar rules
to the set L. The language generated by the grammar is:

```
L(G) = lfp(F) = ⋃_{n=0}^{∞} Fⁿ(∅)
```

This is the least fixed point — the smallest set that is closed under all
production rules. It exists by the Knaster-Tarski theorem (every monotone
function on a complete lattice has a least fixed point).

**In plain terms:** start with the empty set, repeatedly apply grammar rules
to generate new strings, and the language is everything you can ever generate.
The process converges because each rule application can only add strings, never
remove them (monotonicity).

---

### Concept-to-Course Reference Table

| Concept | Mathematics field | CS field | Typical course |
|---------|------------------|----------|----------------|
| Sets, relations, functions | Set Theory | — | Discrete Mathematics |
| Mathematical induction | Number Theory / Logic | — | Discrete Mathematics |
| Trees (as data structures) | Graph Theory | Data Structures | Discrete Math / DS&A |
| Recursion | — | Algorithms | DS&A / Programming |
| Alphabets, strings, Σ* | Formal Language Theory | — | Formal Languages & Automata |
| Grammars (N, Σ, P, S) | Formal Language Theory | — | Formal Languages & Automata |
| Chomsky hierarchy | Formal Language Theory | — | Formal Languages & Automata |
| Regular expressions (formal) | Formal Language Theory | — | Formal Languages & Automata |
| Finite automata (DFA, NFA) | Automata Theory | — | Formal Languages & Automata |
| Pushdown automata | Automata Theory | — | Formal Languages & Automata |
| Decidability | Computability Theory | Theory of Computation | Theory of Computation |
| Time complexity (Big-O) | — | Complexity Theory | Algorithms / Theory of Comp |
| Parsing algorithms (LL, LR) | — | Compiler Construction | Compilers |
| PEG grammars | — | Compiler Construction | Compilers / PL Theory |
| Recursive descent | — | Compiler Construction | Compilers |
| AST construction | — | Compiler Construction | Compilers |
| Lexical analysis | — | Compiler Construction | Compilers |
| BNF / EBNF notation | — | PL Theory | Compilers / PL Theory |
| Denotational semantics | Domain Theory | PL Theory | PL Theory |
| Fixed-point theory | Order Theory / Topology | PL Theory | PL Theory (advanced) |
| Type systems | Logic (Curry-Howard) | PL Theory | PL Theory |
| Lambda calculus | Mathematical Logic | PL Theory | PL Theory |
| Pattern matching | — | Functional Programming | FP / Compilers |
| DOM manipulation | — | Web Engineering | Web Development |
| CSS layout | — | Web Engineering | Web Development |

---

### How Parsing Algorithms Work Mathematically

#### The Recognition Problem

**Formal statement:** Given a grammar G = (N, Σ, P, S) and a string w ∈ Σ*,
determine whether w ∈ L(G) — i.e., whether w can be derived from S using
the rules in P.

This is the fundamental problem that all parsers solve. Different algorithms
solve it with different tradeoffs:

#### Top-Down Parsing (what we use)

**Approach:** Start from the start symbol S and try to derive the input string
by expanding non-terminals from left to right.

**Mathematically:** Find a leftmost derivation S ⟹* w, where at each step
the leftmost non-terminal is expanded.

**Algorithm (recursive descent):**
```
function parse(rule, input, position):
    for each production A → α of rule:
        result = tryMatch(α, input, position)
        if result.success:
            return result
    return failure
```

This is a depth-first search through the space of possible derivations.
PEG's ordered choice makes this search deterministic (no backtracking to
previously successful choices).

#### Bottom-Up Parsing (LR parsers — not used here, but important to know)

**Approach:** Start from the input string and try to reduce it back to the
start symbol by applying rules in reverse.

**Mathematically:** Find a rightmost derivation in reverse. At each step,
identify a substring that matches the right side of a rule (a "handle") and
replace it with the left side.

**Example:** Parsing `2 + 3 * x` bottom-up:
```
2 + 3 * x
Num + 3 * x       (reduce 2 → Num)
Prim + 3 * x      (reduce Num → Prim)
Mul + 3 * x       (reduce Prim → Mul)
Add + 3 * x       (reduce Mul → Add)
Add + Num * x     (reduce 3 → Num)
Add + Prim * x    (reduce Num → Prim)
Add + Mul * x     (reduce Prim → Mul)
Add + Mul * Id    (reduce x → Id)
Add + Mul * Prim  (reduce Id → Prim)
Add + Mul         (reduce Mul * Prim → Mul)
Add               (reduce Add + Mul → Add)
Expr              (reduce Add → Expr)
```

LR parsers use a **state machine + stack** to determine which reductions to
apply. They are more powerful than LL parsers (can handle left-recursive
grammars) but harder to implement by hand.

#### PEG Parsing as Logical Deduction

A PEG can be viewed as a system of **logical assertions**. Each rule
`A ← e` asserts: "at position p, non-terminal A matches if and only if
expression e matches at position p".

The parsing process is a proof search: "prove that the start symbol matches
the entire input". Each rule application is a proof step. The ordered choice
`e₁ / e₂` means "try to prove e₁ first; only if that proof fails, try e₂".

This logical view explains why PEGs are deterministic: the proof search has
a fixed strategy (try options in order), so there is exactly one proof (or
no proof) for any input.

---

### The Mathematical Structure of Our Grammar

Our BobaMath grammar, viewed as a formal object:

```
G = (N, Σ, P, S) where:

N = { Expression, Relational, RelationalOp, Additive, Multiplicative,
      MultiplicativeOp, Power, ImplicitPower, Unary, Postfix, Primary,
      CallSuffix, ControlSuffix, SubscriptSuffix, FactorialSuffix,
      DerivativeSuffix, IndexSuffix, ArgumentList, RolloutExpression,
      Ellipsis, AbsoluteValue, BracketExpression, BracketContent,
      MatrixRows, MatrixRow, BracketList, ParenExpression, Number,
      Identifier, BlackboardBoldIdentifier, RightSkewGreekIdentifier,
      GreekIdentifier, RightSkewIdentifier, LeftSkewIdentifier,
      PlainIdentifier }

Σ = { 0-9, a-z, A-Z, +, -, *, /, ^, (, ), [, ], {, }, |, _, ., ',
      !, =, <, >, ~, :, ;, ,, \, ` }

S = Expression

P = (see grammar.ts — each rule object is one production)
```

The grammar has **34 non-terminals** and generates an infinite language
(because of recursion: Expression → ... → Primary → (Expression) → ...).

The **depth of the precedence tower** (7 levels from Expression to Primary)
determines the maximum recursion depth for a single precedence decision.
Actual recursion depth for a given input depends on nesting: `((((x))))` has
depth 4 × 7 = 28 recursive calls.

---

### Formal Properties of the BobaMath Language

| Property | Value | Implication |
|----------|-------|-------------|
| Language class | Context-free (PEG subset) | Can be parsed in polynomial time |
| Ambiguity | None (PEG guarantee) | Every input has exactly one parse tree |
| Left-recursive | No | Required for PEG (would cause infinite loop) |
| LL(k) | Approximately LL(2) | Most decisions need at most 2 lookahead tokens |
| Deterministic | Yes | No backtracking to previously committed choices |
| Alphabet size | ~70 characters | Standard ASCII keyboard |
| Recursion | Through parentheses and brackets | Enables arbitrary nesting depth |
| Longest match | Greedy (PEG default) | `\sin` consumed as one token, not `\s` + `in` |
