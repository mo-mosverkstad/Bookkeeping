from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from utils import BookkeepingError

from element import Element
from table import Table
from graph import Graph
from keyvaluepair import KeyValuePair

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