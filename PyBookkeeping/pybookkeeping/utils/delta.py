from dataclasses import dataclass
from typing import Any, Dict, List, Optional

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