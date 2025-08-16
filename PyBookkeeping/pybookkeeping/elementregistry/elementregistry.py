from __future__ import annotations
import json
import os
import struct
from typing import Any, Dict, List, Optional, Tuple

from utils import Delta, IndexPointer

from elements import *

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