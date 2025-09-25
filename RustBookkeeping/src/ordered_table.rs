use std::fmt;

use crate::column::Column;
use crate::table::{TableError, TableResult};
use crate::value::Value;

/// Table that maintains logical row order.
#[derive(Debug, Default)]
pub struct OrderedTable {
    columns: Vec<Box<dyn Column>>,
}

impl OrderedTable {
    /// Creates an empty table.
    pub fn new() -> Self {
        Self {
            columns: Vec::new(),
        }
    }

    /// Adds a column and returns the table for chaining.
    pub fn with_column<C: Column + 'static>(mut self, column: C) -> Self {
        self.add_column(column);
        self
    }

    /// Adds a column to the table. Missing rows are filled with default values.
    pub fn add_column<C: Column + 'static>(&mut self, mut column: C) -> &mut Self {
        let target_len = self.row_count();
        while column.len() < target_len {
            column.push_default();
        }
        self.columns.push(Box::new(column));
        self
    }

    /// Returns the number of columns.
    pub fn column_count(&self) -> usize {
        self.columns.len()
    }

    /// Returns the column names in order of insertion.
    pub fn column_names(&self) -> Vec<&str> {
        self.columns.iter().map(|c| c.name()).collect()
    }

    /// Returns the number of rows tracked by the table.
    pub fn row_count(&self) -> usize {
        self.columns.iter().map(|c| c.len()).max().unwrap_or(0)
    }

    /// Returns `true` when the table has no rows.
    pub fn is_empty(&self) -> bool {
        self.row_count() == 0
    }

    /// Appends a row of values.
    pub fn append_row(&mut self, row: Vec<Value>) -> TableResult<()> {
        if self.column_count() != row.len() {
            return Err(TableError::row_length(self.column_count(), row.len()));
        }
        for (mut value, column) in row.into_iter().zip(self.columns.iter_mut()) {
            if matches!(value, Value::Null) {
                column.push_default();
            } else {
                column.push(value).map_err(TableError::from)?;
            }
        }
        Ok(())
    }

    /// Overwrites the row at `index`, extending the table with defaults if required.
    pub fn update_row(&mut self, index: usize, row: Vec<Value>) -> TableResult<()> {
        if self.column_count() != row.len() {
            return Err(TableError::row_length(self.column_count(), row.len()));
        }
        for (value, column) in row.into_iter().zip(self.columns.iter_mut()) {
            while column.len() <= index {
                column.push_default();
            }
            if !matches!(value, Value::Null) {
                column.set(index, value).map_err(TableError::from)?;
            }
        }
        Ok(())
    }

    /// Returns a copy of the row at `index`.
    pub fn get_row(&self, index: usize) -> TableResult<Vec<Value>> {
        if index >= self.row_count() {
            return Err(TableError::row_out_of_bounds(index, self.row_count()));
        }
        let mut row = Vec::with_capacity(self.column_count());
        for column in &self.columns {
            row.push(column.get(index).unwrap_or(Value::Null));
        }
        Ok(row)
    }

    /// Renders the table into a padded textual form.
    pub fn render(&self) -> String {
        if self.column_count() == 0 {
            return "(empty table)".to_string();
        }
        let rows = self.row_count();
        let mut widths: Vec<usize> = Vec::with_capacity(self.column_count());
        for column in &self.columns {
            let mut width = column.name().len();
            for idx in 0..rows {
                if let Some(value) = column.get(idx) {
                    width = width.max(value.to_string().len());
                }
            }
            widths.push(width);
        }
        let mut output = String::new();
        for (column, width) in self.columns.iter().zip(widths.iter()) {
            if !output.is_empty() {
                output.push(' ');
            }
            fmt::write(
                &mut output,
                format_args!("{:<width$}", column.name(), width = width),
            )
            .unwrap();
        }
        output.push('\n');
        for (idx, width) in widths.iter().enumerate() {
            if idx > 0 {
                output.push(' ');
            }
            output.push_str(&"-".repeat(*width));
        }
        output.push('\n');
        for row_idx in 0..rows {
            for (col_idx, (column, width)) in self.columns.iter().zip(widths.iter()).enumerate() {
                if col_idx > 0 {
                    output.push(' ');
                }
                let value = column.get(row_idx).unwrap_or(Value::Null);
                fmt::write(
                    &mut output,
                    format_args!("{:<width$}", value, width = width),
                )
                .unwrap();
            }
            if row_idx + 1 < rows {
                output.push('\n');
            }
        }
        output
    }
}
