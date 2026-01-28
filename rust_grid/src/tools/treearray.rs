use std::fmt::Debug;

// ----------------------------- AVL Node -----------------------------
#[derive(Debug)]
struct Node<T> {
    value: T,
    size: usize,   // subtree size
    height: usize, // height of subtree
    left: Option<Box<Node<T>>>,
    right: Option<Box<Node<T>>>,
}

impl<T> Node<T> {
    fn new(value: T) -> Self {
        Self {
            value,
            size: 1,
            height: 1,
            left: None,
            right: None,
        }
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

// ----------------------------- TreeArray (AVL) -----------------------------
#[derive(Debug)]
pub struct TreeArray<T> {
    root: Option<Box<Node<T>>>,
}

#[allow(dead_code)]
impl<T: Copy + Debug> TreeArray<T> {
    pub fn new() -> Self {
        Self { root: None }
    }

    pub fn len(&self) -> usize {
        self.root.as_ref().map_or(0, |n| n.size)
    }

    // Public interface
    pub fn get(&self, idx: usize) -> Option<T> {
        self.get_ref(idx).cloned()
    }
    pub fn get_ref(&self, idx: usize) -> Option<&T> {
        Self::get_node_ref(&self.root, idx)
    }
    pub fn append(&mut self, value: T) {
        self.insert(self.len(), value);
    }
    pub fn pop(&mut self) -> Option<T> {
        let idx = self.len().checked_sub(1)?;
        let val = self.get(idx)?;
        self.delete(idx);
        Some(val)
    }
    pub fn insert(&mut self, idx: usize, value: T) {
        self.root = Self::insert_node(self.root.take(), idx, value);
    }
    pub fn delete(&mut self, idx: usize) {
        self.root = Self::delete_node(self.root.take(), idx);
    }
    pub fn clear(&mut self) {
        self.root = None
    }

    // ------------------ AVL helpers ------------------
    fn get_node_ref(node: &Option<Box<Node<T>>>, idx: usize) -> Option<&T> {
        let node = node.as_ref()?;
        let left_size = node.left.as_ref().map_or(0, |l| l.size);
        if idx < left_size {
            Self::get_node_ref(&node.left, idx)
        } else if idx == left_size {
            Some(&node.value)
        } else {
            Self::get_node_ref(&node.right, idx - left_size - 1)
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
            if node.left.is_none() {
                return node.right;
            }
            if node.right.is_none() {
                return node.left;
            }
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

    // -----------------In order --------------------

    pub fn in_order(&self) -> Vec<T> {
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
    pub fn pretty_print(&self) {
        fn recurse<T: Debug>(node: &Option<Box<Node<T>>>, prefix: String, is_left: bool) {
            if let Some(n) = node {
                println!(
                    "{}{}- [{:?}] size:{} height:{}",
                    prefix,
                    if is_left { "L" } else { "R" },
                    n.value,
                    n.size,
                    n.height
                );
                let new_prefix = prefix.clone() + if is_left { "|  " } else { "   " };
                recurse(&n.left, new_prefix.clone(), true);
                recurse(&n.right, new_prefix, false);
            }
        }
        println!("TreeArray structure:");
        recurse(&self.root, "".to_string(), false);
    }
}
