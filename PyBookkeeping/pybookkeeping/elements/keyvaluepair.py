from utils import BookkeepingError, _serialize, _deserialize
from element import Element
from typing import Any, Dict, List, Optional

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