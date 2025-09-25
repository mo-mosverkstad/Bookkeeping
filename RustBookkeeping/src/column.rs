use std::error::Error;
use std::fmt;

use crate::value::{Value, ValueKind};

/// Convenience alias for operations on [`Column`] implementations.
pub type ColumnResult<T> = Result<T, ColumnError>;

/// Errors that can occur when manipulating columnar data.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ColumnError {
    TypeMismatch {
        column: String,
        expected: ValueKind,
        found: ValueKind,
    },
    IndexOutOfBounds {
        column: String,
        index: usize,
        len: usize,
    },
}

impl ColumnError {
    pub fn type_mismatch(column: impl Into<String>, expected: ValueKind, found: ValueKind) -> Self {
        Self::TypeMismatch {
            column: column.into(),
            expected,
            found,
        }
    }

    pub fn index_out_of_bounds(column: impl Into<String>, index: usize, len: usize) -> Self {
        Self::IndexOutOfBounds {
            column: column.into(),
            index,
            len,
        }
    }
}

impl fmt::Display for ColumnError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ColumnError::TypeMismatch {
                column,
                expected,
                found,
            } => {
                write!(
                    f,
                    "column '{}' expected {}, found {}",
                    column,
                    expected.as_str(),
                    found.as_str()
                )
            }
            ColumnError::IndexOutOfBounds { column, index, len } => {
                write!(
                    f,
                    "column '{}' index {} out of bounds for length {}",
                    column, index, len
                )
            }
        }
    }
}

impl Error for ColumnError {}

pub trait Column: fmt::Debug {
    /// Returns the display name of the column.
    fn name(&self) -> &str;
    /// Reports the [`ValueKind`] stored by this column.
    fn kind(&self) -> ValueKind;
    /// Returns the number of allocated rows.
    fn len(&self) -> usize;

    /// Appends `value` to the column.
    fn push(&mut self, value: Value) -> ColumnResult<()>;
    /// Appends the type's default value.
    fn push_default(&mut self);
    /// Replaces the value at `index`.
    fn set(&mut self, index: usize, value: Value) -> ColumnResult<()>;
    /// Returns the value at `index`, if present.
    fn get(&self, index: usize) -> Option<Value>;
}

/// Trait implemented by types that can be stored inside [`TableColumn`].
pub trait ColumnType:
    Clone + Default + fmt::Debug + fmt::Display + Into<Value> + TryFrom<Value, Error = Value>
{
    const KIND: ValueKind;
}

macro_rules! impl_column_type {
    ($ty:ty, $kind:expr) => {
        impl ColumnType for $ty {
            const KIND: ValueKind = $kind;
        }
    };
}

impl_column_type!(i32, ValueKind::Int);
impl_column_type!(f32, ValueKind::Float);
impl_column_type!(f64, ValueKind::Double);
impl_column_type!(u32, ValueKind::UInt);
impl_column_type!(i64, ValueKind::Long);
impl_column_type!(bool, ValueKind::Bool);
impl_column_type!(u8, ValueKind::Byte);
impl_column_type!(char, ValueKind::Char);
impl_column_type!(String, ValueKind::Str);
impl_column_type!(u64, ValueKind::Date);

/// Concrete [`Column`] implementation backed by a `Vec<T>`.
#[derive(Debug, Default)]
pub struct TableColumn<T: ColumnType> {
    name: String,
    values: Vec<T>,
}

impl<T: ColumnType> TableColumn<T> {
    /// Creates an empty column with the given `name`.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            values: Vec::new(),
        }
    }

    /// Returns the typed view of the underlying values.
    pub fn values(&self) -> &[T] {
        &self.values
    }

    fn ensure_index(&self, index: usize) -> ColumnResult<()> {
        if index < self.values.len() {
            Ok(())
        } else {
            Err(ColumnError::index_out_of_bounds(
                self.name.clone(),
                index,
                self.values.len(),
            ))
        }
    }
}

impl<T: ColumnType> Column for TableColumn<T> {
    fn name(&self) -> &str {
        &self.name
    }

    fn kind(&self) -> ValueKind {
        T::KIND
    }

    fn len(&self) -> usize {
        self.values.len()
    }

    fn push(&mut self, value: Value) -> ColumnResult<()> {
        let typed = T::try_from(value)
            .map_err(|v| ColumnError::type_mismatch(self.name.clone(), T::KIND, v.kind()))?;
        self.values.push(typed);
        Ok(())
    }

    fn push_default(&mut self) {
        self.values.push(T::default());
    }

    fn set(&mut self, index: usize, value: Value) -> ColumnResult<()> {
        self.ensure_index(index)?;
        let typed = T::try_from(value)
            .map_err(|v| ColumnError::type_mismatch(self.name.clone(), T::KIND, v.kind()))?;
        self.values[index] = typed;
        Ok(())
    }

    fn get(&self, index: usize) -> Option<Value> {
        self.values.get(index).cloned().map(Into::into)
    }
}
