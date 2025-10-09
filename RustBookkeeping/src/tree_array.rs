use std::error::Error;
use std::fmt;
use std::fmt::Debug;

/// Error returned when an index-based operation is outside the current bounds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexError {
    pub index: usize,
    pub len: usize,
}

impl fmt::Display for IndexError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "index {} out of bounds for length {}",
            self.index, self.len
        )
    }
}

impl Error for IndexError {}

/// Convenience alias for results produced by [`TreeArray`] operations.
pub type IndexResult<T> = Result<T, IndexError>;

/// Balanced binary tree that exposes a stable, vector-like index.
///
/// The structure keeps subtree sizes and heights to preserve AVL balance
/// while allowing `O(log n)` random access, insertion, and removal by index.
#[derive(Default)]
pub struct TreeArray<T> {
    root: Option<Box<Node<T>>>,
}

impl<T> TreeArray<T> {
    /// Creates an empty [`TreeArray`].
    pub fn new() -> Self {
        Self { root: None }
    }

    /// Returns the number of elements stored in the tree.
    pub fn len(&self) -> usize {
        self.root.as_ref().map_or(0, |n| n.size)
    }

    /// Returns `true` when no elements are stored.
    pub fn is_empty(&self) -> bool {
        self.root.is_none()
    }

    /// Removes all elements from the container.
    pub fn clear(&mut self) {
        self.root = None;
    }
}

impl<T: Clone> TreeArray<T> {
    /// Returns a clone of the value at `index`.
    pub fn get(&self, index: usize) -> IndexResult<T> {
        self.get_ref(index).map(Clone::clone)
    }

    /// Borrows the value at `index`.
    pub fn get_ref(&self, index: usize) -> IndexResult<&T> {
        Self::get_node_ref(&self.root, index).ok_or(IndexError {
            index,
            len: self.len(),
        })
    }

    /// Creates an iterator that yields the elements in order.
    pub fn iter(&self) -> TreeArrayIter<'_, T> {
        TreeArrayIter::new(&self.root)
    }

    /// Appends `value` to the end of the tree and returns its index.
    pub fn append(&mut self, value: T) -> usize {
        let len = self.len();
        self.insert(len, value)
            .expect("append index should always be in bounds");
        len
    }

    /// Inserts `value` at `index`, shifting the following elements.
    pub fn insert(&mut self, index: usize, value: T) -> IndexResult<()> {
        let len = self.len();
        if index > len {
            return Err(IndexError { index, len });
        }
        self.root = Self::insert_node(self.root.take(), index, value);
        Ok(())
    }

    /// Overwrites the value at `index` with `value`.
    pub fn set(&mut self, index: usize, value: T) -> IndexResult<()> {
        if Self::set_node_mut(&mut self.root, index, value) {
            Ok(())
        } else {
            Err(IndexError {
                index,
                len: self.len(),
            })
        }
    }

    /// Removes and returns the element located at `index`.
    pub fn remove(&mut self, index: usize) -> IndexResult<T> {
        if index >= self.len() {
            return Err(IndexError {
                index,
                len: self.len(),
            });
        }
        let mut output = None;
        self.root = Self::delete_node(self.root.take(), index, &mut output);
        output.ok_or(IndexError {
            index,
            len: self.len(),
        })
    }

    /// Removes and returns the last element, if any.
    pub fn pop(&mut self) -> Option<T> {
        let last = self.len().checked_sub(1)?;
        self.remove(last).ok()
    }

    /// Returns a vector containing the elements in sorted order.
    pub fn in_order(&self) -> Vec<T> {
        let mut result = Vec::with_capacity(self.len());
        fn traverse<T: Clone>(node: &Option<Box<Node<T>>>, output: &mut Vec<T>) {
            if let Some(node) = node {
                traverse(&node.left, output);
                output.push(node.value.clone());
                traverse(&node.right, output);
            }
        }
        traverse(&self.root, &mut result);
        result
    }
}

impl<T: Clone + fmt::Debug> fmt::Debug for TreeArray<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TreeArray")
            .field("len", &self.len())
            .field("values", &self.in_order())
            .finish()
    }
}

impl<T> TreeArray<T> {
    fn get_node_ref<'a>(node: &'a Option<Box<Node<T>>>, index: usize) -> Option<&'a T> {
        let node = node.as_ref()?;
        let left_size = node.left.as_ref().map_or(0, |l| l.size);
        if index < left_size {
            Self::get_node_ref(&node.left, index)
        } else if index == left_size {
            Some(&node.value)
        } else {
            Self::get_node_ref(&node.right, index - left_size - 1)
        }
    }

    fn set_node_mut(node: &mut Option<Box<Node<T>>>, index: usize, value: T) -> bool {
        let current = match node {
            Some(node) => node,
            None => return false,
        };
        let left_size = current.left.as_ref().map_or(0, |l| l.size);
        if index < left_size {
            Self::set_node_mut(&mut current.left, index, value)
        } else if index == left_size {
            current.value = value;
            true
        } else {
            Self::set_node_mut(&mut current.right, index - left_size - 1, value)
        }
    }

    fn insert_node(node: Option<Box<Node<T>>>, index: usize, value: T) -> Option<Box<Node<T>>> {
        let mut node = match node {
            Some(node) => node,
            None => return Some(Box::new(Node::new(value))),
        };
        let left_size = node.left.as_ref().map_or(0, |l| l.size);
        if index <= left_size {
            node.left = Self::insert_node(node.left.take(), index, value);
        } else {
            node.right = Self::insert_node(node.right.take(), index - left_size - 1, value);
        }
        Some(Self::balance(node))
    }

    fn delete_node(
        node: Option<Box<Node<T>>>,
        index: usize,
        removed: &mut Option<T>,
    ) -> Option<Box<Node<T>>> {
        let mut node = node?;
        let left_size = node.left.as_ref().map_or(0, |l| l.size);
        if index < left_size {
            node.left = Self::delete_node(node.left.take(), index, removed);
        } else if index > left_size {
            node.right = Self::delete_node(node.right.take(), index - left_size - 1, removed);
        } else {
            *removed = Some(node.value);
            if node.left.is_none() {
                return node.right;
            }
            if node.right.is_none() {
                return node.left;
            }
            let (min, new_right) = Self::take_min(node.right.take().unwrap());
            node.value = min;
            node.right = new_right;
        }
        Some(Self::balance(node))
    }

    fn take_min(mut node: Box<Node<T>>) -> (T, Option<Box<Node<T>>>) {
        if node.left.is_none() {
            return (node.value, node.right.take());
        }
        let (min, new_left) = Self::take_min(node.left.take().unwrap());
        node.left = new_left;
        (min, Some(Self::balance(node)))
    }

    fn rotate_left(mut node: Box<Node<T>>) -> Box<Node<T>> {
        let mut right = node.right.take().expect("right child expected");
        node.right = right.left.take();
        node.update();
        right.left = Some(node);
        right.update();
        right
    }

    fn rotate_right(mut node: Box<Node<T>>) -> Box<Node<T>> {
        let mut left = node.left.take().expect("left child expected");
        node.left = left.right.take();
        node.update();
        left.right = Some(node);
        left.update();
        left
    }

    fn balance(mut node: Box<Node<T>>) -> Box<Node<T>> {
        node.update();
        let balance = node.balance_factor();
        if balance > 1 {
            if node.left.as_ref().unwrap().balance_factor() < 0 {
                node.left = Some(Self::rotate_left(node.left.take().unwrap()));
            }
            return Self::rotate_right(node);
        }
        if balance < -1 {
            if node.right.as_ref().unwrap().balance_factor() > 0 {
                node.right = Some(Self::rotate_right(node.right.take().unwrap()));
            }
            return Self::rotate_left(node);
        }
        node
    }
}

struct Node<T> {
    value: T,
    height: usize,
    size: usize,
    left: Option<Box<Node<T>>>,
    right: Option<Box<Node<T>>>,
}

impl<T> Node<T> {
    fn new(value: T) -> Self {
        Self {
            value,
            height: 1,
            size: 1,
            left: None,
            right: None,
        }
    }

    fn update(&mut self) {
        let left_height = self.left.as_ref().map_or(0, |n| n.height);
        let right_height = self.right.as_ref().map_or(0, |n| n.height);
        self.height = 1 + left_height.max(right_height);

        let left_size = self.left.as_ref().map_or(0, |n| n.size);
        let right_size = self.right.as_ref().map_or(0, |n| n.size);
        self.size = 1 + left_size + right_size;
    }

    fn balance_factor(&self) -> isize {
        let left_height = self.left.as_ref().map_or(0, |n| n.height as isize);
        let right_height = self.right.as_ref().map_or(0, |n| n.height as isize);
        left_height - right_height
    }
}

/// Iterator that yields references in ascending index order.
pub struct TreeArrayIter<'a, T> {
    stack: Vec<&'a Node<T>>,
}

impl<'a, T> TreeArrayIter<'a, T> {
    fn new(root: &'a Option<Box<Node<T>>>) -> Self {
        let mut stack = Vec::new();
        Self::push_left(root.as_deref(), &mut stack);
        Self { stack }
    }

    fn push_left(mut node: Option<&'a Node<T>>, stack: &mut Vec<&'a Node<T>>) {
        while let Some(n) = node {
            stack.push(n);
            node = n.left.as_deref();
        }
    }
}

impl<'a, T> Iterator for TreeArrayIter<'a, T> {
    type Item = &'a T;

    fn next(&mut self) -> Option<Self::Item> {
        let node = self.stack.pop()?;
        let value = &node.value;
        Self::push_left(node.right.as_deref(), &mut self.stack);
        Some(value)
    }
}

impl<'a, T: Clone> IntoIterator for &'a TreeArray<T> {
    type Item = &'a T;
    type IntoIter = TreeArrayIter<'a, T>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<T: Clone> IntoIterator for TreeArray<T> {
    type Item = T;
    type IntoIter = std::vec::IntoIter<T>;

    fn into_iter(self) -> Self::IntoIter {
        self.in_order().into_iter()
    }
}
