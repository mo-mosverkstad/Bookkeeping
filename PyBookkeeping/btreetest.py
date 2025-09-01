from btree import BTree

if __name__ == "__main__":
    b = BTree(3)
    for i in [543, 234, 232, 333, 128, 121, 98, 283, 443, 322, 827, 543, 234, 239, 232, 129, 567, 665, 532, 452, 198]:
        b.insert(i)

    print("Pretty print:")
    b.print_yaml()

    print("\nIn-order traversal:", b.inorder_traversal())

    b.delete(6)
    print("\nAfter deleting 6:")
    b.print_yaml()
    print("In-order traversal:", b.inorder_traversal())
