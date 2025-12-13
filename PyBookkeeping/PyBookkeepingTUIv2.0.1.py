#!/usr/bin/env python3
from __future__ import annotations
import json
import shlex
import os
import struct
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from abc import ABC, abstractmethod
import pprint
from pprint import pformat

from enum import Enum, auto
import curses
import locale
from typing import Callable, Final, List, Optional, Tuple, Protocol, runtime_checkable

# ---- constants ----
FILE_MAGIC = b"BKUP_V3\0"  # 8 bytes (padded/truncated)
FILE_VERSION = 3
U32 = "<I"  # little-endian unsigned 4 bytes
U64 = "<Q"  # unsigned 8 bytes (if needed)

# ---- exceptions ----
class BookkeepingError(Exception):
    pass

# ---- IndexPointer ----
@dataclass(frozen=True)
class IndexPointer:
    target_element_id: int
    target_index_key: str

    def __repr__(self):
        return f"<IndexPointer {self.target_element_id}::{self.target_index_key}>"

# ---- JSON helpers for internals (we still use JSON for complex structures) ----
def _serialize(obj: Any) -> Any:
    if isinstance(obj, IndexPointer):
        return {"__IndexPointer__": True,
                "target_element_id": obj.target_element_id,
                "target_index_key": obj.target_index_key}
    if isinstance(obj, dict):
        return {str(k): _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(v) for v in obj]
    if isinstance(obj, tuple):
        return [_serialize(v) for v in obj]
    return obj

def _deserialize(obj: Any) -> Any:
    if isinstance(obj, dict):
        if obj.get("__IndexPointer__"):
            return IndexPointer(int(obj["target_element_id"]), obj["target_index_key"])
        return {k: _deserialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_deserialize(v) for v in obj]
    return obj

# ---- Element base ----
class Element(ABC):
    TYPE_CODE = "NULL"
    def __init__(self, name: str, element_id: Optional[int] = None):
        self.id: int = element_id if element_id is not None else -1
        self.name: str = name
        self.type: str = self.__class__.__name__
        # refs: stable slots list; 0 = empty, otherwise element id
        self.refs: List[int] = []

    @abstractmethod
    def to_serializable(self) -> Dict[str, Any]:
        pass

    @abstractmethod
    def from_serializable(self, data: Dict[str, Any]):
        pass

    @abstractmethod
    def list_indexable(self) -> List[str]:
        pass

    @abstractmethod
    def has_index_key(self, key: str) -> bool:
        pass

    def info(self) -> str:
        # show positions count and number of non-empty refs
        non_empty = sum(1 for r in self.refs if r)
        return f"{self.type}(id={self.id}, name={self.name}, slots={len(self.refs)}, children={non_empty})"

    def __repr__(self):
        return f"<{self.type} id={self.id} name={self.name}>"

# ---- Table Element ----
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

    def move_row(self, old_index: int, new_index: int):
        if old_index < 0 or old_index >= len(self.rows):
            raise BookkeepingError("Old row index out of range")
        if new_index < 0 or new_index >= len(self.rows):
            raise BookkeepingError("New row index out of range")
        row = self.rows.pop(old_index)
        self.rows.insert(new_index, row)
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

class OrderedTable(Table):
    #TODO: Make an orderedtable, without insert or delete or rearrange
    pass

class UnorderedTable(Table):
    #TODO: Make an unorderedtable, with insert, delete or rearrange, but index will be affected!
    pass

# ---- Graph Element ----
class Graph(Element):
    TYPE_CODE = "Graph"

    def __init__(self, name: str, element_id: Optional[int] = None):
        super().__init__(name, element_id)
        # adjacency table: node_id -> {"attrs": { ... }, "edges": {target_id: {meta...}}}
        self.adj: Dict[str, Dict[str, Any]] = {}
        self.indexed_node_attrs: List[str] = []
        self.node_index_maps: Dict[str, Dict[Any, List[str]]] = {}

    # ---------------- Nodes ----------------
    def add_node(self, node_id: str, attrs: Optional[Dict[str, Any]] = None):
        if node_id in self.adj:
            raise BookkeepingError("Node exists")
        self.adj[node_id] = {"attrs": dict(attrs) if attrs else {}, "edges": {}}
        for attr in self.indexed_node_attrs:
            val = self.adj[node_id]["attrs"].get(attr)
            self.node_index_maps.setdefault(attr, {}).setdefault(val, []).append(node_id)

    def del_node(self, node_id: str):
        if node_id not in self.adj:
            raise BookkeepingError("No such node")
        # remove incoming edges from all other nodes
        for src in self.adj:
            self.adj[src]["edges"].pop(node_id, None)
        # remove from indexes
        for attr in self.indexed_node_attrs:
            val = self.adj[node_id]["attrs"].get(attr)
            if val in self.node_index_maps.get(attr, {}):
                try:
                    self.node_index_maps[attr][val].remove(node_id)
                    if not self.node_index_maps[attr][val]:
                        del self.node_index_maps[attr][val]
                except ValueError:
                    pass
        del self.adj[node_id]
        self._rebuild_node_indexes()

    def update_node(self, node_id: str, attrs: Dict[str, Any]):
        if node_id not in self.adj:
            raise BookkeepingError("No such node")
        old_attrs = dict(self.adj[node_id]["attrs"])
        self.adj[node_id]["attrs"].update(attrs)
        for attr in self.indexed_node_attrs:
            old_val = old_attrs.get(attr)
            new_val = self.adj[node_id]["attrs"].get(attr)
            if old_val != new_val:
                m = self.node_index_maps.setdefault(attr, {})
                if old_val in m:
                    try:
                        m[old_val].remove(node_id)
                        if not m[old_val]:
                            del m[old_val]
                    except ValueError:
                        pass
                m.setdefault(new_val, []).append(node_id)

    # ---------------- Edges ----------------
    def add_edge(self, frm: str, to: str, meta: Optional[Dict[str, Any]] = None):
        if frm not in self.adj or to not in self.adj:
            raise BookkeepingError("Both nodes must exist")
        self.adj[frm]["edges"][to] = dict(meta) if meta else {}

    def del_edge(self, frm: str, to: str):
        if frm not in self.adj or to not in self.adj[frm]["edges"]:
            raise BookkeepingError("Edge not found")
        del self.adj[frm]["edges"][to]

    # ---------------- Indexes ----------------
    def set_node_index(self, attr_name: str):
        if attr_name not in self.indexed_node_attrs:
            self.indexed_node_attrs.append(attr_name)
        m: Dict[Any, List[str]] = {}
        for nid, data in self.adj.items():
            val = data["attrs"].get(attr_name)
            m.setdefault(val, []).append(nid)
        self.node_index_maps[attr_name] = m

    def unset_node_index(self, attr_name: str):
        if attr_name in self.indexed_node_attrs:
            self.indexed_node_attrs.remove(attr_name)
        self.node_index_maps.pop(attr_name, None)

    def lookup_nodes_by_index(self, attr_name: str, value: Any):
        if attr_name not in self.indexed_node_attrs:
            raise BookkeepingError("Node attribute not indexed")
        nids = self.node_index_maps.get(attr_name, {}).get(value, [])
        return [{"node_id": nid, "attrs": self.adj[nid]["attrs"]} for nid in nids]

    def _rebuild_node_indexes(self):
        for attr in list(self.indexed_node_attrs):
            self.set_node_index(attr)

    # ---------------- Serialization ----------------
    def to_serializable(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "type": Graph.TYPE_CODE,
            "adj": _serialize(self.adj),
            "indexed_node_attrs": list(self.indexed_node_attrs),
            "refs": list(self.refs),
        }

    def from_serializable(self, data: Dict[str, Any]):
        self.id = int(data["id"])
        self.name = data.get("name", self.name)
        self.adj = _deserialize(data.get("adj", {}))
        self.indexed_node_attrs = list(data.get("indexed_node_attrs", []))
        self.refs = [int(x) for x in data.get("refs", [])]
        self._rebuild_node_indexes()

    # ---------------- Info & Display ----------------
    def list_indexable(self) -> List[str]:
        return list(self.indexed_node_attrs)

    def has_index_key(self, key: str) -> bool:
        return key in self.indexed_node_attrs

    def info(self) -> str:
        return f"Graph(name={self.name}, nodes={len(self.adj)}, edges={sum(len(d['edges']) for d in self.adj.values())}, slots={len(self.refs)})"

    # Helper for CLI show_edges (backwards compatibility)
    def edges_as_list(self):
        return [(src, tgt, meta) for src, data in self.adj.items() for tgt, meta in data["edges"].items()]

# ---- KeyValuePair Element ----
class KeyValuePair(Element):
    TYPE_CODE = "KeyValuePair"

    def __init__(self, name: str, element_id: Optional[int] = None):
        super().__init__(name, element_id)
        self.store: Dict[str, Any] = {}
        self.indexed_keys: List[str] = []

    def set(self, key: str, value: Any):
        self.store[key] = value

    def get(self, key: str):
        if key not in self.store:
            raise BookkeepingError("Key not found")
        return self.store[key]

    def delete(self, key: str):
        if key not in self.store:
            raise BookkeepingError("Key not found")
        del self.store[key]
        if key in self.indexed_keys:
            self.indexed_keys.remove(key)

    def set_index_key(self, key: str):
        if key not in self.store:
            raise BookkeepingError("Key not found to index")
        if key not in self.indexed_keys:
            self.indexed_keys.append(key)

    def unset_index_key(self, key: str):
        if key in self.indexed_keys:
            self.indexed_keys.remove(key)

    def lookup_by_key(self, key: str):
        if key not in self.indexed_keys:
            raise BookkeepingError("Key not indexed")
        return self.store[key]

    def to_serializable(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "type": KeyValuePair.TYPE_CODE,
            "store": _serialize(self.store),
            "indexed_keys": list(self.indexed_keys),
            "refs": list(self.refs),
        }

    def from_serializable(self, data: Dict[str, Any]):
        self.id = int(data["id"])
        self.name = data.get("name", self.name)
        self.store = _deserialize(data.get("store", {}))
        self.indexed_keys = list(data.get("indexed_keys", []))
        self.refs = [int(x) for x in data.get("refs", [])]

    def list_indexable(self) -> List[str]:
        return list(self.indexed_keys)

    def has_index_key(self, key: str) -> bool:
        return key in self.indexed_keys

    def info(self) -> str:
        return f"KVP(name={self.name}, keys={len(self.store)}, slots={len(self.refs)})"

# ---- Factory ----
class ElementFactory:
    @staticmethod
    def create(element_type: str, name: str, element_id: Optional[int] = None, **kwargs) -> Element:
        t = element_type.lower()
        if t == "table":
            return Table(name, columns=kwargs.get("columns"), element_id=element_id)
        if t == "graph":
            return Graph(name, element_id=element_id)
        if t in ("kvp", "kv", "keyvaluepair"):
            return KeyValuePair(name, element_id=element_id)
        raise BookkeepingError("Unknown element type")


    @staticmethod
    def from_serializable(data: Dict[str, Any]) -> Element:
        t = data.get("type")
        if t == Table.TYPE_CODE:
            el = Table(data.get("name", "Table"), element_id=int(data["id"]))
            el.from_serializable(data)
            return el
        if t == Graph.TYPE_CODE:
            el = Graph(data.get("name", "Graph"), element_id=int(data["id"]))
            el.from_serializable(data)
            return el
        if t == KeyValuePair.TYPE_CODE:
            el = KeyValuePair(data.get("name", "KVP"), element_id=int(data["id"]))
            el.from_serializable(data)
            return el
        raise BookkeepingError("Unsupported element type in serialized data")

# ---- Delta (unchanged) ----
@dataclass
class Delta:
    action: str
    element_id: Optional[int] = None
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None
    path_before: Optional[List[int]] = None
    path_after: Optional[List[int]] = None
    current_element_before: Optional[int] = None
    current_element_after: Optional[int] = None

# ---- ElementRegistry ----
class ElementRegistry:
    def __init__(self, history_limit: int = 500):
        self.elements: Dict[int, Element] = {}
        self._next_id = 1
        self._free_ids: List[int] = []

        root_id = self._alloc_id()
        root = KeyValuePair("root", element_id=root_id)
        # initialize root with one slot (optional)
        root.refs = []
        self.elements[root.id] = root
        self.root_id: int = root.id

        self.current_element_id: int = self.root_id
        # path_stack stores positions (integers) used to descend at each level
        self.path_stack: List[int] = []

        self._history: List[Delta] = []
        self._hist_ptr: int = -1
        self._history_limit = history_limit

    def _alloc_id(self) -> int:
        if self._free_ids:
            return self._free_ids.pop()
        nid = self._next_id
        self._next_id += 1
        return nid

    def _free_id(self, eid: int):
        if eid <= 0:
            return
        if eid in self.elements:
            return
        self._free_ids.append(eid)

    def _current(self) -> Element:
        return self.get_element(self.current_element_id)

    def get_element(self, element_id: int) -> Element:
        if element_id not in self.elements:
            raise BookkeepingError("No such element")
        return self.elements[element_id]

    def find_by_name(self, name: str) -> List[Element]:
        return [e for e in self.elements.values() if e.name == name]

    def _push_delta(self, delta: Delta):
        if self._hist_ptr < len(self._history) - 1:
            self._history = self._history[: self._hist_ptr + 1]
        self._history.append(delta)
        if len(self._history) > self._history_limit:
            drop = len(self._history) - self._history_limit
            self._history = self._history[drop:]
        self._hist_ptr = len(self._history) - 1

    def undo(self):
        if self._hist_ptr < 0:
            raise BookkeepingError("Nothing to undo")
        d = self._history[self._hist_ptr]
        self._apply_delta(d, reverse=True)
        self._hist_ptr -= 1

    def redo(self):
        if self._hist_ptr >= len(self._history) - 1:
            raise BookkeepingError("Nothing to redo")
        self._hist_ptr += 1
        d = self._history[self._hist_ptr]
        self._apply_delta(d, reverse=False)

    def list_history(self):
        out = []
        for i, d in enumerate(self._history):
            out.append({"idx": i, "action": d.action, "element_id": d.element_id})
        return out

    def _apply_delta(self, delta: Delta, reverse: bool):
        state = delta.before if reverse else delta.after
        if delta.action == "create":
            if reverse:
                if delta.element_id in self.elements:
                    del self.elements[delta.element_id]
                    self._free_id(delta.element_id)
            else:
                if state is None:
                    raise BookkeepingError("Malformed create delta")
                el = ElementFactory.from_serializable(state)
                self.elements[el.id] = el

        elif delta.action == "delete":
            if reverse:
                if state is None:
                    raise BookkeepingError("Malformed delete delta")
                el = ElementFactory.from_serializable(state)
                self.elements[el.id] = el
            else:
                if delta.element_id in self.elements:
                    del self.elements[delta.element_id]
                    self._free_id(delta.element_id)

        elif delta.action == "update":
            if state is None:
                if delta.element_id in self.elements:
                    del self.elements[delta.element_id]
                    self._free_id(delta.element_id)
            else:
                el = ElementFactory.from_serializable(state)
                self.elements[el.id] = el

        if reverse:
            if delta.path_before is not None:
                self.path_stack = list(delta.path_before)
            if delta.current_element_before is not None:
                self.current_element_id = delta.current_element_before
        else:
            if delta.path_after is not None:
                self.path_stack = list(delta.path_after)
            if delta.current_element_after is not None:
                self.current_element_id = delta.current_element_after

    # incoming refs: return (element_id, slot_pos) pairs where slot_pos is the index in parent's refs list
    def incoming_refs(self, target_id: int) -> List[Tuple[int, int]]:
        out = []
        for eid, el in self.elements.items():
            for pos, v in enumerate(el.refs):
                if v == target_id:
                    out.append((eid, pos))
        return out

    def reachable_from_root(self) -> set:
        seen = set()
        q = [self.root_id]
        while q:
            cur = q.pop(0)
            if cur in seen:
                continue
            seen.add(cur)
            el = self.elements.get(cur)
            if not el:
                continue
            for child_id in el.refs:
                if child_id and child_id not in seen:
                    q.append(child_id)
        return seen

    # create element and link from current element into a stable slot position (reuse empty slots)
    def create_element(self, element_type: str, name: str, slot_pos: Optional[int] = None, **kwargs) -> Tuple[int, int]:
        el_id = self._alloc_id()
        el = ElementFactory.create(element_type, name, element_id=el_id, **kwargs)
        cur = self._current()
        before_cur = cur.to_serializable()
        # choose slot: if slot_pos specified, use it (must be within 0..len)
        if slot_pos is None:
            # find first empty slot (0) or append
            found = None
            for i, v in enumerate(cur.refs):
                if v == 0:
                    found = i
                    break
            if found is None:
                cur.refs.append(el.id)
                used_pos = len(cur.refs) - 1
            else:
                cur.refs[found] = el.id
                used_pos = found
        else:
            if slot_pos < 0:
                raise BookkeepingError("slot_pos out of range")
            if slot_pos < len(cur.refs):
                if cur.refs[slot_pos] != 0:
                    raise BookkeepingError("slot already occupied")
                cur.refs[slot_pos] = el.id
                used_pos = slot_pos
            else:
                # extend with zeros up to slot_pos then set
                while len(cur.refs) < slot_pos:
                    cur.refs.append(0)
                cur.refs.append(el.id)
                used_pos = slot_pos
        self.elements[el.id] = el
        after_cur = cur.to_serializable()
        delta = Delta(action="create", element_id=el.id, before={"cur": before_cur}, after={"cur": after_cur, "created": el.to_serializable()},
                      path_before=list(self.path_stack), path_after=list(self.path_stack),
                      current_element_before=self.current_element_id, current_element_after=self.current_element_id)
        self._push_delta(delta)
        return el.id, used_pos

    # createref: insert existing element id into first empty slot or specified slot
    def createref(self, slot_pos: Optional[int], element_id: int) -> int:
        if element_id not in self.elements:
            raise BookkeepingError("Target element does not exist")
        cur = self._current()
        before = cur.to_serializable()
        if slot_pos is None:
            found = None
            for i, v in enumerate(cur.refs):
                if v == 0:
                    found = i
                    break
            if found is None:
                cur.refs.append(element_id)
                used = len(cur.refs) - 1
            else:
                cur.refs[found] = element_id
                used = found
        else:
            if slot_pos < 0:
                raise BookkeepingError("slot_pos out of range")
            if slot_pos < len(cur.refs):
                if cur.refs[slot_pos] != 0:
                    raise BookkeepingError("slot already occupied")
                cur.refs[slot_pos] = element_id
                used = slot_pos
            else:
                while len(cur.refs) < slot_pos:
                    cur.refs.append(0)
                cur.refs.append(element_id)
                used = slot_pos
        after = cur.to_serializable()
        delta = Delta(action="update", element_id=cur.id, before=before, after=after,
                      path_before=list(self.path_stack), path_after=list(self.path_stack),
                      current_element_before=self.current_element_id, current_element_after=self.current_element_id)
        self._push_delta(delta)
        return used

    # updateref: change target at slot_pos to new element id
    def updateref(self, slot_pos: int, new_element_id: int):
        cur = self._current()
        if slot_pos < 0 or slot_pos >= len(cur.refs):
            raise BookkeepingError("slot_pos out of range")
        if new_element_id not in self.elements:
            raise BookkeepingError("New target element does not exist")
        if cur.refs[slot_pos] == 0:
            raise BookkeepingError("Slot is empty")
        before = cur.to_serializable()
        cur.refs[slot_pos] = new_element_id
        after = cur.to_serializable()
        delta = Delta(action="update", element_id=cur.id, before=before, after=after,
                      path_before=list(self.path_stack), path_after=list(self.path_stack),
                      current_element_before=self.current_element_id, current_element_after=self.current_element_id)
        self._push_delta(delta)

    # deleteref: clear slot (set to 0) only if target has >1 incoming refs after removal
    def deleteref(self, slot_pos: int):
        cur = self._current()
        if slot_pos < 0 or slot_pos >= len(cur.refs):
            raise BookkeepingError("slot_pos out of range")
        target = cur.refs[slot_pos]
        if target == 0:
            raise BookkeepingError("Slot already empty")
        incoming = self.incoming_refs(target)
        # count incoming excluding this slot
        count = sum(1 for (eid, pos) in incoming if not (eid == cur.id and pos == slot_pos))
        if count <= 0:
            raise BookkeepingError("Cannot clear slot: would orphan target (no other incoming refs)")
        before = cur.to_serializable()
        cur.refs[slot_pos] = 0
        after = cur.to_serializable()
        delta = Delta(action="update", element_id=cur.id, before=before, after=after,
                      path_before=list(self.path_stack), path_after=list(self.path_stack),
                      current_element_before=self.current_element_id, current_element_after=self.current_element_id)
        self._push_delta(delta)

    # delete element entirely (allowed only if element has no children refs)
    def delete(self, slot_pos: int):
        cur = self._current()
        if slot_pos < 0 or slot_pos >= len(cur.refs):
            raise BookkeepingError("slot_pos out of range")
        target_id = cur.refs[slot_pos]
        if target_id == 0:
            raise BookkeepingError("Slot empty")
        target_el = self.elements.get(target_id)
        if target_el is None:
            before_parent = cur.to_serializable()
            cur.refs[slot_pos] = 0
            after_parent = cur.to_serializable()
            delta = Delta(action="update", element_id=cur.id, before=before_parent, after=after_parent,
                          path_before=list(self.path_stack), path_after=list(self.path_stack),
                          current_element_before=self.current_element_id, current_element_after=self.current_element_id)
            self._push_delta(delta)
            raise BookkeepingError("Dangling reference removed (target was missing)")
        if any(child for child in target_el.refs if child):
            raise BookkeepingError("Cannot delete: target element has children refs (would orphan subtree)")
        before_deleted = target_el.to_serializable()
        before_parent = cur.to_serializable()
        # remove incoming refs across all parents (clear slots)
        incoming = self.incoming_refs(target_id)
        for (eid, pos) in incoming:
            el = self.elements.get(eid)
            if el and pos < len(el.refs) and el.refs[pos] == target_id:
                el.refs[pos] = 0
        # delete element
        if target_id in self.elements:
            del self.elements[target_id]
            self._free_id(target_id)
        # clear parent slot
        if cur.refs[slot_pos] == target_id:
            cur.refs[slot_pos] = 0
        after_parent = cur.to_serializable()
        delta = Delta(action="delete", element_id=target_id, before=before_deleted, after=None,
                      path_before=list(self.path_stack), path_after=list(self.path_stack),
                      current_element_before=self.current_element_id, current_element_after=self.current_element_id)
        parent_delta = Delta(action="update", element_id=cur.id, before=before_parent, after=after_parent,
                             path_before=list(self.path_stack), path_after=list(self.path_stack),
                             current_element_before=self.current_element_id, current_element_after=self.current_element_id)
        self._push_delta(delta)
        self._push_delta(parent_delta)

    # descend into a child by slot position (push slot pos to path_stack)
    def descend(self, slot_pos: int):
        cur = self._current()
        if slot_pos < 0 or slot_pos >= len(cur.refs):
            raise BookkeepingError("slot_pos out of range")
        if cur.refs[slot_pos] == 0:
            raise BookkeepingError("Slot empty")
        target_id = cur.refs[slot_pos]
        if target_id not in self.elements:
            raise BookkeepingError("Referenced element missing")
        before_path = list(self.path_stack)
        before_current = self.current_element_id
        self.path_stack.append(slot_pos)
        self.current_element_id = target_id
        delta = Delta(action="update", element_id=None, before=None, after=None,
                      path_before=before_path, path_after=list(self.path_stack),
                      current_element_before=before_current, current_element_after=self.current_element_id)
        self._push_delta(delta)

    def ascend(self):
        if not self.path_stack:
            raise BookkeepingError("Already at root; cannot ascend")
        before_path = list(self.path_stack)
        before_current = self.current_element_id
        self.path_stack.pop()
        cur = self.root_id
        for pos in self.path_stack:
            el = self.elements.get(cur)
            if el is None or pos < 0 or pos >= len(el.refs):
                raise BookkeepingError("Invalid path state while ascending")
            cur = el.refs[pos]
            if cur == 0 or cur not in self.elements:
                raise BookkeepingError("Invalid path state while ascending (missing element)")
        self.current_element_id = cur
        delta = Delta(action="update", element_id=None, before=None, after=None,
                      path_before=before_path, path_after=list(self.path_stack),
                      current_element_before=before_current, current_element_after=self.current_element_id)
        self._push_delta(delta)

    def _record_element_update(self, el: Element, before_state: Dict[str, Any]):
        after_state = el.to_serializable()
        delta = Delta(action="update", element_id=el.id, before=before_state, after=after_state,
                      path_before=list(self.path_stack), path_after=list(self.path_stack),
                      current_element_before=self.current_element_id, current_element_after=self.current_element_id)
        self._push_delta(delta)

    # Table ops (unchanged semantics)
    def table_add_column(self, col: str):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.add_column(col)
        self._record_element_update(el, before)

    def table_del_column(self, col: str):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.del_column(col)
        self._record_element_update(el, before)

    def table_insert_row(self, row: Dict[str, Any]) -> int:
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        idx = el.insert_row(row)
        self._record_element_update(el, before)
        return idx

    def table_update_row(self, row_idx: int, updates: Dict[str, Any]):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.update_row(row_idx, updates)
        self._record_element_update(el, before)

    def table_delete_row(self, row_idx: int):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.delete_row(row_idx)
        self._record_element_update(el, before)

    def table_move_row(self, old_idx: int, new_idx: int):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.move_row(old_idx, new_idx)
        self._record_element_update(el, before)

    def table_set_index(self, col: str):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.set_index_column(col)
        self._record_element_update(el, before)

    def table_unset_index(self, col: str):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.unset_index_column(col)
        self._record_element_update(el, before)


    def table_add_list_column(self, col: str):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.add_list_column(col)
        self._record_element_update(el, before)

    def table_del_list_column(self, col: str):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.del_list_column(col)
        self._record_element_update(el, before)

    def table_list_append(self, row_idx: int, col: str, value: Any):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.append_to_list_cell(row_idx, col, value)
        self._record_element_update(el, before)

    def table_list_insert(self, row_idx: int, col: str, index: int, value: Any):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.insert_into_list_cell(row_idx, col, index, value)
        self._record_element_update(el, before)

    def table_list_update(self, row_idx: int, col: str, index: int, value: Any):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.update_list_cell_item(row_idx, col, index, value)
        self._record_element_update(el, before)

    def table_list_delete(self, row_idx: int, col: str, index: int):
        el = self._current()
        if not isinstance(el, Table):
            raise BookkeepingError("Current element is not a Table")
        before = el.to_serializable()
        el.delete_list_cell_item(row_idx, col, index)
        self._record_element_update(el, before)

    # Graph ops
    def graph_add_node(self, node_id: str, attrs: Optional[Dict[str, Any]] = None):
        el = self._current()
        if not isinstance(el, Graph):
            raise BookkeepingError("Current element is not a Graph")
        before = el.to_serializable()
        el.add_node(node_id, attrs)
        self._record_element_update(el, before)

    def graph_del_node(self, node_id: str):
        el = self._current()
        if not isinstance(el, Graph):
            raise BookkeepingError("Current element is not a Graph")
        before = el.to_serializable()
        el.del_node(node_id)
        self._record_element_update(el, before)

    def graph_update_node(self, node_id: str, attrs: Dict[str, Any]):
        el = self._current()
        if not isinstance(el, Graph):
            raise BookkeepingError("Current element is not a Graph")
        before = el.to_serializable()
        el.update_node(node_id, attrs)
        self._record_element_update(el, before)

    def graph_add_edge(self, frm: str, to: str, meta: Optional[Dict[str, Any]] = None):
        el = self._current()
        if not isinstance(el, Graph):
            raise BookkeepingError("Current element is not a Graph")
        before = el.to_serializable()
        el.add_edge(frm, to, meta)
        self._record_element_update(el, before)

    def graph_del_edge(self, frm: str, to: str):
        el = self._current()
        if not isinstance(el, Graph):
            raise BookkeepingError("Current element is not a Graph")
        before = el.to_serializable()
        el.del_edge(frm, to)
        self._record_element_update(el, before)

    def graph_set_node_index(self, attr: str):
        el = self._current()
        if not isinstance(el, Graph):
            raise BookkeepingError("Current element is not a Graph")
        before = el.to_serializable()
        el.set_node_index(attr)
        self._record_element_update(el, before)

    def graph_unset_node_index(self, attr: str):
        el = self._current()
        if not isinstance(el, Graph):
            raise BookkeepingError("Current element is not a Graph")
        before = el.to_serializable()
        el.unset_node_index(attr)
        self._record_element_update(el, before)

    def graph_lookup_nodes(self, attr: str, value: Any):
        el = self._current()
        if not isinstance(el, Graph):
            raise BookkeepingError("Current element is not a Graph")
        # Works with adjacency table: lookup in attrs for matching value
        if attr not in el.indexed_node_attrs:
            raise BookkeepingError("Node attribute not indexed")
        nids = el.node_index_maps.get(attr, {}).get(value, [])
        return [{ "node_id": nid, "attrs": el.adj[nid]["attrs"] } for nid in nids]


    # KVP ops
    def kv_set(self, key: str, value: Any):
        el = self._current()
        if not isinstance(el, KeyValuePair):
            raise BookkeepingError("Current element is not a KeyValuePair")
        before = el.to_serializable()
        el.set(key, value)
        self._record_element_update(el, before)

    def kv_get(self, key: str):
        el = self._current()
        if not isinstance(el, KeyValuePair):
            raise BookkeepingError("Current element is not a KeyValuePair")
        return el.get(key)

    def kv_delete(self, key: str):
        el = self._current()
        if not isinstance(el, KeyValuePair):
            raise BookkeepingError("Current element is not a KeyValuePair")
        before = el.to_serializable()
        el.delete(key)
        self._record_element_update(el, before)

    def kv_set_index(self, key: str):
        el = self._current()
        if not isinstance(el, KeyValuePair):
            raise BookkeepingError("Current element is not a KeyValuePair")
        before = el.to_serializable()
        el.set_index_key(key)
        self._record_element_update(el, before)

    def kv_unset_index(self, key: str):
        el = self._current()
        if not isinstance(el, KeyValuePair):
            raise BookkeepingError("Current element is not a KeyValuePair")
        before = el.to_serializable()
        el.unset_index_key(key)
        self._record_element_update(el, before)

    '''
    # ---- binary save/load using struct + length-prefixed element payloads (payloads are JSON bytes)
    # File format:
    # [magic 8][version 4][element_count 4]
    # then repeated element_count times:
    #   [id 4][payload_len 8][payload bytes]
    # finally meta block: [meta_len 8][meta bytes]
    def save_to_file(self, filepath: str):
        recs: List[Tuple[int, bytes]] = []
        for eid, el in self.elements.items():
            serial = el.to_serializable()
            payload = json.dumps(serial, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            recs.append((eid, payload))
        meta = {"current_element_id": self.current_element_id,
                "path_stack": list(self.path_stack),
                "root_id": self.root_id,
                "next_id": self._next_id,
                "free_ids": list(self._free_ids)}
        meta_bytes = json.dumps(meta, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        with open(filepath, "wb") as f:
            f.write(FILE_MAGIC.ljust(8, b"\x00")[:8])
            f.write(struct.pack(U32, FILE_VERSION))
            f.write(struct.pack(U32, len(recs)))
            for eid, payload in recs:
                f.write(struct.pack(U32, int(eid)))
                f.write(struct.pack("<Q", len(payload)))
                f.write(payload)
            f.write(struct.pack("<Q", len(meta_bytes)))
            f.write(meta_bytes)

    def load_from_file(self, filepath: str):
        if not os.path.exists(filepath):
            raise BookkeepingError("File not found")
        with open(filepath, "rb") as f:
            magic = f.read(8)
            if magic[:7] != FILE_MAGIC[:7]:
                raise BookkeepingError("Not a bookkeeping binary file (bad magic)")
            (version,) = struct.unpack(U32, f.read(4))
            if version != FILE_VERSION:
                raise BookkeepingError("Unsupported file version")
            (count,) = struct.unpack(U32, f.read(4))
            new_elements: Dict[int, Element] = {}
            for _ in range(count):
                (eid,) = struct.unpack(U32, f.read(4))
                (plen,) = struct.unpack("<Q", f.read(8))
                pdata = f.read(plen)
                data = json.loads(pdata.decode("utf-8"))
                el = ElementFactory.from_serializable(data)
                new_elements[el.id] = el
            (meta_len,) = struct.unpack("<Q", f.read(8))
            meta_bytes = f.read(meta_len)
            meta = json.loads(meta_bytes.decode("utf-8"))
            # install
            self.elements = new_elements
            self._next_id = int(meta.get("next_id", max(self.elements.keys()) + 1 if self.elements else 1))
            self._free_ids = list(meta.get("free_ids", []))
            root_id_loaded = meta.get("root_id")
            if root_id_loaded is not None and int(root_id_loaded) in self.elements:
                self.root_id = int(root_id_loaded)
            else:
                if self.elements:
                    self.root_id = min(self.elements.keys())
                else:
                    rid = self._alloc_id()
                    root = KeyValuePair("root", element_id=rid)
                    self.elements[rid] = root
                    self.root_id = rid
            current_element_id = meta.get("current_element_id")
            if current_element_id is not None and int(current_element_id) in self.elements:
                self.current_element_id = int(current_element_id)
            else:
                self.current_element_id = self.root_id
            path_stack = meta.get("path_stack", [])
            # validate path_stack (positions)
            valid = True
            cur = self.root_id
            for pos in path_stack:
                el = self.elements.get(cur)
                if el is None or pos < 0 or pos >= len(el.refs) or el.refs[pos] == 0 or el.refs[pos] not in self.elements:
                    valid = False
                    break
                cur = el.refs[pos]
            if valid:
                self.path_stack = list(path_stack)
            else:
                self.path_stack = []
            self._history.clear()
            self._hist_ptr = -1
    '''

        # ---- JSON save/load (human-readable) ----
    def save_to_file(self, filepath: str):
        data = {
            "elements": [el.to_serializable() for el in self.elements.values()],
            "meta": {
                "current_element_id": self.current_element_id,
                "path_stack": list(self.path_stack),
                "root_id": self.root_id,
                "next_id": self._next_id,
                "free_ids": list(self._free_ids)
            }
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"), ensure_ascii=False)

    def load_from_file(self, filepath: str):
        if not os.path.exists(filepath):
            raise BookkeepingError("File not found")
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        new_elements: Dict[int, Element] = {}
        for el_data in data.get("elements", []):
            el = ElementFactory.from_serializable(el_data)
            new_elements[el.id] = el
        self.elements = new_elements
        meta = data.get("meta", {})
        self._next_id = int(meta.get("next_id", max(self.elements.keys()) + 1 if self.elements else 1))
        self._free_ids = list(meta.get("free_ids", []))
        root_id_loaded = meta.get("root_id")
        if root_id_loaded is not None and int(root_id_loaded) in self.elements:
            self.root_id = int(root_id_loaded)
        else:
            if self.elements:
                self.root_id = min(self.elements.keys())
            else:
                rid = self._alloc_id()
                root = KeyValuePair("root", element_id=rid)
                self.elements[rid] = root
                self.root_id = rid
        current_element_id = meta.get("current_element_id")
        if current_element_id is not None and int(current_element_id) in self.elements:
            self.current_element_id = int(current_element_id)
        else:
            self.current_element_id = self.root_id
        path_stack = meta.get("path_stack", [])
        # validate path_stack
        valid = True
        cur = self.root_id
        for pos in path_stack:
            el = self.elements.get(cur)
            if el is None or pos < 0 or pos >= len(el.refs) or el.refs[pos] == 0 or el.refs[pos] not in self.elements:
                valid = False
                break
            cur = el.refs[pos]
        self.path_stack = list(path_stack) if valid else []
        self._history.clear()
        self._hist_ptr = -1


    def validate_pointer(self, pointer: IndexPointer) -> bool:
        if pointer.target_element_id not in self.elements:
            return False
        target = self.elements[pointer.target_element_id]
        return target.has_index_key(pointer.target_index_key)

    def resolve_pointer(self, pointer: IndexPointer) -> Any:
        if not self.validate_pointer(pointer):
            raise BookkeepingError("Invalid pointer")
        target = self.elements[pointer.target_element_id]
        if isinstance(target, Table):
            return target.index_maps[pointer.target_index_key]
        if isinstance(target, Graph):
            return target.node_index_maps[pointer.target_index_key]
        if isinstance(target, KeyValuePair):
            return {pointer.target_index_key: target.store.get(pointer.target_index_key)}
        raise BookkeepingError("Unsupported target type")

def parse_value(token: str):
    if token.startswith("ptr:"):
        body = token[len("ptr:"):]
        if "::" not in body:
            raise BookkeepingError("ptr must be ptr:<element_id>::<index_key>")
        eid_s, k = body.split("::", 1)
        try:
            eid = int(eid_s)
        except ValueError:
            raise BookkeepingError("Invalid element id in pointer")
        return IndexPointer(eid, k)
    try:
        return int(token)
    except ValueError:
        pass
    try:
        return float(token)
    except ValueError:
        pass
    if token.lower() in ("true", "false"):
        return token.lower() == "true"
    if (token.startswith('"') and token.endswith('"')) or (token.startswith("'") and token.endswith("'")):
        return token[1:-1]
    return token

def parse_kvs(tokens: List[str]) -> Dict[str, Any]:
    out = {}
    for t in tokens:
        if "=" not in t:
            raise BookkeepingError("expected key=value tokens")
        k, v = t.split("=", 1)
        out[k] = parse_value(v)
    return out



# --------------------------------------------

"""
A curses-based TUI for PyBookkeeping with Vim-like modal editing.

Modes:
- Normal: navigation + registry ops
- Table: table operations
- Graph: graph operations
- KVP: key-value operations
- Command: for :w, :wq, :q, :q!, :load <file>

ESC always aborts or returns to Normal.
"""


class Mode(Enum):
    NORMAL = auto()
    TABLE = auto()
    GRAPH = auto()
    KVP = auto()
    COMMAND = auto()


@dataclass
class Cursor:
    slot_index: int = 0
    row: int = 0
    col: int = 0


@dataclass
class Status:
    message: str = ""
    error: bool = False


def clamp(value: int, lo: int, hi: int) -> int:
    if hi < lo:
        return lo
    return max(lo, min(value, hi))


def draw_text(stdscr: "curses._CursesWindow", y: int, x: int, text: str, attr: int = 0) -> None:
    max_y, max_x = stdscr.getmaxyx()
    if y < 0 or y >= max_y:
        return
    if x < 0:
        x = 0
    stdscr.addnstr(y, x, text, max_x - x - 1, attr)


class TUIApp:
    TITLE: Final[str] = "PyBookkeeping - TUI"

    def __init__(self, registry: Optional[ElementRegistry] = None) -> None:
        self.reg: ElementRegistry = registry or ElementRegistry()
        self.cursor: Cursor = Cursor(0)
        self.status: Status = Status()
        self.mode: Mode = Mode.NORMAL
        self.key_buffer: str = ""
        self.command_line: str = ""
        self.file_path: Optional[str] = None

        # ---------- Dispatch Tables ----------
        self.table_commands = {
            "a": self._table_add_column,
            "A": self._table_add_list_column,
            "d": self._table_delete_column,
            "i": self._table_insert_row,
            "x": self._table_delete_row,
            "m": self._table_move_row,
            "U": self._table_update_row,
            "s": self._table_set_index,
            "S": self._table_unset_index,
            "l": self._table_list_append,
            "L": self._table_list_insert,
            "r": self._table_list_update,
            "X": self._table_list_delete,
        }

        self.graph_commands = {
            "a": self._graph_add_node,
            "d": self._graph_del_node,
            "U": self._graph_update_node,
            "e": self._graph_add_edge,
            "E": self._graph_del_edge,
            "s": self._graph_set_index,
            "S": self._graph_unset_index,
            "f": self._graph_find_nodes,
        }

        self.kvp_commands = {
            "a": self._kvp_set,           # add/set
            "U": self._kvp_set,           # update = set
            "g": self._kvp_get,
            "d": self._kvp_delete,
            "i": self._kvp_set_index,
            "I": self._kvp_unset_index,
        }

    # ---------- Mode Switching ----------
    def enter_mode_for_element(self) -> None:
        el = self.reg._current()
        t = getattr(el, "TYPE_CODE", None)
        if t == "Table":
            self.mode = Mode.TABLE
            self.cursor = Cursor(0)
            self.set_status("Entered Table mode")
        elif t == "Graph":
            self.mode = Mode.GRAPH
            self.cursor = Cursor(0)
            self.set_status("Entered Graph mode")
        elif t == "KeyValuePair":
            self.mode = Mode.KVP
            self.cursor = Cursor(0)
            self.set_status("Entered KVP mode")
        else:
            self.set_status("Element not Table/Graph/KVP", error=True)

    def reset_mode(self) -> None:
        self.mode = Mode.NORMAL
        self.key_buffer = ""
        if not self.status.message:
            self.set_status("Normal mode")

    # ---------- Cursor navigation ----------
    def _current_slots(self) -> List[int]:
        el = self.reg._current()
        return list(getattr(el, "refs", []))

    def move_cursor(self, delta: int) -> None:
        slots = self._current_slots()
        n = len(slots)
        if n == 0:
            self.cursor = Cursor(0)
            return
        new_idx = clamp(self.cursor.slot_index + delta, 0, n - 1)
        self.cursor = Cursor(new_idx)

    # ---------- Status ----------
    def set_status(self, msg: str, *, error: bool = False) -> None:
        self.status = Status(msg, error)

    # ---------- Rendering ----------
    def _render_header(self, stdscr: "curses._CursesWindow") -> int:
        el = self.reg._current()
        name = getattr(el, "name", "?")
        eid = getattr(self.reg, "current_element_id", -1)
        mode_name = self.mode.name
        file_part = f" | {self.file_path}" if self.file_path else ""
        header = f" {self.TITLE} | Mode: {mode_name} | {name}#{eid}{file_part} "
        max_y, max_x = stdscr.getmaxyx()
        draw_text(stdscr, 0, 0, header.ljust(max_x - 1), curses.A_REVERSE)
        return 1

    def _render_slots(self, stdscr: "curses._CursesWindow", start_y: int) -> None:
        slots = self._current_slots()
        max_y, max_x = stdscr.getmaxyx()
        for i, eid in enumerate(slots):
            sel = (i == self.cursor.slot_index)
            label = f"{i:>3} -> {eid:<4} "
            details = "<empty>"
            if eid != 0 and eid in self.reg.elements:
                target = self.reg.elements[eid]
                details = f"{getattr(target, 'TYPE_CODE', '?')} '{getattr(target, 'name', '?')}'"
            draw_text(stdscr, start_y + i, 0,
                      (label + details).ljust(max_x - 1),
                      curses.A_STANDOUT if sel else 0)
        if not slots:
            draw_text(stdscr, start_y, 0, "<no slots>")

    def _render_element_pprint(self, stdscr: "curses._CursesWindow", start_y: int) -> None:
        el = self.reg._current()
        try:
            content = pformat(el.to_serializable(), indent=2, width=80, compact=False)
        except Exception as e:
            content = f"<error rendering element: {e}>"
        for i, line in enumerate(content.splitlines()):
            draw_text(stdscr, start_y + i, 0, line)

    def _render_footer(self, stdscr: "curses._CursesWindow") -> None:
        max_y, max_x = stdscr.getmaxyx()
        if self.mode == Mode.COMMAND:
            draw_text(stdscr, max_y - 1, 0, f":{self.command_line}")
        else:
            status_attr = curses.A_BOLD | (curses.A_REVERSE if self.status.error else 0)
            draw_text(stdscr, max_y - 1, 0,
                      f" {self.status.message} ".ljust(max_x - 1),
                      status_attr)

    # ---------- Input handling ----------
    def handle_input(self, ch: int, stdscr: "curses._CursesWindow") -> bool:
        if ch == 27:  # ESC
            self.reset_mode()
            return True
        if self.mode == Mode.NORMAL:
            return self._handle_normal(ch)
        elif self.mode == Mode.TABLE:
            return self._dispatch(self.table_commands, ch, stdscr)
        elif self.mode == Mode.GRAPH:
            return self._dispatch(self.graph_commands, ch, stdscr)
        elif self.mode == Mode.KVP:
            return self._dispatch(self.kvp_commands, ch, stdscr)
        elif self.mode == Mode.COMMAND:
            return self._handle_command(ch)
        return True

    def _dispatch(self, commands: Dict[str, "Callable"], ch: int, stdscr) -> bool:
        try:
            key = chr(ch) if 0 <= ch < 256 else None
            if key in commands:
                commands[key](stdscr)
            elif ch == ord(":"):
                self.mode = Mode.COMMAND
                self.command_line = ""
                self.set_status("")
            elif key == "u":
                self.reg.undo()
                self.set_status("Undo successful")
            elif ch == 18:  # Ctrl-r
                self.reg.redo()
                self.set_status("Redo successful")
            elif key == "H":
                hist = self.reg.list_history()
                self.set_status(f"History: {hist}")
            return True
        except BookkeepingError as e:
            self.set_status(str(e), error=True)
            return True

    # ---------- Prompt & Sanitizers ----------
    def _prompt_user(self, stdscr, prompt: str) -> Optional[str]:
        """
        Prompt the user for input.
        Returns the string entered, or None if Esc pressed.
        """
        curses.echo(False)
        stdscr.addstr(curses.LINES - 1, 0, prompt + ": ")
        stdscr.clrtoeol()
        stdscr.refresh()

        buf: list[str] = []
        while True:
            ch = stdscr.getch()

            if ch in (curses.KEY_ENTER, 10, 13):  # Enter
                text = "".join(buf).strip()
                return text if text else None

            elif ch == 27:  # Esc
                self.set_status("Aborted")
                return None

            elif ch in (curses.KEY_BACKSPACE, 127, 8):
                if buf:
                    buf.pop()
                    y, x = stdscr.getyx()
                    if x > len(prompt) + 2:
                        stdscr.move(y, x - 1)
                        stdscr.delch()

            elif 32 <= ch < 127:
                buf.append(chr(ch))
                stdscr.addch(ch)

            stdscr.refresh()

    def _safe_int(self, stdscr, prompt: str) -> Optional[int]:
        raw = self._prompt_user(stdscr, prompt)
        if raw is None or not raw.strip():
            return None
        try:
            return int(raw.strip())
        except ValueError:
            self.set_status(f"Invalid integer: {raw}", error=True)
            return None

    def _safe_value(self, stdscr, prompt: str):
        raw = self._prompt_user(stdscr, prompt)
        if raw is None or not raw.strip():
            return None
        try:
            return parse_value(raw.strip())
        except BookkeepingError as e:
            self.set_status(str(e), error=True)
            return None

    def _safe_kvs(self, stdscr, prompt: str):
        raw = self._prompt_user(stdscr, prompt)
        if raw is None or not raw.strip():
            return None
        try:
            return parse_kvs(shlex.split(raw.strip()))
        except BookkeepingError as e:
            self.set_status(str(e), error=True)
            return None

    # ---------- Keep existing normal & command handlers ----------
    # (We reuse _handle_normal and _handle_command from the original implementation.)

    # ---------- Table Commands ----------
    def _table_add_column(self, stdscr):
        col = self._prompt_user(stdscr, "Column name")
        if col:
            self.reg.table_add_column(col)
            self.set_status(f"Added column {col}")

    def _table_add_list_column(self, stdscr):
        col = self._prompt_user(stdscr, "List column name")
        if col:
            self.reg.table_add_list_column(col)
            self.set_status(f"Added list column {col}")

    def _table_delete_column(self, stdscr):
        col = self._prompt_user(stdscr, "Column to delete")
        if col:
            self.reg.table_del_column(col)
            self.set_status(f"Deleted column {col}")

    def _table_insert_row(self, stdscr):
        kv = self._safe_kvs(stdscr, "Row data key=value ...")
        if kv:
            idx = self.reg.table_insert_row(kv)
            self.set_status(f"Inserted row #{idx}")

    def _table_delete_row(self, stdscr):
        idx = self._safe_int(stdscr, "Row index")
        if idx is not None:
            self.reg.table_delete_row(idx)
            self.set_status(f"Deleted row #{idx}")

    def _table_move_row(self, stdscr):
        old_idx = self._safe_int(stdscr, "Old index")
        new_idx = self._safe_int(stdscr, "New index")
        if old_idx is not None and new_idx is not None:
            self.reg.table_move_row(old_idx, new_idx)
            self.set_status(f"Moved row {old_idx} -> {new_idx}")

    def _table_update_row(self, stdscr):
        idx = self._safe_int(stdscr, "Row index")
        kv = self._safe_kvs(stdscr, "Updates key=value ...")
        if idx is not None and kv:
            self.reg.table_update_row(idx, kv)
            self.set_status(f"Updated row #{idx}")

    def _table_set_index(self, stdscr):
        col = self._prompt_user(stdscr, "Column to index")
        if col:
            self.reg.table_set_index(col)
            self.set_status(f"Indexed column {col}")

    def _table_unset_index(self, stdscr):
        col = self._prompt_user(stdscr, "Column to unindex")
        if col:
            self.reg.table_unset_index(col)
            self.set_status(f"Unindexed column {col}")

    def _table_list_append(self, stdscr):
        idx = self._safe_int(stdscr, "Row index")
        col = self._prompt_user(stdscr, "List column")
        val = self._safe_value(stdscr, "Value to append")
        if idx is not None and col and val is not None:
            self.reg.table_list_append(idx, col, val)
            self.set_status(f"Appended to {col} in row {idx}")

    def _table_list_insert(self, stdscr):
        idx = self._safe_int(stdscr, "Row index")
        col = self._prompt_user(stdscr, "List column")
        pos = self._safe_int(stdscr, "Insert position")
        val = self._safe_value(stdscr, "Value")
        if idx is not None and col and pos is not None and val is not None:
            self.reg.table_list_insert(idx, col, pos, val)
            self.set_status(f"Inserted in {col}[{pos}] row {idx}")

    def _table_list_update(self, stdscr):
        idx = self._safe_int(stdscr, "Row index")
        col = self._prompt_user(stdscr, "List column")
        pos = self._safe_int(stdscr, "Position")
        val = self._safe_value(stdscr, "New value")
        if idx is not None and col and pos is not None and val is not None:
            self.reg.table_list_update(idx, col, pos, val)
            self.set_status(f"Updated {col}[{pos}] row {idx}")

    def _table_list_delete(self, stdscr):
        idx = self._safe_int(stdscr, "Row index")
        col = self._prompt_user(stdscr, "List column")
        pos = self._safe_int(stdscr, "Position")
        if idx is not None and col and pos is not None:
            self.reg.table_list_delete(idx, col, pos)
            self.set_status(f"Deleted from {col}[{pos}] row {idx}")

    # ---------- Graph Commands ----------
    def _graph_add_node(self, stdscr):
        nid = self._prompt_user(stdscr, "Node ID")
        kv = self._safe_kvs(stdscr, "Attrs key=value ... (optional)")
        if nid:
            self.reg.graph_add_node(nid, kv or {})
            self.set_status(f"Added node {nid}")

    def _graph_del_node(self, stdscr):
        nid = self._prompt_user(stdscr, "Node ID")
        if nid:
            self.reg.graph_del_node(nid)
            self.set_status(f"Deleted node {nid}")

    def _graph_update_node(self, stdscr):
        nid = self._prompt_user(stdscr, "Node ID")
        kv = self._safe_kvs(stdscr, "Updates key=value ...")
        if nid and kv:
            self.reg.graph_update_node(nid, kv)
            self.set_status(f"Updated node {nid}")

    def _graph_add_edge(self, stdscr):
        frm = self._prompt_user(stdscr, "From node")
        to = self._prompt_user(stdscr, "To node")
        kv = self._safe_kvs(stdscr, "Meta key=value ... (optional)")
        if frm and to:
            self.reg.graph_add_edge(frm, to, kv or {})
            self.set_status(f"Added edge {frm}->{to}")

    def _graph_del_edge(self, stdscr):
        frm = self._prompt_user(stdscr, "From node")
        to = self._prompt_user(stdscr, "To node")
        if frm and to:
            self.reg.graph_del_edge(frm, to)
            self.set_status(f"Deleted edge {frm}->{to}")

    def _graph_set_index(self, stdscr):
        attr = self._prompt_user(stdscr, "Attr to index")
        if attr:
            self.reg.graph_set_node_index(attr)
            self.set_status(f"Indexed {attr}")

    def _graph_unset_index(self, stdscr):
        attr = self._prompt_user(stdscr, "Attr to unindex")
        if attr:
            self.reg.graph_unset_node_index(attr)
            self.set_status(f"Unindexed {attr}")

    def _graph_find_nodes(self, stdscr):
        attr = self._prompt_user(stdscr, "Attr name")
        val = self._safe_value(stdscr, "Value")
        if attr and val is not None:
            res = self.reg.graph_lookup_nodes(attr, val)
            self.set_status(f"Found: {res}")

    # ---------- KVP Commands ----------
    def _kvp_set(self, stdscr):
        key = self._prompt_user(stdscr, "Key")
        val = self._safe_value(stdscr, "Value")
        if key and val is not None:
            self.reg.kv_set(key, val)
            self.set_status(f"Set {key}={val}")

    def _kvp_get(self, stdscr):
        key = self._prompt_user(stdscr, "Key")
        if key:
            try:
                val = self.reg.kv_get(key)
                self.set_status(f"{key}={val}")
            except BookkeepingError as e:
                self.set_status(str(e), error=True)

    def _kvp_delete(self, stdscr):
        key = self._prompt_user(stdscr, "Key")
        if key:
            self.reg.kv_delete(key)
            self.set_status(f"Deleted {key}")

    def _kvp_set_index(self, stdscr):
        key = self._prompt_user(stdscr, "Key to index")
        if key:
            self.reg.kv_set_index(key)
            self.set_status(f"Indexed key {key}")

    def _kvp_unset_index(self, stdscr):
        key = self._prompt_user(stdscr, "Key to unindex")
        if key:
            self.reg.kv_unset_index(key)
            self.set_status(f"Unindexed key {key}")

    # ---------- Existing Normal/Command/Run from original ----------
    # We keep _handle_normal, _handle_command, _cmd_save, _cmd_load, run as-is in the file.





    def _handle_normal(self, ch: int) -> bool:
        if ch == ord("j"):
            self.move_cursor(1)
        elif ch == ord("k"):
            self.move_cursor(-1)
        elif ch == ord("h"):
            try:
                self.reg.ascend()
                self.set_status("ascend")
            except BookkeepingError as e:
                self.set_status(str(e), error=True)
        elif ch == ord("l"):
            try:
                self.reg.descend(self.cursor.slot_index)
                self.set_status(f"descend {self.cursor.slot_index}")
            except BookkeepingError as e:
                self.set_status(str(e), error=True)
        elif ch == ord("i"):
            self.enter_mode_for_element()
        elif ch == ord("q"):
            return False
        elif ch == ord(":"):
            self.mode = Mode.COMMAND
            self.command_line = ""
            self.set_status("")
        elif ch == ord("u"):  # undo
            try:
                self.reg.undo()
                self.set_status("Undo successful")
            except BookkeepingError as e:
                self.set_status(str(e), error=True)
        elif ch == 18:  # Ctrl-r for redo
            try:
                self.reg.redo()
                self.set_status("Redo successful")
            except BookkeepingError as e:
                self.set_status(str(e), error=True)
        elif ch == ord("H"):  # show history
            hist = self.reg.list_history()
            self.set_status(f"History: {hist}")

        return True


    def _handle_command(self, ch: int) -> bool:
        if ch in (10, 13):
            cmd = self.command_line.strip()
            if cmd.startswith("load "):
                path = cmd.partition(" ")[2].strip()
                self._cmd_load(path)
            elif cmd.startswith("w"):
                path = cmd.partition(" ")[2].strip() or self.file_path
                self._cmd_save(path)
                if cmd.startswith("wq"):
                    return False
            elif cmd in ("q", "q!"):
                return False
            self.reset_mode()
        elif ch in (curses.KEY_BACKSPACE, 127, 8):
            self.command_line = self.command_line[:-1]
        else:
            try:
                self.command_line += chr(ch)
            except ValueError:
                pass
        return True


    def _cmd_save(self, path: Optional[str]) -> None:
        if not path:
            self.set_status("No file path", error=True)
            return
        try:
            self.reg.save_to_file(path)
            self.file_path = path
            self.set_status(f"Saved to {path}")
        except BookkeepingError as e:
            self.set_status(str(e), error=True)

    def _cmd_load(self, path: str) -> None:
        if not path:
            self.set_status("Usage: :load <file>", error=True)
            return
        try:
            self.reg.load_from_file(path)
            self.cursor = Cursor(0)
            self.file_path = path
            self.set_status(f"Loaded {path}")
        except BookkeepingError as e:
            self.set_status(str(e), error=True)

    # ---------- Main loop ----------
    def run(self, stdscr: "curses._CursesWindow") -> None:
        curses.curs_set(0)
        stdscr.nodelay(False)
        stdscr.keypad(True)
        self.set_status("PyBookkeeping initialized")
        while True:
            stdscr.erase()
            top = self._render_header(stdscr)
            if self.mode == Mode.NORMAL:
                self._render_slots(stdscr, top)
            elif self.mode in (Mode.TABLE, Mode.GRAPH, Mode.KVP):
                self._render_element_pprint(stdscr, top)
            self._render_footer(stdscr)
            stdscr.refresh()

            ch = stdscr.getch()
            if not self.handle_input(ch, stdscr):
                break




    def _cmd_load(self, path: str) -> None:
        if not path:
            self.set_status("Usage: :load <file>", error=True)
            return
        try:
            self.reg.load_from_file(path)
            self.cursor = Cursor(0)
            self.file_path = path
            self.set_status(f"Loaded {path}")
        except BookkeepingError as e:
            self.set_status(str(e), error=True)

    # ---------- Main loop ----------
    def run(self, stdscr: "curses._CursesWindow") -> None:
        curses.curs_set(0)
        stdscr.nodelay(False)
        stdscr.keypad(True)
        self.set_status("PyBookkeeping initialized")
        while True:
            stdscr.erase()
            top = self._render_header(stdscr)
            if self.mode == Mode.NORMAL:
                self._render_slots(stdscr, top)
            elif self.mode in (Mode.TABLE, Mode.GRAPH, Mode.KVP):
                self._render_element_pprint(stdscr, top)
            self._render_footer(stdscr)
            stdscr.refresh()

            ch = stdscr.getch()
            if not self.handle_input(ch, stdscr):
                break



    def run(self, stdscr: "curses._CursesWindow") -> None:
        curses.curs_set(0)
        stdscr.nodelay(False)
        stdscr.keypad(True)
        self.set_status("PyBookkeeping initialized")
        while True:
            stdscr.erase()
            top = self._render_header(stdscr)
            if self.mode == Mode.NORMAL:
                self._render_slots(stdscr, top)
            elif self.mode in (Mode.TABLE, Mode.GRAPH, Mode.KVP):
                self._render_element_pprint(stdscr, top)
            self._render_footer(stdscr)
            stdscr.refresh()

            ch = stdscr.getch()
            if not self.handle_input(ch, stdscr):
                break



# ---------- Entrypoint ----------
def main() -> None:
    app = TUIApp()
    curses.wrapper(app.run)


if __name__ == "__main__":
    main()

