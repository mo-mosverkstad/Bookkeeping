use rust_grid::csv_table::CSVTable;
use std::io::{self, Write};

#[derive(Debug)]
struct SessionState {
    dirty: bool,                 // unsaved changes
    path: Option<std::path::PathBuf>, // None = never saved / untitled
}


fn cli_test() -> std::io::Result<()>{
    let mut csv = CSVTable::new();
    println!("CSV Table CLI");
    println!("Type 'help' for commands.\n");
    
    let mut state = SessionState {
        dirty: false,
        path: None,
    };

    loop {
        print!("[{}{}] > ", state.path.as_ref().map(|p| p.display().to_string()).unwrap_or("untitled".into()), if state.dirty { "*" } else { "" });
        io::stdout().flush().unwrap();

        let mut input = String::new();
        if io::stdin().read_line(&mut input).is_err() {
            println!("Input error.");
            continue;
        }

        let input = input.trim();
        if input.is_empty() { continue; }

        let mut parts = input.split_whitespace();
        let cmd = parts.next().unwrap();

        match cmd {
            "help" => {
                println!("Commands:");
                println!("  Print: p or print");
                println!("  Append row: ar, append_row");
                println!("  Append column: ac, append_col");
                println!("  Insert row: ir <index>, insert_row <index>");
                println!("  Insert column: ic <index>, insert_col <index>");
                println!("  Delete row: dr <index>, delete_row <index>");
                println!("  Delete column: dc <index>, delete_col <index>");
                println!("  Write: w <row> <col> <value>, write <row> <col> <value>");
                println!("  Read: read <row> <col>");
                println!("  Undo: u, undo");
                println!("  Redo: r, redo");
                println!("  Quit: quit, exit");
            }

            "p" | "print" => {
                csv.pretty_print();
            }

            "ar" | "append_row" => {
                csv.append_row();
                state.dirty = true;
                println!("SUCCESS: Row appended.");
            }

            "ac" | "append_col" => {
                csv.append_col();
                state.dirty = true;
                println!("SUCCESS: Column appended.");
            }

            "ir" | "insert_row" => {
                if let Some(r) = parts.next().and_then(|v| v.parse::<usize>().ok()) {
                    csv.insert_row(r);
                    state.dirty = true;
                    println!("SUCCESS: Row inserted at {}.", r);
                } else {
                    println!("PROBLEM: Usage: insert_row <index> or ir <index>");
                }
            }

            "ic" | "insert_col" => {
                if let Some(c) = parts.next().and_then(|v| v.parse::<usize>().ok()) {
                    csv.insert_col(c);
                    state.dirty = true;
                    println!("SUCCESS: Column inserted at {}.", c);
                } else {
                    println!("PROBLEM: Usage: insert_col <index> or ic <index>");
                }
            }

            "dr" | "delete_row" => {
                if let Some(r) = parts.next().and_then(|v| v.parse::<usize>().ok()) {
                    if csv.has_row(r){
                        csv.delete_row(r);
                        state.dirty = true;
                        println!("SUCCESS: Row deleted at {}.", r);
                    }
                    else{
                        println!("PROBLEM: Cannot delete row {} out of bounds", r);
                    }
                } else {
                    println!("PROBLEM: Usage: delete_row <index> or dr <index>");
                }
            }

            "dc" | "delete_col" => {
                if let Some(c) = parts.next().and_then(|v| v.parse::<usize>().ok()) {
                    if csv.has_col(c){
                        csv.delete_col(c);
                        state.dirty = true;
                        println!("SUCCESS: Column deleted at {}.", c);
                    }
                    else{
                        println!("PROBLEM: Cannot delete column {} out of bounds", c);
                    }
                } else {
                    println!("PROBLEM: Usage: delete_col <index> or dc <index>");
                }
            }

            "w" | "write" => {
                let r = parts.next().and_then(|v| v.parse::<usize>().ok());
                let c = parts.next().and_then(|v| v.parse::<usize>().ok());
                let value = parts.collect::<Vec<_>>().join(" ");

                if let (Some(r), Some(c)) = (r, c) {
                    if csv.has_cell(r, c){
                        csv.write_cell(r, c, &value);
                        state.dirty = true;
                        println!("SUCCESS: Written to ({}, {}).", r, c);
                    }
                    else{
                        println!("PROBLEM: Cannot write cell ({}, {}) out of bounds", r, c);
                    }
                } else {
                    println!("PROBLEM: Usage: write <row> <col> <value> or w <row> <col> <value>");
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
                    println!("PROBLEM: Usage: read <row> <col> or r <row> <col>");
                }
            }

            "u" | "undo" => {
                if csv.undoable() {
                    csv.undo();
                    state.dirty = true;
                    println!("SUCCESS: Undo done.");
                } else {
                    println!("INFO: Nothing to undo.");
                }
            }

            "r" | "redo" => {
                if csv.redoable() {
                    csv.redo();
                    state.dirty = true;
                    println!("SUCCESS: Redo done.");
                } else {
                    println!("INFO: Nothing to redo.");
                }
            }
            
            "load" => {
                if state.dirty {
                    println!("WARNING: You have unsaved changes. Save them before loading a new file");
                    continue;
                }
                if let Some(path) = parts.next() {
                    let path = std::path::PathBuf::from(path);
                    match std::fs::File::open(&path) {
                        Ok(file) => {
                            let reader = std::io::BufReader::new(file);
                            match csv.read_csv(reader) {
                                Ok(_) => {
                                    println!("SUCCESS: Loaded '{}'.", path.display());
                                    state.path = Some(path);
                                    state.dirty = false;
                                }
                                Err(e) => println!("PROBLEM: Failed to read CSV: {}", e),
                            }
                        }
                        Err(e) => println!("PROBLEM: Cannot open file '{}': {}", path.display(), e),
                    }
                } else {
                    println!("PROBLEM: Usage: load <file_path>");
                }
            }
            
            "s" | "save" => {
                let target_path = if let Some(path) = parts.next() {
                    let p = std::path::PathBuf::from(path);
                    state.path = Some(p.clone());
                    Some(p)
                } else {
                    state.path.clone()
                };
            
                match target_path {
                    Some(path) => {
                        match std::fs::File::create(&path) {
                            Ok(file) => {
                                let writer = std::io::BufWriter::new(file);
                                match csv.write_csv(writer) {
                                    Ok(_) => {
                                        println!("SUCCESS: Saved to '{}'.", path.display());
                                        state.dirty = false;
                                    }
                                    Err(e) => println!("PROBLEM: Failed to write CSV: {}", e),
                                }
                            }
                            Err(e) => println!("PROBLEM: Cannot create file '{}': {}", path.display(), e),
                        }
                    }
                    None => {
                        println!("PROBLEM: No file path. Use `save <path>` first.");
                    }
                }
            }

            "quit" | "exit" => {
                if state.dirty {
                    println!("WARNING: You have unsaved changes.");
                    println!("Type 'quit!' to exit without saving, or 'save' to save.");
            
                    // Optional immediate confirmation
                    // continue loop instead of exiting
                    continue;
                } else {
                    println!("ONGOING: Exiting...");
                    break;
                }
            }
            
            "quit!" => {
                println!("FORCED: Exiting without saving.");
                break;
            }

            _ => {
                println!("PROBLEM: Unknown command. Type 'help'.");
            }
        }
    }
    println!("SUCCESS: Exit the system");
    Ok(())
}


fn main() -> std::io::Result<()> {
    cli_test()
}
