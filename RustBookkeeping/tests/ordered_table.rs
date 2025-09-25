use rustbookkeeping::{OrderedTable, TableColumn, TableResult, Value};

#[test]
fn ordered_table_append_and_update() -> TableResult<()> {
    let mut table = OrderedTable::new();
    table
        .add_column(TableColumn::<String>::new("Name"))
        .add_column(TableColumn::<i32>::new("Age"))
        .add_column(TableColumn::<f32>::new("Salary"));

    table.append_row(vec!["Alice".into(), 30.into(), 50_000.0_f32.into()])?;
    table.append_row(vec!["Bob".into(), 28.into(), 42_000.0_f32.into()])?;
    table.update_row(1, vec![Value::Null, 29.into(), Value::Null])?;

    let row = table.get_row(1)?;
    assert_eq!(
        row,
        vec![
            Value::Str("Bob".to_string()),
            Value::Int(29),
            Value::Float(42_000.0_f32),
        ]
    );
    assert!(table.render().contains("Alice"));
    Ok(())
}

#[test]
fn ordered_table_row_length_validation() {
    let mut table = OrderedTable::new();
    table.add_column(TableColumn::<i32>::new("Only"));

    let result = table.append_row(vec![Value::Int(10), Value::Int(20)]);
    assert!(result.is_err());
}
