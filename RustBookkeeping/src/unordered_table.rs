use std::collections::BTreeSet;
use std::fmt;

use crate::column::Column;
use crate::table::{TableError, TableResult};
use crate::tree_array::{IndexError, TreeArray};
use crate::value::Value;

/// Table that separates logical order from physical storage.
#[derive(Debug, Default)]
pub struct UnorderedTable {
    columns: Vec<Box<dyn Column>>,
    logical_order: TreeArray<usize>,
    next_physical: usize,
    free_physical: BTreeSet<usize>,
}

impl UnorderedTable {
    /// Creates an empty table.
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds a column using builder-style chaining.
    pub fn with_column<C: Column + 'static>(mut self, column: C) -> Self {
        self.add_column(column);
        self
    }

    /// Adds a column and extends it to cover existing physical slots.
    pub fn add_column<C: Column + 'static>(&mut self, mut column: C) -> &mut Self {
        let target_len = self.next_physical;
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

    /// Returns the number of logical rows.
    pub fn row_count(&self) -> usize {
        self.logical_order.len()
    }

    /// Returns `true` when the table has no logical rows.
    pub fn is_empty(&self) -> bool {
        self.logical_order.len() == 0
    }

    /// Returns the physical indices in the current logical order.
    pub fn physical_order(&self) -> Vec<usize> {
        self.logical_order.in_order()
    }

    /// Appends a row at the end of the logical order.
    pub fn append_row(&mut self, row: Vec<Value>) -> TableResult<()> {
        let index = self.row_count();
        self.insert_row(index, row)
    }

    /// Inserts a row at a specific logical position.
    pub fn insert_row(&mut self, index: usize, row: Vec<Value>) -> TableResult<()> {
        if self.column_count() != row.len() {
            return Err(TableError::row_length(self.column_count(), row.len()));
        }
        let physical = if let Some(&reuse) = self.free_physical.iter().next() {
            self.free_physical.take(&reuse);
            reuse
        } else {
            let id = self.next_physical;
            self.next_physical += 1;
            id
        };
        for (value, column) in row.into_iter().zip(self.columns.iter_mut()) {
            while column.len() <= physical {
                column.push_default();
            }
            if !matches!(value, Value::Null) {
                column.set(physical, value).map_err(TableError::from)?;
            }
        }
        self.logical_order
            .insert(index, physical)
            .map_err(map_index_error)?;
        Ok(())
    }

    /// Deletes the logical row at `index`, recycling its physical slot.
    pub fn delete_row(&mut self, index: usize) -> TableResult<()> {
        let physical = self
            .logical_order
            .remove(index)
            .map_err(map_index_error)?;
        self.free_physical.insert(physical);
        Ok(())
    }

    /// Swaps two logical rows by exchanging their physical indices.
    pub fn swap_rows(&mut self, a: usize, b: usize) -> TableResult<()> {
        if a == b {
            return Ok(());
        }
        let pa = self
            .logical_order
            .get(a)
            .map_err(map_index_error)?;
        let pb = self
            .logical_order
            .get(b)
            .map_err(map_index_error)?;
        self.logical_order
            .set(a, pb)
            .map_err(map_index_error)?;
        self.logical_order
            .set(b, pa)
            .map_err(map_index_error)?;
        Ok(())
    }

    /// Overwrites the logical row at `index` with new values.
    pub fn update_row(&mut self, index: usize, row: Vec<Value>) -> TableResult<()> {
        if self.column_count() != row.len() {
            return Err(TableError::row_length(self.column_count(), row.len()));
        }
        let physical = self
            .logical_order
            .get(index)
            .map_err(|err| map_index_error(err, self.row_count()))?;
        for (value, column) in row.into_iter().zip(self.columns.iter_mut()) {
            while column.len() <= physical {
                column.push_default();
            }
            if !matches!(value, Value::Null) {
                column.set(physical, value).map_err(TableError::from)?;
            }
        }
        Ok(())
    }

    /// Renders the table in logical order.
    pub fn render(&self) -> String {
        if self.column_count() == 0 || self.row_count() == 0 {
            return "(empty table)".to_string();
        }
        let rows = self.row_count();
        let mut widths: Vec<usize> = Vec::with_capacity(self.column_count());
        for column in &self.columns {
            let mut width = column.name().len();
            for physical in self.logical_order.iter() {
                if let Some(value) = column.get(*physical) {
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
            fmt::write(&mut output, format_args!("{:<width$}", column.name(), width = width)).unwrap();
        }
        output.push('\n');
        for (idx, width) in widths.iter().enumerate() {
            if idx > 0 {
                output.push(' ');
            }
            output.push_str(&"-".repeat(*width));
        }
        output.push('\n');
        for physical in self.logical_order.iter() {
            for (col_idx, (column, width)) in self.columns.iter().zip(widths.iter()).enumerate() {
                if col_idx > 0 {
                    output.push(' ');
                }
                let value = column.get(*physical).unwrap_or(Value::Null);
                fmt::write(&mut output, format_args!("{:<width$}", value, width = width)).unwrap();
            }
            output.push('\n');
        }
        if !output.is_empty() {
            output.pop();
        }
        output
    }

    /// Returns a copy of the recycled physical slots.
    pub fn free_slots(&self) -> BTreeSet<usize> {
        self.free_physical.clone()
    }

    /// Returns the next unused physical slot.
    pub fn next_physical(&self) -> usize {
        self.next_physical
    }
}

fn map_index_error(error: IndexError) -> TableError {
    TableError::row_out_of_bounds(error.index, error.len)
}
