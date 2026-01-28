use crate::tools::csv_read::{CsvReader, CsvWriter};
use crate::tools::history::{History, TargetMementoTrait};
use crate::tools::treearray::TreeArray;
use std::io::{BufRead, Write};
use std::mem;

// --------- History for CSV Table changes ----------
#[derive(Debug, Clone)]
enum TableChange {
    CellEdit(usize, usize, String),

    RowInserted(usize, usize),
    RowDeleted(usize, usize),
    ColInserted(usize, usize),
    ColDeleted(usize, usize),

    FreeRowPushed(usize),
    FreeRowPopped(usize),
    FreeColPushed(usize),
    FreeColPopped(usize),
}

#[derive(Debug, Clone, Default)]
struct CSVTableMemento {
    changes: Vec<TableChange>,
}

// --------- Main CSV Table logic ---------
#[derive(Debug)]
#[allow(unused_assignments)]
pub struct CSVTable {
    table: Vec<Vec<String>>,
    row_indirection: TreeArray<usize>,
    col_indirection: TreeArray<usize>,
    free_rows: Vec<usize>,
    free_cols: Vec<usize>,
    history: History<CSVTableMemento>,
}

#[allow(dead_code)]
impl CSVTable {
    pub fn new() -> Self {
        Self {
            table: Vec::<Vec<String>>::new(),
            row_indirection: TreeArray::<usize>::new(),
            col_indirection: TreeArray::<usize>::new(),
            free_rows: Vec::<usize>::new(),
            free_cols: Vec::<usize>::new(),
            history: History::<CSVTableMemento>::new(),
        }
    }

    pub fn row_size(self: &mut Self) -> usize {
        self.row_indirection.len()
    }

    pub fn col_size(self: &mut Self) -> usize {
        self.col_indirection.len()
    }

    pub fn has_cell(self: &mut Self, row_index: usize, col_index: usize) -> bool {
        row_index < self.row_size() && col_index < self.col_size()
    }

    pub fn has_row(self: &mut Self, row_index: usize) -> bool {
        row_index < self.row_size()
    }

    pub fn has_col(self: &mut Self, col_index: usize) -> bool {
        col_index < self.col_size()
    }

    pub fn append_row(self: &mut Self) {
        let physical_row_index: usize = match self.free_rows.pop() {
            Some(value) => value,
            None => {
                let value: usize = self.row_size();
                let col_size = self.col_size();
                self.table.push(vec![String::new(); col_size]);
                value
            }
        };
        let row_index = self.row_size();
        self.row_indirection.append(physical_row_index);
        self.history.record(CSVTableMemento {
            changes: vec![TableChange::RowDeleted(row_index, physical_row_index)],
        });
    }

    pub fn append_col(self: &mut Self) {
        let physical_col_index: usize = match self.free_cols.pop() {
            Some(value) => value,
            None => match self.row_size() {
                0 => {
                    self.table.push(vec![String::new()]);
                    self.row_indirection.append(0);
                    0
                }
                _ => {
                    let value: usize = self.table[0].len();
                    for row in &mut self.table {
                        row.push(String::new());
                    }
                    value
                }
            },
        };
        let col_index = self.col_size();
        self.col_indirection.append(physical_col_index);
        self.history.record(CSVTableMemento {
            changes: vec![TableChange::ColDeleted(col_index, physical_col_index)],
        });
    }

    pub fn insert_row(self: &mut Self, row_index: usize) {
        let physical_row_index: usize = match self.free_rows.pop() {
            Some(value) => value,
            None => {
                let value: usize = self.row_size();
                let col_size = self.col_size();
                self.table.push(vec![String::new(); col_size]);
                value
            }
        };
        self.row_indirection.insert(row_index, physical_row_index);
        self.history.record(CSVTableMemento {
            changes: vec![TableChange::RowDeleted(row_index, physical_row_index)],
        });
    }

    pub fn insert_col(self: &mut Self, col_index: usize) {
        let physical_col_index: usize = match self.free_cols.pop() {
            Some(value) => value,
            None => match self.row_size() {
                0 => {
                    self.table.push(vec![String::new()]);
                    self.row_indirection.append(0);
                    0
                }
                _ => {
                    let value: usize = self.table[0].len();
                    for row in &mut self.table {
                        row.push(String::new());
                    }
                    value
                }
            },
        };
        self.col_indirection.insert(col_index, physical_col_index);
        self.history.record(CSVTableMemento {
            changes: vec![TableChange::ColDeleted(col_index, physical_col_index)],
        });
    }

    pub fn delete_row(self: &mut Self, row_index: usize) {
        let physical_row_index = match self.row_indirection.get(row_index) {
            Some(value) => value,
            None => panic!("row_index parameter out of bound"),
        };
        let mut changes: Vec<TableChange> =
            vec![TableChange::RowInserted(row_index, physical_row_index)];
        self.free_rows.push(physical_row_index);
        self.row_indirection.delete(row_index);
        for physical_col_index in 0..self.col_size() {
            let old_value: String = self.table[physical_row_index][physical_col_index].clone();
            self.table[physical_row_index][physical_col_index] = String::new();
            changes.push(TableChange::CellEdit(
                physical_row_index,
                physical_col_index,
                old_value,
            ));
        }

        self.history.record(CSVTableMemento { changes: changes });
    }

    pub fn delete_col(self: &mut Self, col_index: usize) {
        let physical_col_index = match self.col_indirection.get(col_index) {
            Some(value) => value,
            None => panic!("col_index parameter out of bound"),
        };
        let mut changes: Vec<TableChange> =
            vec![TableChange::ColInserted(col_index, physical_col_index)];
        self.free_cols.push(physical_col_index);
        self.col_indirection.delete(col_index);
        for physical_row_index in 0..self.row_size() {
            let old_value: String = self.table[physical_row_index][physical_col_index].clone();
            self.table[physical_row_index][physical_col_index] = String::new();
            changes.push(TableChange::CellEdit(
                physical_row_index,
                physical_col_index,
                old_value,
            ));
        }
        self.history.record(CSVTableMemento { changes: changes });
    }

    pub fn write_cell(self: &mut Self, row_index: usize, col_index: usize, value: &str) {
        let physical_row_index = match self.row_indirection.get(row_index) {
            Some(value) => value,
            None => panic!("row_index parameter out of bound"),
        };
        let physical_col_index = match self.col_indirection.get(col_index) {
            Some(value) => value,
            None => panic!("col_index parameter out of bound"),
        };
        let old_value: String = self.table[physical_row_index][physical_col_index].clone();
        self.table[physical_row_index][physical_col_index] = value.to_string();
        self.history.record(CSVTableMemento {
            changes: vec![TableChange::CellEdit(
                physical_row_index,
                physical_col_index,
                old_value,
            )],
        });
    }

    pub fn read_cell(self: &mut Self, row_index: usize, col_index: usize) -> &str {
        let physical_row_index = match self.row_indirection.get(row_index) {
            Some(value) => value,
            None => panic!("row_index parameter out of bound"),
        };
        let physical_col_index = match self.col_indirection.get(col_index) {
            Some(value) => value,
            None => panic!("col_index parameter out of bound"),
        };

        &self.table[physical_row_index][physical_col_index]
    }

    pub fn pretty_print(self: &mut Self) {
        for physical_row_index in self.row_indirection.in_order() {
            let mut first: bool = true;
            print!("[");
            for physical_col_index in self.col_indirection.in_order() {
                let deliminator: &str = if first {
                    first = false;
                    ""
                } else {
                    ", "
                };
                print!(
                    "{}\"{}\"",
                    deliminator, &self.table[physical_row_index][physical_col_index]
                );
            }
            println!("]");
        }
    }

    pub fn inspection_print(self: &mut Self) {
        println!("CSV TABLE");
        println!("table: {:#?}", self.table);
        println!(
            "row_indirection: {:?}",
            self.row_indirection
                .in_order()
                .into_iter()
                .collect::<Vec<usize>>()
        );
        println!(
            "col_indirection: {:?}",
            self.col_indirection
                .in_order()
                .into_iter()
                .collect::<Vec<usize>>()
        );
        println!("free_rows: {:?}", self.free_rows);
        println!("free_cols: {:?}", self.free_cols);
        println!("history: {:?}", self.history);
    }

    pub fn undo(self: &mut Self) {
        let mut history = mem::take(&mut self.history);
        history.undo(self);
        self.history = history;
    }

    pub fn redo(self: &mut Self) {
        let mut history = mem::take(&mut self.history);
        history.redo(self);
        self.history = history;
    }

    pub fn undoable(self: &mut Self) -> bool {
        self.history.undoable()
    }

    pub fn redoable(self: &mut Self) -> bool {
        self.history.redoable()
    }

    pub fn read_csv<R: BufRead>(&mut self, reader: R) -> std::io::Result<()> {
        // ---- Reset state ----
        self.table.clear();
        self.row_indirection.clear();
        self.col_indirection.clear();
        self.free_rows.clear();
        self.free_cols.clear();
        self.history.clear();

        let csv_reader = CsvReader::new(reader);

        let mut col_count = 0usize;

        // ---- Stream rows ----
        for value in csv_reader {
            let record = value?;
            col_count = col_count.max(record.len());
            self.table.push(record);
        }

        // ---- Normalize row lengths ----
        for row in &mut self.table {
            row.resize(col_count, String::new());
        }

        // ---- Initialize indirections ----
        for row_index in 0..self.table.len() {
            self.row_indirection.append(row_index);
        }

        for col_index in 0..col_count {
            self.col_indirection.append(col_index);
        }

        Ok(())
    }

    pub fn write_csv<W: Write>(&mut self, writer: W) -> std::io::Result<()> {
        let mut csv = CsvWriter::new(writer);

        let rows = self.row_size();
        let cols = self.col_size();

        for r in 0..rows {
            let mut record = Vec::with_capacity(cols);
            for c in 0..cols {
                record.push(self.read_cell(r, c).to_string());
            }
            csv.write_record(&record)?;
        }

        Ok(())
    }
}

impl TargetMementoTrait<CSVTableMemento> for CSVTable {
    fn apply_memento(self: &mut Self, memento: &CSVTableMemento) -> CSVTableMemento {
        let mut inverse_changes = Vec::new();
        for change in &memento.changes {
            match change {
                TableChange::CellEdit(physical_row_index, physical_col_index, new_val) => {
                    let previous_val = self.table[*physical_row_index][*physical_col_index].clone();
                    self.table[*physical_row_index][*physical_col_index] = new_val.clone();
                    inverse_changes.push(TableChange::CellEdit(
                        *physical_row_index,
                        *physical_col_index,
                        previous_val,
                    ));
                }
                TableChange::RowInserted(logical, physical) => {
                    self.row_indirection.insert(*logical, *physical);
                    inverse_changes.push(TableChange::RowDeleted(*logical, *physical));
                }
                TableChange::RowDeleted(logical, physical) => {
                    self.row_indirection.delete(*logical);
                    inverse_changes.push(TableChange::RowInserted(*logical, *physical));
                }
                TableChange::ColInserted(logical, physical) => {
                    self.col_indirection.insert(*logical, *physical);
                    inverse_changes.push(TableChange::ColDeleted(*logical, *physical));
                }
                TableChange::ColDeleted(logical, physical) => {
                    self.col_indirection.delete(*logical);
                    inverse_changes.push(TableChange::ColInserted(*logical, *physical));
                }
                TableChange::FreeRowPushed(physical) => {
                    self.free_rows.push(*physical);
                    inverse_changes.push(TableChange::FreeRowPopped(*physical));
                }
                TableChange::FreeRowPopped(physical) => {
                    self.free_rows.pop();
                    inverse_changes.push(TableChange::FreeRowPushed(*physical));
                }
                TableChange::FreeColPushed(physical) => {
                    self.free_cols.push(*physical);
                    inverse_changes.push(TableChange::FreeColPopped(*physical));
                }
                TableChange::FreeColPopped(physical) => {
                    self.free_cols.pop();
                    inverse_changes.push(TableChange::FreeColPushed(*physical));
                }
            }
        }
        CSVTableMemento {
            changes: inverse_changes,
        }
    }
}
