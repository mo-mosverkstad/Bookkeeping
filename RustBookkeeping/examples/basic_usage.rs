use rustbookkeeping::{OrderedTable, TableColumn, TableResult, UnorderedTable, Value};

fn main() -> TableResult<()> {
    let mut ordered = OrderedTable::new();
    ordered
        .add_column(TableColumn::<String>::new("Account"))
        .add_column(TableColumn::<f64>::new("Balance"));

    ordered.append_row(vec!["Checking".into(), 1_250.45_f64.into()])?;
    ordered.append_row(vec!["Savings".into(), 9_001.12_f64.into()])?;

    println!("Ordered table:\n{}", ordered.render());

    let mut unordered = UnorderedTable::new();
    unordered
        .add_column(TableColumn::<u32>::new("Id"))
        .add_column(TableColumn::<String>::new("Description"));

    unordered.append_row(vec![100.into(), "Invoice".into()])?;
    unordered.append_row(vec![200.into(), "Expense".into()])?;
    unordered.delete_row(0)?;
    unordered.insert_row(0, vec![300.into(), "Correction".into()])?;

    println!("\nUnordered table:\n{}", unordered.render());
    println!("Physical order: {:?}", unordered.physical_order());
    Ok(())
}
