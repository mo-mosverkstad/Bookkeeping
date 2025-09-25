//! Core data structures for the RustBookkeeping project.
//!
//! This crate provides:
//! - [`TreeArray`]: an implicit-indexed AVL tree that supports stable indices.
//! - [`OrderedTable`] and [`UnorderedTable`]: columnar data containers backed by typed columns.
//! - [`Value`]: a lightweight dynamic value representation used for heterogeneous tables.
//!
//! The modules are intentionally lightweight so the components can be embedded in larger
//! applications or reused independently in other crates.

pub mod column;
pub mod ordered_table;
pub mod table;
pub mod tree_array;
pub mod unordered_table;
pub mod value;

pub use column::{Column, ColumnError, ColumnResult, TableColumn};
pub use ordered_table::OrderedTable;
pub use table::{TableError, TableResult};
pub use tree_array::{IndexError, IndexResult, TreeArray};
pub use unordered_table::UnorderedTable;
pub use value::{Value, ValueKind};
