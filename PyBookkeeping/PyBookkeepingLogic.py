from typing import Any, List, Optional, Tuple
from abc import ABC, abstractmethod

class BookkeepingError(Exception):
    pass

class Element(ABC):
    TYPE_CODE = "NULL"

    def __init__(self, name: str):
        self.name: str = name
        self.refs: List[int] = []

    @abstractmethod
    def list_indexable(self) -> List[str]:
        pass

    @abstractmethod
    def has_index_key(self, key: str) -> bool:
        pass

    def info(self) -> str:
        non_empty = sum(1 for r in self.refs if r)
        return f"{self.TYPE_CODE}(name={self.name}, slots={len(self.refs)}, children={non_empty})"

    def __repr__(self) -> str:
        return f"<{self.TYPE_CODE} name={self.name}>"

# ---------------- ABSTRACT TABLE ---------------- #

class Table(Element, ABC):
    TYPE_CODE = "Table"

    def __init__(self, name: str, columns: List[str]):
        super().__init__(name)
        self.columns: List[str] = columns.copy()
        self.rows: List[Tuple[Any, ...]] = []

    def append_row(self, values: Tuple[Any, ...]) -> int:
        if len(values) != len(self.columns):
            raise BookkeepingError("Wrong number of values")
        self.rows.append(values)
        return len(self.rows) - 1

    def update_row(self, row_idx: int, values: Tuple[Any, ...]):
        if row_idx < 0 or row_idx >= len(self.rows):
            raise BookkeepingError("Row index out of range")
        if len(values) != len(self.columns):
            raise BookkeepingError("Wrong number of values")
        self.rows[row_idx] = values

    def get_row(self, row_idx: int) -> Tuple[Any, ...]:
        if row_idx < 0 or row_idx >= len(self.rows):
            raise BookkeepingError("Row index out of range")
        return self.rows[row_idx]

    def add_column(self, col_name: str):
        if col_name in self.columns:
            raise BookkeepingError("Column exists")
        self.columns.append(col_name)
        self._extend_rows()

    def _extend_rows(self):
        self.rows = [row + (None,) for row in self.rows]

    def info(self) -> str:
        return f"Table(name={self.name}, cols={self.columns})"

    def list_indexable(self) -> List[str]:
        return self.columns

    def has_index_key(self, key: str) -> bool:
        return key in self.columns

# ---------------- UNORDERED TABLE (mutable row order) ---------------- #

class UnorderedTable(Table):
    """A Table with row insertion, deletion and moving around."""

    def insert_row(self, index: int, values: Tuple[Any, ...]) -> int:
        if len(values) != len(self.columns):
            raise BookkeepingError("Wrong number of values")
        if index < 0 or index > len(self.rows):  # allow insert at end
            raise BookkeepingError("Row index out of range")
        self.rows.insert(index, values)
        return index

    def delete_row(self, row_idx: int):
        if row_idx < 0 or row_idx >= len(self.rows):
            raise BookkeepingError("Row index out of range")
        self.rows.pop(row_idx)

    def move_row(self, old_index: int, new_index: int):
        if old_index < 0 or old_index >= len(self.rows):
            raise BookkeepingError("Old row index out of range")
        if new_index < 0 or new_index >= len(self.rows):
            raise BookkeepingError("New row index out of range")
        row = self.rows.pop(old_index)
        self.rows.insert(new_index, row)

# ---------------- ORDERED TABLE (immutable row order) ---------------- #

class OrderedTable(UnorderedTable):
    """A Table without row insertion, deletion and moving around."""
    pass


def main() -> None:
    t = UnorderedTable("people", ["id", "name"])
    t.append_row((1, "Alice"))
    t.append_row((2, "Bob"))
    # t.insert_row(1, (3, "Charlie"))  # insert at index 1
    # t.move_row(0, 2)  # move "Alice" to after "Charlie"
    print(t.info())
    for i, row in enumerate(t.rows):
        print(i, row)

main()