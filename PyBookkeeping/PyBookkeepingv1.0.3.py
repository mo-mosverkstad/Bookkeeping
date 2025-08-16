#!/usr/bin/env python3
"""PyBookkeeping_all_changes.py

Changes:
- Parent refs are stable slots: Element.refs is a list of ints; 0 means empty slot. Removing a child leaves a 0 slot.
  Adding a child reuses the first empty slot if any, otherwise appends (so positions are stable).
- CLI path prints last 3 segments with '...' prefix when longer.
- Binary save/load uses struct for all integer packing and length-prefixing element payloads. Element internals are JSON-encoded
  but stored as binary payloads framed with struct (fully binary file container).
- Other behaviors preserved (element ids allocated, free id reuse, undo/redo, etc).
"""
from __future__ import annotations
import json
import shlex
import os
import struct
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from abc import ABC, abstractmethod
import pprint

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

# ---- CLI ----
HELP = """
PyBookkeeping CLI — Help
=========================

This program manages a hierarchy of elements (Tables, Graphs, Key/Value stores)
connected through *stable slots*. Each element can reference others, forming a
navigable structure. You can save/load your work and use undo/redo at any time.

General Commands
----------------
  help                        Show this help text
  info                        Show root, current element, and path stack
  list                        List slots in the current element (slot -> element)
  inspect <slot>              Show full data of element at a slot
  show                        Show a short summary (info) of the current element
  to_dict                     Print the current element as a dictionary

Navigation
----------
  descend <slot>              Move into the child element at slot (push path)
  ascend / up                 Return to parent element (pop path)
  history                     Show undo/redo history
  undo / redo                 Step backwards/forwards in history

Element Management
------------------
  create <type> <name> [slot] Create a new element in the first free slot (or given slot)
                              Types: table, graph, kvp
  createref [slot] <id>       Insert an existing element into a slot
  updateref <slot> <id>       Change the element stored in a slot
  deleteref <slot>            Clear a slot (if target still referenced elsewhere)
  delete <slot>               Delete the element at a slot (only if it has no children)

Persistence
-----------
  save <file>                 Save the registry to a file (JSON format)
  load <file>                 Load registry from a file
  exit / quit                 Leave the program

Table Commands (when inside a Table element)
--------------------------------------------
  tbl.add_col <name>          Add a new column
  tbl.del_col <name>          Delete a column
  tbl.add_list_col <name>     Add a column that stores lists
  tbl.del_list_col <name>     Delete a list column
  tbl.insert_row k=v ...      Insert a row with values
  tbl.update_row <i> k=v ...  Update row i
  tbl.del_row <i>             Delete row i
  tbl.move_row <old> <new>    Move row from old index to new
  tbl.set_index <col>         Index a column
  tbl.unset_index <col>       Remove index
  tbl.lookup <col> <val>      Query by index
  tbl.list_append <row> <col> <val>
  tbl.list_insert <row> <col> <idx> <val>
  tbl.list_update <row> <col> <idx> <val>
  tbl.list_del <row> <col> <idx>
  tbl.show_rows               Print all rows

Graph Commands (when inside a Graph element)
--------------------------------------------
  g.add_node <id> [k=v...]    Add a node with optional attributes
  g.del_node <id>             Delete a node
  g.update_node <id> k=v ...  Update node attributes
  g.add_edge <from> <to> [k=v...]  Add an edge with optional metadata
  g.del_edge <from> <to>      Remove an edge
  g.set_node_index <attr>     Index node attribute
  g.unset_node_index <attr>   Remove node attribute index
  g.lookup_nodes <attr> <val> Find nodes by attribute value
  g.show                      Show full adjacency table

Key/Value Pair Commands (when inside a KVP element)
---------------------------------------------------
  kv.set <key> <val>          Set key -> value
  kv.get <key>                Get value by key
  kv.del <key>                Delete a key
  kv.set_index <key>          Index a key
  kv.unset_index <key>        Remove index
  kv.lookup <key>             Lookup indexed key

Notes
-----
- Slots are stable: empty slots are kept as 0, and reused when possible.
- Element IDs are unique; you can refer to elements by name or ID.
- Pointers are written as ptr:<element_id>::<index_key>.
- Use quotes for strings with spaces, e.g. tbl.insert_row name="Alice Smith".
"""


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

class CLI:
    def __init__(self):
        self.reg = ElementRegistry()
        self.running = True

    def _format_path(self) -> str:
        # Build readable segments from path_stack: each segment as name#id
        segments: List[str] = []
        cur = self.reg.root_id
        for pos in self.reg.path_stack:
            el = self.reg.elements.get(cur)
            if el is None or pos < 0 or pos >= len(el.refs):
                segments.append("<?>" )
                cur = -1
            else:
                child_id = el.refs[pos]
                child = self.reg.elements.get(child_id)
                if child:
                    segments.append(f"{child.name}#{child.id}")
                    cur = child_id
                else:
                    segments.append(f"MISSING#{child_id}")
                    cur = -1
        if not segments:
            segs = [f"{self.reg.get_element(self.reg.root_id).name}#{self.reg.root_id}"]
        else:
            segs = segments
        if len(segs) > 3:
            segs = ["..."] + segs[-3:]
        return "/".join(segs)

    def run(self):
        print("Bookkeeping CLI (stable slots). Type 'help'.")
        while self.running:
            try:
                cur = self.reg.current_element_id
                cur_name = self.reg.get_element(cur).name if cur in self.reg.elements else "???"
                path = self._format_path()
                prompt = f"[{path} {cur_name}#{cur}]"
                line = input(f"{prompt}> ").strip()
                if not line:
                    continue
                self.handle(line)
            except BookkeepingError as e:
                print("Error:", e)
            except KeyboardInterrupt:
                print("\nInterrupted. Type 'exit' to quit.")
            except Exception as e:
                print("Unexpected error:", e)

    def _resolve(self, token: str) -> int:
        try:
            eid = int(token)
            if eid in self.reg.elements:
                return eid
        except ValueError:
            pass
        matches = self.reg.find_by_name(token)
        if matches:
            return matches[0].id
        raise BookkeepingError("Element not found by id or name")

    def handle(self, line: str):
        parts = shlex.split(line)
        if not parts:
            return
        cmd = parts[0].lower()
        if cmd == "help":
            print(HELP)
            return
        if cmd in ("exit", "quit"):
            self.running = False
            print("Bye.")
            return
        if cmd == "info":
            print("root id:", self.reg.root_id)
            print("current id:", self.reg.current_element_id)
            print("path stack:", self.reg.path_stack)
            return
        if cmd == "history":
            for h in self.reg.list_history():
                print(h)
            return
        if cmd == "undo":
            self.reg.undo()
            print("Undone")
            return
        if cmd == "redo":
            self.reg.redo()
            print("Redone")
            return

        if cmd == "create":
            # create <type> <name> [<slot_pos>]
            if len(parts) < 3:
                raise BookkeepingError("create <type> <name> [<slot_pos>]")
            etype = parts[1]
            name = parts[2]
            slot = None
            if len(parts) >= 4:
                slot = int(parts[3])
            eid, used = self.reg.create_element(etype, name, slot_pos=slot)
            print("Created", eid, "in slot", used)
            return

        if cmd == "createref":
            # createref [<slot_pos>] <element_id>
            if len(parts) not in (2,3):
                raise BookkeepingError("createref [<slot_pos>] <element_id>")
            if len(parts) == 2:
                slot = None
                eid = self._resolve(parts[1])
            else:
                slot = int(parts[1])
                eid = self._resolve(parts[2])
            used = self.reg.createref(slot, eid)
            print("Created ref to", eid, "in slot", used)
            return

        if cmd == "updateref":
            if len(parts) != 3:
                raise BookkeepingError("updateref <slot_pos> <new_element_id>")
            pos = int(parts[1])
            new_eid = self._resolve(parts[2])
            self.reg.updateref(pos, new_eid)
            print("Updated slot", pos, "->", new_eid)
            return

        if cmd == "deleteref":
            if len(parts) != 2:
                raise BookkeepingError("deleteref <slot_pos>")
            pos = int(parts[1])
            self.reg.deleteref(pos)
            print("Cleared slot", pos)
            return

        if cmd == "delete":
            if len(parts) != 2:
                raise BookkeepingError("delete <slot_pos>")
            pos = int(parts[1])
            self.reg.delete(pos)
            print("Deleted element at slot", pos)
            return

        if cmd == "list":
            cur = self.reg._current()
            print("Slots from current element (position -> id (type name) ):")
            for i, v in enumerate(cur.refs):
                el = self.reg.elements.get(v) if v else None
                if el:
                    print(f"  {i} -> {v} ({el.type} '{el.name}')")
                else:
                    print(f"  {i} -> {v} (empty)")
            return

        if cmd == "inspect":
            if len(parts) != 2:
                raise BookkeepingError("inspect <slot_pos>")
            pos = int(parts[1])
            cur = self.reg._current()
            if pos < 0 or pos >= len(cur.refs):
                raise BookkeepingError("pos not in current slots")
            eid = cur.refs[pos]
            if eid == 0:
                raise BookkeepingError("slot empty")
            el = self.reg.elements.get(eid)
            if not el:
                raise BookkeepingError("Referenced element missing")
            pprint.pprint(el.to_serializable())
            return

        if cmd == "descend":
            if len(parts) != 2:
                raise BookkeepingError("descend <slot_pos>")
            pos = int(parts[1])
            self.reg.descend(pos)
            print("Descended into slot", pos)
            return

        if cmd in ("ascend", "up"):
            self.reg.ascend()
            print("Ascended. Current path:", self.reg.path_stack)
            return

        if cmd == "save":
            if len(parts) != 2:
                raise BookkeepingError("save <file>")
            self.reg.save_to_file(parts[1])
            print("Saved to", parts[1])
            return

        if cmd == "load":
            if len(parts) != 2:
                raise BookkeepingError("load <file>")
            self.reg.load_from_file(parts[1])
            print("Loaded from", parts[1])
            return

        cur_el = self.reg._current()

        # Table commands
        if cmd.startswith("tbl.") and isinstance(cur_el, Table):
            sub = cmd.split(".", 1)[1]
            if sub == "add_col":
                if len(parts) != 2:
                    raise BookkeepingError("tbl.add_col <col>")
                self.reg.table_add_column(parts[1])
                print("Added column")
                return
            if sub == "del_col":
                if len(parts) != 2:
                    raise BookkeepingError("tbl.del_col <col>")
                self.reg.table_del_column(parts[1])
                print("Deleted column")
                return
            if sub == "insert_row":
                kv = parse_kvs(parts[1:])
                idx = self.reg.table_insert_row(kv)
                print("Inserted row", idx)
                return
            if sub == "update_row":
                if len(parts) < 3:
                    raise BookkeepingError("tbl.update_row <idx> k=v ...")
                idx = int(parts[1])
                kv = parse_kvs(parts[2:])
                self.reg.table_update_row(idx, kv)
                print("Updated row")
                return
            if sub == "del_row":
                if len(parts) != 2:
                    raise BookkeepingError("tbl.del_row <idx>")
                self.reg.table_delete_row(int(parts[1]))
                print("Deleted row")
                return
            if sub == "move_row":
                if len(parts) != 3:
                    raise BookkeepingError("tbl.move_row <old_idx> <new_idx>")
                old_idx = int(parts[1])
                new_idx = int(parts[2])
                self.reg.table_move_row(old_idx, new_idx)
                print(f"Moved row {old_idx} -> {new_idx}")
                return
            if sub == "set_index":
                if len(parts) != 2:
                    raise BookkeepingError("tbl.set_index <col>")
                self.reg.table_set_index(parts[1])
                print("Indexed column")
                return
            if sub == "unset_index":
                if len(parts) != 2:
                    raise BookkeepingError("tbl.unset_index <col>")
                self.reg.table_unset_index(parts[1])
                print("Unset index")
                return
            if sub == "lookup":
                if len(parts) != 3:
                    raise BookkeepingError("tbl.lookup <col> <value>")
                val = parse_value(parts[2])
                pprint.pprint(self.reg._current().lookup_by_index(parts[1], val))
                return

            if sub == "add_list_col":
                if len(parts) != 2:
                    raise BookkeepingError("tbl.add_list_col <col>")
                self.reg.table_add_list_column(parts[1])
                print("Added list column")
                return
            if sub == "del_list_col":
                if len(parts) != 2:
                    raise BookkeepingError("tbl.del_list_col <col>")
                self.reg.table_del_list_column(parts[1])
                print("Deleted list column")
                return
            if sub == "list_append":
                if len(parts) != 4:
                    raise BookkeepingError("tbl.list_append <row> <col> <value>")
                row = int(parts[1])
                val = parse_value(parts[3])
                self.reg.table_list_append(row, parts[2], val)
                print("Appended to list cell")
                return
            if sub == "list_insert":
                if len(parts) != 5:
                    raise BookkeepingError("tbl.list_insert <row> <col> <index> <value>")
                row = int(parts[1])
                idx = int(parts[3])
                val = parse_value(parts[4])
                self.reg.table_list_insert(row, parts[2], idx, val)
                print("Inserted into list cell")
                return
            if sub == "list_update":
                if len(parts) != 5:
                    raise BookkeepingError("tbl.list_update <row> <col> <index> <value>")
                row = int(parts[1])
                idx = int(parts[3])
                val = parse_value(parts[4])
                self.reg.table_list_update(row, parts[2], idx, val)
                print("Updated list cell")
                return
            if sub == "list_del":
                if len(parts) != 4:
                    raise BookkeepingError("tbl.list_del <row> <col> <index>")
                row = int(parts[1])
                idx = int(parts[3])
                self.reg.table_list_delete(row, parts[2], idx)
                print("Deleted list cell item")
                return

            if sub == "show_rows":
                pprint.pprint(cur_el.rows)
                return
            raise BookkeepingError("Unknown tbl command")

        # Graph commands (prefix g.)
        if cmd.startswith("g.") and isinstance(cur_el, Graph):
            sub = cmd.split(".", 1)[1]
            if sub == "add_node":
                if len(parts) < 2:
                    raise BookkeepingError("g.add_node <node_id> [k=v...]")
                nid = parts[1]
                attrs = parse_kvs(parts[2:]) if len(parts) > 2 else {}
                self.reg.graph_add_node(nid, attrs)
                print("Added node")
                return
            if sub == "del_node":
                if len(parts) != 2:
                    raise BookkeepingError("g.del_node <node_id>")
                self.reg.graph_del_node(parts[1])
                print("Deleted node")
                return
            if sub == "update_node":
                if len(parts) < 3:
                    raise BookkeepingError("g.update_node <node_id> k=v ...")
                nid = parts[1]
                attrs = parse_kvs(parts[2:])
                self.reg.graph_update_node(nid, attrs)
                print("Updated node")
                return
            if sub == "add_edge":
                if len(parts) < 3:
                    raise BookkeepingError("g.add_edge <from> <to> [k=v...]")
                frm, to = parts[1], parts[2]
                meta = parse_kvs(parts[3:]) if len(parts) > 3 else {}
                self.reg.graph_add_edge(frm, to, meta)
                print("Added edge")
                return
            if sub == "del_edge":
                if len(parts) != 3:
                    raise BookkeepingError("g.del_edge <from> <to>")
                self.reg.graph_del_edge(parts[1], parts[2])
                print("Deleted edge")
                return
            if sub == "set_node_index":
                if len(parts) != 2:
                    raise BookkeepingError("g.set_node_index <attr>")
                self.reg.graph_set_node_index(parts[1])
                print("Indexed node attr")
                return
            if sub == "unset_node_index":
                if len(parts) != 2:
                    raise BookkeepingError("g.unset_node_index <attr>")
                self.reg.graph_unset_node_index(parts[1])
                print("Unset node index")
                return
            if sub == "lookup_nodes":
                if len(parts) != 3:
                    raise BookkeepingError("g.lookup_nodes <attr> <value>")
                val = parse_value(parts[2])
                pprint.pprint(self.reg.graph_lookup_nodes(parts[1], val))
                return
            if sub == "show":
                # Full adjacency table
                pprint.pprint(cur_el.adj)
                return
        raise BookkeepingError("Unknown g command")


        # KVP commands (prefix kv.)
        if cmd.startswith("kv.") and isinstance(cur_el, KeyValuePair):
            sub = cmd.split(".", 1)[1]
            if sub == "set":
                if len(parts) != 3:
                    raise BookkeepingError("kv.set <key> <value>")
                val = parse_value(parts[2])
                self.reg.kv_set(parts[1], val)
                print("Set key")
                return
            if sub == "get":
                if len(parts) != 2:
                    raise BookkeepingError("kv.get <key>")
                pprint.pprint(self.reg.kv_get(parts[1]))
                return
            if sub == "del":
                if len(parts) != 2:
                    raise BookkeepingError("kv.del <key>")
                self.reg.kv_delete(parts[1])
                print("Deleted key")
                return
            if sub == "set_index":
                if len(parts) != 2:
                    raise BookkeepingError("kv.set_index <key>")
                self.reg.kv_set_index(parts[1])
                print("Indexed")
                return
            if sub == "unset_index":
                if len(parts) != 2:
                    raise BookkeepingError("kv.unset_index <key>")
                self.reg.kv_unset_index(parts[1])
                print("Unset index")
                return
            if sub == "lookup":
                if len(parts) != 2:
                    raise BookkeepingError("kv.lookup <key>")
                pprint.pprint(self.reg._current().lookup_by_key(parts[1]))
                return
            raise BookkeepingError("Unknown kv command")

        if cmd == "show":
            print(cur_el.info())
            return
        if cmd == "to_dict":
            pprint.pprint(cur_el.to_serializable())
            return

        raise BookkeepingError("Unknown command or invalid for current element")

# ---- demo / entrypoint ----
def _demo():
    cli = CLI()
    r = cli.reg
    print("root id:", r.root_id)
    eid, pos = r.create_element("kvp", "level1")
    print("created", eid, "in slot", pos)
    r.descend(pos)
    print("current:", r.current_element_id, r.path_stack)
    tid, tpos = r.create_element("table", "mytable")
    print("created table:", tid, "in slot", tpos)
    r.ascend()
    print("at root, slots:", r._current().refs)
    r.save_to_file("demo_all_changes.bin")
    print("saved demo_all_changes.bin")
    r2 = ElementRegistry()
    r2.load_from_file("demo_all_changes.bin")
    print("loaded into new registry, root id:", r2.root_id, "current:", r2.current_element_id, "path:", r2.path_stack)
    cli2 = CLI()
    cli2.reg = r2
    print("demo finished. Launching CLI (exit to quit)." )
    cli2.run()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--demo":
        _demo()
    else:
        CLI().run()
