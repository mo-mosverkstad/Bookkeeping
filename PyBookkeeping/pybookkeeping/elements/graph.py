from utils import BookkeepingError, _serialize, _deserialize
from element import Element
from typing import Any, Dict, List, Optional

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