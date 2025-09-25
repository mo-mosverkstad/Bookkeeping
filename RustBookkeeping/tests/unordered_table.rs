use rustbookkeeping::{TableColumn, TableResult, UnorderedTable, Value};

#[test]
fn unordered_table_recycles_slots() -> TableResult<()> {
    let mut table = UnorderedTable::new();
    table
        .add_column(TableColumn::<i32>::new("Id"))
        .add_column(TableColumn::<String>::new("Name"));

    table.append_row(vec![1.into(), "Alpha".into()])?;
    table.append_row(vec![2.into(), "Beta".into()])?;
    assert_eq!(table.row_count(), 2);
    assert_eq!(table.next_physical(), 2);

    table.delete_row(0)?;
    assert_eq!(table.row_count(), 1);
    assert!(table.free_slots().contains(&0));

    table.insert_row(0, vec![3.into(), "Gamma".into()])?;
    assert_eq!(table.row_count(), 2);
    assert_eq!(table.next_physical(), 2);
    assert!(table.free_slots().is_empty());

    let order = table.physical_order();
    assert_eq!(order.len(), 2);
    assert!(order.iter().all(|&idx| idx < 2));

    table.swap_rows(0, 1)?;
    let rendered = table.render();
    assert!(rendered.contains("Beta"));
    assert!(rendered.contains("Gamma"));
    Ok(())
}

#[test]
fn unordered_table_validates_lengths() {
    let mut table = UnorderedTable::new();
    table.add_column(TableColumn::<i32>::new("Only"));
    let result = table.append_row(vec![Value::Int(1), Value::Int(2)]);
    assert!(result.is_err());
}
