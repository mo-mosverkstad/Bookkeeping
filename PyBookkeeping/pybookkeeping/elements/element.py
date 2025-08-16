from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

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