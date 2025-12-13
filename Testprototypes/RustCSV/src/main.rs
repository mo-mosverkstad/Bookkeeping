use RustCSV::csv_table::CSVTable;

fn default_test() {
    let mut csv_table = CSVTable::new();
    
    println!("Initialization");
    csv_table.pretty_print();
    println!();
    
    println!("Raw append");
    csv_table.append_col();
    csv_table.append_col();

    csv_table.append_row();
    csv_table.append_row();
    csv_table.append_row();
    
    csv_table.pretty_print();
    println!();

    println!("Populate the table");
    csv_table.write_cell(0, 0, "0, 0");
    csv_table.write_cell(0, 1, "0, 1");
    csv_table.write_cell(1, 0, "1, 0");
    csv_table.write_cell(1, 1, "1, 1");
    csv_table.write_cell(2, 0, "2, 0");
    csv_table.write_cell(2, 1, "2, 1");
    csv_table.write_cell(3, 0, "3, 0");
    csv_table.write_cell(3, 1, "3, 1");
    // csv_table.write_cell(3, 2, "3, 2");
    csv_table.pretty_print();
    println!();

    println!("Insert row 0 and col 0");
    csv_table.insert_row(0);
    csv_table.insert_col(0);
    csv_table.pretty_print();
    println!();

    println!("Delete 3rd row");
    csv_table.delete_row(3);
    csv_table.pretty_print();
    println!();
    
    println!("Append new row");
    csv_table.append_row();
    csv_table.pretty_print();
    println!();

    println!("undo first action");
    csv_table.undo();
    csv_table.pretty_print();
    println!();

    println!("undo second action");
    csv_table.undo();
    csv_table.pretty_print();
    println!("Undoable: {}", csv_table.undoable());
    println!();

    println!("redo second action");
    csv_table.redo();
    csv_table.pretty_print();
    println!();
    
    println!("Write cells");
    csv_table.write_cell(0, 0, "Cell 0, 0");
    csv_table.pretty_print();
    println!();

    println!("Undo write cell");
    csv_table.undo();
    csv_table.pretty_print();
    println!();

    println!("Redo the last written cell");
    csv_table.redo();
    csv_table.pretty_print();
    println!();
}

use std::io::{self, Write};

fn cli_test() {
    let mut csv = CSVTable::new();
    println!("CSV Table CLI");
    println!("Type 'help' for commands.\n");

    loop {
        print!("> ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        if io::stdin().read_line(&mut input).is_err() {
            println!("Input error.");
            continue;
        }
        
        println!();

        let input = input.trim();
        if input.is_empty() { continue; }

        let mut parts = input.split_whitespace();
        let cmd = parts.next().unwrap();

        match cmd {
            "help" => {
                println!("Commands:");
                println!("  print");
                println!("  append_row");
                println!("  append_col");
                println!("  insert_row <index>");
                println!("  insert_col <index>");
                println!("  delete_row <index>");
                println!("  delete_col <index>");
                println!("  write <row> <col> <value>");
                println!("  read <row> <col>");
                println!("  undo");
                println!("  redo");
                println!("  quit");
            }

            "print" => {
                csv.pretty_print();
            }

            "append_row" => {
                csv.append_row();
                println!("SUCCESS: Row appended.");
            }

            "append_col" => {
                csv.append_col();
                println!("SUCCESS: Column appended.");
            }

            "insert_row" => {
                if let Some(r) = parts.next().and_then(|v| v.parse::<usize>().ok()) {
                    csv.insert_row(r);
                    println!("SUCCESS: Row inserted at {}.", r);
                } else {
                    println!("PROBLEM: Usage: insert_row <index>");
                }
            }

            "insert_col" => {
                if let Some(c) = parts.next().and_then(|v| v.parse::<usize>().ok()) {
                    csv.insert_col(c);
                    println!("SUCCESS: Column inserted at {}.", c);
                } else {
                    println!("PROBLEM: Usage: insert_col <index>");
                }
            }

            "delete_row" => {
                if let Some(r) = parts.next().and_then(|v| v.parse::<usize>().ok()) {
                    if csv.has_row(r){
                        csv.delete_row(r);
                        println!("SUCCESS: Row deleted at {}.", r);
                    }
                    else{
                        println!("PROBLEM: Cannot delete row {} out of bounds", r);
                    }
                } else {
                    println!("PROBLEM: Usage: delete_row <index>");
                }
            }

            "delete_col" => {
                if let Some(c) = parts.next().and_then(|v| v.parse::<usize>().ok()) {
                    if csv.has_col(c){
                        csv.delete_col(c);
                        println!("SUCCESS: Column deleted at {}.", c);
                    }
                    else{
                        println!("PROBLEM: Cannot delete column {} out of bounds", c);
                    }
                } else {
                    println!("PROBLEM: Usage: delete_col <index>");
                }
            }

            "write" => {
                let r = parts.next().and_then(|v| v.parse::<usize>().ok());
                let c = parts.next().and_then(|v| v.parse::<usize>().ok());
                let value = parts.collect::<Vec<_>>().join(" ");

                if let (Some(r), Some(c)) = (r, c) {
                    if csv.has_cell(r, c){
                        csv.write_cell(r, c, &value);
                        println!("SUCCESS: Written to ({}, {}).", r, c);
                    }
                    else{
                        println!("PROBLEM: Cannot write cell ({}, {}) out of bounds", r, c);
                    }
                } else {
                    println!("PROBLEM: Usage: write <row> <col> <value>");
                }
            }

            "read" => {
                let r = parts.next().and_then(|v| v.parse::<usize>().ok());
                let c = parts.next().and_then(|v| v.parse::<usize>().ok());

                if let (Some(r), Some(c)) = (r, c) {
                    if csv.has_cell(r, c){
                        let v = csv.read_cell(r, c);
                        println!("SUCCESS: Value at ({}, {}) = \"{}\"", r, c, v);
                    }
                    else{
                        println!("PROBLEM: Cannot read cell ({}, {}) out of bounds", r, c);
                    }
                } else {
                    println!("PROBLEM: Usage: read <row> <col>");
                }
            }

            "undo" => {
                if csv.undoable() {
                    csv.undo();
                    println!("SUCCESS: Undo done.");
                } else {
                    println!("INFO: Nothing to undo.");
                }
            }

            "redo" => {
                if csv.redoable() {
                    csv.redo();
                    println!("SUCCESS: Redo done.");
                } else {
                    println!("INFO: Nothing to redo.");
                }
            }

            "quit" | "exit" => {
                println!("ONGOING: Exiting...");
                break;
            }

            _ => {
                println!("PROBLEM: Unknown command. Type 'help'.");
            }
        }
    }
    println!("SUCCESS: Exit the system");
}

fn main(){
    default_test();
}