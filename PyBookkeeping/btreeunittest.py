import unittest
from io import StringIO
from contextlib import redirect_stdout

from btree import BTree

class TestBTree(unittest.TestCase):

    def setUp(self):
        self.btree = BTree(t=2)  # minimum degree = 2

    def test_insert_and_search(self):
        values = [10, 20, 5, 6, 12, 30, 7, 17]
        for v in values:
            self.btree.insert(v)

        # Ensure all inserted values can be found
        for v in values:
            result = self.btree.search(v)
            self.assertIsNotNone(result, f"{v} should be found in the BTree")
            node, idx = result
            self.assertEqual(node.keys[idx], v)

        # Ensure a non-existent value is not found
        self.assertIsNone(self.btree.search(99))

    def test_inorder_traversal_sorted(self):
        values = [10, 20, 5, 6, 12, 30, 7, 17]
        for v in values:
            self.btree.insert(v)
        traversal = self.btree.inorder_traversal()
        self.assertEqual(traversal, sorted(values))

    def test_delete_leaf(self):
        self.btree.insert(10)
        self.btree.insert(20)
        self.btree.insert(5)
        self.assertIn(10, self.btree.inorder_traversal())
        self.btree.delete(10)
        self.assertNotIn(10, self.btree.inorder_traversal())

    def test_delete_internal_node(self):
        values = [10, 20, 5, 6, 12, 30, 7, 17]
        for v in values:
            self.btree.insert(v)

        self.assertIn(20, self.btree.inorder_traversal())
        self.btree.delete(20)
        self.assertNotIn(20, self.btree.inorder_traversal())
        self.assertEqual(self.btree.inorder_traversal(), sorted(set(values) - {20}))

    def test_root_shrinking(self):
        self.btree.insert(1)
        self.btree.insert(2)
        self.btree.insert(3)
        self.btree.insert(4)
        self.btree.insert(5)
        self.btree.delete(1)
        self.btree.delete(2)
        self.btree.delete(3)
        self.btree.delete(4)
        self.btree.delete(5)
        self.assertEqual(self.btree.root.keys, [])

    def test_pretty_print_runs(self):
        self.btree.insert(10)
        self.btree.insert(20)

        f = StringIO()
        with redirect_stdout(f):
            self.btree.pretty_print()
        output = f.getvalue()
        self.assertIn("Level", output)

    def test_print_yaml_runs(self):
        self.btree.insert(10)
        self.btree.insert(20)

        f = StringIO()
        with redirect_stdout(f):
            self.btree.print_yaml()
        output = f.getvalue()
        self.assertIn("-", output)


if __name__ == "__main__":
    unittest.main()
