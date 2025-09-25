# Bookkeeping
Bookkeeping is a set of small experiments for keeping structured financial data.

## RustBookkeeping

`RustBookkeeping/` now ships a reusable crate that exposes:

- `TreeArray`: an implicit-indexed AVL tree with stable indices and safe error handling.
- `OrderedTable` and `UnorderedTable`: columnar row stores backed by typed `TableColumn<T>` implementations.
- `Value`: a lightweight runtime value enum (ints, floats, strings, etc.) with friendly `Display` output and conversions.
- Shared error types (`IndexError`, `ColumnError`, `TableError`) so indexing mistakes surface as recoverable results instead of panics.

### Layout

```
RustBookkeeping/
├── src/
│   ├── lib.rs                # Crate exports
│   ├── tree_array.rs         # Implicit AVL implementation
│   ├── column.rs             # Typed column storage and errors
│   ├── ordered_table.rs      # Ordered row table
│   ├── unordered_table.rs    # Logical/physical split table
│   ├── table.rs              # Table-level error definitions
│   └── value.rs              # Dynamic Value enum
├── src/main.rs               # CLI demo that exercises both table types
├── examples/basic_usage.rs   # Minimal usage example (run via `cargo run --example basic_usage`)
└── tests/                    # Integration test suite for core components
```

### Requirements

- Rust toolchain (install via <https://rustup.rs>)

### Common Tasks

- Build library and binaries: `cargo build`
- Run the demo CLI: `cargo run`
- Execute example: `cargo run --example basic_usage`
- Run tests: `cargo test`
- Format sources: `cargo fmt`

### Notes

- Legacy scratch files (`BookkeepingDB.rs`, `ImplicitAVL.rs`) remain in the directory for reference but are not compiled; the new functionality lives entirely in `src/`.
- The crate exports all public APIs through `rustbookkeeping::` so it can be reused from other projects or embedded in larger tooling.
