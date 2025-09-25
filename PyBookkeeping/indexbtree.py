from typing import Any, List, Optional


class IndexBTreeNode:
    def __init__(self, t: int, leaf: bool = True):
        self.t = t
        self.leaf = leaf
        self.rows: List[Any] = []             # store rows directly in leaves
        self.children: List[IndexBTreeNode] = []
        self.subtree_size: int = 0            # total #rows in this subtree

    def update_size(self) -> int:
        """Recalculate subtree size recursively."""
        if self.leaf:
            self.subtree_size = len(self.rows)
        else:
            self.subtree_size = sum(child.update_size() for child in self.children)
        return self.subtree_size


class IndexBTree:
    def __init__(self, t: int = 4):
        self.t = t
        self.root = IndexBTreeNode(t, leaf=True)

    def from_list(given_list: list, t: int = 4):
        indexBTree: IndexBTree = IndexBTree(t)
        for i in range(len(given_list)):
            list_item: Any = given_list[i]
            indexBTree.insert(i, list_item)
        return indexBTree

    # ------------------------------
    # GET ROW BY INDEX
    # ------------------------------
    def get(self, index: int, node: Optional[IndexBTreeNode] = None) -> Any:
        if node is None:
            node = self.root

        if node.leaf:
            if index < 0 or index >= len(node.rows):
                raise IndexError("Row index out of range")
            return node.rows[index]

        # Walk children based on subtree sizes
        for child in node.children:
            if index < child.subtree_size:
                return self.get(index, child)
            index -= child.subtree_size

        raise IndexError("Row index out of range")

    # ------------------------------
    # INSERT ROW AT INDEX
    # ------------------------------
    def insert(self, index: int, row: Any, node: Optional[IndexBTreeNode] = None):
        if node is None:
            node = self.root

        if node.leaf:
            if index < 0 or index > len(node.rows):
                raise IndexError("Row index out of range")
            node.rows.insert(index, row)
            node.subtree_size = len(node.rows)
            return

        for i, child in enumerate(node.children):
            if index <= child.subtree_size:
                self.insert(index, row, child)
                break
            index -= child.subtree_size

        node.update_size()

    # ------------------------------
    # DELETE ROW AT INDEX
    # ------------------------------
    def delete(self, index: int, node: Optional[IndexBTreeNode] = None):
        if node is None:
            node = self.root

        if node.leaf:
            if index < 0 or index >= len(node.rows):
                raise IndexError("Row index out of range")
            node.rows.pop(index)
            node.subtree_size = len(node.rows)
            return

        for child in node.children:
            if index < child.subtree_size:
                self.delete(index, child)
                break
            index -= child.subtree_size

        node.update_size()

    # ------------------------------
    # UTILITIES
    # ------------------------------
    def size(self) -> int:
        return self.root.update_size()

    def inorder(self, node: Optional[IndexBTreeNode] = None) -> List[Any]:
        if node is None:
            node = self.root
        if node.leaf:
            return node.rows[:]
        result = []
        for child in node.children:
            result.extend(self.inorder(child))
        return result

    def print_yaml(self, node: Optional[IndexBTreeNode] = None, indent: int = 0):
        if node is None:
            node = self.root

        prefix = "  " * indent
        if node.leaf:
            print(f"{prefix}- leaf (size={node.subtree_size}): {node.rows}")
        else:
            print(f"{prefix}- internal (size={node.subtree_size}):")
            for child in node.children:
                self.print_yaml(child, indent + 1)

def main():
    t = IndexBTree.from_list([12, 32, 92, 38, 28, 38], 2)
    print("All rows:", t.inorder())
    t.print_yaml(indent = 4)


main()
