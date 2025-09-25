from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, List, Dict, Tuple, Set, Optional
from multipledispatch import dispatch

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

# ---------------- TABLE ---------------- #

class Table(Element, ABC):
    TYPE_CODE = "Table"

    def __init__(self, name: str, columns: List[str]):
        super().__init__(name)
        self.columns: List[str] = columns.copy()
        self.rows: List[List[Any]] = []  # use lists for mutability

    # --- Row operations --- #
    def append_row(self, values: List[Any]) -> int:
        if len(values) != len(self.columns):
            raise BookkeepingError("Wrong number of values")
        self.rows.append(values.copy())
        return len(self.rows) - 1

    def update_row(self, row_idx: int, values: List[Any]):
        if row_idx < 0 or row_idx >= len(self.rows):
            raise BookkeepingError("Row index out of range")
        if len(values) != len(self.columns):
            raise BookkeepingError("Wrong number of values")
        self.rows[row_idx] = values.copy()

    def get_row(self, row_idx: int) -> List[Any]:
        if row_idx < 0 or row_idx >= len(self.rows):
            raise BookkeepingError("Row index out of range")
        return self.rows[row_idx]

    # --- Column operations --- #
    def add_column(self, col_name: str):
        if col_name in self.columns:
            raise BookkeepingError("Column already exists")
        self.columns.append(col_name)
        for row in self.rows:
            row.append(None)

    def delete_column(self, col_name: str):
        if col_name not in self.columns:
            raise BookkeepingError("Column does not exist")
        idx = self.columns.index(col_name)
        self.columns.pop(idx)
        for row in self.rows:
            row.pop(idx)

    def rename_column(self, old_name: str, new_name: str):
        if old_name not in self.columns:
            raise BookkeepingError("Column does not exist")
        if new_name in self.columns:
            raise BookkeepingError("Column already exists")
        idx = self.columns.index(old_name)
        self.columns[idx] = new_name

    # --- Info / Index --- #
    def info(self) -> str:
        return f"Table(name={self.name}, cols={self.columns})"

    def list_indexable(self) -> List[str]:
        return self.columns

    def has_index_key(self, key: str) -> bool:
        return key in self.columns

# ---------------- UNORDERED TABLE (mutable row order) ---------------- #

class UnorderedTable(Table):
    def insert_row(self, index: int, values: List[Any]) -> int:
        if len(values) != len(self.columns):
            raise BookkeepingError("Wrong number of values")
        if index < 0 or index > len(self.rows):
            raise BookkeepingError("Row index out of range")
        self.rows.insert(index, values.copy())
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
    """Rows cannot be inserted, deleted, or moved."""
    def insert_row(self, index: int, values: List[Any]):
        raise BookkeepingError("Cannot insert rows in OrderedTable")

    def delete_row(self, row_idx: int):
        raise BookkeepingError("Cannot delete rows in OrderedTable")

    def move_row(self, old_index: int, new_index: int):
        raise BookkeepingError("Cannot move rows in OrderedTable")

class BookkeepingFileIO:
    def __init__(self, file_name) -> None:
        self.file_opener = open(file_name, "rb+")

    @dispatch(OrderedTable)
    def write(self, orderedTable: OrderedTable) -> None:
        pass

    @dispatch(UnorderedTable)
    def write(self, unorderedTable: UnorderedTable) -> None:
        pass

    def close(self) -> None:
        self.file_opener.close()

class ElementFactory:
    @staticmethod
    def create(element_type: str, name: str, **kwargs) -> Element:
        t = element_type.lower()
        if t == "ordered_table":
            return OrderedTable(name, columns=kwargs.get("columns"))
        if t == "unordered_table":
            return UnorderedTable(name, columns=kwargs.get("columns"))
        raise BookkeepingError("Unknown element type")

@dataclass
class CreateDelta:
    position: List[int]
    essence_object: Any

@dataclass
class DeleteDelta:
    position: List[int]
    essence_object: Any

@dataclass
class ModificationDelta:
    position: Dict[int]
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None

class BookkeepingRegistry:
    HISTORY_LIMIT = 256;
    def __init__(self):
        self.elements: List[Tuple[str, Element]] = {}
        self.__free_id: Set[int] = set()
        self.__path: List[int] = []
        self.__current_element: int = None

    def is_free_id(self, element_id: int):
        return element_id >= len(self.elements) or element_id in self.__free_id

    def create_element(self, element_id: int, name: str, element: Element):
        if element_id < 0:
            raise BookkeepingError("Element id is negative")
        if not self.is_free_id(element_id):
            raise BookkeepingError("Element id is occupied!")
        while element_id <= len(self.elements):
            self.__free_id.add(len(self.elements))
            self.elements.append(None)




# ---------------- TEST ---------------- #

def main():
    t = UnorderedTable("people", ["id", "name"])
    t.append_row([1, "Alice"])
    t.append_row([2, "Bob"])
    t.insert_row(1, [3, "Charlie"])  # insert at index 1
    t.add_column("age")
    t.update_row(0, [1, "Alice", 30])
    t.rename_column("name", "full_name")
    t.delete_column("age")
    print(t.info())
    for i, row in enumerate(t.rows):
        print(i, row)

main()
