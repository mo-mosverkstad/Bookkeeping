#!/usr/bin/env python3
"""
bookkeeping_full.py

Full bookkeeping system with:
 - Elements: Table, Graph, KeyValuePair
 - ElementRegistry holding elements, with focus/unfocus
 - CLI wrapper (REPL)
 - Delta-based undo/redo (no pickle for history)
 - Save / Load using fixed 1 KiB blocks:
     * Block 0 = small super-header (magic + header_blocks count)
     * Blocks 1..N = header JSON (mapping element_id -> block indices + type)
     * Remaining blocks = element payload chunks (JSON per element)
 - IndexPointer objects serialized safely
 - OOP design and routing of mutating ops through registry so deltas capture before/after
"""

import json
import uuid
import shlex
import math
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, Union
from abc import ABC, abstractmethod
import pprint

# ---- Constants ----
BLOCK_SIZE = 1024
SUPER_HEADER_MAGIC = "BKUPv1"  # small magic string for Block 0


# ---- Exceptions ----
class BookkeepingError(Exception):
    pass


# ---- IndexPointer (hashable) ----
@dataclass(frozen=True)
class IndexPointer:
    target_element_id: str
    target_index_key: str

    def __repr__(self):
        return f"<IndexPointer {self.target_element_id}::{self.target_index_key}>"


# ---- Serialization helpers (JSON-friendly) ----
def _serialize(obj: Any) -> Any:
    """Recursively convert objects (including IndexPointer) into JSON-serializable forms."""
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
    # primitives (int, float, str, bool, None)
    return obj


def _deserialize(obj: Any) -> Any:
    """Reverse operation of _serialize."""
    if isinstance(obj, dict):
        if obj.get("__IndexPointer__"):
            return IndexPointer(obj["target_element_id"], obj["target_index_key"])
        return {k: _deserialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_deserialize(v) for v in obj]
    return obj


# ---- Element base class ----
class Element(ABC):
    def __init__(self, name: str, element_id: Optional[str] = None):
        self.id: str = element_id if element_id is not None else str(uuid.uuid4())
        self.name: str = name
        self.type: str = self.__class__.__name__

    @abstractmethod
    def to_serializable(self) -> Dict[str, Any]:
        """Return a JSON-serializable dict representing this element."""
        pass

    @abstractmethod
    def from_serializable(self, data: Dict[str, Any]):
        """Restore element state from a serializable dict."""
        pass

    @abstractmethod
    def list_indexable(self) -> List[str]:
        pass

    @abstractmethod
    def has_index_key(self, key: str) -> bool:
        pass

    def info(self) -> str:
        return f"{self.type}(id={self.id}, name={self.name})"

    def __repr__(self):
        return f"<{self.type} id={self.id} name={self.name}>"


# ---- Table Element ----
class Table(Element):
    TYPE_CODE = "Table"

    def __init__(self, name: str, columns: Optional[List[str]] = None, element_id: Optional[str] = None):
        super().__init__(name, element_id)
        self.columns: List[str] = columns[:] if columns else []
        self.rows: List[Dict[str, Any]] = []
        # set of column names marked as indexed (index maps rebuilt on load)
        self.indexed_columns: List[str] = []
        # runtime index maps (col -> {value: [row_indices]})
        self.index_maps: Dict[str, Dict[Any, List[int]]] = {}

    # CRUD & index operations
    def add_column(self, col_name: str):
        if col_name in self.columns:
            raise BookkeepingError("Column already exists.")
        self.columns.append(col_name)
        for r in self.rows:
            r[col_name] = None

    def del_column(self, col_name: str):
        if col_name not in self.columns:
            raise BookkeepingError("No such column.")
        self.columns.remove(col_name)
        for r in self.rows:
            r.pop(col_name, None)
        if col_name in self.indexed_columns:
            self.indexed_columns.remove(col_name)
            self.index_maps.pop(col_name, None)

    def insert_row(self, row: Dict[str, Any]) -> int:
        # accept subset and fill defaults
        new_row = {c: None for c in self.columns}
        for k, v in row.items():
            if k not in self.columns:
                raise BookkeepingError(f"Unknown column {k}")
            new_row[k] = v
        self.rows.append(new_row)
        idx = len(self.rows) - 1
        # update indexes
        for col in self.indexed_columns:
            self.index_maps.setdefault(col, {})
            val = new_row.get(col)
            self.index_maps[col].setdefault(val, []).append(idx)
        return idx

    def update_row(self, row_idx: int, updates: Dict[str, Any]):
        if row_idx < 0 or row_idx >= len(self.rows):
            raise BookkeepingError("Row index out of range.")
        row = self.rows[row_idx]
        for k, v in updates.items():
            if k not in self.columns:
                raise BookkeepingError(f"Unknown column {k}")
            old = row.get(k)
            row[k] = v
            # refresh index map if applicable
            if k in self.indexed_columns:
                imap = self.index_maps.setdefault(k, {})
                # remove old
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
            raise BookkeepingError("Row index out of range.")
        self.rows.pop(row_idx)
        # rebuild indexes (simpler)
        self._rebuild_indexes()

    def set_index_column(self, col_name: str):
        if col_name not in self.columns:
            raise BookkeepingError("No such column.")
        if col_name not in self.indexed_columns:
            self.indexed_columns.append(col_name)
        # build index map
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
            raise BookkeepingError("Column not indexed.")
        indices = self.index_maps.get(col_name, {}).get(value, [])
        return [self.rows[i] for i in indices]

    def _rebuild_indexes(self):
        for col in list(self.indexed_columns):
            self.set_index_column(col)

    # Serialization
    def to_serializable(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "type": Table.TYPE_CODE,
            "columns": list(self.columns),
            "rows": _serialize(self.rows),
            "indexed_columns": list(self.indexed_columns),
        }

    def from_serializable(self, data: Dict[str, Any]):
        self.id = data["id"]
        self.name = data.get("name", self.name)
        self.columns = list(data.get("columns", []))
        self.rows = _deserialize(data.get("rows", []))
        self.indexed_columns = list(data.get("indexed_columns", []))
        # rebuild runtime index maps
        self._rebuild_indexes()

    def list_indexable(self) -> List[str]:
        return list(self.indexed_columns)

    def has_index_key(self, key: str) -> bool:
        return key in self.indexed_columns

    def info(self) -> str:
        return f"Table(name={self.name}, cols={self.columns}, rows={len(self.rows)}, indices={self.indexed_columns})"


# ---- Graph Element ----
class Graph(Element):
    TYPE_CODE = "Graph"

    def __init__(self, name: str, element_id: Optional[str] = None):
        super().__init__(name, element_id)
        self.nodes: Dict[str, Dict[str, Any]] = {}  # node_id -> attrs
        self.edges: List[Tuple[str, str, Dict[str, Any]]] = []  # (from, to, meta)
        self.indexed_node_attrs: List[str] = []
        self.node_index_maps: Dict[str, Dict[Any, List[str]]] = {}

    def add_node(self, node_id: str, attrs: Optional[Dict[str, Any]] = None):
        if node_id in self.nodes:
            raise BookkeepingError("Node already exists.")
        self.nodes[node_id] = dict(attrs) if attrs else {}
        # update indexes
        for attr in self.indexed_node_attrs:
            val = self.nodes[node_id].get(attr)
            self.node_index_maps.setdefault(attr, {}).setdefault(val, []).append(node_id)

    def del_node(self, node_id: str):
        if node_id not in self.nodes:
            raise BookkeepingError("No such node.")
        del self.nodes[node_id]
        # remove edges referencing node
        self.edges = [e for e in self.edges if e[0] != node_id and e[1] != node_id]
        self._rebuild_node_indexes()

    def update_node(self, node_id: str, attrs: Dict[str, Any]):
        if node_id not in self.nodes:
            raise BookkeepingError("No such node.")
        old = dict(self.nodes[node_id])
        self.nodes[node_id].update(attrs)
        # refresh indexes
        for attr in self.indexed_node_attrs:
            old_val = old.get(attr)
            new_val = self.nodes[node_id].get(attr)
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

    def add_edge(self, frm: str, to: str, meta: Optional[Dict[str, Any]] = None):
        if frm not in self.nodes or to not in self.nodes:
            raise BookkeepingError("Both nodes must exist.")
        self.edges.append((frm, to, dict(meta) if meta else {}))

    def del_edge(self, frm: str, to: str):
        before = len(self.edges)
        self.edges = [e for e in self.edges if not (e[0] == frm and e[1] == to)]
        if len(self.edges) == before:
            raise BookkeepingError("Edge not found.")

    def set_node_index(self, attr_name: str):
        if attr_name not in self.indexed_node_attrs:
            self.indexed_node_attrs.append(attr_name)
        m: Dict[Any, List[str]] = {}
        for nid, attrs in self.nodes.items():
            val = attrs.get(attr_name)
            m.setdefault(val, []).append(nid)
        self.node_index_maps[attr_name] = m

    def unset_node_index(self, attr_name: str):
        if attr_name in self.indexed_node_attrs:
            self.indexed_node_attrs.remove(attr_name)
        self.node_index_maps.pop(attr_name, None)

    def lookup_nodes_by_index(self, attr_name: str, value: Any) -> List[Dict[str, Any]]:
        if attr_name not in self.indexed_node_attrs:
            raise BookkeepingError("Node attribute not indexed.")
        nids = self.node_index_maps.get(attr_name, {}).get(value, [])
        return [{"node_id": nid, "attrs": self.nodes[nid]} for nid in nids]

    def _rebuild_node_indexes(self):
        for attr in list(self.indexed_node_attrs):
            self.set_node_index(attr)

    # Serialization
    def to_serializable(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "type": Graph.TYPE_CODE,
            "nodes": _serialize(self.nodes),
            "edges": _serialize(self.edges),
            "indexed_node_attrs": list(self.indexed_node_attrs),
        }

    def from_serializable(self, data: Dict[str, Any]):
        self.id = data["id"]
        self.name = data.get("name", self.name)
        self.nodes = _deserialize(data.get("nodes", {}))
        self.edges = _deserialize(data.get("edges", []))
        self.indexed_node_attrs = list(data.get("indexed_node_attrs", []))
        self._rebuild_node_indexes()

    def list_indexable(self) -> List[str]:
        return list(self.indexed_node_attrs)

    def has_index_key(self, key: str) -> bool:
        return key in self.indexed_node_attrs

    def info(self) -> str:
        return f"Graph(name={self.name}, nodes={len(self.nodes)}, edges={len(self.edges)}, indices={self.indexed_node_attrs})"


# ---- KeyValuePair Element ----
class KeyValuePair(Element):
    TYPE_CODE = "KeyValuePair"

    def __init__(self, name: str, element_id: Optional[str] = None):
        super().__init__(name, element_id)
        self.store: Dict[str, Any] = {}
        self.indexed_keys: List[str] = []

    def set(self, key: str, value: Any):
        self.store[key] = value

    def get(self, key: str) -> Any:
        if key not in self.store:
            raise BookkeepingError("Key not found.")
        return self.store[key]

    def delete(self, key: str):
        if key not in self.store:
            raise BookkeepingError("Key not found.")
        del self.store[key]
        if key in self.indexed_keys:
            self.indexed_keys.remove(key)

    def set_index_key(self, key: str):
        if key not in self.store:
            raise BookkeepingError("Key not found to index.")
        if key not in self.indexed_keys:
            self.indexed_keys.append(key)

    def unset_index_key(self, key: str):
        if key in self.indexed_keys:
            self.indexed_keys.remove(key)

    def lookup_by_key(self, key: str) -> Any:
        if key not in self.indexed_keys:
            raise BookkeepingError("Key not indexed.")
        return self.store[key]

    # Serialization
    def to_serializable(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "type": KeyValuePair.TYPE_CODE,
            "store": _serialize(self.store),
            "indexed_keys": list(self.indexed_keys),
        }

    def from_serializable(self, data: Dict[str, Any]):
        self.id = data["id"]
        self.name = data.get("name", self.name)
        self.store = _deserialize(data.get("store", {}))
        self.indexed_keys = list(data.get("indexed_keys", []))

    def list_indexable(self) -> List[str]:
        return list(self.indexed_keys)

    def has_index_key(self, key: str) -> bool:
        return key in self.indexed_keys

    def info(self) -> str:
        return f"KVP(name={self.name}, keys={len(self.store)}, indices={self.indexed_keys})"


# ---- Factory ----
class ElementFactory:
    @staticmethod
    def create(element_type: str, name: str, **kwargs) -> Element:
        t = element_type.lower()
        if t == "table":
            return Table(name, columns=kwargs.get("columns"))
        if t == "graph":
            return Graph(name)
        if t in ("kvp", "keyvaluepair", "keyvalue", "kv"):
            return KeyValuePair(name)
        raise BookkeepingError("Unknown element type.")

    @staticmethod
    def from_serializable(data: Dict[str, Any]) -> Element:
        t = data.get("type")
        if t == Table.TYPE_CODE:
            el = Table(data.get("name", "Table"), element_id=data["id"])
            el.from_serializable(data)
            return el
        if t == Graph.TYPE_CODE:
            el = Graph(data.get("name", "Graph"), element_id=data["id"])
            el.from_serializable(data)
            return el
        if t == KeyValuePair.TYPE_CODE:
            el = KeyValuePair(data.get("name", "KVP"), element_id=data["id"])
            el.from_serializable(data)
            return el
        raise BookkeepingError("Unsupported element type in serialized data.")


# ---- Delta for undo/redo ----
@dataclass
class Delta:
    action: str                         # 'create' | 'delete' | 'update' | 'focus_change'
    element_id: Optional[str] = None    # None for focus_change
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None
    focus_before: Optional[str] = None
    focus_after: Optional[str] = None


# ---- ElementRegistry (centralized operations + deltas + save/load) ----
class ElementRegistry:
    def __init__(self, history_limit: int = 500):
        self.elements: Dict[str, Element] = {}
        self.focused_element_id: Optional[str] = None

        # delta history (no pickle)
        self._history: List[Delta] = []
        self._hist_ptr: int = -1  # pointer to current state in history: -1 = no history applied
        self._history_limit = history_limit
        # redo stack is implicit: any history entries after hist_ptr are redoable

    # ---- History management ----
    def _push_delta(self, delta: Delta):
        # Trim any redo tail
        if self._hist_ptr < len(self._history) - 1:
            self._history = self._history[:self._hist_ptr + 1]
        self._history.append(delta)
        # Enforce limit
        if len(self._history) > self._history_limit:
            # drop oldest
            drop = len(self._history) - self._history_limit
            self._history = self._history[drop:]
        self._hist_ptr = len(self._history) - 1

    def undo(self):
        if self._hist_ptr < 0:
            raise BookkeepingError("Nothing to undo.")
        delta = self._history[self._hist_ptr]
        self._apply_delta(delta, reverse=True)
        self._hist_ptr -= 1

    def redo(self):
        if self._hist_ptr >= len(self._history) - 1:
            raise BookkeepingError("Nothing to redo.")
        self._hist_ptr += 1
        delta = self._history[self._hist_ptr]
        self._apply_delta(delta, reverse=False)

    def list_history(self) -> List[Dict[str, Any]]:
        out = []
        for i, d in enumerate(self._history):
            out.append({
                "idx": i,
                "action": d.action,
                "element_id": d.element_id,
                "focus_before": d.focus_before,
                "focus_after": d.focus_after,
            })
        return out

    # ---- Delta apply logic ----
    def _apply_delta(self, delta: Delta, reverse: bool):
        """Apply one delta. If reverse=True, revert it (apply 'before'); else apply forward ('after')."""
        # Determine which state to apply
        target_state = delta.before if reverse else delta.after

        # element actions
        if delta.action == "create":
            if reverse:
                # remove element
                if delta.element_id in self.elements:
                    del self.elements[delta.element_id]
            else:
                # restore created element from after
                if target_state is None:
                    raise BookkeepingError("Malformed delta for create")
                el = ElementFactory.from_serializable(target_state)
                self.elements[el.id] = el
        elif delta.action == "delete":
            if reverse:
                # restore deleted element from before
                if target_state is None:
                    raise BookkeepingError("Malformed delta for delete")
                el = ElementFactory.from_serializable(target_state)
                self.elements[el.id] = el
            else:
                # remove element
                if delta.element_id and delta.element_id in self.elements:
                    del self.elements[delta.element_id]
        elif delta.action == "update":
            # if reversing, apply 'before', else apply 'after'
            if target_state is None:
                # if target_state is None, then update meant deletion in that delta context
                if delta.element_id and delta.element_id in self.elements:
                    del self.elements[delta.element_id]
            else:
                el = ElementFactory.from_serializable(target_state)
                self.elements[el.id] = el
        elif delta.action == "focus_change":
            # apply focus change
            if reverse:
                self.focused_element_id = delta.focus_before
            else:
                self.focused_element_id = delta.focus_after
        else:
            raise BookkeepingError("Unknown delta action.")

        # focus changes tied to element deltas (if present)
        if delta.action in ("create", "delete", "update"):
            if reverse:
                # restore focus_before
                self.focused_element_id = delta.focus_before
            else:
                self.focused_element_id = delta.focus_after

    # ---- Utilities for capturing serializable element state ----
    def _element_serializable(self, element_id: str) -> Optional[Dict[str, Any]]:
        el = self.elements.get(element_id)
        if el is None:
            return None
        return el.to_serializable()

    # ---- CRUD & typed operations (all mutating ops push deltas) ----
    def create_element(self, element_type: str, name: str, **kwargs) -> str:
        el = ElementFactory.create(element_type, name, **kwargs)
        before_focus = self.focused_element_id
        # create
        self.elements[el.id] = el
        after = el.to_serializable()
        # push delta
        delta = Delta(action="create", element_id=el.id, before=None, after=after,
                      focus_before=before_focus, focus_after=self.focused_element_id)
        self._push_delta(delta)
        return el.id

    def delete_element(self, element_id: str):
        if element_id not in self.elements:
            raise BookkeepingError("No such element.")
        before = self._element_serializable(element_id)
        before_focus = self.focused_element_id
        # perform deletion (and unfocus if needed)
        del self.elements[element_id]
        if self.focused_element_id == element_id:
            self.focused_element_id = None
        delta = Delta(action="delete", element_id=element_id, before=before, after=None,
                      focus_before=before_focus, focus_after=self.focused_element_id)
        self._push_delta(delta)

    def focus(self, element_id: str):
        if element_id not in self.elements:
            raise BookkeepingError("No such element.")
        before_focus = self.focused_element_id
        self.focused_element_id = element_id
        delta = Delta(action="focus_change", element_id=None, before=None, after=None,
                      focus_before=before_focus, focus_after=self.focused_element_id)
        self._push_delta(delta)

    def unfocus(self):
        before_focus = self.focused_element_id
        self.focused_element_id = None
        delta = Delta(action="focus_change", element_id=None, before=None, after=None,
                      focus_before=before_focus, focus_after=None)
        self._push_delta(delta)

    # ------- Table ops -------
    def table_add_column(self, element_id: str, col_name: str):
        el = self._get_table(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.add_column(col_name)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def table_del_column(self, element_id: str, col_name: str):
        el = self._get_table(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.del_column(col_name)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def table_insert_row(self, element_id: str, row: Dict[str, Any]) -> int:
        el = self._get_table(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        idx = el.insert_row(row)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))
        return idx

    def table_update_row(self, element_id: str, row_idx: int, updates: Dict[str, Any]):
        el = self._get_table(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.update_row(row_idx, updates)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def table_delete_row(self, element_id: str, row_idx: int):
        el = self._get_table(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.delete_row(row_idx)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def table_set_index(self, element_id: str, col_name: str):
        el = self._get_table(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.set_index_column(col_name)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def table_unset_index(self, element_id: str, col_name: str):
        el = self._get_table(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.unset_index_column(col_name)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def table_lookup(self, element_id: str, col_name: str, value: Any) -> List[Dict[str, Any]]:
        el = self._get_table(element_id)
        return el.lookup_by_index(col_name, value)

    # ------- Graph ops -------
    def graph_add_node(self, element_id: str, node_id: str, attrs: Optional[Dict[str, Any]] = None):
        el = self._get_graph(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.add_node(node_id, attrs)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def graph_del_node(self, element_id: str, node_id: str):
        el = self._get_graph(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.del_node(node_id)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def graph_update_node(self, element_id: str, node_id: str, attrs: Dict[str, Any]):
        el = self._get_graph(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.update_node(node_id, attrs)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def graph_add_edge(self, element_id: str, frm: str, to: str, meta: Optional[Dict[str, Any]] = None):
        el = self._get_graph(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.add_edge(frm, to, meta)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def graph_del_edge(self, element_id: str, frm: str, to: str):
        el = self._get_graph(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.del_edge(frm, to)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def graph_set_node_index(self, element_id: str, attr_name: str):
        el = self._get_graph(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.set_node_index(attr_name)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def graph_unset_node_index(self, element_id: str, attr_name: str):
        el = self._get_graph(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.unset_node_index(attr_name)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def graph_lookup_nodes(self, element_id: str, attr_name: str, value: Any):
        el = self._get_graph(element_id)
        return el.lookup_nodes_by_index(attr_name, value)

    # ------- KVP ops -------
    def kv_set(self, element_id: str, key: str, value: Any):
        el = self._get_kv(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.set(key, value)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def kv_get(self, element_id: str, key: str):
        el = self._get_kv(element_id)
        return el.get(key)

    def kv_delete(self, element_id: str, key: str):
        el = self._get_kv(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.delete(key)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def kv_set_index(self, element_id: str, key: str):
        el = self._get_kv(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.set_index_key(key)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    def kv_unset_index(self, element_id: str, key: str):
        el = self._get_kv(element_id)
        before = el.to_serializable()
        before_focus = self.focused_element_id
        el.unset_index_key(key)
        after = el.to_serializable()
        self._push_delta(Delta("update", element_id, before, after, before_focus, self.focused_element_id))

    # ---- Helpers to fetch typed elements (with validation) ----
    def _get_table(self, element_id: str) -> Table:
        if element_id not in self.elements:
            raise BookkeepingError("No such element.")
        el = self.elements[element_id]
        if not isinstance(el, Table):
            raise BookkeepingError("Element is not a Table.")
        return el

    def _get_graph(self, element_id: str) -> Graph:
        if element_id not in self.elements:
            raise BookkeepingError("No such element.")
        el = self.elements[element_id]
        if not isinstance(el, Graph):
            raise BookkeepingError("Element is not a Graph.")
        return el

    def _get_kv(self, element_id: str) -> KeyValuePair:
        if element_id not in self.elements:
            raise BookkeepingError("No such element.")
        el = self.elements[element_id]
        if not isinstance(el, KeyValuePair):
            raise BookkeepingError("Element is not a KeyValuePair.")
        return el

    # ---- Registry introspection ----
    def list_elements(self) -> List[Dict[str, Any]]:
        return [{"id": e.id, "name": e.name, "type": e.type} for e in self.elements.values()]

    def find_by_name(self, name: str) -> List[Element]:
        return [e for e in self.elements.values() if e.name == name]

    def get_element(self, element_id: str) -> Element:
        if element_id not in self.elements:
            raise BookkeepingError("No such element.")
        return self.elements[element_id]

    def info(self) -> str:
        f = None
        if self.focused_element_id:
            f = self.elements.get(self.focused_element_id).name if self.focused_element_id in self.elements else None
        return f"Registry(elements={len(self.elements)}, focused={f})"

    # ---- Save / Load (fixed block format) ----
    def save_to_file(self, filepath: str):
        """
        Save all elements + meta to a binary file composed of exact BLOCK_SIZE blocks.
        Format:
          - Block 0: super-header JSON: {"magic":..., "version":1, "header_blocks":N}
          - Blocks 1..N: header JSON bytes chunked (header maps element_id -> {"type":..., "blocks": [indices], "size": payload_size})
          - Remaining blocks: payload chunks for elements (raw bytes of element JSON)
        We determine header_blocks iteratively because header includes absolute block indices.
        """
        # prepare payloads for each element + meta
        items = {}  # element_id -> payload_bytes and type
        for eid, el in self.elements.items():
            serial = el.to_serializable()
            # JSON dump compact
            b = json.dumps(serial, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            items[eid] = {"type": el.type, "payload": b}

        # meta (registry-level info)
        meta = {"focused": self.focused_element_id}
        meta_b = json.dumps(meta, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        META_ID = "__META__"
        items[META_ID] = {"type": "meta", "payload": meta_b}

        # compute blocks per item & assign indices. iterative because header size depends on indices
        # initial guess of header_blocks
        header_blocks = 1
        for _ in range(10):  # iterate to converge
            start_idx = 1 + header_blocks  # first payload block index
            mapping = {}
            cur = start_idx
            for eid, rec in items.items():
                payload = rec["payload"]
                num_blocks = max(1, math.ceil(len(payload) / BLOCK_SIZE))
                mapping[eid] = {
                    "type": rec["type"],
                    "blocks": list(range(cur, cur + num_blocks)),
                    "size": len(payload)
                }
                cur += num_blocks
            header_json = json.dumps(mapping, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            needed_header_blocks = max(1, math.ceil(len(header_json) / BLOCK_SIZE))
            if needed_header_blocks == header_blocks:
                header_bytes = header_json
                break
            header_blocks = needed_header_blocks
        else:
            raise BookkeepingError("Failed to stabilize header size for save file.")

        # now mapping and header_bytes are consistent
        # Build final block sequence: block0, header_blocks, then payload blocks in ascending block index order
        # We'll write sequentially block0, header chunks, then payload chunks by iterating mapping in items order.
        # Because mapping contains absolute block indices, we must ensure we write payloads in the same order.
        # Simpler: create an array of payload blocks indexed by absolute block index, then write in order.

        total_blocks = 1 + header_blocks
        # create payload block storage sized for all payload blocks
        last_index = 0
        for v in mapping.values():
            last_index = max(last_index, max(v["blocks"]))
        total_blocks = max(total_blocks, last_index + 1)
        blocks = [b"\x00" * BLOCK_SIZE for _ in range(total_blocks)]

        # Block 0: super header
        super_header = {"magic": SUPER_HEADER_MAGIC, "version": 1, "header_blocks": header_blocks}
        block0 = json.dumps(super_header, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        blocks[0] = block0.ljust(BLOCK_SIZE, b"\x00")

        # Header blocks 1..header_blocks: fill with header_bytes chunked
        for i in range(header_blocks):
            start = i * BLOCK_SIZE
            chunk = header_bytes[start:start + BLOCK_SIZE]
            blocks[1 + i] = chunk.ljust(BLOCK_SIZE, b"\x00")

        # Fill payload blocks according to mapping: for each item, split payload into BLOCK_SIZE chunks and place at block indices
        for eid, rec in items.items():
            payload = rec["payload"]
            info = mapping[eid]
            blist = info["blocks"]
            # split payload into chunks
            chunks = [payload[i * BLOCK_SIZE:(i + 1) * BLOCK_SIZE] for i in range(len(blist))]
            if len(chunks) != len(blist):
                # pad with empty chunks
                while len(chunks) < len(blist):
                    chunks.append(b"")
            for idx, c in zip(blist, chunks):
                blocks[idx] = c.ljust(BLOCK_SIZE, b"\x00")

        # Finally, write blocks to file sequentially
        with open(filepath, "wb") as f:
            for b in blocks:
                f.write(b)

    def load_from_file(self, filepath: str):
        """
        Load registry from file created by save_to_file.
        After loading, history is cleared.
        """
        if not os.path.exists(filepath):
            raise BookkeepingError("File not found.")
        filesize = os.path.getsize(filepath)
        if filesize % BLOCK_SIZE != 0:
            raise BookkeepingError("Corrupted file size (not multiple of block_size).")
        with open(filepath, "rb") as f:
            # read block 0
            block0 = f.read(BLOCK_SIZE)
            try:
                sh = json.loads(block0.rstrip(b"\x00").decode("utf-8"))
            except Exception as e:
                raise BookkeepingError("Invalid file header.") from e
            if sh.get("magic") != SUPER_HEADER_MAGIC:
                raise BookkeepingError("Not a recognized bookkeeping file.")
            header_blocks = int(sh.get("header_blocks", 0))
            # read header
            header_bytes = b""
            for _ in range(header_blocks):
                header_bytes += f.read(BLOCK_SIZE)
            try:
                mapping = json.loads(header_bytes.rstrip(b"\x00").decode("utf-8"))
            except Exception as e:
                raise BookkeepingError("Invalid header JSON.") from e

            # reconstruct elements: mapping: element_id -> {type, blocks: [indices], size}
            new_elements: Dict[str, Element] = {}
            focused = None
            # For each mapping entry, read blocks by seeking to block index * BLOCK_SIZE
            for eid, info in mapping.items():
                blist: List[int] = info["blocks"]
                size = info["size"]
                # assemble payload
                payload = b""
                for block_idx in blist:
                    f.seek(block_idx * BLOCK_SIZE)
                    chunk = f.read(BLOCK_SIZE)
                    payload += chunk
                payload = payload[:size]
                # decode JSON
                try:
                    data = json.loads(payload.decode("utf-8"))
                except Exception as e:
                    raise BookkeepingError("Invalid payload JSON for element.") from e
                if eid == "__META__":
                    focused = data.get("focused", None)
                    continue
                # create element from serializable dict
                el = ElementFactory.from_serializable(data)
                new_elements[el.id] = el

            # replace registry
            self.elements = new_elements
            self.focused_element_id = focused
            # clear history
            self._history.clear()
            self._hist_ptr = -1

    # ---- Validate pointers ----
    def validate_pointer(self, pointer: IndexPointer) -> bool:
        if pointer.target_element_id not in self.elements:
            return False
        target = self.elements[pointer.target_element_id]
        return target.has_index_key(pointer.target_index_key)

    def resolve_pointer(self, pointer: IndexPointer) -> Any:
        if not self.validate_pointer(pointer):
            raise BookkeepingError("Invalid index pointer.")
        target = self.elements[pointer.target_element_id]
        if isinstance(target, Table):
            # return index map for that column
            return target.index_maps[pointer.target_index_key]
        if isinstance(target, Graph):
            return target.node_index_maps[pointer.target_index_key]
        if isinstance(target, KeyValuePair):
            return {pointer.target_index_key: target.store.get(pointer.target_index_key)}
        raise BookkeepingError("Unsupported target type for pointer.")


# ---- CLI REPL ----
HELP_TEXT = """
Commands (registry-level):
  help
  create <type> <name> [--cols a,b]    Create element (type: table, graph, kvp)
  list                                 List elements
  inspect <id|name>                    Print element serializable dict
  focus <id|name>                      Focus element
  unfocus                              Clear focus
  delete <id|name>                     Delete element
  save <file>                          Save to binary file (1 KiB blocks)
  load <file>                          Load from binary file (replaces current state)
  undo                                 Undo last change
  redo                                 Redo last undone change
  history                              Show delta history (indexes)
  info                                 Show registry info
  exit

When focused, these commands apply to the focused element (use 'help' when focused to see type-specific commands).

Table commands (when focused is Table):
  tbl.add_col <col>
  tbl.del_col <col>
  tbl.insert_row k=v k2=v2 ...
  tbl.update_row <row_idx> k=v ...
  tbl.del_row <row_idx>
  tbl.set_index <col>
  tbl.unset_index <col>
  tbl.lookup <col> <value>
  tbl.show_rows

Graph commands (when focused is Graph):
  g.add_node <node_id> [k=v ...]
  g.del_node <node_id>
  g.update_node <node_id> k=v ...
  g.add_edge <from> <to> [k=v ...]
  g.del_edge <from> <to>
  g.set_node_index <attr>
  g.unset_node_index <attr>
  g.lookup_nodes <attr> <value>
  g.show_nodes
  g.show_edges

KeyValuePair commands (when focused is KVP):
  kv.set <key> <value>
  kv.get <key>
  kv.del <key>
  kv.set_index <key>
  kv.unset_index <key>
  kv.lookup <key>

Notes:
  - Use ptr:<element_id>::<index_key> to supply an IndexPointer value in k=v inputs.
  - Values parse as int, float, true/false, or string (quoted or unquoted).
  - Element ids are UUID strings from 'list'.
"""

def parse_value(token: str) -> Any:
    # pointer syntax
    if token.startswith("ptr:"):
        body = token[len("ptr:"):]
        if "::" not in body:
            raise BookkeepingError("IndexPointer must be ptr:<element_id>::<index_key>")
        eid, key = body.split("::", 1)
        return IndexPointer(eid, key)
    # ints
    try:
        return int(token)
    except ValueError:
        pass
    try:
        return float(token)
    except ValueError:
        pass
    if token.lower() == "true":
        return True
    if token.lower() == "false":
        return False
    # quoted string removal
    if (token.startswith('"') and token.endswith('"')) or (token.startswith("'") and token.endswith("'")):
        return token[1:-1]
    return token

def parse_kv_pairs(tokens: List[str]) -> Dict[str, Any]:
    d: Dict[str, Any] = {}
    for t in tokens:
        if '=' not in t:
            raise BookkeepingError(f"Expected key=value token, got: {t}")
        k, v = t.split('=', 1)
        d[k] = parse_value(v)
    return d


class CLI:
    def __init__(self):
        self.reg = ElementRegistry()
        self.running = True

    def run(self):
        print("Bookkeeping CLI - type 'help'")
        while self.running:
            try:
                focused = self.reg.focused_element_id
                prompt = "[registry]" if not focused else f"[{self.reg.elements[focused].name}::{self.reg.elements[focused].type}]"
                line = input(f"{prompt}> ").strip()
                if not line:
                    continue
                self.handle(line)
            except BookkeepingError as e:
                print("Error:", e)
            except KeyboardInterrupt:
                print("\nInterrupted. Use 'exit' to quit.")
            except Exception as e:
                print("Unexpected error:", e)

    def _resolve(self, token: str) -> str:
        # token may be id or name - if multiple names return first match
        if token in self.reg.elements:
            return token
        matches = self.reg.find_by_name(token)
        if matches:
            return matches[0].id
        raise BookkeepingError("Element not found by id or name.")

    def handle(self, line: str):
        parts = shlex.split(line)
        cmd = parts[0].lower()

        if cmd == "help":
            print(HELP_TEXT)
            return
        if cmd in ("exit", "quit"):
            self.running = False
            print("Bye.")
            return

        if cmd == "undo":
            self.reg.undo()
            print("Undo performed.")
            return
        if cmd == "redo":
            self.reg.redo()
            print("Redo performed.")
            return
        if cmd == "history":
            for h in self.reg.list_history():
                print(h)
            return

        if cmd == "create":
            if len(parts) < 3:
                raise BookkeepingError("create <type> <name> [--cols a,b]")
            etype = parts[1]
            name = parts[2]
            cols = None
            if "--cols" in parts:
                i = parts.index("--cols")
                if i + 1 >= len(parts):
                    raise BookkeepingError("Provide comma-separated columns after --cols")
                cols = parts[i+1].split(",")
            eid = self.reg.create_element(etype, name, columns=cols)
            print("Created", eid)
            return

        if cmd == "list":
            for el in self.reg.list_elements():
                print(f"{el['id']}  {el['type']:12}  {el['name']}")
            return

        if cmd == "inspect":
            if len(parts) < 2:
                raise BookkeepingError("inspect <id|name>")
            eid = self._resolve(parts[1])
            pprint.pprint(self.reg.get_element(eid).to_serializable())
            return

        if cmd == "focus":
            if len(parts) < 2:
                raise BookkeepingError("focus <id|name>")
            eid = self._resolve(parts[1])
            self.reg.focus(eid)
            print("Focused", eid)
            return

        if cmd == "unfocus":
            self.reg.unfocus()
            print("Unfocused (back to registry).")
            return

        if cmd == "delete":
            if len(parts) < 2:
                raise BookkeepingError("delete <id|name>")
            eid = self._resolve(parts[1])
            self.reg.delete_element(eid)
            print("Deleted", eid)
            return

        if cmd == "save":
            if len(parts) < 2:
                raise BookkeepingError("save <file>")
            path = parts[1]
            # include meta as an extra element in the save process
            # We assemble meta inside registry.save_to_file
            self.reg.save_to_file(path)
            print("Saved to", path)
            return

        if cmd == "load":
            if len(parts) < 2:
                raise BookkeepingError("load <file>")
            path = parts[1]
            # snapshot isn't created for load; but user can save before load if needed.
            self.reg.load_from_file(path)
            print("Loaded from", path)
            return

        if cmd == "info":
            print(self.reg.info())
            return

        # Focused commands
        focused = self.reg.focused_element_id
        if not focused:
            raise BookkeepingError("No element focused. Use 'focus <id|name>' to focus an element.")

        focused_el = self.reg.elements[focused]
        # Table commands
        if cmd.startswith("tbl.") and isinstance(focused_el, Table):
            sub = cmd.split(".", 1)[1]
            if sub == "add_col":
                if len(parts) < 2:
                    raise BookkeepingError("tbl.add_col <col>")
                self.reg.table_add_column(focused, parts[1])
                print("Added column.")
                return
            if sub == "del_col":
                if len(parts) < 2:
                    raise BookkeepingError("tbl.del_col <col>")
                self.reg.table_del_column(focused, parts[1])
                print("Deleted column.")
                return
            if sub == "insert_row":
                kv = parse_kv_pairs(parts[1:])
                idx = self.reg.table_insert_row(focused, kv)
                print("Inserted row index", idx)
                return
            if sub == "update_row":
                if len(parts) < 3:
                    raise BookkeepingError("tbl.update_row <row_idx> k=v ...")
                row_idx = int(parts[1])
                kv = parse_kv_pairs(parts[2:])
                self.reg.table_update_row(focused, row_idx, kv)
                print("Updated row.")
                return
            if sub == "del_row":
                if len(parts) < 2:
                    raise BookkeepingError("tbl.del_row <row_idx>")
                self.reg.table_delete_row(focused, int(parts[1]))
                print("Deleted row.")
                return
            if sub == "set_index":
                if len(parts) < 2:
                    raise BookkeepingError("tbl.set_index <col>")
                self.reg.table_set_index(focused, parts[1])
                print("Indexed column.")
                return
            if sub == "unset_index":
                if len(parts) < 2:
                    raise BookkeepingError("tbl.unset_index <col>")
                self.reg.table_unset_index(focused, parts[1])
                print("Unset index.")
                return
            if sub == "lookup":
                if len(parts) < 3:
                    raise BookkeepingError("tbl.lookup <col> <value>")
                col = parts[1]
                val = parse_value(parts[2])
                pprint.pprint(self.reg.table_lookup(focused, col, val))
                return
            if sub == "show_rows":
                pprint.pprint(focused_el.rows)
                return
            raise BookkeepingError("Unknown tbl command.")

        # Graph commands
        if cmd.startswith("g.") and isinstance(focused_el, Graph):
            sub = cmd.split(".", 1)[1]
            if sub == "add_node":
                if len(parts) < 2:
                    raise BookkeepingError("g.add_node <node_id> [k=v ...]")
                nid = parts[1]
                attrs = parse_kv_pairs(parts[2:]) if len(parts) > 2 else {}
                self.reg.graph_add_node(focused, nid, attrs)
                print("Added node.")
                return
            if sub == "del_node":
                if len(parts) < 2:
                    raise BookkeepingError("g.del_node <node_id>")
                self.reg.graph_del_node(focused, parts[1])
                print("Deleted node.")
                return
            if sub == "update_node":
                if len(parts) < 3:
                    raise BookkeepingError("g.update_node <node_id> k=v ...")
                nid = parts[1]
                attrs = parse_kv_pairs(parts[2:])
                self.reg.graph_update_node(focused, nid, attrs)
                print("Updated node.")
                return
            if sub == "add_edge":
                if len(parts) < 3:
                    raise BookkeepingError("g.add_edge <from> <to> [k=v ...]")
                frm, to = parts[1], parts[2]
                meta = parse_kv_pairs(parts[3:]) if len(parts) > 3 else {}
                self.reg.graph_add_edge(focused, frm, to, meta)
                print("Added edge.")
                return
            if sub == "del_edge":
                if len(parts) < 3:
                    raise BookkeepingError("g.del_edge <from> <to>")
                self.reg.graph_del_edge(focused, parts[1], parts[2])
                print("Deleted edge.")
                return
            if sub == "set_node_index":
                if len(parts) < 2:
                    raise BookkeepingError("g.set_node_index <attr>")
                self.reg.graph_set_node_index(focused, parts[1])
                print("Indexed node attribute.")
                return
            if sub == "unset_node_index":
                if len(parts) < 2:
                    raise BookkeepingError("g.unset_node_index <attr>")
                self.reg.graph_unset_node_index(focused, parts[1])
                print("Unset node index.")
                return
            if sub == "lookup_nodes":
                if len(parts) < 3:
                    raise BookkeepingError("g.lookup_nodes <attr> <value>")
                attr = parts[1]
                val = parse_value(parts[2])
                pprint.pprint(self.reg.graph_lookup_nodes(focused, attr, val))
                return
            if sub == "show_nodes":
                pprint.pprint(focused_el.nodes)
                return
            if sub == "show_edges":
                pprint.pprint(focused_el.edges)
                return
            raise BookkeepingError("Unknown g command.")

        # KVP commands
        if cmd.startswith("kv.") and isinstance(focused_el, KeyValuePair):
            sub = cmd.split(".", 1)[1]
            if sub == "set":
                if len(parts) < 3:
                    raise BookkeepingError("kv.set <key> <value>")
                key = parts[1]
                val = parse_value(parts[2])
                self.reg.kv_set(focused, key, val)
                print("Set key.")
                return
            if sub == "get":
                if len(parts) < 2:
                    raise BookkeepingError("kv.get <key>")
                pprint.pprint(self.reg.kv_get(focused, parts[1]))
                return
            if sub == "del":
                if len(parts) < 2:
                    raise BookkeepingError("kv.del <key>")
                self.reg.kv_delete(focused, parts[1])
                print("Deleted key.")
                return
            if sub == "set_index":
                if len(parts) < 2:
                    raise BookkeepingError("kv.set_index <key>")
                self.reg.kv_set_index(focused, parts[1])
                print("Indexed key.")
                return
            if sub == "unset_index":
                if len(parts) < 2:
                    raise BookkeepingError("kv.unset_index <key>")
                self.reg.kv_unset_index(focused, parts[1])
                print("Unset index.")
                return
            if sub == "lookup":
                if len(parts) < 2:
                    raise BookkeepingError("kv.lookup <key>")
                pprint.pprint(self.reg.kv_get(focused, parts[1]))
                return
            raise BookkeepingError("Unknown kv command.")

        # generic show / to_dict
        if cmd == "show":
            print(self.reg.elements[focused].info())
            return
        if cmd == "to_dict":
            pprint.pprint(self.reg.elements[focused].to_serializable())
            return

        raise BookkeepingError("Unknown command or invalid for focused element.")


# ---- Main Entrypoint ----
def _demo():
    r = ElementRegistry()
    # create a table, graph, kv
    tid = r.create_element("table", "People", columns=["id", "name", "age"])
    gid = r.create_element("graph", "Friends")
    kv = r.create_element("kvp", "Config")

    # mutate
    r.table_insert_row(tid, {"id": 1, "name": "Alice", "age": 30})
    r.table_insert_row(tid, {"id": 2, "name": "Bob", "age": 25})
    r.table_set_index(tid, "id")

    r.graph_add_node(gid, "n1", {"uid": 1, "username": "Alice"})
    r.graph_add_node(gid, "n2", {"uid": 2, "username": "Bob"})
    r.graph_add_edge(gid, "n1", "n2")
    r.graph_set_node_index(gid, "uid")

    r.kv_set(kv, "main_contact", "Alice")
    r.kv_set_index(kv, "main_contact")

    # pointer example: put pointer to kv main_contact in a table
    r.table_update_row(tid, 0, {"name": IndexPointer(kv, "main_contact")})

    print("Registry before save:", r.list_elements())
    r.save_to_file("sample.bin")
    print("Saved sample.bin")

    # load into new registry
    r2 = ElementRegistry()
    r2.load_from_file("sample.bin")
    print("Registry loaded:", r2.list_elements())
    print("Focused after load:", r2.focused_element_id)

    # undo / redo demo
    r2.delete_element(tid)
    print("After delete, elements:", r2.list_elements())
    r2.undo()
    print("After undo, elements:", r2.list_elements())
    r2.redo()
    print("After redo, elements:", r2.list_elements())


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--demo":
        _demo()
    else:
        cli = CLI()
        cli.run()
