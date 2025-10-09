use rustbookkeeping::{OrderedTable, TableColumn, TableResult, UnorderedTable, Value};

fn main() -> TableResult<()> {
    println!("Ordered table demo:");
    let mut ordered = OrderedTable::new();
    ordered
        .add_column(TableColumn::<String>::new("Name"))
        .add_column(TableColumn::<i32>::new("Age"))
        .add_column(TableColumn::<f32>::new("Salary"));

    ordered.append_row(vec!["Alice".into(), 29.into(), 72_500.0_f32.into()])?;
    ordered.append_row(vec!["Bob".into(), 33.into(), 81_200.0_f32.into()])?;
    ordered.update_row(1, vec!["Bob".into(), 34.into(), Value::Null])?;

    println!("{}", ordered.render());

    println!("\nUnordered table demo:");
    let mut unordered = UnorderedTable::new();
    unordered
        .add_column(TableColumn::<i32>::new("Id"))
        .add_column(TableColumn::<String>::new("Owner"));

    unordered.append_row(vec![1.into(), "Checking".into()])?;
    unordered.append_row(vec![2.into(), "Savings".into()])?;
    unordered.insert_row(1, vec![3.into(), "Brokerage".into()])?;
    unordered.swap_rows(0, 2)?;
    unordered.delete_row(1)?;

    println!("{}", unordered.render());
    println!("Physical order: {:?}", unordered.physical_order());
    println!("Next physical index: {}", unordered.next_physical());
    println!("Free physical slots: {:?}", unordered.free_slots());

    Ok(())
}
