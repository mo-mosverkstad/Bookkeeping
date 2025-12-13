class BTreeNode:
    def __init__(self, t, leaf=False):
        self.t = t
        self.leaf = leaf
        self.keys = []
        self.children = []

    def __str__(self, level=0):
        indent = "   " * level
        rep = indent + str(self.keys) + "\n"
        for child in self.children:
            rep += child.__str__(level + 1)
        return rep


class BTree:
    def __init__(self, t):
        self.t = t
        self.root = BTreeNode(t, leaf=True)

    # ------------------------------
    # SEARCH
    # ------------------------------
    def search(self, k, x=None):
        if x is None:
            x = self.root

        i = 0
        while i < len(x.keys) and k > x.keys[i]:
            i += 1

        if i < len(x.keys) and k == x.keys[i]:
            return (x, i)
        elif x.leaf:
            return None
        else:
            return self.search(k, x.children[i])

    # ------------------------------
    # INSERT
    # ------------------------------
    def insert(self, k):
        root = self.root
        if len(root.keys) == (2 * self.t - 1):
            new_root = BTreeNode(self.t, leaf=False)
            new_root.children.insert(0, root)
            self._split_child(new_root, 0)
            self._insert_non_full(new_root, k)
            self.root = new_root
        else:
            self._insert_non_full(root, k)

    def _insert_non_full(self, x, k):
        i = len(x.keys) - 1
        if x.leaf:
            x.keys.append(None)
            while i >= 0 and k < x.keys[i]:
                x.keys[i + 1] = x.keys[i]
                i -= 1
            x.keys[i + 1] = k
        else:
            while i >= 0 and k < x.keys[i]:
                i -= 1
            i += 1
            if len(x.children[i].keys) == (2 * self.t - 1):
                self._split_child(x, i)
                if k > x.keys[i]:
                    i += 1
            self._insert_non_full(x.children[i], k)

    def _split_child(self, x, i):
        t = self.t
        y = x.children[i]
        z = BTreeNode(t, leaf=y.leaf)

        z.keys = y.keys[t:]
        middle = y.keys[t - 1]
        y.keys = y.keys[:t - 1]

        if not y.leaf:
            z.children = y.children[t:]
            y.children = y.children[:t]

        x.children.insert(i + 1, z)
        x.keys.insert(i, middle)

    # ------------------------------
    # DELETE
    # ------------------------------
    def delete(self, k):
        self._delete(self.root, k)
        if len(self.root.keys) == 0 and not self.root.leaf:
            self.root = self.root.children[0]

    def _delete(self, x, k):
        t = self.t
        i = 0
        while i < len(x.keys) and k > x.keys[i]:
            i += 1

        if i < len(x.keys) and x.keys[i] == k:
            if x.leaf:
                x.keys.pop(i)
            else:
                if len(x.children[i].keys) >= t:
                    pred = self._get_pred(x, i)
                    x.keys[i] = pred
                    self._delete(x.children[i], pred)
                elif len(x.children[i + 1].keys) >= t:
                    succ = self._get_succ(x, i)
                    x.keys[i] = succ
                    self._delete(x.children[i + 1], succ)
                else:
                    self._merge(x, i)
                    self._delete(x.children[i], k)
        elif not x.leaf:
            if len(x.children[i].keys) < t:
                self._fix_child_size(x, i)
            self._delete(x.children[i], k)

    def _get_pred(self, x, i):
        node = x.children[i]
        while not node.leaf:
            node = node.children[-1]
        return node.keys[-1]

    def _get_succ(self, x, i):
        node = x.children[i + 1]
        while not node.leaf:
            node = node.children[0]
        return node.keys[0]

    def _merge(self, x, i):
        child = x.children[i]
        sibling = x.children[i + 1]
        child.keys.append(x.keys.pop(i))
        child.keys.extend(sibling.keys)
        if not child.leaf:
            child.children.extend(sibling.children)
        x.children.pop(i + 1)

    def _fix_child_size(self, x, i):
        t = self.t
        if i > 0 and len(x.children[i - 1].keys) >= t:
            left = x.children[i - 1]
            child = x.children[i]
            child.keys.insert(0, x.keys[i - 1])
            x.keys[i - 1] = left.keys.pop()
            if not left.leaf:
                child.children.insert(0, left.children.pop())
        elif i < len(x.children) - 1 and len(x.children[i + 1].keys) >= t:
            right = x.children[i + 1]
            child = x.children[i]
            child.keys.append(x.keys[i])
            x.keys[i] = right.keys.pop(0)
            if not right.leaf:
                child.children.append(right.children.pop(0))
        else:
            if i < len(x.children) - 1:
                self._merge(x, i)
            else:
                self._merge(x, i - 1)

    # ------------------------------
    # TRAVERSAL
    # ------------------------------
    def inorder_traversal(self, x=None):
        if x is None:
            x = self.root
        result = []
        for i in range(len(x.keys)):
            if not x.leaf:
                result.extend(self.inorder_traversal(x.children[i]))
            result.append(x.keys[i])
        if not x.leaf:
            result.extend(self.inorder_traversal(x.children[-1]))
        return result

    # ------------------------------
    # PRETTY PRINT
    # ------------------------------
    def pretty_print(self):
        """Print tree level by level with keys grouped per node."""
        levels = []
        self._collect_levels(self.root, 0, levels)
        for depth, nodes in enumerate(levels):
            print("Level", depth, ":", " | ".join(str(node) for node in nodes))

    def _collect_levels(self, node, depth, levels):
        if len(levels) <= depth:
            levels.append([])
        levels[depth].append(node.keys)
        for child in node.children:
            self._collect_levels(child, depth + 1, levels)
            
    def print_yaml(self, node=None, indent=0):
        """Pretty print the B-tree in a YAML-like hierarchical style."""
        if node is None:
            node = self.root

        prefix = "  " * indent
        print(f"{prefix}- {node.keys}")
        for child in node.children:
            self.print_yaml(child, indent + 1)