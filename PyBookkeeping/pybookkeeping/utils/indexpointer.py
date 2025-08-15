# ---- IndexPointer ----
@dataclass(frozen=True)
class IndexPointer:
    target_element_id: int
    target_index_key: str

    def __repr__(self):
        return f"<IndexPointer {self.target_element_id}::{self.target_index_key}>"


