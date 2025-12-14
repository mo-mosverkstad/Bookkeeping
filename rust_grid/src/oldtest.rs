fn default_test() -> std::io::Result<()>{
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
    
    Ok(())
}