use std::error::Error;
use std::fmt;

use crate::column::ColumnError;

/// Convenience alias for table-oriented results.
pub type TableResult<T> = Result<T, TableError>;

/// Errors propagated by table operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TableError {
    Column(ColumnError),
    RowLength { expected: usize, found: usize },
    RowOutOfBounds { index: usize, len: usize },
}

impl From<ColumnError> for TableError {
    fn from(error: ColumnError) -> Self {
        TableError::Column(error)
    }
}

impl TableError {
    pub fn row_length(expected: usize, found: usize) -> Self {
        TableError::RowLength { expected, found }
    }

    pub fn row_out_of_bounds(index: usize, len: usize) -> Self {
        TableError::RowOutOfBounds { index, len }
    }
}

impl fmt::Display for TableError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TableError::Column(err) => write!(f, "column error: {}", err),
            TableError::RowLength { expected, found } => write!(f, "row length mismatch: expected {}, found {}", expected, found),
            TableError::RowOutOfBounds { index, len } => write!(f, "row {} out of bounds for length {}", index, len),
        }
    }
}

impl Error for TableError {}
