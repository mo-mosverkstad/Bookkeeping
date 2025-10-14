mod implicit_avl;
use implicit_avl::TreeArray;

#[derive(Debug)]
#[allow(unused_assignments)]
struct CSVTable{
    table: Vec<Vec<String>>,
    row_indirection: TreeArray<usize>,
    col_indirection: TreeArray<usize>,
    free_rows: Vec<usize>,
    free_cols: Vec<usize>
}

#[allow(dead_code)]
impl CSVTable{
    pub fn new() -> Self{
        Self { 
            table: Vec::<Vec<String>>::new(), 
            row_indirection: TreeArray::<usize>::new(), 
            col_indirection: TreeArray::<usize>::new(),
            free_rows: Vec::<usize>::new(),
            free_cols: Vec::<usize>::new()
        }
    }

    pub fn row_size(self: &mut Self) -> usize{
        self.row_indirection.len()
    }

    pub fn col_size(self: &mut Self) -> usize{
        self.col_indirection.len()
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
        self.row_indirection.append(physical_row_index);
    }

    pub fn append_col(self: &mut Self) {
        let physical_col_index: usize = match self.free_cols.pop() {
            Some(value) => value,
            None => {
                match self.row_size(){
                    0 => {
                        self.table.push(vec![String::new()]);
                        self.row_indirection.append(0);
                        0
                    }
                    _ => {
                        let value: usize = self.table[0].len();
                        for row in &mut self.table{
                            row.push(String::new());
                        }
                        value
                    }
                }
            }
        };
        self.col_indirection.append(physical_col_index);
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
    }

    pub fn insert_col(self: &mut Self, col_index: usize) {
        let physical_col_index: usize = match self.free_cols.pop() {
            Some(value) => value,
            None => {
                match self.row_size(){
                    0 => {
                        self.table.push(vec![String::new()]);
                        self.row_indirection.append(0);
                        0
                    }
                    _ => {
                        let value: usize = self.table[0].len();
                        for row in &mut self.table{
                            row.push(String::new());
                        }
                        value
                    }
                }
            }
        };
        self.col_indirection.insert(col_index, physical_col_index);
    }

    pub fn delete_row(self: &mut Self, row_index: usize) {
        let physical_row_index = match self.row_indirection.get(row_index) {
            Some(value) => value,
            None => panic!("row_index parameter out of bound"),
        };
        self.free_rows.push(physical_row_index);
        self.row_indirection.delete(row_index);
        for physical_col_index in 0..self.col_size(){
            self.table[physical_row_index][physical_col_index] = String::new();
        }
    }

    pub fn delete_col(self: &mut Self, col_index: usize) {
        let physical_col_index = match self.col_indirection.get(col_index){
            Some(value) => value,
            None => panic!("col_index parameter out of bound"),
        };
        self.free_cols.push(physical_col_index);
        self.col_indirection.delete(col_index);
        for physical_row_index in 0..self.row_size(){
            self.table[physical_row_index][physical_col_index] = String::new();
        }
    }

    pub fn write_cell(self: &mut Self, row_index: usize, col_index: usize, value: &str){
        let physical_row_index = match self.row_indirection.get(row_index) {
            Some(value) => value,
            None => panic!("row_index parameter out of bound"),
        };
        let physical_col_index = match self.col_indirection.get(col_index){
            Some(value) => value,
            None => panic!("col_index parameter out of bound"),
        };
        self.table[physical_row_index][physical_col_index] = value.to_string();
    }

    pub fn read_cell(self: &mut Self, row_index: usize, col_index: usize) -> &str{
        let physical_row_index = match self.row_indirection.get(row_index) {
            Some(value) => value,
            None => panic!("row_index parameter out of bound"),
        };
        let physical_col_index = match self.col_indirection.get(col_index){
            Some(value) => value,
            None => panic!("col_index parameter out of bound"),
        };

        &self.table[physical_row_index][physical_col_index]
    }

    pub fn pretty_print(self: &mut Self) {
        let mut first: bool = true;
        for physical_row_index in self.row_indirection.in_order(){
            first = true;
            print!("[");
            for physical_col_index in self.col_indirection.in_order(){
                let deliminator: &str = if first{
                    first = false;
                    ""
                }
                else{
                    ", "
                };
                print!("{}\"{}\"", deliminator, &self.table[physical_row_index][physical_col_index]);
            }
            println!("]");
        }
    }

    pub fn inspection_print(self: &mut Self) {
        println!("CSV TABLE");
        println!("table: {:#?}", self.table);
        println!("row_indirection: {:?}", self.row_indirection.in_order().into_iter().collect::<Vec<usize>>());
        println!("col_indirection: {:?}", self.col_indirection.in_order().into_iter().collect::<Vec<usize>>());
        println!("free_rows: {:?}", self.free_rows);
        println!("free_cols: {:?}", self.free_cols);
    }
}


fn main() {
    let mut csv_table = CSVTable::new();
    
    csv_table.append_col();
    csv_table.append_col();

    csv_table.append_row();
    csv_table.append_row();
    csv_table.append_row();

    csv_table.write_cell(0, 0, "0, 0");
    csv_table.write_cell(0, 1, "0, 1");
    csv_table.write_cell(1, 0, "1, 0");
    csv_table.write_cell(1, 1, "1, 1");
    csv_table.write_cell(2, 0, "2, 0");
    csv_table.write_cell(2, 1, "2, 1");
    csv_table.write_cell(3, 0, "3, 0");
    csv_table.write_cell(3, 1, "3, 1");
    // csv_table.write_cell(3, 2, "3, 2");

    csv_table.insert_row(0);
    csv_table.insert_col(0);
    csv_table.pretty_print();

    println!("Delete 3rd row");
    csv_table.delete_row(3);
    csv_table.pretty_print();
    
    println!("Append new row");
    csv_table.append_row();
    csv_table.pretty_print();
}
