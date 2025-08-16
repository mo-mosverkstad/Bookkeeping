from utils import BookkeepingError, _serialize, _deserialize
from element import Element
from typing import Any, Dict, List, Optional

class Table(Element):
    TYPE_CODE = "Table"
    def __init__(self, name: str, columns: Optional[List[str]] = None, element_id: Optional[int] = None):
        super().__init__(name, element_id)
        self.columns: List[str] = columns[:] if columns else []
        self.rows: List[Dict[str, Any]] = []
        self.indexed_columns: List[str] = []
        self.index_maps: Dict[str, Dict[Any, List[int]]] = {}
        self.list_columns: List[str] = []  # NEW: columns storing lists

    def add_column(self, col_name: str):
        if col_name in self.columns:
            raise BookkeepingError("Column exists")
        self.columns.append(col_name)
        for r in self.rows:
            r[col_name] = None

    def del_column(self, col_name: str):
        if col_name not in self.columns:
            raise BookkeepingError("No such column")
        self.columns.remove(col_name)
        for r in self.rows:
            r.pop(col_name, None)
        if col_name in self.indexed_columns:
            self.indexed_columns.remove(col_name)
            self.index_maps.pop(col_name, None)


    def add_list_column(self, col_name: str):
        if col_name in self.columns:
            raise BookkeepingError("Column exists")
        self.columns.append(col_name)
        self.list_columns.append(col_name)
        for r in self.rows:
            r[col_name] = []

    def del_list_column(self, col_name: str):
        if col_name not in self.columns:
            raise BookkeepingError("No such column")
        self.columns.remove(col_name)
        if col_name in self.list_columns:
            self.list_columns.remove(col_name)
        for r in self.rows:
            r.pop(col_name, None)

    def insert_row(self, row: Dict[str, Any]) -> int:
        new_row = {}
        for c in self.columns:
            if c in self.list_columns:
                new_row[c] = []
            else:
                new_row[c] = None
        for k, v in row.items():
            if k not in self.columns:
                raise BookkeepingError(f"Unknown column {k}")
            new_row[k] = v
        self.rows.append(new_row)
        idx = len(self.rows) - 1
        for col in self.indexed_columns:
            self.index_maps.setdefault(col, {})
            val = new_row.get(col)
            self.index_maps[col].setdefault(val, []).append(idx)
        return idx

    def update_row(self, row_idx: int, updates: Dict[str, Any]):
        if row_idx < 0 or row_idx >= len(self.rows):
            raise BookkeepingError("Row index out of range")
        row = self.rows[row_idx]
        for k, v in updates.items():
            if k not in self.columns:
                raise BookkeepingError(f"Unknown column {k}")
            old = row.get(k)
            row[k] = v
            if k in self.indexed_columns:
                imap = self.index_maps.setdefault(k, {})
                if old in imap:
                    try:
                        imap[old].remove(row_idx)
                        if not imap[old]:
                            del imap[old]
                    except ValueError:
                        pass
                imap.setdefault(v, []).append(row_idx)

    def delete_row(self, row_idx: int):
        if row_idx < 0 or row_idx >= len(self.rows):
            raise BookkeepingError("Row index out of range")
        self.rows.pop(row_idx)
        self._rebuild_indexes()

    def set_index_column(self, col_name: str):
        if col_name not in self.columns:
            raise BookkeepingError("No such column")
        if col_name not in self.indexed_columns:
            self.indexed_columns.append(col_name)
        m: Dict[Any, List[int]] = {}
        for i, r in enumerate(self.rows):
            val = r.get(col_name)
            m.setdefault(val, []).append(i)
        self.index_maps[col_name] = m

    def unset_index_column(self, col_name: str):
        if col_name in self.indexed_columns:
            self.indexed_columns.remove(col_name)
        self.index_maps.pop(col_name, None)

    def lookup_by_index(self, col_name: str, value: Any) -> List[Dict[str, Any]]:
        if col_name not in self.indexed_columns:
            raise BookkeepingError("Column not indexed")
        idxs = self.index_maps.get(col_name, {}).get(value, [])
        return [self.rows[i] for i in idxs]


    def _validate_list_cell(self, row_idx: int, col: str):
        if col not in self.list_columns:
            raise BookkeepingError(f"Column {col} is not a list column")
        if row_idx < 0 or row_idx >= len(self.rows):
            raise BookkeepingError("Row index out of range")
        if not isinstance(self.rows[row_idx][col], list):
            raise BookkeepingError(f"Cell {row_idx}:{col} is not a list")

    def append_to_list_cell(self, row_idx: int, col: str, value: Any):
        self._validate_list_cell(row_idx, col)
        self.rows[row_idx][col].append(value)

    def insert_into_list_cell(self, row_idx: int, col: str, index: int, value: Any):
        self._validate_list_cell(row_idx, col)
        self.rows[row_idx][col].insert(index, value)

    def update_list_cell_item(self, row_idx: int, col: str, index: int, value: Any):
        self._validate_list_cell(row_idx, col)
        if index < 0 or index >= len(self.rows[row_idx][col]):
            raise BookkeepingError("List index out of range")
        self.rows[row_idx][col][index] = value

    def delete_list_cell_item(self, row_idx: int, col: str, index: int):
        self._validate_list_cell(row_idx, col)
        if index < 0 or index >= len(self.rows[row_idx][col]):
            raise BookkeepingError("List index out of range")
        del self.rows[row_idx][col][index]

    def _rebuild_indexes(self):
        for col in list(self.indexed_columns):
            self.set_index_column(col)

    def to_serializable(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "type": Table.TYPE_CODE,
            "columns": list(self.columns),
            "rows": _serialize(self.rows),
            "indexed_columns": list(self.indexed_columns),
            "list_columns": list(self.list_columns),  # NEW
            "refs": list(self.refs),
        }

    def from_serializable(self, data: Dict[str, Any]):
        self.id = int(data["id"])
        self.name = data.get("name", self.name)
        self.columns = list(data.get("columns", []))
        self.rows = _deserialize(data.get("rows", []))
        self.indexed_columns = list(data.get("indexed_columns", []))
        self.list_columns = list(data.get("list_columns", []))  # NEW
        self.refs = [int(x) for x in data.get("refs", [])]
        self._rebuild_indexes()

    def list_indexable(self) -> List[str]:
        return list(self.indexed_columns)

    def has_index_key(self, key: str) -> bool:
        return key in self.indexed_columns

    def info(self) -> str:
        return f"Table(name={self.name}, cols={self.columns}, rows={len(self.rows)}, slots={len(self.refs)})"