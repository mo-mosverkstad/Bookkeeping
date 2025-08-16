from typing import Any
from indexpointer import IndexPointer

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