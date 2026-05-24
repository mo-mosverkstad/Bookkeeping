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
- **Ordered knowledge topology** — the graph is currently unordered. A
  reference sheet is not just a set of formulas; it is a layered, ordered
  knowledge topology with derivation order, dependency order, pedagogical
  order, logical proof order, canonical presentation order, transformation
  order, and hierarchy order. This is addressed in Phase 9 via a separate
  semantic layer (`SemanticGraph`) that adds `Concept`, `Collection`,
  `CollectionItem` (with explicit `position` and `orderingType`), and
  `FormulaFamily` on top of the existing flat model without modifying it.
- **Stable entity identity** — entity IDs are currently the mutable
  first-cell string value. Renaming a row silently breaks all graph edges
  pointing to it. Phase 10 introduces stable UUIDs and a persistent ID
  registry to decouple identity from display name.

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

### Database Design Analysis

This section analyses how the Bookkeeping data model maps to a database,
what database paradigm fits best, and what the concrete schema looks like.
This is a study section — no implementation is planned until Phase 11 or
later. The analysis informs the native format design and the long-term
storage strategy for the non-web implementations (Rust, Java, Python).

---

#### The three layers that need storage

The full Bookkeeping data model has three distinct layers, each with
different structural characteristics:

```
Layer 1 — Flat tabular data
  Tables, columns, rows, typed cells
  → Homogeneous within a table, heterogeneous across tables
  → Natural fit: relational tables

Layer 2 — Association graph
  Directed typed edges between entities (uses, derives-from, etc.)
  → Sparse, variable degree, vocabulary-controlled
  → Natural fit: edge table in relational, or native graph DB

Layer 3 — Semantic graph
  Generic labelled property graph (SemanticNode + SemanticEdge)
  → Fully schema-free, arbitrary property bags
  → Natural fit: property graph DB, or EAV in relational
```

These three layers have different query patterns, different mutability
characteristics, and different structural shapes. No single database
paradigm is a perfect fit for all three simultaneously. The analysis
below examines the options.

---

#### Option 1 — Pure relational (SQLite)

Map all three layers into relational tables.

**Layer 1 — Flat tabular data**

Two approaches exist:

*Approach A — one table per knowledge table (dynamic schema):*
```sql
CREATE TABLE theorems (
    uuid        TEXT PRIMARY KEY,
    name        TEXT,
    statement   TEXT,   -- raw BobaMath source
    domain      TEXT
);
```
Advantage: natural SQL queries, typed columns, fast column scans.
Disadvantage: schema must be created dynamically when the user defines
a new table. Adding a column requires `ALTER TABLE`. Schema migrations
are needed when the user renames or removes a column.

*Approach B — universal EAV (Entity-Attribute-Value):*
```sql
CREATE TABLE entity (
    uuid        TEXT PRIMARY KEY,
    table_name  TEXT NOT NULL
);

CREATE TABLE cell (
    entity_uuid TEXT NOT NULL REFERENCES entity(uuid),
    col_name    TEXT NOT NULL,
    type_id     TEXT NOT NULL,   -- "text", "math", etc.
    value       TEXT NOT NULL,
    PRIMARY KEY (entity_uuid, col_name)
);
```
Advantage: no schema migrations ever. Any column can be added to any
table at any time by inserting a new `cell` row.
Disadvantage: querying a full row requires joining N cell rows. Sorting
by a column value requires a subquery. Performance degrades for wide
tables. SQL loses its natural expressiveness.

*Approach C — hybrid: one metadata table + JSON column for cells:*
```sql
CREATE TABLE kb_table (
    name        TEXT PRIMARY KEY,
    columns_json TEXT NOT NULL   -- [{name, typeId}, ...]
);

CREATE TABLE kb_row (
    uuid        TEXT PRIMARY KEY,
    table_name  TEXT NOT NULL REFERENCES kb_table(name),
    cells_json  TEXT NOT NULL,   -- {"Name": "FTC", "Statement": "..."}
    position    INTEGER NOT NULL -- row order within the table
);
```
Advantage: schema-free cells (no migrations), row order preserved,
still queryable via SQLite's JSON functions (`json_extract`).
Disadvantage: JSON column is opaque to standard SQL indexing. Full-text
search on cell values requires a separate FTS virtual table.

**Layer 2 — Association graph**

```sql
CREATE TABLE association (
    id          INTEGER PRIMARY KEY,
    source_uuid TEXT NOT NULL REFERENCES kb_row(uuid),
    relation    TEXT NOT NULL,
    target_uuid TEXT NOT NULL REFERENCES kb_row(uuid)
);
CREATE INDEX idx_assoc_source ON association(source_uuid);
CREATE INDEX idx_assoc_target ON association(target_uuid);
CREATE INDEX idx_assoc_relation ON association(relation);

CREATE TABLE relation_type (
    name        TEXT PRIMARY KEY,
    inverse     TEXT,
    symmetric   INTEGER NOT NULL DEFAULT 0
);
```

This maps cleanly. Filtering by relation + target is a single indexed
query. Neighbourhood traversal (BFS) requires recursive CTEs
(`WITH RECURSIVE`) which SQLite supports since 3.8.3.

**Layer 3 — Semantic graph**

```sql
CREATE TABLE semantic_node (
    id              TEXT PRIMARY KEY,
    source_uuid     TEXT REFERENCES kb_row(uuid),  -- nullable
    properties_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE semantic_edge (
    id          TEXT PRIMARY KEY,
    source_id   TEXT NOT NULL REFERENCES semantic_node(id),
    target_id   TEXT NOT NULL REFERENCES semantic_node(id),
    label       TEXT NOT NULL,
    properties_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_sem_edge_source ON semantic_edge(source_id);
CREATE INDEX idx_sem_edge_target ON semantic_edge(target_id);
CREATE INDEX idx_sem_edge_label  ON semantic_edge(label);
```

Properties are stored as JSON blobs. Querying by property value
requires `json_extract(properties_json, '$.type') = 'Theorem'`.
SQLite supports this but it is not as fast as a native property index.
For the scale of a personal knowledge base (thousands of nodes), this
is acceptable.

**Full relational schema summary:**

```
kb_table        (name, columns_json)
kb_row          (uuid, table_name, cells_json, position)
association     (id, source_uuid, relation, target_uuid)
relation_type   (name, inverse, symmetric)
semantic_node   (id, source_uuid, properties_json)
semantic_edge   (id, source_id, target_id, label, properties_json)
```

Six tables. No domain-specific tables. The schema never changes
regardless of what knowledge domains the user adds.

**Assessment:**
- SQLite is available everywhere (Rust via `rusqlite`, Java via JDBC,
  Python via `sqlite3` stdlib, browser via `sql.js` or OPFS)
- The schema is stable and domain-agnostic
- JSON columns for cells and properties sacrifice some query performance
  but avoid all schema migration complexity
- Recursive CTE for BFS graph traversal is supported
- Full-text search on cell values requires a separate FTS5 virtual table
- This is the **recommended approach** for the database-controlled
  implementations (RustBookkeeping, BookkeepingJava, PyBookkeeping)

---

#### Option 2 — Native property graph database (Neo4j / similar)

A property graph database (Neo4j, ArangoDB, Memgraph) natively stores
nodes with property bags and typed directed edges — exactly the shape
of Layer 3. Layer 2 (association graph) is also a natural fit.

Layer 1 (flat tabular data) is the awkward part. A "table" becomes a
label on a set of nodes, and "columns" become property keys. A row is
a node with properties `{ Name: "FTC", Statement: "...", Domain: "Calculus" }`.

```cypher
// A row in the theorems table
CREATE (n:theorems {
    uuid: "c-ftc",
    Name: "Fundamental Theorem of Calculus",
    Statement: "\\int{a,b,f'(x)}=f(b)-f(a)",
    Domain: "Calculus",
    position: 0
})

// An association edge
CREATE (ftc)-[:uses]->(deriv)

// A semantic node (pure metadata, no flat-table row)
CREATE (col:SemanticNode {
    id: "n-calc-seq",
    type: "Collection",
    name: "Calculus Learning Sequence"
})

// A semantic edge
CREATE (ftc)-[:member { position: 3, orderingType: "pedagogical" }]->(col)
```

Advantage: graph traversal is native and fast. No recursive CTEs needed.
The semantic layer and association graph are first-class citizens.
Disadvantage: Neo4j is a server process — not embeddable in a desktop
application without a running server. Not available in the browser.
Overkill for a personal knowledge base of thousands of entities.
Licensing is complex (Neo4j Community Edition has restrictions).

**Assessment:** Architecturally elegant but operationally heavy.
Not suitable for the current deployment targets (local-native desktop
apps, browser). Revisit if the system ever needs to scale to millions
of entities or multi-user access.

---

#### Option 3 — Document store (JSON files / embedded document DB)

Store each knowledge base as a single `.bk.json` file (Phase 11 format).
This is already the planned native format. It is effectively a document
store with one document per knowledge base.

For larger knowledge bases, a document database like LevelDB or RocksDB
(key-value with range scans) could store each row as a JSON document
keyed by UUID. The semantic graph would be a separate set of documents.

Advantage: simple, no schema, works offline, easy to version-control.
Disadvantage: no relational queries, no joins, no full-text search
without a separate index. Sorting and filtering require loading all
documents into memory.

**Assessment:** Suitable for the Webapp (already implemented as
in-memory model + JSON file). Not suitable as the primary storage for
the database-controlled implementations once data grows large.

---

#### Recommended architecture per implementation

| Implementation | Storage | Rationale |
|---|---|---|
| Webapp (browser) | In-memory + `.bk.json` file | No server, OPFS for persistence |
| RustBookkeeping | SQLite via `rusqlite` | Embedded, fast, no server |
| BookkeepingJava | SQLite via JDBC + SQLite JDBC driver | Same schema, cross-platform |
| PyBookkeeping | SQLite via `sqlite3` stdlib | Zero dependencies |
| C/C++ (future) | SQLite via C API | Native, minimal overhead |

All database implementations share the same six-table schema. The
in-memory model (`Table`/`Row`/`Cell`/`SemanticGraph`) is the canonical
representation at runtime. The database is the persistence layer only —
it is loaded into memory on startup and flushed on save.

---

#### The impedance mismatch problem

The most important design tension is between the **schema-free** nature
of the knowledge model and the **schema-bound** nature of relational
databases.

The knowledge model is intentionally schema-free:
- A user can add any column to any table at any time
- A `SemanticNode` can have any property keys
- A `SemanticEdge` can have any property keys on any label

A traditional relational schema would require a migration for every
new column or property key. This is unacceptable for a personal
knowledge tool where the user is constantly evolving their data model.

The resolution is the hybrid approach already described:
- Row cell data is stored as a JSON blob (`cells_json`) — no column
  migrations ever
- Semantic node and edge properties are stored as JSON blobs
  (`properties_json`) — no property migrations ever
- The structural skeleton (which tables exist, which rows exist, which
  edges exist) is stored in proper relational columns with indexes
- Queries on structure ("give me all rows in table X", "give me all
  edges with label Y") are fast indexed SQL
- Queries on content ("give me all rows where column Name = 'FTC'") use
  `json_extract` — slower but acceptable at personal-knowledge-base scale

This is the same tradeoff made by systems like Notion, Obsidian, and
Airtable internally: relational structure for the skeleton, JSON/blob
for the payload.

---

#### Full SQLite schema (reference)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Flat layer: table definitions
CREATE TABLE IF NOT EXISTS kb_table (
    name         TEXT PRIMARY KEY,
    columns_json TEXT NOT NULL DEFAULT '[]'
    -- columns_json: [{"name": "Name", "typeId": "text"}, ...]
);

-- Flat layer: rows
CREATE TABLE IF NOT EXISTS kb_row (
    uuid         TEXT PRIMARY KEY,
    table_name   TEXT NOT NULL REFERENCES kb_table(name) ON DELETE CASCADE,
    cells_json   TEXT NOT NULL DEFAULT '{}',
    -- cells_json: {"Name": "FTC", "Statement": "...", "Domain": "Calculus"}
    position     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_row_table ON kb_row(table_name);
CREATE INDEX IF NOT EXISTS idx_row_position ON kb_row(table_name, position);

-- Association layer: vocabulary
CREATE TABLE IF NOT EXISTS relation_type (
    name         TEXT PRIMARY KEY,
    inverse      TEXT,
    symmetric    INTEGER NOT NULL DEFAULT 0
);

-- Association layer: edges
CREATE TABLE IF NOT EXISTS association (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source_uuid  TEXT NOT NULL REFERENCES kb_row(uuid) ON DELETE CASCADE,
    relation     TEXT NOT NULL,
    target_uuid  TEXT NOT NULL REFERENCES kb_row(uuid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_assoc_source   ON association(source_uuid);
CREATE INDEX IF NOT EXISTS idx_assoc_target   ON association(target_uuid);
CREATE INDEX IF NOT EXISTS idx_assoc_relation ON association(relation);

-- Semantic layer: nodes
CREATE TABLE IF NOT EXISTS semantic_node (
    id              TEXT PRIMARY KEY,
    source_uuid     TEXT REFERENCES kb_row(uuid) ON DELETE SET NULL,
    properties_json TEXT NOT NULL DEFAULT '{}'
    -- properties_json: {"type": "Theorem", "name": "FTC"}
);
CREATE INDEX IF NOT EXISTS idx_sem_node_source ON semantic_node(source_uuid);

-- Semantic layer: edges
CREATE TABLE IF NOT EXISTS semantic_edge (
    id              TEXT PRIMARY KEY,
    source_id       TEXT NOT NULL REFERENCES semantic_node(id) ON DELETE CASCADE,
    target_id       TEXT NOT NULL REFERENCES semantic_node(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,
    properties_json TEXT NOT NULL DEFAULT '{}'
    -- properties_json: {"position": "3", "orderingType": "pedagogical"}
);
CREATE INDEX IF NOT EXISTS idx_sem_edge_source   ON semantic_edge(source_id);
CREATE INDEX IF NOT EXISTS idx_sem_edge_target   ON semantic_edge(target_id);
CREATE INDEX IF NOT EXISTS idx_sem_edge_label    ON semantic_edge(label);

-- Optional: full-text search on cell values
CREATE VIRTUAL TABLE IF NOT EXISTS kb_row_fts
    USING fts5(uuid UNINDEXED, cells_text, content=kb_row);
```

**Key query examples:**

```sql
-- All rows in a table, in order
SELECT uuid, cells_json FROM kb_row
WHERE table_name = 'theorems'
ORDER BY position;

-- All outgoing associations from an entity
SELECT relation, target_uuid FROM association
WHERE source_uuid = 'c-ftc';

-- All entities that use 'derivative' (graph filter)
SELECT source_uuid FROM association
WHERE relation = 'uses' AND target_uuid = 'c-deriv';

-- BFS neighbourhood (2 hops) using recursive CTE
WITH RECURSIVE neighbourhood(uuid, hops) AS (
    SELECT 'c-ftc', 0
    UNION
    SELECT a.target_uuid, n.hops + 1
    FROM neighbourhood n
    JOIN association a ON a.source_uuid = n.uuid
    WHERE n.hops < 2
)
SELECT DISTINCT uuid FROM neighbourhood WHERE uuid != 'c-ftc';

-- All semantic nodes of type 'Theorem'
SELECT id, properties_json FROM semantic_node
WHERE json_extract(properties_json, '$.type') = 'Theorem';

-- All member edges of a collection, in pedagogical order
SELECT source_id, properties_json FROM semantic_edge
WHERE target_id = 'n-calc-seq'
  AND label = 'member'
  AND json_extract(properties_json, '$.orderingType') = 'pedagogical'
ORDER BY CAST(json_extract(properties_json, '$.position') AS INTEGER);
```

---

#### Open questions for the database design

1. **Cell indexing strategy** — `json_extract` on `cells_json` is
   unindexed. For large tables (tens of thousands of rows), filtering
   by a specific cell value will be slow. Options: generated columns
   (`ALTER TABLE kb_row ADD COLUMN name_col TEXT GENERATED ALWAYS AS
   (json_extract(cells_json, '$.Name'))`), or a separate FTS5 virtual
   table for text search. Not yet decided.

2. **Property indexing strategy** — same problem for `properties_json`
   on semantic nodes. For the expected scale (hundreds to low thousands
   of nodes), a full scan with `json_extract` is acceptable. If scale
   grows, generated columns or a separate property index table would
   be needed.

3. **Transaction granularity** — each user edit (cell change, row add,
   semantic edge add) should be one SQLite transaction. Undo/redo maps
   naturally to transaction rollback for single operations, but the
   in-memory `EditHistory` stack is the primary undo mechanism. The
   database is a persistence layer, not the undo mechanism.

4. **Multi-file vs single-file** — the current model loads multiple CSV
   files into one `KnowledgeBase`. In the database model, all tables
   from all files live in one SQLite database file. The `table_name`
   column in `kb_row` replaces the file-per-table convention. This is
   a cleaner model but requires a migration path from the multi-file
   CSV approach.

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

#### Phase 7 — Search, Indexing & Tooling ✅ *complete*

---

#### Phase 8 — Spreadsheet Shell Layout & Refactoring ✅ *complete*

**Goal:** Restructure the UI from a scrolling document into a fixed
spreadsheet shell where all chrome (menu bar, formula bar, toolbar, tab bar,
status bar) is fixed and only the table workspace scrolls. Enforce 1 class
per file in the model layer. Add row drag-to-reorder and insert-at-index.

**Concrete tasks:**
- [x] Split `src/model/index.ts` into one file per class (9 files);
      `index.ts` becomes a barrel re-export
- [x] Add `moveRow(tableIdx, fromIdx, toIdx)` to controller with undo/redo
- [x] Add `insertRow(tableIdx, atIdx)` to controller with undo/redo
- [x] Restructure `index.html` into fixed chrome layers:
      `#menu-bar`, `#formula-bar`, `#toolbar`, `#tab-bar`, `#workspace`, `#status-bar`
- [x] Rewrite `style.css`: `body` as flex column, `overflow: hidden` on shell,
      `overflow: auto` only on `#workspace`, sticky `thead th`
- [x] Update `TableView`: accept external `tabStrip` parameter, expose
      `getActiveTableIdx()` and `setStatusCallback()`, add drag handle
      column and insert-row button per row, remove internal toolbar
- [x] Update `GraphFilterView`: float association detail panel via
      `document.body` append with `position: fixed`
- [x] Update `main.ts`: wire toolbar buttons, workspace drag-drop,
      status bar callback

**Completion criteria:**
- All chrome rows are fixed; only `#workspace` scrolls
- Column headers remain visible while scrolling (sticky)
- Tabs switch the active table without scrolling the page
- Rows can be dragged to reorder; drag target shows a blue top border
- Insert (+) button adds a row directly below the clicked row
- Status bar shows `TableName — N rows × M cols` for the active table
- All existing tests pass without modification

**Demo:** Load a CSV file. The table appears in the workspace with fixed
chrome above and below. Scroll the table — headers stay visible. Click
tabs to switch tables. Drag a row handle to reorder. Click + on a row to
insert below it. Edit a math cell — the formula bar shows the live preview.
Click ⬇ Export in the toolbar to download the active table.

---

#### Phase 9 — Geometry Syntax Plugin ✅ *complete*

**Goal:** Implement a geometry syntax plugin that can represent and render
geometric diagrams symbolically. A geometry cell in a knowledge table
contains a textual description of a geometric figure that the plugin
parses into a structured AST and renders as an SVG diagram.

##### Design philosophy

Geometry syntax is a **declarative structural language**, not a drawing
language. It describes topology, coordinates, labels, and relations —
not visual rendering properties (shading, perspective, line thickness).
The same geometry source renders identically regardless of display size.
Rendering independence is a hard constraint: the parser must never infer
visual depth, perspective projection, or hidden surfaces.

Math syntax is a declared dependency. Coordinate values, measurements,
and angle values are math syntax expressions embedded inside geometry
constructs.

##### Geometry syntax specification

**Coordinate system declaration** (default if omitted):
```
System(2,Euclidean)
```
Syntax: `System(dimension, geometry_type)`
Examples: `System(2,Euclidean)`, `System(3,Euclidean)`, `System(2,Spherical)`,
`System(2,Hyperbolic)`, `System(4,Euclidean)`

**Point declaration**:
```
Point(A,B,C,D)
```
All points must be explicitly declared. Unnamed points may be inferred
only when necessary to preserve topology, using unused uppercase letters
in alphabetical order.

**Point coordinates** (optional, uses math syntax for values):
```
Point(A)=(2,3)
Point(B)=(x,y)
Point(C)=(a+b,2c)
Point(P)=(x,y,z)
```

**Primitives**:
```
Segment(A,B)          — line segment from A to B
Segment(A,B)=a        — segment with label
Segment(A,B)=5        — segment with numeric measurement
Line(A,B)             — infinite line through A and B
Ray(A,B)              — ray from A through B
Arrow(A,B)            — directed arrow, tip at B
```

**Angles**:
```
Angle(A,B,C)          — angle at vertex B, from A to C
Angle(A,B,C)=\t       — angle labelled with math expression
Angle(A,B,C)=30\deg   — angle with degree measurement
```
Rules: exactly 3 parameters; middle point is the vertex.

**Relations**:
```
Parallel(Line(A,B),Line(C,D))
Perpendicular(Line(A,B),Line(C,D))
Intersection(Line(A,B),Line(C,D))=E
Midpoint(M,Segment(A,B))
```

**Equality relations**:
```
Segment(A,B)=Segment(C,D)
Angle(A,B,C)=Angle(D,E,F)
```

**Polygons**:
```
Triangle(A,B,C)
Quadrilateral(A,B,C,D)
Polygon(A,B,C,D,...)
```

**Circles, ellipses, arcs**:
```
Circle((A,B,C),O,4)       — circumference points A,B,C; center O; radius 4 (optional)
Ellipse((A,B,C),O,5,3)    — circumference points; center O; major axis 5, minor 3 (optional)
Arc(A,B,O)                — arc from A to B on circle centered at O
```

**Higher-dimensional objects** (same syntax, coordinates determine dimension):
```
Plane(A,B,C)
Plane(x+y+z=1)
Hyperplane(x1+x2+x3+x4=0)
Sphere((A,B),O,r)         — lateral surface points A,B; center O; radius r (optional)
```

**Coordinate axes and origin**:
```
Axis(x)
Axis(y)
Axis(z)
Axis(x')=2x+3y            — transformed axis (math syntax expression)
Origin(O)
```

**Curves and planes via equations**:
```
l1=Graph(y=sin(x))
l2=Graph(x^2+y^2=1)
```

**Non-Euclidean relations**:
```
Geodesic(A,B)
Curvature(K)=1
```

##### AST node types

```
GeometryProgram       — root: system declaration + statement list
SystemDecl            — System(dim, type)
PointDecl             — Point(A,B,...) with optional coordinate assignment
PrimitiveNode         — Segment | Line | Ray | Arrow (base, optional label)
AngleNode             — Angle(A,B,C) with optional value
RelationNode          — Parallel | Perpendicular | Intersection | Midpoint
EqualityNode          — lhs = rhs (two geometry expressions)
PolygonNode           — Triangle | Quadrilateral | Polygon
CircleNode            — Circle | Sphere (circumference points, center, optional radius)
EllipseNode           — Ellipse | Ellipsoid (points, center, optional axes)
ArcNode               — Arc(A,B,O)
PlaneNode             — Plane | Hyperplane (points or equation)
AxisDecl              — Axis(name) with optional math expression
OriginDecl            — Origin(label)
GraphNode             — name=Graph(equation)
GeodesicNode          — Geodesic(A,B)
CurvatureNode         — Curvature(K)=value
```

Coordinate values and measurement values are `MathNode` subtrees
(from the math syntax plugin), not raw strings.

##### Renderer

The geometry renderer produces an SVG element. It lays out declared
points using their coordinates (if given) or an automatic layout
algorithm (if coordinates are absent). It draws segments, lines, arcs,
polygons, and circles as SVG paths. Labels are placed near their
associated elements. Relation markers (parallel tick marks,
perpendicular squares) are drawn at the relevant points.

Rendering independence is enforced: the renderer never infers perspective,
hidden surfaces, shading, or 3D depth from 2D projections.

##### Concrete tasks
- [ ] Define the geometry grammar in `src/plugins/geometry/grammar.ts`
      covering all constructs above
- [ ] Define geometry AST node types in `src/plugins/geometry/types.ts`
- [ ] Implement the geometry parser using the existing PEG engine
- [ ] Implement the SVG renderer in `src/plugins/geometry/render.ts`:
      point layout, segment/line/ray/arrow drawing, polygon fill,
      circle/arc drawing, label placement, relation markers
- [ ] Register the geometry plugin with `type_id: "geometry"` in
      `src/plugins/registry.ts`
- [ ] Add `src/public/geometry-sample.csv` with geometry cells
- [ ] Add grammar tests covering all construct types and edge cases
- [ ] Add render tests for SVG output structure

**Completion criteria:**
- `Point(A,B,C)` declares three points
- `Segment(A,B)=5` renders a labelled segment
- `Angle(A,B,C)=30\deg` renders an angle arc with label
- `Triangle(A,B,C)` renders a closed triangle
- `Circle((A,B,C),O)` renders a circle through three points
- `Parallel(Line(A,B),Line(C,D))` renders tick marks on both lines
- `Perpendicular(Line(A,B),Line(C,D))` renders a right-angle square
- `System(3,Euclidean)` with 3D coordinates renders a projected diagram
- `Graph(y=sin(x))` renders a curve
- Parse errors display inline without crashing the table
- All existing Phase 1–8 tests pass without modification

**Demo:** Load a CSV with a `geometry` column. Cells contain geometry
source like `Triangle(A,B,C)\nSegment(A,B)=5\nAngle(A,B,C)=60\deg`.
The table renders each cell as an SVG diagram. A cell with
`System(2,Euclidean)\nPoint(A)=(0,0)\nPoint(B)=(3,0)\nPoint(C)=(0,4)\nTriangle(A,B,C)`
renders a right triangle with coordinates.

---

#### Phase 10 — Physics Free-Body Syntax Plugin ✅ *complete*

**Goal:** Implement a physics syntax plugin for free-body diagrams and
physical system descriptions. A physics cell describes bodies, forces,
constraints, and motion quantities symbolically.

##### Design philosophy

Physics syntax extends geometry syntax with physical quantities. A
free-body diagram is a geometry diagram annotated with force vectors,
motion vectors, torques, and constraints. Math syntax provides the
scalar and vector values. Geometry syntax provides the spatial structure.
Physics syntax adds the physical layer on top.

The plugin declares dependencies on both `math` and `geometry` plugins.

##### Physics syntax specification

**Body declaration**:
```
Body(B1)                      — a rigid body
Body(B1)=mass(m)              — body with mass
Body(B1)=mass(m),moment(I)    — body with mass and moment of inertia
```

**Force vectors** (applied at a point, in a direction):
```
Force(F1,A,\d)=mg             — force named F1, at point A, direction \d (down), magnitude mg
Force(F1,A,\u)=N              — normal force upward
Force(F1,A,\t)=f              — force at angle \t
Force(F1,A,[v])               — force in direction of vector v
```

**Motion vectors**:
```
Velocity(v,A,[d])=v_0         — velocity at point A in direction d
Acceleration(a,A,[d])=a_0
AngularVelocity(\w,B1)=\w_0
AngularAcceleration(\a,B1)=\a_0
```

**Torques**:
```
Torque(\t,B1,O)=r*F           — torque on body B1 about point O
```

**Constraints**:
```
Fixed(A)                      — point A is fixed (pin joint)
Roller(A,[d])                 — roller constraint at A in direction d
Contact(A,B)                  — contact between two bodies at point A
String(A,B)                   — inextensible string from A to B
Spring(A,B)=k                 — spring between A and B with stiffness k
Damper(A,B)=c                 — damper between A and B
```

**Reference frames**:
```
Frame(F1,O,[x],[y])           — reference frame F1 with origin O and axes
Inertial(F1)                  — declare F1 as inertial frame
```

**Equations of motion** (uses math syntax):
```
EOM(\S{F}=m*a)
EOM(\S{\t}=I*\a)
```

##### AST node types

```
PhysicsProgram        — root: geometry base + physics statements
BodyDecl              — Body(name) with optional mass/moment
ForceNode             — Force(name, point, direction, magnitude)
VelocityNode          — Velocity | Acceleration (name, point, direction, value)
AngularNode           — AngularVelocity | AngularAcceleration (name, body, value)
TorqueNode            — Torque(name, body, pivot, value)
ConstraintNode        — Fixed | Roller | Contact | String | Spring | Damper
FrameDecl             — Frame(name, origin, axes)
EOMNode               — EOM(math expression)
```

##### Renderer

The physics renderer extends the geometry SVG renderer. Bodies are drawn
as rectangles or polygons. Force vectors are drawn as arrows with labels.
Velocity and acceleration vectors are drawn with distinct arrow styles
(double-headed for acceleration). Constraints are drawn as standard
engineering symbols (pin joint circle, roller triangle, spring zigzag,
damper rectangle). Reference frame axes are drawn as labelled arrows.

##### Concrete tasks
- [x] Define physics grammar in `src/plugins/physics/grammar.ts`
- [x] Define physics AST types in `src/plugins/physics/types.ts`
- [x] Implement physics parser (extends geometry parser instance)
- [x] Implement physics SVG renderer in `src/plugins/physics/render.ts`
- [x] Register physics plugin with `type_id: "physics"`
- [x] Add grammar and render tests

**Completion criteria:**
- `Body(B1)=mass(m)` declares a body with mass
- `Force(F1,A,\d)=mg` renders a downward force arrow labelled `mg`
- `Fixed(A)` renders a pin joint symbol at A
- `Spring(A,B)=k` renders a spring between A and B
- A complete free-body diagram with multiple forces renders correctly
- All existing Phase 1–9 tests pass without modification

**Demo:** Load `physics-sample.csv`. The first cell renders a block on a
surface with a weight force arrow (red, downward), normal force (red, upward),
and friction force (red, rightward). The second cell renders a block on an
inclined plane with a pin joint at A and roller at B. The third cell renders
a spring-mass system with a spring zigzag between the fixed wall and the mass.

---

#### Phase 11 — Chemistry Reaction Syntax Plugin 📐 *planned*

**Goal:** Implement a chemistry syntax plugin for chemical reactions,
compound structures, and stoichiometric equations.

##### Design philosophy

Chemistry syntax covers two distinct levels:
1. **Reaction equations** — stoichiometric notation with compounds,
   arrows, states, and conditions
2. **Structural formulas** — molecular connectivity (bonds, atoms,
   functional groups)

Math syntax is a dependency for numeric coefficients, concentrations,
and thermodynamic quantities.

##### Chemistry syntax specification

**Compounds** (molecular formula notation):
```
Compound(H2O)
Compound(C6H12O6)
Compound(NaCl,(s))            — with state: (s) solid, (l) liquid, (g) gas, (aq) aqueous
```

**Reaction arrows**:
```
->                            — forward reaction (irreversible)
<->                           — reversible equilibrium
<=>                           — equilibrium (double arrow)
-->                           — slow/multi-step reaction
```

**Reaction equations**:
```
Reaction(2H2 + O2 -> 2H2O)
Reaction(N2 + 3H2 <=> 2NH3, cond(T=450\deg,P=200atm,cat=Fe))
```

**Conditions**:
```
cond(T=value, P=value, cat=name, light, heat, ...)
```

**Thermodynamic quantities** (uses math syntax):
```
DeltaH(reaction)=-286kJ/mol
DeltaG(reaction)=-237kJ/mol
DeltaS(reaction)=-163J/(mol*K)
Ka(reaction)=1.8e-5
```

**Structural formula** (connectivity):
```
Atom(C1)
Atom(C2)
Bond(C1,C2,single)
Bond(C1,C2,double)
Bond(C1,C2,triple)
Bond(C1,C2,aromatic)
```

**Functional groups** (shorthand):
```
Group(C1,OH)                  — hydroxyl group at C1
Group(C1,COOH)                — carboxyl group
Group(C1,NH2)                 — amine group
```

**Ionic notation**:
```
Ion(Na,+1)
Ion(Cl,-1)
Ion(SO4,-2)
```

##### AST node types

```
ChemistryProgram      — root: list of chemistry statements
CompoundNode          — Compound(formula, optional state)
ReactionNode          — reactants, arrow type, products, optional conditions
ReactionTerm          — coefficient (MathNode) + compound
ConditionNode         — temperature, pressure, catalyst, other flags
ThermodynamicNode     — DeltaH | DeltaG | DeltaS | Ka (value as MathNode)
AtomNode              — Atom(label)
BondNode              — Bond(atom1, atom2, type)
GroupNode             — Group(atom, functional group name)
IonNode               — Ion(symbol, charge)
```

##### Renderer

The chemistry renderer produces SVG. Reaction equations are rendered
as horizontal layouts: reactants on the left, arrow in the middle
(with conditions above/below), products on the right. Coefficients
are rendered using math syntax. States are rendered as subscripts.
Structural formulas are rendered as bond-line diagrams with atoms at
vertices. Functional groups use standard abbreviations.

##### Concrete tasks
- [ ] Define chemistry grammar in `src/plugins/chemistry/grammar.ts`
- [ ] Define chemistry AST types in `src/plugins/chemistry/types.ts`
- [ ] Implement chemistry parser
- [ ] Implement chemistry SVG renderer in `src/plugins/chemistry/render.ts`
- [ ] Register chemistry plugin with `type_id: "chemistry"`
- [ ] Add grammar and render tests

**Completion criteria:**
- `Reaction(2H2 + O2 -> 2H2O)` renders a balanced reaction equation
- `Reaction(N2 + 3H2 <=> 2NH3, cond(T=450\deg,cat=Fe))` renders
  with conditions above the equilibrium arrow
- `Compound(NaCl,(s))` renders with state subscript
- `DeltaH(reaction)=-286kJ/mol` renders as a thermodynamic annotation
- Structural formula with atoms and bonds renders as a bond-line diagram
- All existing Phase 1–10 tests pass without modification

**Demo:** Load a CSV with a `chemistry` column. Cells contain reaction
equations. The Haber process cell renders as a full equilibrium reaction
with temperature, pressure, and catalyst conditions. A structural formula
cell renders ethanol as a bond-line diagram.

---

#### Phase 12 — Control File & Map Views 📐 *planned*

**Goal:** Introduce a `control.json` file that declares how a folder of CSV
files should be loaded and rendered. Standard tables continue to render as
spreadsheets. Map declarations bind one or more CSV files together and
dispatch them to a diagram renderer instead of a table renderer.

---

##### Core insight

A map is a special kind of CSV table **physically** — nodes are rows, edges
are rows, all stored as plain CSV. The difference from a standard table is
purely in **rendering intent** and **column role assignment**. The control
file is the single place where both are declared.

This means:
- No new file format is needed — CSV remains the storage medium
- The same CSV file can appear as both a standard table tab and a diagram
  node source simultaneously — two views over the same data
- Adding a new diagram type requires only a new renderer and a new `view`
  value in the control file — no changes to existing files or the data model

---

##### Control file — `control.json`

Lives alongside the CSV files in the same folder. Optional — if absent,
every CSV in the folder loads as a standard table (backward compatible).

```json
{
  "version": "1.0",
  "entries": [
    {
      "id": "theorems",
      "view": "table",
      "file": "theorems.csv"
    },
    {
      "id": "glycolysis",
      "view": "flow",
      "nodes": {
        "file": "glycolysis-nodes.csv",
        "mapping": {
          "id":    "Formula",
          "label": "Name",
          "type":  "Kind",
          "x":     "PosX",
          "y":     "PosY"
        }
      },
      "edges": {
        "file": "glycolysis-edges.csv",
        "mapping": {
          "from":  "Reactant",
          "to":    "Product",
          "type":  "ReactionType",
          "label": "Enzyme"
        }
      }
    },
    {
      "id": "anatomy",
      "view": "spatial",
      "nodes": {
        "file": "anatomy-nodes.csv",
        "mapping": {
          "id":     "Structure",
          "label":  "Name",
          "type":   "Category",
          "x":      "X",
          "y":      "Y",
          "width":  "W",
          "height": "H",
          "parent": "ContainedIn"
        }
      },
      "edges": {
        "file": "anatomy-edges.csv",
        "mapping": {
          "from":  "From",
          "to":    "To",
          "type":  "Relation"
        }
      }
    },
    {
      "id": "uml-classes",
      "view": "relation",
      "nodes": {
        "file": "classes.csv",
        "mapping": { "id": "ClassName", "label": "ClassName", "type": "Kind" }
      },
      "edges": {
        "file": "relationships.csv",
        "mapping": { "from": "Source", "to": "Target", "type": "RelType", "label": "Label" }
      }
    },
    {
      "id": "login-sequence",
      "view": "sequence",
      "actors": {
        "file": "actors.csv",
        "mapping": { "id": "Actor", "label": "Actor" }
      },
      "messages": {
        "file": "messages.csv",
        "mapping": { "from": "From", "to": "To", "label": "Message", "time": "Order" }
      }
    }
  ]
}
```

---

##### Full mapping — design rationale

Full explicit mapping is used rather than reserved column names or
convention-based defaults. Rationale:

- A knowledge storage system cannot anticipate every domain's column naming
  conventions during development. Forcing schema conformance on the CSV
  defeats the reusability property — the same CSV cannot serve as both a
  standard table and a diagram node source if its columns must be renamed.
- Full mapping in the control file is the only approach that is both
  fully reusable and fully explicit. Every column role is declared once,
  in one place, without touching the CSV.
- The control file is the single source of truth for rendering intent.
  No in-band metadata in the CSV beyond the existing types row.

---

##### Map view taxonomy

Four structurally distinct map types, each with its own renderer:

| `view` value | Structure | Layout | Covers |
|---|---|---|---|
| `flow` | Directed graph, possibly cyclic | Directional (LR or TB), force-directed | Reaction pathway, metabolism map, flowchart, dependency graph |
| `spatial` | Containment hierarchy + adjacency | Fixed spatial positions, containment boxes | Anatomy diagram, system architecture, UML package diagram |
| `relation` | General directed graph | Force-directed or hierarchical by relation type | UML class diagram, ER diagram, concept map, knowledge graph |
| `sequence` | Ordered actors × ordered messages | 2D timeline: actors as vertical lifelines, messages as horizontal arrows | UML sequence diagram, signal timing diagram |

`flow`, `spatial`, and `relation` all use nodes + edges CSV files.
`sequence` uses actors + messages CSV files (different file roles).

---

##### Mapping fields per view type

**Nodes mapping** (used by `flow`, `spatial`, `relation`):

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable node identity — referenced by edge `from`/`to` |
| `label` | no | Display name (falls back to `id` if absent) |
| `type` | no | Node type — drives shape and colour via `nodeStyles` |
| `x`, `y` | no | Position hints for fixed-layout maps (`spatial`) |
| `width`, `height` | no | Size hints for containment boxes (`spatial`) |
| `parent` | no | Parent node id for containment hierarchy (`spatial`) |

All other columns in the nodes CSV are **domain content** — rendered
inside the node using the column's plugin type from the CSV types row.

**Edges mapping** (used by `flow`, `spatial`, `relation`):

| Field | Required | Meaning |
|---|---|---|
| `from` | yes | Source node id |
| `to` | yes | Target node id |
| `type` | no | Edge type — drives arrow style via `edgeStyles` |
| `label` | no | Edge label displayed near the midpoint |

**Actors mapping** (used by `sequence`):

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Actor identity — referenced by message `from`/`to` |
| `label` | no | Display name |

**Messages mapping** (used by `sequence`):

| Field | Required | Meaning |
|---|---|---|
| `from` | yes | Source actor id |
| `to` | yes | Target actor id |
| `label` | no | Message label |
| `time` | no | Ordering key (integer or float, ascending) |
| `type` | no | Message type (sync, async, return, create, destroy) |

---

##### Multiple node files

A diagram can draw nodes from multiple CSV files — useful when a large
map spans multiple domain tables:

```json
{
  "id": "metabolism",
  "view": "flow",
  "nodes": [
    { "file": "glycolysis-nodes.csv",  "mapping": { "id": "Formula", "label": "Name", "type": "Kind" } },
    { "file": "tca-nodes.csv",         "mapping": { "id": "Formula", "label": "Name", "type": "Kind" } },
    { "file": "pentose-nodes.csv",     "mapping": { "id": "Formula", "label": "Name", "type": "Kind" } }
  ],
  "edges": {
    "file": "metabolism-edges.csv",
    "mapping": { "from": "Reactant", "to": "Product", "type": "ReactionType" }
  }
}
```

The renderer merges all node files into one node map keyed by `id`.
Edge `from`/`to` references resolve across all node files. Node `id`
values must be unique across all node files in a diagram.

---

##### Inline edges via `_associations` column

If no `edges` key is present in a diagram declaration, the renderer
falls back to reading the `_associations` column from the nodes CSV
(the existing Phase 4 convention). This means existing CSVs with
`_associations` columns can be rendered as diagrams with zero additional
configuration:

```json
{ "id": "concept-map", "view": "relation", "nodes": { "file": "concepts.csv", "mapping": { "id": "Name", "label": "Name" } } }
```

---

##### Style declarations (optional)

Node and edge appearance is driven by the `type` column value. Styles
are declared in the control file entry:

```json
"nodeStyles": {
  "compound": { "shape": "ellipse", "color": "#e0f2fe" },
  "enzyme":   { "shape": "rect",    "color": "#fef9c3" },
  "cofactor": { "shape": "diamond", "color": "#f0fdf4" }
},
"edgeStyles": {
  "substrate": { "arrow": "open",   "dash": false },
  "product":   { "arrow": "filled", "dash": false },
  "inhibits":  { "arrow": "flat",   "dash": true  },
  "activates": { "arrow": "filled", "dash": false, "color": "#16a34a" }
}
```

If `nodeStyles`/`edgeStyles` are absent, the renderer uses defaults
per view type. Unknown type values use the default style.

---

##### Reusability — same file as table and diagram

The same CSV file can appear in multiple entries:

```json
{ "id": "glycolysis-table", "view": "table", "file": "glycolysis-nodes.csv" },
{ "id": "glycolysis-map",   "view": "flow",  "nodes": { "file": "glycolysis-nodes.csv", "mapping": { ... } }, "edges": { ... } }
```

Two tabs in the UI — one spreadsheet, one diagram — both reading the
same file. Editing a cell in the spreadsheet tab updates the node label
in the diagram tab on next render.

---

##### Backward compatibility

If `control.json` is absent, every `.csv` file in the folder loads as
a standard table, exactly as before. No existing files need to change.
The control file is purely additive.

---

##### In-memory model additions

The existing `KnowledgeBase` model is unchanged. Two new model classes
are added:

**`DiagramDecl`** — parsed from a control file entry with a non-`table`
view. Holds the view type, resolved node/edge table references, mapping
definitions, and style declarations. Not a `Table` — it is a rendering
declaration over existing tables.

**`ControlFile`** — top-level container parsed from `control.json`.
Holds a list of entries, each either a `TableDecl` (view: table) or a
`DiagramDecl` (view: flow/spatial/relation/sequence).

`KnowledgeBase` gains one new field:
```
readonly diagrams: DiagramDecl[] = []
```

No existing fields or methods change.

---

##### UI additions

The tab strip currently shows one tab per loaded CSV table. With the
control file, tabs are driven by the control file entries instead:
- `table` entries → standard spreadsheet tab (existing behaviour)
- `flow`/`spatial`/`relation`/`sequence` entries → diagram tab

Clicking a diagram tab renders the diagram in `#workspace` instead of
a spreadsheet. The formula bar and toolbar are hidden or repurposed
for diagram interaction (pan, zoom, node selection).

---

##### View architecture — `WorkspaceView` class hierarchy

Cell plugins (math, chemistry, geometry, physics) operate at **micro
scale** — one cell, one expression, stateless, interchangeable. The
cell plugin registry pattern fits them perfectly.

Display views operate at **macro scale** — one or more entire CSV files,
rendered as a coherent view filling the workspace. They are stateful,
have layout, support interaction (pan, zoom, click, select), and own
the workspace for the duration of a tab's active lifetime. The plugin
registry pattern is the wrong model for them.

The right model is a **view component class hierarchy**. Each view type
is a proper class. The existing `TableView` is already a view component
— the new diagram views extend the same pattern:

```
WorkspaceView (interface)
  mount(container, data, args, state?): void
  unmount(): ViewState
  update(data): void

TableView          implements WorkspaceView   ← already exists, refactored to conform
FlowDiagramView    implements WorkspaceView   ← Phase 12
SpatialView        implements WorkspaceView   ← Phase 12
RelationView       implements WorkspaceView   ← Phase 12
SequenceView       implements WorkspaceView   ← Phase 12
```

The controller holds `activeView: WorkspaceView`. Tab switching:
```ts
const state = activeView.unmount();          // save state
savedStates.set(activeEntryId, state);       // store opaque blob
activeView = viewFactory(entry, data);       // create new view
activeView.mount(workspaceEl, data, args,    // restore state
    savedStates.get(newEntryId));
```

`viewFactory` is a simple switch on `entry.view` — not a registry,
just a factory function. Adding a new view type = new class + one line
in the factory. No interface changes, no registry updates.

---

##### View state — what each view remembers

State means the view remembers where the user left off and restores it
when they return to that tab. Each view type defines its own state shape
internally. The controller stores states as opaque `unknown` blobs and
passes them back to the same view type that produced them — it never
inspects them.

**`unmount()` returns state. `mount()` accepts optional saved state.**

State per view type:

| View | State fields |
|---|---|
| `TableView` | `scrollTop`, `scrollLeft`, `sortCol`, `sortAsc` |
| `FlowDiagramView` | `panX`, `panY`, `zoom`, `selectedNodeIds[]`, `nodePositions: Record<id, {x,y}>` |
| `SpatialView` | `panX`, `panY`, `zoom`, `selectedNodeId` |
| `RelationView` | `panX`, `panY`, `zoom`, `selectedNodeIds[]`, `nodePositions: Record<id, {x,y}>` |
| `SequenceView` | `scrollTop`, `selectedMessageId` |

**Two state lifetimes:**

- **In-session** — lives as long as the app session. Held by the
  controller in `savedStates: Map<entryId, unknown>`. Lost on page
  reload. Covers all state fields above.

- **Persistent** — survives page reload. Stored in `localStorage`
  alongside the session file names. Only the lightweight subset:
  `panX`, `panY`, `zoom`, `scrollTop`, `sortCol`, `sortAsc`, active
  tab id. Not layout positions (too large to serialise on every change).

**Layout positions — the special case:**

Force-directed layout is non-deterministic. Once the algorithm settles
(or the user drags nodes manually), those positions must be frozen and
remembered — otherwise every tab switch re-runs the layout from scratch.

- **Default**: positions are in-session state only. Layout runs once
  on first mount. Positions stored in `FlowViewState.nodePositions`
  and restored on tab switch. Lost on page reload — layout re-runs.

- **Future — "Save Layout"**: a toolbar button writes the computed
  `x`/`y` positions back into the nodes CSV (or a sidecar). On next
  load, those positions are read as the `x`/`y` mapping fields and
  the layout algorithm is skipped. This is equivalent to promoting a
  `flow` view to a `spatial` view by persisting its layout. Deferred
  to a later phase.

---

##### Concrete tasks
- [ ] Define `ControlFile`, `TableDecl`, `DiagramDecl`, `NodeMapping`,
      `EdgeMapping`, `ActorMapping`, `MessageMapping`, `NodeStyle`,
      `EdgeStyle` interfaces in `src/data/control.ts`
- [ ] Implement `parseControlFile(json): ControlFile` in `src/data/control.ts`
- [ ] Add `readonly diagrams: DiagramDecl[]` to `KnowledgeBase`
- [ ] Update `AppController.loadFiles()`: if a `control.json` is present
      among dropped files, parse it and use it to drive table/diagram loading
      instead of loading all CSVs as tables
- [ ] Implement `FlowDiagramView` in `src/view/`: reads `DiagramDecl`,
      resolves node/edge rows via mapping, renders as SVG directed graph
      with force-directed layout (D3-force or hand-written spring layout)
- [ ] Implement `SpatialDiagramView` in `src/view/`: containment boxes
      at declared `x`/`y`/`width`/`height`, adjacency edges between boxes
- [ ] Implement `RelationDiagramView` in `src/view/`: force-directed
      layout, typed edge arrows, node shapes by type
- [ ] Implement `SequenceDiagramView` in `src/view/`: vertical lifelines,
      horizontal message arrows ordered by `time` column
- [ ] Update `TableView` tab strip: driven by `ControlFile` entries when
      present, falling back to one-tab-per-CSV when absent
- [ ] Add diagram CSS: node shapes (ellipse, rect, diamond), edge arrows
      (open, filled, flat), dashed edges, lifelines, message arrows
- [ ] Add sample control file `public/control.json` with a flow diagram
      declaration over new sample node/edge CSVs
- [ ] Add `public/glycolysis-nodes.csv` and `public/glycolysis-edges.csv`
      as sample data for the flow diagram demo
- [ ] Add tests for `parseControlFile`
- [ ] Add tests for node/edge resolution via mapping

**Completion criteria:**
- Loading a folder with `control.json` drives tab creation from the
  control file entries, not from raw CSV filenames
- A `table` entry renders as a standard spreadsheet tab (unchanged)
- A `flow` entry renders as a directed graph SVG in `#workspace`
- Node labels use the mapped `label` column; node shapes use `nodeStyles`
- Edge arrows use the mapped `type` column and `edgeStyles`
- Multiple node files merge correctly; edge references resolve across files
- The same CSV file appears as both a table tab and a diagram node source
  simultaneously — editing a cell in the table tab is reflected in the
  diagram tab on next render
- Absent `control.json` → all CSVs load as standard tables (backward compat)
- All existing Phase 1–11 tests pass without modification

**Demo:** Drop a folder containing `control.json`, `glycolysis-nodes.csv`,
`glycolysis-edges.csv`, and `theorems.csv`. The tab strip shows three tabs:
"theorems" (standard table), "glycolysis-table" (spreadsheet view of nodes),
"glycolysis-map" (flow diagram). Click the flow diagram tab — the glycolysis
pathway renders as a directed graph with compound nodes (ellipses, blue),
enzyme nodes (rectangles, yellow), and labelled reaction arrows between them.
Click the glycolysis-table tab, edit a compound name — switch back to the
diagram tab and the node label has updated.

---

#### Phase 13 — File System Access & Save Strategy 📐 *planned*

**Goal:** Upgrade the file open/save lifecycle from download-only to
direct filesystem access where the browser supports it, using a
capability-detection pattern that delegates to the correct strategy at
startup — no try/catch, no browser version checks, no hardcoded data.

---

##### The problem with the current approach

The current save mechanism creates a `Blob`, generates an object URL,
and triggers a download via a hidden `<a download>` element. This works
everywhere but forces the user to manually replace the original file
after every save — the browser cannot write back to the file it opened.

The File System Access API (`showOpenFilePicker`, `showSaveFilePicker`)
solves this: it returns a `FileSystemFileHandle` that the app can write
through directly, enabling true Ctrl+S save-in-place. But it is not
supported in all browsers (Firefox does not support it as of 2025;
Safari support is partial).

---

##### Why not try/catch and why not browser version checks

**try/catch** for capability detection is wrong because:
- It conflates "API not present" with "API present but failed" — a
  write failure (disk full, permission denied) would silently fall back
  to download instead of surfacing the real error
- It makes the control flow implicit and hard to reason about
- The fallback fires at the wrong time — after the user has already
  interacted with a picker that may not have appeared

**Browser version checks** are wrong because:
- They require hardcoded version tables that rot immediately
- A browser may support the API in some versions but not others, or
  behind a flag, or only on certain platforms
- The source of truth for whether an API exists is the runtime, not
  a lookup table

---

##### The correct approach — capability detection at startup

Check for the existence of the API functions themselves at startup,
not at call time. The check is a simple property existence test:

```ts
const HAS_FILE_SYSTEM_ACCESS =
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function";
```

This is evaluated once when the module loads. It is a pure boolean —
no async, no try/catch, no side effects. The result is used to select
which strategy implementation to instantiate.

---

##### Strategy pattern — `FileSystemStrategy` interface

Two concrete strategies implement one interface. The controller holds
a single `FileSystemStrategy` reference, set at startup. All file
operations go through the strategy — the controller never branches on
browser capability after startup.

```ts
interface FileSystemStrategy {
    // Open one or more files. Returns file contents + opaque handles
    // (handles are null in the fallback strategy)
    open(options: OpenOptions): Promise<OpenedFile[]>;

    // Save content to a file. Uses the stored handle if available,
    // otherwise triggers a download.
    save(content: string, handle: FileHandle | null, suggestedName: string): Promise<FileHandle | null>;

    // Save As — always prompts for a new location.
    saveAs(content: string, suggestedName: string): Promise<FileHandle | null>;

    // Whether this strategy supports in-place save (handle != null)
    readonly canSaveInPlace: boolean;
}

type FileHandle = FileSystemFileHandle;   // native handle, opaque to callers

interface OpenedFile {
    name: string;
    text: string;
    handle: FileHandle | null;   // null in fallback strategy
}
```

**`NativeFileSystemStrategy`** — used when `HAS_FILE_SYSTEM_ACCESS` is true:
- `open()` calls `showOpenFilePicker()`, reads each file via
  `handle.getFile().text()`, returns handles alongside content
- `save()` with a non-null handle calls `handle.createWritable()`,
  writes content, closes the writable — direct in-place save
- `save()` with a null handle delegates to `saveAs()`
- `saveAs()` calls `showSaveFilePicker()`, writes, returns new handle
- `canSaveInPlace = true`

**`DownloadFallbackStrategy`** — used when `HAS_FILE_SYSTEM_ACCESS` is false:
- `open()` programmatically clicks a hidden `<input type="file">`,
  reads via `FileReader`, returns null handles
- `save()` and `saveAs()` both create a `Blob`, generate an object URL,
  trigger a download via `<a download>`, revoke the URL— no handle returned
- `canSaveInPlace = false`

**Startup wiring** in `main.ts`:
```ts
const fileSystem: FileSystemStrategy = HAS_FILE_SYSTEM_ACCESS
    ? new NativeFileSystemStrategy()
    : new DownloadFallbackStrategy();

controller.setFileSystemStrategy(fileSystem);
```

The controller never inspects `HAS_FILE_SYSTEM_ACCESS` again. It only
calls `fileSystem.open()`, `fileSystem.save()`, `fileSystem.saveAs()`.

---

##### Handle storage — per-file, not per-session

Each loaded file has its own handle. The controller stores handles
alongside the loaded data:

```ts
interface LoadedEntry {
    name: string;
    text: string;
    handle: FileHandle | null;   // null if opened via fallback
}

loadedFiles: Map<string, LoadedEntry>   // keyed by filename
```

When the user saves a specific file (CSV, control.json, meta.json),
the controller looks up its handle and calls `fileSystem.save(content,
handle, name)`. If the handle is null (fallback browser), a download
is triggered. If the handle is non-null (native browser), the file is
written in place.

---

##### Permission model

`FileSystemFileHandle` requires write permission. On Chrome, the first
write after opening triggers a permission prompt. The permission is not
persistent across page reloads — the user must re-grant each session.
This is a browser security constraint, not something the app can work
around. The strategy handles this transparently: `createWritable()`
will prompt if needed; the app does not need to manage permissions
explicitly.

---

##### Open path upgrade

The current open path uses `<input type="file">` which returns a `File`
object (read-only blob, no handle). To support save-in-place, the open
path must also be upgraded to `showOpenFilePicker` in the native
strategy — only `showOpenFilePicker` returns a `FileSystemFileHandle`.

The fallback strategy continues to use `<input type="file">` and
returns null handles. The rest of the app is unchanged — it only sees
`OpenedFile[]` from the strategy, not the underlying mechanism.

---

##### UI changes

- **Save button** (Ctrl+S): calls `fileSystem.save(content, handle, name)`
  for each modified file. On native browsers: writes in place, no dialog.
  On fallback browsers: triggers a download per modified file.
- **Save As button**: always calls `fileSystem.saveAs()` — prompts for
  location on native browsers, triggers download on fallback.
- **Status indicator**: when `canSaveInPlace` is false, a small indicator
  in the status bar shows "⇓ Download mode" so the user knows saves
  produce downloads rather than in-place writes.
- **Dirty indicator**: a `●` dot in the tab title or status bar when
  the in-memory model differs from the last saved state.

---

##### Concrete tasks
- [ ] Define `FileSystemStrategy`, `OpenOptions`, `OpenedFile`,
      `FileHandle` interfaces in `src/data/file-system.ts`
- [ ] Implement `NativeFileSystemStrategy` in `src/data/file-system.ts`:
      `showOpenFilePicker` open, `createWritable` save, `showSaveFilePicker`
      save-as
- [ ] Implement `DownloadFallbackStrategy` in `src/data/file-system.ts`:
      `<input type="file">` open, `Blob` + object URL download save
- [ ] Add `HAS_FILE_SYSTEM_ACCESS` capability constant in
      `src/data/file-system.ts` — property existence check only, no
      try/catch, no version strings
- [ ] Wire strategy selection in `main.ts`: instantiate correct strategy
      based on `HAS_FILE_SYSTEM_ACCESS`, pass to controller
- [ ] Add `setFileSystemStrategy(s)` and `loadedFiles: Map<string,
      LoadedEntry>` to `AppController`
- [ ] Update `AppController.loadFiles()` to use `fileSystem.open()` and
      store returned handles in `loadedFiles`
- [ ] Add `AppController.saveFile(name)` — serialises the named file,
      calls `fileSystem.save(content, handle, name)`
- [ ] Add `AppController.saveAllModified()` — calls `saveFile` for each
      entry where in-memory state differs from last-saved text
- [ ] Wire Ctrl+S to `saveAllModified()` in `main.ts`
- [ ] Add Save As button to toolbar, wired to `fileSystem.saveAs()`
- [ ] Add dirty indicator to tab titles and status bar
- [ ] Add "⇓ Download mode" indicator when `canSaveInPlace` is false
- [ ] Add tests for `NativeFileSystemStrategy` (mock `showOpenFilePicker`
      and `showSaveFilePicker`)
- [ ] Add tests for `DownloadFallbackStrategy`
- [ ] Add tests for `AppController.saveFile` and `saveAllModified`

**Completion criteria:**
- On a browser with File System Access API: opening a CSV and pressing
  Ctrl+S writes directly back to the original file with no dialog
- On a browser without File System Access API: Ctrl+S triggers a
  download of the modified file
- The controller never branches on browser capability after startup —
  all branching is inside the strategy implementations
- No try/catch used for capability detection anywhere in the codebase
- No browser version strings or hardcoded compatibility tables anywhere
- `HAS_FILE_SYSTEM_ACCESS` is the single point of capability detection,
  evaluated once at module load time
- Dirty indicator appears when unsaved changes exist
- All existing Phase 1–12 tests pass without modification

**Demo:** Open `theorems.csv` in Chrome. Edit a cell. Press Ctrl+S —
no download dialog appears; the file is written in place. Open the file
in a text editor — the edit is present. Open the same file in Firefox.
Edit a cell. Press Ctrl+S — a download is triggered. The status bar
shows "⇓ Download mode". The Save As button always prompts for a
location regardless of browser.

---

#### Phase 14 — Semantic Layer: Ordered Knowledge Topology 📐 *planned*

##### New model classes (additive — no existing classes modified)

The semantic layer is a **generic labelled property graph**. It has no
knowledge of concepts, collections, collection items, formula families,
or any other domain-specific structure. Those are user-defined
interpretations layered on top of the graph by the data author, not by
the code.

The model has exactly three primitives:

**`SemanticNode`** — a node in the graph with an arbitrary property bag:
```
id: string                        — stable opaque identifier (UUID)
properties: Map<string, string>   — arbitrary key-value pairs
sourceEntityId?: string           — optional link to Row.entityId
sourceTableName?: string          — optional link to which Table
```

Examples of what a node can represent, purely by convention in its
properties — the model does not distinguish these:

| User intent | properties example |
|-------------|-------------------|
| A theorem | `{ type: "Theorem", name: "FTC" }` |
| A collection | `{ type: "Collection", name: "Calculus Curriculum", collectionType: "sequence" }` |
| A chemical compound | `{ type: "Compound", formula: "H2O", state: "liquid" }` |
| A logic gate | `{ type: "Gate", gateType: "NAND", inputs: "2" }` |
| An ordering system | `{ type: "OrderingSystem", orderingType: "pedagogical" }` |

**`SemanticEdge`** — a directed, labelled edge between two nodes with
an arbitrary property bag:
```
id: string                        — stable opaque identifier
sourceId: string                  — id of the source SemanticNode
targetId: string                  — id of the target SemanticNode
label: string                     — relation name (user-defined)
properties: Map<string, string>   — arbitrary key-value pairs
```

Examples of what an edge can represent:

| User intent | label | properties example |
|-------------|-------|-------------------|
| Collection membership with order | `"member"` | `{ position: "3", orderingType: "pedagogical" }` |
| Derivation dependency | `"derived-from"` | `{}` |
| Formula equivalence | `"equivalent-to"` | `{ variantType: "rearranged" }` |
| Hierarchical nesting | `"child-of"` | `{}` |
| Reaction produces | `"produces"` | `{ yield: "0.85" }` |
| Canonical form | `"canonical-of"` | `{}` |

**`SemanticGraph`** — the top-level container:
```
nodes: Map<string, SemanticNode>   — keyed by node id
edges: Map<string, SemanticEdge>   — keyed by edge id
```

With query methods:
```
getNode(id) → SemanticNode | undefined
getEdgesFrom(nodeId) → SemanticEdge[]
getEdgesTo(nodeId) → SemanticEdge[]
getEdgesByLabel(label) → SemanticEdge[]
getNodesByProperty(key, value) → SemanticNode[]
```

`KnowledgeBase` gains one new field: `readonly semantic = new SemanticGraph()`.
No existing fields or methods on `KnowledgeBase` change.

What the current study.md previously called `Concept`, `Collection`,
`CollectionItem`, `FormulaFamily` are not model classes — they are
**query conventions** that the user establishes by choosing consistent
property keys and edge labels in their sidecar file. The code has no
knowledge of them. A mathematics user writes nodes with
`{ type: "Theorem" }` and edges with label `"member"` and property
`{ position: "3" }`. A chemistry user writes nodes with
`{ type: "Reaction" }` and edges with label `"produces"`. The model
stores both identically.

##### Sidecar file format

Semantic metadata is stored in a JSON sidecar file alongside the CSV files.
Convention: `theorems.csv` → `theorems.meta.json`.

The sidecar format is a **generic node-edge graph**. It has no hardcoded
keys for concepts, collections, items, or families. The structure is
entirely defined by the data author through property keys and edge labels.

```json
{
  "version": "1.0",
  "nodes": [
    {
      "id": "n-ftc",
      "properties": {
        "type": "Theorem",
        "name": "Fundamental Theorem of Calculus"
      },
      "sourceEntityId": "Fundamental Theorem of Calculus",
      "sourceTableName": "theorems"
    },
    {
      "id": "n-ibp",
      "properties": {
        "type": "Theorem",
        "name": "Integration by Parts"
      },
      "sourceEntityId": "Integration by Parts",
      "sourceTableName": "theorems"
    },
    {
      "id": "n-calc-seq",
      "properties": {
        "type": "Collection",
        "name": "Calculus Learning Sequence",
        "collectionType": "sequence"
      }
    },
    {
      "id": "n-calc-domain",
      "properties": {
        "type": "Collection",
        "name": "Differential Calculus",
        "collectionType": "domain"
      }
    }
  ],
  "edges": [
    {
      "id": "e-1",
      "sourceId": "n-calc-seq",
      "targetId": "n-calc-domain",
      "label": "child-of",
      "properties": {}
    },
    {
      "id": "e-2",
      "sourceId": "n-ftc",
      "targetId": "n-calc-seq",
      "label": "member",
      "properties": { "position": "3", "orderingType": "pedagogical" }
    },
    {
      "id": "e-3",
      "sourceId": "n-ibp",
      "targetId": "n-calc-seq",
      "label": "member",
      "properties": { "position": "5", "orderingType": "pedagogical" }
    }
  ]
}
```

The same format for a chemistry knowledge base looks structurally
identical — only the property values differ:

```json
{
  "version": "1.0",
  "nodes": [
    {
      "id": "n-h2o",
      "properties": { "type": "Compound", "formula": "H2O", "state": "liquid" },
      "sourceEntityId": "Water",
      "sourceTableName": "compounds"
    },
    {
      "id": "n-electrolysis",
      "properties": { "type": "Reaction", "name": "Electrolysis of Water" },
      "sourceEntityId": "Electrolysis of Water",
      "sourceTableName": "reactions"
    }
  ],
  "edges": [
    {
      "id": "e-1",
      "sourceId": "n-electrolysis",
      "targetId": "n-h2o",
      "label": "consumes",
      "properties": { "stoichiometry": "2" }
    }
  ]
}
```

The model parses both files with the same code. The interpretation of
`"type": "Theorem"` vs `"type": "Compound"` is entirely up to the
application layer and the user — the model stores both as a property
string on a `SemanticNode`.

The sidecar file is optional. If absent, the flat model works exactly as
before. If present, it is loaded alongside the CSV and populates
`KnowledgeBase.semantic`.

##### Querying the semantic layer

Because the model is a generic graph, all queries are expressed in terms
of nodes, edges, labels, and property key-value pairs. There are no
domain-specific query methods.

The five primitive queries on `SemanticGraph` cover all use cases:

| Method | Returns | Example use |
|--------|---------|-------------|
| `getNode(id)` | `SemanticNode` | Look up a specific node by UUID |
| `getEdgesFrom(nodeId)` | `SemanticEdge[]` | All edges leaving a node |
| `getEdgesTo(nodeId)` | `SemanticEdge[]` | All edges arriving at a node |
| `getEdgesByLabel(label)` | `SemanticEdge[]` | All `"member"` edges, all `"child-of"` edges |
| `getNodesByProperty(key, value)` | `SemanticNode[]` | All nodes where `type = "Theorem"` |

Higher-level queries that the application layer builds from these
primitives — none of these are in the model:

```
// "Get all members of a collection in pedagogical order"
getEdgesTo(collectionNodeId)
  .filter(e => e.label === "member" && e.properties.get("orderingType") === "pedagogical")
  .sort((a, b) => Number(a.properties.get("position")) - Number(b.properties.get("position")))
  .map(e => getNode(e.sourceId))

// "Get all child collections of a domain"
getEdgesTo(domainNodeId)
  .filter(e => e.label === "child-of")
  .map(e => getNode(e.sourceId))

// "Get all theorems"
getNodesByProperty("type", "Theorem")

// "Get the canonical form of a formula family"
getEdgesFrom(variantNodeId)
  .filter(e => e.label === "canonical-of")
  .map(e => getNode(e.targetId))
```

This means the `CollectionBrowserView` in the UI is also generic — it
does not hardcode "collection" or "member". Instead, it is configured
with the edge label and property keys to use for tree rendering and
ordering. The configuration is provided by the sidecar file or by the
user through the UI settings.

##### What this unlocks in the view

A new **Semantic Graph Panel** in the UI (separate from the tab strip
which shows flat CSV tables) renders the semantic layer. Because the
model is generic, the panel is configured rather than hardcoded:

- The user specifies which edge label means "parent-child" (e.g.
  `"child-of"`) and which means "membership" (e.g. `"member"`), and
  which property key holds the ordering position (e.g. `"position"`)
- The panel renders a tree of nodes connected by the configured
  parent-child label
- Expanding a tree node shows its members sorted by the configured
  position property
- Clicking any node navigates to its linked row in the flat table
  (via `sourceEntityId` / `sourceTableName`)
- Nodes without a `sourceEntityId` are pure semantic nodes (e.g. a
  collection or ordering system) and have no flat-table link

The flat table editor (Phases 3–8) is unchanged. The semantic graph
panel is an additional view layer on top.

##### What is explicitly deferred to Phase 13

- **Stable entity IDs** — `sourceEntityId` still uses the fragile
  first-cell string. Renaming a row in the CSV breaks the sidecar link.
  Phase 13 introduces UUIDs and a stable ID registry.
- **Semantic editing** — Phase 14 is read-only for the semantic layer.
  Creating/editing nodes and edges via the UI is Phase 15.
- **Native format** — CSV remains the canonical storage. Phase 16
  replaces it with a format that natively encodes the semantic layer.

##### Concrete tasks
- [ ] Add `SemanticNode`, `SemanticEdge`, `SemanticGraph` classes to
      `src/model/` (one class per file, all property fields are plain
      `string` — no enums, no domain-specific fields)
- [ ] Add `readonly semantic = new SemanticGraph()` to `KnowledgeBase`
- [ ] Add the five primitive query methods to `SemanticGraph`:
      `getNode`, `getEdgesFrom`, `getEdgesTo`, `getEdgesByLabel`,
      `getNodesByProperty`
- [ ] Add sidecar JSON loader to `src/data/`: `parseMetaJSON(json)` →
      reads `nodes[]` and `edges[]` arrays, populates a `SemanticGraph`
- [ ] Wire sidecar loading in `AppController`: if a `.meta.json` file
      is dropped alongside a `.csv`, load it into `kb.semantic`
- [ ] Add `SemanticPanelView` to `src/view/`: a configurable tree/list
      renderer driven by edge label and property key settings
- [ ] Add `#semantic-panel` to `index.html` as a collapsible side panel
- [ ] Add semantic panel styles to `style.css`
- [ ] Add `src/data/sample.meta.json` alongside the existing sample CSVs
- [ ] Add tests for all five `SemanticGraph` query methods
- [ ] Add tests for `parseMetaJSON`

**Completion criteria:**
- Loading a `.meta.json` sidecar populates `kb.semantic` without
  affecting any existing flat-model behaviour
- `getNodesByProperty("type", "Theorem")` returns all theorem nodes
- `getEdgesTo(collectionNodeId).filter(e => e.label === "member")`
  returns the correct membership edges sorted by `position` property
- `getEdgesByLabel("child-of")` correctly returns nesting edges
- The semantic panel renders a tree driven by the configured edge label
- Clicking a node with a `sourceEntityId` highlights its row in the
  flat table
- All existing Phase 1–13 tests pass without modification

**Demo:** Load `theorems.csv` + `theorems.meta.json`. The semantic panel
shows a tree built from `"child-of"` edges: `Differential Calculus >
Calculus Learning Sequence`. Expanding the sequence shows theorems
ordered by their `"position"` property on `"member"` edges. Clicking a
theorem highlights its row in the flat table. Load `compounds.csv` +
`compounds.meta.json` (chemistry data) — the same panel renders a
completely different tree structure from the same generic model.

---

#### Phase 15 — Stable Entity Identity & Semantic Editing 📐 *planned*

##### Background and motivation

Phase 14 introduces the semantic layer but leaves one critical fragility
intact: `sourceEntityId` is still the mutable first-cell string value of
a CSV row. If the user renames "Fundamental Theorem of Calculus" to
"FTC" in the flat table, the sidecar link silently breaks — the
`SemanticGraph` still holds `sourceEntityId: "Fundamental Theorem of
Calculus"` but no row matches it anymore.

This phase fixes that by introducing stable UUIDs as the canonical
identity of every entity, and by making the semantic layer editable
through the UI.

##### Stable UUID registry

A new `EntityRegistry` class maps stable UUIDs to their current
`sourceEntityId` string. The registry is persisted in the sidecar file.
When a row's first cell is edited, the controller updates the registry
entry rather than breaking the link.

```
EntityRegistry
  entries: Map<uuid, { tableName: string; entityId: string }>

  register(tableName, entityId) → uuid   — creates new entry
  resolve(uuid) → { tableName, entityId } | null
  updateEntityId(uuid, newEntityId)        — called on cell rename
  getUUID(tableName, entityId) → uuid | null
```

`KnowledgeBase` gains `readonly registry = new EntityRegistry()`.
`AssociationGraph` edges are updated to use UUIDs internally while
still accepting display-name strings at the CSV import boundary
(resolved via the registry at load time).

`Concept.sourceEntityId` is replaced by `Concept.entityUUID`, making
the semantic layer fully stable against renames.

##### Semantic editing

Phase 13 is read-only for the semantic layer. Phase 14 makes it editable:

- **Create node** — right-click a row in the flat table → "Add to
  semantic graph" → assigns a UUID, creates a `SemanticNode` with
  `sourceEntityId` pointing to the row, opens a property editor
- **Edit node properties** — add, edit, or remove arbitrary key-value
  pairs on any `SemanticNode` in the property editor
- **Create edge** — drag from one node to another in the semantic panel
  → enter label and optional properties
- **Edit edge properties** — click an edge → edit label and property
  key-value pairs
- **Delete node or edge** — select and delete; edges connected to a
  deleted node are also removed
- **Export sidecar** — "Save .meta.json" button serialises the current
  `SemanticGraph` as the generic `{ nodes[], edges[] }` format

All semantic edits are recorded in `EditHistory` via new action types:
`addSemanticNode | editSemanticNode | deleteSemanticNode |
addSemanticEdge | editSemanticEdge | deleteSemanticEdge`.
Ctrl+Z / Ctrl+Y undo/redo works across both flat and semantic edits.

##### Impact on `AssociationGraph`

The existing `AssociationGraph` uses display-name strings as node
identifiers. Phase 13 adds a UUID resolution pass at CSV load time:

1. CSV is parsed → rows loaded into flat model as before
2. Registry is loaded from sidecar (or created fresh if absent)
3. Each row's `entityId` string is looked up in the registry; if not
   found, a new UUID is auto-assigned and registered
4. `AssociationGraph` edges are re-indexed by UUID internally
5. All existing search and filter operations continue to work via the
   registry's `resolve()` method

Existing CSV files without a sidecar continue to work — UUIDs are
auto-assigned at load time and discarded when the session ends (since
there is no sidecar to persist them to). Stability only kicks in once
the user saves a sidecar.

##### Concrete tasks
- [ ] Add `EntityRegistry` class to `src/model/`
- [ ] Add `readonly registry = new EntityRegistry()` to `KnowledgeBase`
- [ ] Update `KnowledgeBase.addTable` to auto-register all entity IDs
- [ ] Update `AppController.editCell` for column 0: call
      `registry.updateEntityId(uuid, newValue)` when the first cell changes
- [ ] Update `AssociationGraph` to resolve display-name strings to UUIDs
      at import time and use UUIDs internally
- [ ] Replace `SemanticNode.sourceEntityId` string coupling with UUID
      lookup via the registry
- [ ] Update `parseMetaJSON` to load registry entries from sidecar
- [ ] Add new `EditAction` variants for semantic node/edge edits:
      `addSemanticNode | editSemanticNode | deleteSemanticNode |
      addSemanticEdge | editSemanticEdge | deleteSemanticEdge`
- [ ] Add node property editor panel to `SemanticPanelView`
- [ ] Add "Add to semantic graph" context action on flat table rows
- [ ] Add drag-to-create-edge interaction in the semantic panel
- [ ] Add edge label and property editor
- [ ] Add "Save .meta.json" export button
- [ ] Add undo/redo for all semantic edit actions
- [ ] Add tests for `EntityRegistry`
- [ ] Add tests for UUID resolution in `AssociationGraph`
- [ ] Add tests for semantic edit undo/redo

**Completion criteria:**
- Renaming a row's first cell updates the registry and does not break
  any `SemanticGraph` links or `AssociationGraph` edges
- Concepts, collections, and collection items can be created and edited
  through the UI
- All semantic edits are undoable with Ctrl+Z
- Exporting a sidecar and reloading it restores the full semantic layer
  including all UUIDs
- All existing Phase 1–14 tests pass without modification

**Demo:** Load `theorems.csv` + `theorems.meta.json`. Rename
"Fundamental Theorem of Calculus" to "FTC" in the flat table — the
semantic panel still shows the node correctly linked to its row.
Right-click a row → "Add to semantic graph" → set properties
`{ type: "Theorem" }`. Drag from the new node to an existing collection
node, set label `"member"`, property `{ position: "6" }`. Export the
sidecar. Reload — the node, edge, and properties are all preserved.

---

#### Phase 16 — Native Format: Replacing CSV as Canonical Storage 📐 *planned*

##### Background and motivation

CSV has served as the transitional storage format since Phase 3. It has
three fundamental limitations that become increasingly painful as the
semantic layer grows:

1. **Flat structure** — CSV cannot natively represent the `SemanticGraph`.
   The sidecar JSON workaround is a second file that can drift out of
   sync with the CSV.
2. **No typed cells** — the type row convention (`text`, `math`) is a
   custom encoding on top of CSV, not part of the format.
3. **No stable identity** — entity IDs are display-name strings. The
   UUID registry (Phase 13) patches this but the patch lives outside
   the CSV.

Phase 15 introduces a native JSON format (`.bk.json`) that natively
encodes everything: flat table data, cell types, the semantic graph,
the entity registry, and the association vocabulary. CSV becomes an
import/export adapter, not the canonical format.

##### Native format structure (`.bk.json`)

```json
{
  "version": "1.0",
  "tables": [
    {
      "name": "theorems",
      "columns": [
        { "name": "Name", "typeId": "text" },
        { "name": "Statement", "typeId": "math" },
        { "name": "Domain", "typeId": "text" }
      ],
      "rows": [
        {
          "uuid": "c-ftc",
          "cells": ["Fundamental Theorem of Calculus", "\\int{a,b,f'(x)}=f(b)-f(a)", "Calculus"]
        }
      ]
    }
  ],
  "associations": [
    { "sourceUUID": "c-ftc", "relation": "uses", "targetUUID": "c-deriv" }
  ],
  "vocabulary": [
    { "name": "uses", "inverse": "is-used-by", "symmetric": false }
  ],
  "semantic": {
    "nodes": [ ... ],
    "edges": [ ... ]
  }
}
```

Key design decisions:
- **UUID per row** — each row carries its UUID directly in the format;
  no separate registry file needed
- **Associations use UUIDs** — no display-name string coupling
- **Semantic layer is embedded** — one file, no sidecar drift
- **Versioned** — `"version": "1.0"` allows future format evolution
  without breaking old files

##### CSV as import/export adapter

The existing `parseCSV` function becomes a CSV importer: it produces
a `KnowledgeBase` from CSV text, auto-assigning UUIDs (as in Phase 13).
A new `exportCSV(table)` function (already exists in `KnowledgeBase`)
remains for exporting individual tables back to CSV for interoperability.

The `Table`/`Row`/`Cell` classes are unchanged — they remain the
in-memory representation. The native format is purely a serialisation
layer on top of them.

##### New data layer modules

- `src/data/bk-format.ts` — `parseBKJSON(json)` and `exportBKJSON(kb)`
- `src/data/csv.ts` — unchanged; becomes one of two import paths
- File type detection in `AppController.loadFile(file)`: `.bk.json` →
  `parseBKJSON`, `.csv` → `parseCSV` + optional `.meta.json` sidecar

##### Concrete tasks
- [ ] Design and document the full `.bk.json` schema (all fields,
      types, required vs optional)
- [ ] Implement `parseBKJSON(json): KnowledgeBase` in `src/data/bk-format.ts`
- [ ] Implement `exportBKJSON(kb): string` in `src/data/bk-format.ts`
- [ ] Add file type detection to `AppController`: dispatch to correct
      parser based on file extension
- [ ] Add "Save as .bk.json" button to the toolbar (replaces the
      per-table CSV export for full-knowledge-base saves)
- [ ] Update session persistence (`session.ts`) to store the file type
      alongside the file name
- [ ] Add lossless round-trip test: load CSV → export `.bk.json` →
      reload → compare flat model and semantic layer
- [ ] Update sample data: provide `sample.bk.json` as the primary demo
      file alongside the existing CSV files
- [ ] Add tests for `parseBKJSON` and `exportBKJSON`

**Completion criteria:**
- A `.bk.json` file round-trips losslessly: load → export → reload
  produces an identical `KnowledgeBase`
- CSV files still load correctly via the existing path
- The semantic layer (concepts, collections, items, families) survives
  the round-trip without any sidecar file
- All existing Phase 1–15 tests pass without modification

**Demo:** Load `sample.bk.json` directly. The flat table, association
graph, and collection browser all populate from a single file. Edit a
cell and add a concept to a collection. Click "Save as .bk.json",
reload the saved file — all edits including semantic metadata are
present. Load an old `.csv` file — it still works via the CSV import
path.

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
├── public/                      ← static assets served as-is
├── src/                         ← all TypeScript source
│   ├── engine/                  ← general-purpose PEG engine
│   ├── model/                   ← business model (1 class per file)
│   │   ├── Cell.ts
│   │   ├── Column.ts
│   │   ├── Row.ts
│   │   ├── Table.ts
│   │   ├── Association.ts
│   │   ├── RelationType.ts
│   │   ├── AssociationGraph.ts
│   │   ├── EditHistory.ts       ← EditHistory class + EditAction type
│   │   ├── KnowledgeBase.ts
│   │   └── index.ts             ← barrel re-export only
│   ├── controller/              ← AppController
│   ├── view/                    ← TableView, GraphFilterView, SearchView, session
│   ├── plugins/                 ← math, text, geometry, physics plugins + registry
│   │   ├── math/
│   │   ├── text/
│   │   ├── geometry/            ← geometry syntax plugin (types, grammar, render)
│   │   └── physics/             ← physics free-body plugin (types, grammar, render)
│   ├── data/                    ← CSV parser, types
│   ├── search/                  ← search engine
│   ├── ui/                      ← legacy UI functions (backward compat for tests)
│   └── main.ts                  ← app entry point (MVC wiring)
├── test/                        ← mirrors src structure
├── index.html                   ← spreadsheet shell (menu, formula, toolbar, tabs, workspace, status)
├── native-math.css              ← math rendering styles
├── style.css                    ← app shell + spreadsheet layout styles
├── package.json
├── tsconfig.json
└── .prettierrc
```
