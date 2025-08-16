from __future__ import annotations
import shlex
from typing import Any, Dict, List
import pprint

from elements import *

from pybookkeeping import elements
from utils import BookkeepingError, IndexPointer
from elementregistry import ElementRegistry


HELP = """\nCommands (stable slots by numeric positions):\n  help\n  create <type> <name> [<slot_pos>]    Create element and place in first-empty or given slot\n  createref [<slot_pos>] <element_id>   Insert existing element into current's slot\n  updateref <slot_pos> <new_element_id> Change slot's target\n  deleteref <slot_pos>                 Clear slot (set to 0) if safe\n  delete <slot_pos>                    Delete element referenced at slot (element must be leaf)\n  list                                 List slots (position -> id)\n  inspect <slot_pos>                   Inspect element at slot\n  descend <slot_pos>                   Descend into slot (push slot position)\n  ascend                               Ascend to parent (pop)\n  tbl.* / g.* / kv.*                   Element-specific commands on current element\n  save <file> / load <file>\n  undo / redo / history\n  info\n  exit\n"""

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