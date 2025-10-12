use std::fmt::Debug;
use std::collections::{HashSet};

// ----------------------------- AVL Node & TreeArray -----------------------------
#[derive(Debug)]
struct Node<T> {
    value: T,
    size: usize,      // subtree size
    height: usize,    // height of subtree
    left: Option<Box<Node<T>>>,
    right: Option<Box<Node<T>>> ,
}

impl<T> Node<T> {
    fn new(value: T) -> Self {
        Self { value, size: 1, height: 1, left: None, right: None }
    }

    fn update(&mut self) {
        let lh = self.left.as_ref().map_or(0, |l| l.height);
        let rh = self.right.as_ref().map_or(0, |r| r.height);
        self.height = 1 + lh.max(rh);

        let ls = self.left.as_ref().map_or(0, |l| l.size);
        let rs = self.right.as_ref().map_or(0, |r| r.size);
        self.size = 1 + ls + rs;
    }

    fn balance_factor(&self) -> isize {
        let lh = self.left.as_ref().map_or(0, |l| l.height as isize);
        let rh = self.right.as_ref().map_or(0, |r| r.height as isize);
        lh - rh
    }
}

#[derive(Debug)]
struct TreeArray<T> {
    root: Option<Box<Node<T>>>,
}

impl<T: Copy + Debug> TreeArray<T> {
    fn new() -> Self { Self { root: None } }

    fn len(&self) -> usize { self.root.as_ref().map_or(0, |n| n.size) }

    // Public interface
    fn get(&self, idx: usize) -> Option<T> { self.get_ref(idx).cloned() }
    fn get_ref(&self, idx: usize) -> Option<&T> { Self::get_node_ref(&self.root, idx)}
    fn append(&mut self, value: T) { self.insert(self.len(), value); }
    fn pop(&mut self) -> Option<T> {
        let idx = self.len().checked_sub(1)?;
        let val = self.get(idx)?;
        self.delete(idx);
        Some(val)
    }
    fn insert(&mut self, idx: usize, value: T) { self.root = Self::insert_node(self.root.take(), idx, value); }
    fn delete(&mut self, idx: usize) { self.root = Self::delete_node(self.root.take(), idx); }

    /// Set a value at logical index idx (overwrite). Returns true if succeeded.
    fn set(&mut self, idx: usize, value: T) -> bool {
        Self::set_node_mut(&mut self.root, idx, value)
    }

    // ------------------ AVL helpers ------------------
    fn get_node_ref(node: &Option<Box<Node<T>>>, idx: usize) -> Option<&T> {
        let node = node.as_ref()?;
        let left_size = node.left.as_ref().map_or(0, |l| l.size);
        if idx < left_size { Self::get_node_ref(&node.left, idx) }
        else if idx == left_size { Some(&node.value) }
        else { Self::get_node_ref(&node.right, idx - left_size - 1) }
    }

    fn set_node_mut(node: &mut Option<Box<Node<T>>>, idx: usize, value: T) -> bool {
        let nd = match node {
            Some(n) => n,
            None => return false,
        };
        let left_size = nd.left.as_ref().map_or(0, |l| l.size);
        if idx < left_size {
            Self::set_node_mut(&mut nd.left, idx, value)
        } else if idx == left_size {
            nd.value = value;
            true
        } else {
            Self::set_node_mut(&mut nd.right, idx - left_size - 1, value)
        }
    }

    fn rotate_right(mut y: Box<Node<T>>) -> Box<Node<T>> {
        let mut x = y.left.take().unwrap();
        y.left = x.right.take();
        y.update();
        x.right = Some(y);
        x.update();
        x
    }

    fn rotate_left(mut x: Box<Node<T>>) -> Box<Node<T>> {
        let mut y = x.right.take().unwrap();
        x.right = y.left.take();
        x.update();
        y.left = Some(x);
        y.update();
        y
    }

    fn balance(mut node: Box<Node<T>>) -> Box<Node<T>> {
        node.update();
        let bf = node.balance_factor();
        if bf > 1 {
            // Left heavy
            if node.left.as_ref().unwrap().balance_factor() < 0 {
                node.left = Some(Self::rotate_left(node.left.take().unwrap()));
            }
            return Self::rotate_right(node);
        } else if bf < -1 {
            // Right heavy
            if node.right.as_ref().unwrap().balance_factor() > 0 {
                node.right = Some(Self::rotate_right(node.right.take().unwrap()));
            }
            return Self::rotate_left(node);
        }
        node
    }

    fn insert_node(node: Option<Box<Node<T>>>, idx: usize, value: T) -> Option<Box<Node<T>>> {
        let mut node = match node {
            Some(n) => n,
            None => return Some(Box::new(Node::new(value))),
        };
        let left_size = node.left.as_ref().map_or(0, |l| l.size);
        if idx <= left_size {
            node.left = Self::insert_node(node.left.take(), idx, value);
        } else {
            node.right = Self::insert_node(node.right.take(), idx - left_size - 1, value);
        }
        Some(Self::balance(node))
    }

    fn delete_node(node: Option<Box<Node<T>>>, idx: usize) -> Option<Box<Node<T>>> {
        let mut node = node?;
        let left_size = node.left.as_ref().map_or(0, |l| l.size);
        if idx < left_size {
            node.left = Self::delete_node(node.left.take(), idx);
        } else if idx > left_size {
            node.right = Self::delete_node(node.right.take(), idx - left_size - 1);
        } else {
            // Node to remove
            if node.left.is_none() { return node.right; }
            if node.right.is_none() { return node.left; }
            let (min_val, new_right) = Self::take_min(node.right.take().unwrap());
            node.value = min_val;
            node.right = new_right;
        }
        Some(Self::balance(node))
    }

    fn take_min(mut node: Box<Node<T>>) -> (T, Option<Box<Node<T>>>) {
        if node.left.is_none() {
            return (node.value, node.right.take());
        } else {
            let (min_val, new_left) = Self::take_min(node.left.take().unwrap());
            node.left = new_left;
            (min_val, Some(Self::balance(node)))
        }
    }

    fn in_order(&self) -> Vec<T> {
        let mut result = Vec::with_capacity(self.len());
        fn recurse<T: Clone>(node: &Option<Box<Node<T>>>, result: &mut Vec<T>) {
            if let Some(n) = node {
                recurse(&n.left, result);
                result.push(n.value.clone());
                recurse(&n.right, result);
            }
        }
        recurse(&self.root, &mut result);
        result
    }

    // ------------------ Pretty print ------------------
    fn pretty_print(&self) {
        fn recurse<T: Debug>(node: &Option<Box<Node<T>>>, prefix: String, is_left: bool) {
            if let Some(n) = node {
                println!("{}{}- [{:?}] size:{} height:{}", prefix, if is_left { "L" } else { "R" }, n.value, n.size, n.height);
                let new_prefix = prefix.clone() + if is_left { "|  " } else { "   " };
                recurse(&n.left, new_prefix.clone(), true);
                recurse(&n.right, new_prefix, false);
            }
        }
        println!("TreeArray structure:");
        recurse(&self.root, "".to_string(), false);
    }
}

// ----------------------------- Value enum & Column traits -----------------------------
#[derive(Debug, Clone)]
enum Value {
    Int(i32),
    Float(f32),
    Str(String),
    Bool(bool),
    Byte(u8),
    Double(f64),
    Char(char),
    UInt(u32),
    Long(i64),
    Date(u64),
}

trait Column: Debug {
    fn name(&self) -> &str;
    fn len(&self) -> usize;
    fn push(&mut self, val: Value);
    fn push_empty(&mut self);
    fn update(&mut self, idx: usize, val: Value);
    fn get_value(&self, idx: usize) -> String;
}

#[derive(Debug)]
struct TableColumn<T> {
    name: String,
    rows: Vec<T>,
}

impl<T> TableColumn<T> {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            rows: Vec::new(),
        }
    }
}

impl Column for TableColumn<i32> {
    fn name(&self) -> &str { &self.name }
    fn len(&self) -> usize { self.rows.len() }
    fn push(&mut self, val: Value) { if let Value::Int(x) = val { self.rows.push(x) } else { panic!("Type mismatch") } }
    fn push_empty(&mut self) { self.rows.push(0) }
    fn update(&mut self, idx: usize, val: Value) { if let Value::Int(x) = val { self.rows[idx] = x } else { panic!("Type mismatch") } }
    fn get_value(&self, idx: usize) -> String { self.rows[idx].to_string() }
}
impl Column for TableColumn<String> {
    fn name(&self) -> &str { &self.name }
    fn len(&self) -> usize { self.rows.len() }
    fn push(&mut self, val: Value) { if let Value::Str(x) = val { self.rows.push(x) } else { panic!("Type mismatch") } }
    fn push_empty(&mut self) { self.rows.push(String::new()) }
    fn update(&mut self, idx: usize, val: Value) { if let Value::Str(x) = val { self.rows[idx] = x } else { panic!("Type mismatch") } }
    fn get_value(&self, idx: usize) -> String { self.rows[idx].clone() }
}
impl Column for TableColumn<f32> {
    fn name(&self) -> &str { &self.name }
    fn len(&self) -> usize { self.rows.len() }
    fn push(&mut self, val: Value) { if let Value::Float(x) = val { self.rows.push(x) } else { panic!("Type mismatch") } }
    fn push_empty(&mut self) { self.rows.push(0.0) }
    fn update(&mut self, idx: usize, val: Value) { if let Value::Float(x) = val { self.rows[idx] = x } else { panic!("Type mismatch") } }
    fn get_value(&self, idx: usize) -> String { format!("{:.2}", self.rows[idx]) }
}

// ----------------------------- Table traits & OrderedTable (unchanged) -----------------------------
trait TableTrait: Debug {
    fn add_column<C: Column + 'static>(&mut self, col: C);
    fn append_row(&mut self, row: Vec<Value>);
    fn update_row(&mut self, idx: usize, row: Vec<Value>);
    fn print_table(&self);
}

#[derive(Debug)]
struct OrderedTable {
    columns: Vec<Box<dyn Column>>,
}

impl OrderedTable {
    pub fn new() -> Self { OrderedTable { columns: Vec::new() } }
}

impl TableTrait for OrderedTable {
    fn add_column<C: Column + 'static>(&mut self, col: C) { self.columns.push(Box::new(col)) }

    fn append_row(&mut self, row: Vec<Value>) {
        assert_eq!(row.len(), self.columns.len(), "Row length mismatch");
        for (val, col) in row.into_iter().zip(self.columns.iter_mut()) {
            col.push(val);
        }
    }

    fn update_row(&mut self, idx: usize, row: Vec<Value>) {
        assert_eq!(row.len(), self.columns.len(), "Row length mismatch");
        for (val, col) in row.into_iter().zip(self.columns.iter_mut()) {
            while idx >= col.len() { col.push_empty(); }
            col.update(idx, val);
        }
    }

    fn print_table(&self) {
        if self.columns.is_empty() { println!("(empty table)"); return; }
        let nrows = self.columns.iter().map(|c| c.len()).max().unwrap_or(0);
        let mut widths = Vec::new();
        for col in &self.columns {
            let mut max_width = col.name().len();
            for r in 0..nrows { let val = col.get_value(r); if val.len() > max_width { max_width = val.len(); } }
            widths.push(max_width);
        }
        for (i, (col, w)) in self.columns.iter().zip(&widths).enumerate() { if i>0 {print!(" ")}; print!("{:<width$}", col.name(), width=w); }
        println!();
        for (i, w) in widths.iter().enumerate() { if i>0 {print!(" ")}; print!("{}", "-".repeat(*w)); }
        println!();
        for r in 0..nrows {
            for (i, (col, w)) in self.columns.iter().zip(&widths).enumerate() {
                if i>0 { print!(" "); }
                let val = if r < col.len() { col.get_value(r) } else { "".to_string() };
                print!("{:<width$}", val, width=w);
            }
            println!();
        }
    }
}

// ----------------------------- UnorderedTable with TreeArray + recycling -----------------------------
#[derive(Debug)]
struct UnorderedTable {
    columns: Vec<Box<dyn Column>>,
    logical_order: TreeArray<usize>, // user_index -> physical_index
    next_physical_index: usize,
    free_physical: HashSet<usize>, // recycling of freed physical indices
}

impl UnorderedTable {
    pub fn new() -> Self {
        Self {
            columns: Vec::new(),
            logical_order: TreeArray::new(),
            next_physical_index: 0,
            free_physical: HashSet::new(),
        }
    }

    /// Delete a row by user index (mark physical slot as free)
    pub fn delete_row(&mut self, user_idx: usize) {
        if let Some(phys) = self.logical_order.get(user_idx) {
            // remove logical mapping
            self.logical_order.delete(user_idx);
            // add to free set for reuse
            self.free_physical.insert(phys);
        }
    }

    /// Insert a row at user index (shifts subsequent)
    pub fn insert_row(&mut self, user_idx: usize, row: Vec<Value>) {
        assert_eq!(row.len(), self.columns.len(), "Row length mismatch");
        // choose physical index: recycle or append
        let phys_idx = if let Some(&p) = self.free_physical.iter().next() {
            // take an arbitrary element from the set
            self.free_physical.take(&p);
            p
        } else {
            let p = self.next_physical_index;
            self.next_physical_index += 1;
            p
        };

        // ensure each column has space for phys_idx and set the value at phys_idx
        for (val, col) in row.into_iter().zip(self.columns.iter_mut()) {
            while phys_idx >= col.len() {
                col.push_empty();
            }
            col.update(phys_idx, val);
        }

        // insert into logical array at user_idx
        self.logical_order.insert(user_idx, phys_idx);
    }

    /// Rearrange user indices: swap two rows (swap physical indices)
    pub fn swap_rows(&mut self, idx1: usize, idx2: usize) {
        if idx1 == idx2 { return; }
        if let (Some(p1), Some(p2)) = (self.logical_order.get(idx1), self.logical_order.get(idx2)) {
            self.logical_order.set(idx1, p2);
            self.logical_order.set(idx2, p1);
        }
    }

    /// Get number of logical rows
    pub fn nrows(&self) -> usize { self.logical_order.len() }
}

impl TableTrait for UnorderedTable {
    fn add_column<C: Column + 'static>(&mut self, col: C) { self.columns.push(Box::new(col)) }

    fn append_row(&mut self, row: Vec<Value>) {
        let idx = self.logical_order.len();
        self.insert_row(idx, row);
    }

    fn update_row(&mut self, idx: usize, row: Vec<Value>) {
        assert_eq!(row.len(), self.columns.len(), "Row length mismatch");
        if let Some(phys_idx) = self.logical_order.get(idx) {
            for (val, col) in row.into_iter().zip(self.columns.iter_mut()) {
                while phys_idx >= col.len() { col.push_empty(); }
                col.update(phys_idx, val);
            }
        }
    }

    fn print_table(&self) {
        if self.columns.is_empty() || self.logical_order.len() == 0 { println!("(empty table)"); return; }
        let nrows = self.logical_order.len();
        let mut widths = Vec::new();
        for col in &self.columns {
            let mut max_width = col.name().len();
            for user_idx in 0..nrows {
                if let Some(phys_idx) = self.logical_order.get(user_idx) {
                    let val = col.get_value(phys_idx);
                    if val.len() > max_width { max_width = val.len(); }
                }
            }
            widths.push(max_width);
        }
        // header
        for (i, (col, w)) in self.columns.iter().zip(&widths).enumerate() { if i>0 {print!(" ")}; print!("{:<width$}", col.name(), width=w); }
        println!();
        for (i, w) in widths.iter().enumerate() { if i>0 {print!(" ")}; print!("{}", "-".repeat(*w)); }
        println!();
        // rows
        for user_idx in 0..nrows {
            if let Some(phys_idx) = self.logical_order.get(user_idx) {
                for (i, (col, w)) in self.columns.iter().zip(&widths).enumerate() {
                    if i>0 { print!(" "); }
                    print!("{:<width$}", col.get_value(phys_idx), width=w);
                }
                println!();
            }
        }
    }
}

// ----------------------------- Demonstration in main -----------------------------
fn main() {
    // Ordered example
    let mut ord = OrderedTable::new();
    ord.add_column(TableColumn::<i32>::new("Age"));
    ord.add_column(TableColumn::<String>::new("Name"));
    ord.add_column(TableColumn::<f32>::new("Salary"));
    ord.append_row(vec![Value::Int(25), Value::Str("Alice".to_string()), Value::Float(50000.0)]);
    ord.append_row(vec![Value::Int(30), Value::Str("Bob".to_string()), Value::Float(60000.0)]);
    println!("OrderedTable:");
    ord.print_table();

    // Unordered example using TreeArray + recycling
    let mut unord = UnorderedTable::new();
    unord.add_column(TableColumn::<i32>::new("Age"));
    unord.add_column(TableColumn::<String>::new("Name"));
    unord.add_column(TableColumn::<f32>::new("Salary"));

    // append two rows
    unord.append_row(vec![Value::Int(25), Value::Str("Alice".to_string()), Value::Float(50000.0)]);
    unord.append_row(vec![Value::Int(30), Value::Str("Bob".to_string()), Value::Float(60000.0)]);
    println!("\nUnorderedTable after appends:");
    unord.print_table();

    // insert at logical index 1
    unord.insert_row(1, vec![Value::Int(22), Value::Str("Elina".to_string()), Value::Float(59929.0)]);
    println!("\nAfter insert at logical idx 1:");
    unord.print_table();

    // delete logical index 0 -> frees a physical slot
    unord.delete_row(0);
    println!("\nAfter delete logical idx 0 (frees physical slot):");
    unord.print_table();
    println!("Next physical index: {}", unord.next_physical_index);
    println!("Free physical set: {:?}", unord.free_physical);

    // insert again (should reuse freed physical index)
    unord.insert_row(1, vec![Value::Int(27), Value::Str("Sam".to_string()), Value::Float(48000.0)]);
    println!("\nAfter insert at logical idx 0 (should reuse freed physical slot):");
    unord.print_table();
    println!("Next physical index: {}", unord.next_physical_index);
    println!("Free physical set: {:?}", unord.free_physical);

    // swap rows 0 and 2
    unord.swap_rows(0, 2);
    println!("\nAfter swap rows 0 and 2:");
    unord.print_table();

    // update row
    unord.update_row(1, vec![Value::Int(99), Value::Str("Updated".to_string()), Value::Float(12345.0)]);
    println!("\nAfter update logical row 1:");
    unord.print_table();

    // show internal mapping & recycling info
    println!("\nInternal logical->physical (in-order): {:?}", unord.logical_order.in_order());
    println!("Next physical index: {}", unord.next_physical_index);
    println!("Free physical set: {:?}", unord.free_physical);
}
