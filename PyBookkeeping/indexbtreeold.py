class BTreeNode:
    def __init__(self, t, leaf=False):
        self.t = t
        self.leaf = leaf
        self.keys = []       # rows or values
        self.children = []   # child nodes
        self.subtree_size = 0

class ShiftingBTree:
    def __init__(self, t=2):
        self.t = t
        self.root = BTreeNode(t, leaf=True)

    def size(self):
        return self.root.subtree_size

    # ------------------------------
    # Get value by index
    # ------------------------------
    def get(self, index, node=None):
        if node is None:
            node = self.root
        i = 0
        while i < len(node.keys):
            left_size = node.children[i].subtree_size if not node.leaf else 0
            if index < left_size:
                return self.get(index, node.children[i])
            index -= left_size
            if index == 0:
                return node.keys[i]
            index -= 1
            i += 1
        if not node.leaf:
            return self.get(index, node.children[-1])
        raise IndexError("Index out of range")

    # ------------------------------
    # Insert value at index
    # ------------------------------
    def insert(self, index, value):
        root = self.root
        if len(root.keys) == (2 * self.t - 1):
            new_root = BTreeNode(self.t, leaf=False)
            new_root.children.append(root)
            self._split_child(new_root, 0)
            self.root = new_root
            self._insert_non_full(new_root, index, value)
        else:
            self._insert_non_full(root, index, value)

    def _insert_non_full(self, node, index, value):
        node.subtree_size += 1
        if node.leaf:
            node.keys.insert(index, value)
        else:
            i = 0
            while i < len(node.keys):
                left_size = node.children[i].subtree_size
                if index <= left_size:
                    break
                index -= left_size + 1
                i += 1
            child = node.children[i]
            if len(child.keys) == 2 * self.t - 1:
                self._split_child(node, i)
                left_size = node.children[i].subtree_size
                if index > left_size:
                    index -= left_size + 1
                    i += 1
            self._insert_non_full(node.children[i], index, value)

    def _split_child(self, parent, i):
        t = self.t
        y = parent.children[i]
        z = BTreeNode(t, leaf=y.leaf)

        z.keys = y.keys[t:]
        y.keys = y.keys[:t]

        if not y.leaf:
            z.children = y.children[t:]
            y.children = y.children[:t+1]

        y.subtree_size = len(y.keys) + sum(c.subtree_size for c in y.children) if not y.leaf else len(y.keys)
        z.subtree_size = len(z.keys) + sum(c.subtree_size for c in z.children) if not z.leaf else len(z.keys)

        parent.children.insert(i+1, z)
        parent.keys.insert(i, z.keys[0])
        parent.subtree_size = len(parent.keys) + sum(c.subtree_size for c in parent.children) if not parent.leaf else len(parent.keys)

    # ------------------------------
    # Delete by index (simplified)
    # ------------------------------
    def delete(self, index):
        val = self.get(index)
        self._delete_row(self.root, index)
        return val

    def _delete_row(self, node, index):
        node.subtree_size -= 1
        if node.leaf:
            node.keys.pop(index)
        else:
            i = 0
            while i < len(node.keys):
                left_size = node.children[i].subtree_size
                if index < left_size:
                    self._delete_row(node.children[i], index)
                    return
                index -= left_size + 1
                i += 1
            self._delete_row(node.children[-1], index)

    # ------------------------------
    # Debug print (in-order traversal)
    # ------------------------------
    def inorder(self, node=None, depth=0):
        if node is None:
            node = self.root
        if node.leaf:
            print("  " * depth, node.keys)
        else:
            for i in range(len(node.keys)):
                self.inorder(node.children[i], depth+1)
                print("  " * depth, node.keys[i])
            self.inorder(node.children[-1], depth+1)

    # ------------------------------
    # Pretty print in YAML-like style
    # ------------------------------
    def print_yaml(self, node=None, indent=0):
        if node is None:
            node = self.root

        prefix = "  " * indent
        # Show leaf node keys
        if node.leaf:
            print(f"{prefix}- leaf: {node.keys}")
        else:
            print(f"{prefix}- internal: {node.keys}")
            for child in node.children:
                self.print_yaml(child, indent + 1)

    def __iter__(self):
        stack = []
        node = self.root
        idx_stack = []

        while True:
            # Go to leftmost leaf
            while node:
                stack.append(node)
                idx_stack.append(0)
                if node.leaf:
                    break
                node = node.children[0]

            if not stack:
                break

            node = stack.pop()
            idx = idx_stack.pop()

            if node.leaf:
                # yield remaining keys in leaf
                for val in node.keys[idx:]:
                    yield val
                node = None
            else:
                # internal node: yield keys between children
                if idx < len(node.keys):
                    # visit key
                    yield node.keys[idx]
                    # go to next child
                    stack.append(node)
                    idx_stack.append(idx + 1)
                    node = node.children[idx + 1]
                else:
                    node = None

    def __str__(self):
        return str(list(self))

    __repr__ = __str__


# ------------------------------
# TESTING
# ------------------------------

tree = ShiftingBTree(t=2)

for val in [0,1,2,3,4,5,6,7,8,9]:
    tree.insert(tree.size(), val)

tree.insert(99, 5)  # insert 99 at index 5
tree.delete(2)      # delete element at index 2

print(tree)

"""
if __name__ == "__main__":
    tree = ShiftingBTree(t=2)

    print("Appending values 0..9")
    for i in range(10):
        tree.insert(tree.size(), i)
    tree.inorder()

    
    print("\nGet index 3:", tree.get(3))
    print("Get index 7:", tree.get(7))

    print("\nInsert 99 at index 5")
    tree.insert(5, 99)
    tree.inorder()

    print("\nDelete index 2")
    removed = tree.delete(2)
    print("Removed:", removed)
    tree.inorder()
    """
