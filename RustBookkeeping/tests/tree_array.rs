use rustbookkeeping::{IndexError, TreeArray};

#[test]
fn tree_array_basic_mutations() {
    let mut tree = TreeArray::new();
    tree.append(10);
    tree.append(20);
    tree.insert(1, 15).unwrap();

    assert_eq!(tree.len(), 3);
    assert_eq!(tree.get(0).unwrap(), 10);
    assert_eq!(tree.get(1).unwrap(), 15);
    assert_eq!(tree.get(2).unwrap(), 20);

    let removed = tree.remove(1).unwrap();
    assert_eq!(removed, 15);
    assert_eq!(tree.in_order(), vec![10, 20]);
}

#[test]
fn tree_array_bounds() {
    let mut tree = TreeArray::new();
    tree.append(1);
    let err = tree.get(5).unwrap_err();
    assert_eq!(err, IndexError { index: 5, len: 1 });
    assert!(tree.insert(3, 2).is_err());
}

#[test]
fn tree_array_iteration() {
    let mut tree = TreeArray::new();
    for value in 0..6 {
        tree.append(value);
    }
    let collected: Vec<_> = tree.iter().copied().collect();
    assert_eq!(collected, vec![0, 1, 2, 3, 4, 5]);
}
