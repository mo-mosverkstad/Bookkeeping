"""
Simple terminal CSV editor inspired by sc-im but WITHOUT any formula/evaluation support.
Undo/Redo implemented with a Memento pattern and Python type annotations.

Usage:
    python terminal_csv_editor.py [path/to/file.csv]

Keybindings (inside program):
  Arrow keys / h j k l  : move cursor
  PageUp / PageDown     : move a page
  Enter                 : edit current cell
  i                     : insert row below cursor
  I                     : insert column to the right
  d                     : delete current row
  D                     : delete current column
  s                     : save (overwrite current file)
  S                     : save as (enter path)
  /                     : search (forward)
  n                     : next search result
  u                     : undo last change (multi-level)
  r                     : redo (multi-level)
  q                     : quit (asks to save if modified)
  h or ?                : help screen
"""
from __future__ import annotations

import curses
import csv
import sys
import os
import tempfile
import copy
from dataclasses import dataclass
from typing import List, Optional, Tuple, Any

# Config
MIN_COL_WIDTH = 6
PADDING = 1
MAX_HISTORY = 100  # max undo history entries


def clamp(v: int, a: int, b: int) -> int:
    return max(a, min(b, v))


@dataclass
class Memento:
    """Simple memento holding full snapshot of rows."""
    rows: List[List[str]]


class CSVModel:
    """In-memory CSV model. All values are stored as strings. No formula interpretation."""

    rows: List[List[str]]
    dirty: bool
    filename: Optional[str]
    undo_stack: List[Memento]
    redo_stack: List[Memento]
    max_history: int

    def __init__(self, rows: Optional[List[List[str]]] = None, max_history: int = MAX_HISTORY) -> None:
        self.rows = copy.deepcopy(rows) if rows is not None else []
        self.dirty = False
        self.filename = None
        self.undo_stack = []
        self.redo_stack = []
        self.max_history = max_history

    @classmethod
    def load(cls, path: str, dialect: Any = csv.excel) -> "CSVModel":
        rows: List[List[str]] = []
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.reader(f, dialect=dialect)
            for r in reader:
                rows.append([cell for cell in r])
        inst = cls(rows)
        inst.filename = path
        inst.dirty = False
        return inst

    def save(self, path: Optional[str] = None, dialect: Any = csv.excel) -> None:
        if path is None:
            if not self.filename:
                raise ValueError("No filename provided")
            path = self.filename
        # write to temp then replace to avoid data loss
        fd, tmp = tempfile.mkstemp(prefix="csv_editor_")
        os.close(fd)
        try:
            with open(tmp, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f, dialect=dialect)
                for r in self.rows:
                    writer.writerow([str(cell) for cell in r])
            os.replace(tmp, path)
            self.filename = path
            self.dirty = False
        finally:
            if os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except Exception:
                    pass

    def ensure_rectangular(self) -> None:
        # make all rows same length
        maxc = max((len(r) for r in self.rows), default=0)
        for r in self.rows:
            if len(r) < maxc:
                r.extend([""] * (maxc - len(r)))

    # --- Memento management ---

    def _create_memento(self) -> Memento:
        """Create a deep copy memento of current state."""
        return Memento(rows=copy.deepcopy(self.rows))

    def _push_undo(self) -> None:
        """Push current state to undo stack and cap history."""
        self.undo_stack.append(self._create_memento())
        # cap undo history
        if len(self.undo_stack) > self.max_history:
            # drop oldest
            self.undo_stack.pop(0)
        # any new change invalidates redo history
        self.redo_stack.clear()

    def undo(self) -> bool:
        """Undo last change. Returns True if an undo occurred."""
        if not self.undo_stack:
            return False
        # move current state to redo stack
        self.redo_stack.append(self._create_memento())
        # pop previous state and restore
        m = self.undo_stack.pop()
        self.rows = copy.deepcopy(m.rows)
        self.dirty = True
        return True

    def redo(self) -> bool:
        """Redo last undone change. Returns True if a redo occurred."""
        if not self.redo_stack:
            return False
        # push current to undo before redo
        self.undo_stack.append(self._create_memento())
        m = self.redo_stack.pop()
        self.rows = copy.deepcopy(m.rows)
        self.dirty = True
        return True

    # --- Editing operations (all mutating ops call _push_undo first) ---

    def set_cell(self, r: int, c: int, value: str) -> None:
        self._push_undo()
        self.ensure_rectangular()
        if r < 0 or c < 0:
            return
        while r >= len(self.rows):
            self.rows.append([])
        while c >= len(self.rows[r]):
            self.rows[r].append("")
        self.rows[r][c] = value
        self.dirty = True

    def get_cell(self, r: int, c: int) -> str:
        if r < 0 or c < 0:
            return ""
        if r >= len(self.rows):
            return ""
        row = self.rows[r]
        if c >= len(row):
            return ""
        return row[c]

    def insert_row(self, r: int) -> None:
        self._push_undo()
        cols = max((len(row) for row in self.rows), default=0)
        new = [""] * cols
        if r < 0:
            r = 0
        # insert after the current row (keeps original behavior)
        insert_at = min(len(self.rows), r + 1)
        self.rows.insert(insert_at, new)
        self.dirty = True

    def delete_row(self, r: int) -> None:
        if 0 <= r < len(self.rows):
            self._push_undo()
            del self.rows[r]
            self.dirty = True

    def insert_col(self, c: int) -> None:
        self._push_undo()
        if c < 0:
            c = 0
        # insert new column at index c+1 (to the right of c)
        insert_at = c + 1
        for row in self.rows:
            if len(row) <= insert_at:
                # extend row enough to include new column
                while len(row) < insert_at:
                    row.append("")
                row.append("")
            else:
                row.insert(insert_at, "")
        self.dirty = True

    def delete_col(self, c: int) -> None:
        self._push_undo()
        for row in self.rows:
            if 0 <= c < len(row):
                del row[c]
        self.dirty = True


class CSVEditor:
    def __init__(self, stdscr: Any, model: CSVModel) -> None:
        self.stdscr = stdscr
        self.model = model
        self.top_row = 0
        self.left_col = 0
        self.cur_row = 0
        self.cur_col = 0
        self.col_widths: List[int] = []
        self.search_term = ""
        self.search_matches: List[Tuple[int, int]] = []  # list of (r,c)
        self.match_index = 0
        self.message = ""

    def fit_column_widths(self, max_width: int) -> None:
        # compute suggested widths based on content (but limited)
        cols = max((len(r) for r in self.model.rows), default=0)
        widths: List[int] = [MIN_COL_WIDTH] * cols
        for r in self.model.rows:
            for j, cell in enumerate(r):
                w = max(MIN_COL_WIDTH, len(str(cell)) + PADDING)
                if j < len(widths):
                    widths[j] = max(widths[j], min(w, max_width // 2))
                else:
                    widths.append(min(w, max_width // 2))
        self.col_widths = widths

    def draw(self) -> None:
        self.stdscr.erase()
        h, w = self.stdscr.getmaxyx()
        usable_h = h - 3  # reserve status + message + input
        usable_w = w - 1
        self.fit_column_widths(usable_w)
        
        # compute absolute column start positions
        x = 0
        col_positions: List[int] = []
        for idx, cw in enumerate(self.col_widths):
            col_positions.append(x)
            x += cw + 1
        
        # determine which columns are visible starting from left_col
        visible_cols: List[int] = []
        total_w = 0
        for j in range(self.left_col, len(self.col_widths)):
            cw = self.col_widths[j]
            if total_w + cw + 1 > usable_w:
                break
            visible_cols.append(j)
            total_w += cw + 1
        
        # draw header
        header = "    "
        for j in visible_cols:
            cw = self.col_widths[j]
            label = f" C{j} "
            header += label.ljust(cw + 1)[: cw + 1]
        try:
            self.stdscr.addstr(0, 0, header[: w - 1])
        except curses.error:
            pass
        
        # draw truncation markers if part of sheet hidden
        if self.left_col > 0:
            try:
                self.stdscr.addstr(0, 0, "<", curses.A_BOLD)
            except curses.error:
                pass
        if visible_cols and visible_cols[-1] < len(self.col_widths) - 1:
            try:
                self.stdscr.addstr(0, w - 2, ">", curses.A_BOLD)
            except curses.error:
                pass
        
        # draw visible rows
        for screen_r in range(usable_h):
            model_r = self.top_row + screen_r
            if model_r >= len(self.model.rows):
                break
            row = self.model.rows[model_r]
            line = f"{model_r:4d} "
            for j in visible_cols:
                cell = row[j] if j < len(row) else ""
                cw = self.col_widths[j]
                text = str(cell)
                if len(text) > cw:
                    text = text[: max(0, cw - 1)] + "~"
                line += text.ljust(cw + 1)[: cw + 1]
            try:
                self.stdscr.addstr(1 + screen_r, 0, line[: w - 1])
            except curses.error:
                pass
        
        # highlight current cell
        cr = self.cur_row - self.top_row
        cc = self.cur_col
        if 0 <= cr < usable_h and cc in visible_cols:
            rel_index = visible_cols.index(cc)
            x = 5 + sum(self.col_widths[self.left_col + i] + 1 for i in range(rel_index))
            cw = self.col_widths[cc]
            cell_text = self.model.get_cell(self.cur_row, self.cur_col)
            text = str(cell_text)
            if len(text) > cw:
                text = text[: max(0, cw - 1)] + "~"
            disp = text.ljust(cw + 1)[: cw + 1]
            try:
                self.stdscr.addstr(1 + cr, x, disp[: w - x - 1], curses.A_REVERSE)
            except curses.error:
                pass
        
        # status bar
        status = f"File: {self.model.filename or '<unnamed>'}  Pos: {self.cur_row},{self.cur_col}  Rows: {len(self.model.rows)}"
        if self.model.dirty:
            status += "  [modified]"
        try:
            self.stdscr.addstr(h - 3, 0, status[: w - 1], curses.A_BOLD)
        except curses.error:
            pass
        
        # message line
        try:
            self.stdscr.addstr(h - 2, 0, (self.message or "")[: w - 1])
        except curses.error:
            pass
        
        # help hint
        hint = "Press 'h' for help | 's' save | 'q' quit | 'u' undo | 'r' redo"
        try:
            self.stdscr.addstr(h - 1, 0, hint[: w - 1], curses.A_DIM)
        except curses.error:
            pass
        
        self.stdscr.refresh()


    def edit_cell(self) -> None:
        # open a simple input line at bottom
        h, w = self.stdscr.getmaxyx()
        prompt = f"Edit ({self.cur_row},{self.cur_col}): "
        old = self.model.get_cell(self.cur_row, self.cur_col)
        curses.echo()
        curses.curs_set(1)
        self.stdscr.addstr(h - 2, 0, " " * (w - 1))
        self.stdscr.addstr(h - 2, 0, prompt)
        self.stdscr.addstr(h - 1, 0, "(All text — formulas are NOT evaluated)")
        self.stdscr.clrtoeol()
        self.stdscr.move(h - 2, len(prompt))
        try:
            new = self.stdscr.getstr(h - 2, len(prompt), w - len(prompt) - 1).decode("utf-8")
        except Exception:
            new = old
        curses.noecho()
        curses.curs_set(0)
        # IMPORTANT: do NOT evaluate; treat as raw text
        if new != old:
            self.model.set_cell(self.cur_row, self.cur_col, new)
            self.message = f"Cell updated"
        else:
            self.message = "No change"

    def prompt(self, prompt_text: str) -> Optional[str]:
        h, w = self.stdscr.getmaxyx()
        curses.echo()
        curses.curs_set(1)
        self.stdscr.addstr(h - 2, 0, " " * (w - 1))
        self.stdscr.addstr(h - 2, 0, prompt_text)
        self.stdscr.clrtoeol()
        self.stdscr.move(h - 2, len(prompt_text))
        try:
            res = self.stdscr.getstr(h - 2, len(prompt_text), w - len(prompt_text) - 1).decode("utf-8")
        except Exception:
            res = None
        curses.noecho()
        curses.curs_set(0)
        return res

    def search(self) -> None:
        term = self.prompt("Search term: ")
        if not term:
            self.message = "Search cancelled"
            return
        self.search_term = term
        self.search_matches = []
        for i, row in enumerate(self.model.rows):
            for j, cell in enumerate(row):
                if term in str(cell):
                    self.search_matches.append((i, j))
        if not self.search_matches:
            self.message = f"No matches for '{term}'"
            return
        self.match_index = 0
        r, c = self.search_matches[0]
        self.cur_row, self.cur_col = r, c
        self.ensure_visible()
        self.message = f"{len(self.search_matches)} matches — at {r},{c}"

    def next_match(self) -> None:
        if not self.search_matches:
            self.message = "No search active"
            return
        self.match_index = (self.match_index + 1) % len(self.search_matches)
        r, c = self.search_matches[self.match_index]
        self.cur_row, self.cur_col = r, c
        self.ensure_visible()
        self.message = f"Match {self.match_index + 1}/{len(self.search_matches)} at {r},{c}"

    def ensure_visible(self) -> None:
        h, w = self.stdscr.getmaxyx()
        usable_h = h - 3
        usable_w = w - 1
        
        # --- vertical scrolling ---
        if self.cur_row < self.top_row:
            self.top_row = self.cur_row
        elif self.cur_row >= self.top_row + usable_h:
            self.top_row = self.cur_row - usable_h + 1
        
        # --- horizontal scrolling ---
        # scroll left if cursor went off left side
        if self.cur_col < self.left_col:
            self.left_col = self.cur_col
        else:
            # determine how many columns fit from left_col
            total_w = 0
            j = self.left_col
            while j < len(self.col_widths) and total_w + self.col_widths[j] + 1 < usable_w:
                total_w += self.col_widths[j] + 1
                j += 1
            rightmost_visible_col = j - 1
            if self.cur_col > rightmost_visible_col:
                # move right until the cursor is visible
                self.left_col += 1
                self.ensure_visible()

    def save(self) -> None:
        if not self.model.filename:
            path = self.prompt("Save as path: ")
            if not path:
                self.message = "Save cancelled"
                return
            try:
                self.model.save(path)
                self.message = f"Saved to {path}"
            except Exception as e:
                self.message = f"Save failed: {e}"
        else:
            try:
                self.model.save()
                self.message = f"Saved to {self.model.filename}"
            except Exception as e:
                self.message = f"Save failed: {e}"

    def run(self) -> None:
        self.stdscr.keypad(True)
        curses.curs_set(0)
        while True:
            self.draw()
            ch = self.stdscr.getch()
            self.message = ""
            if ch in (curses.KEY_DOWN, ord('j')):
                self.cur_row += 1
                self.cur_row = clamp(self.cur_row, 0, max(0, len(self.model.rows) - 1))
                self.ensure_visible()
            elif ch in (curses.KEY_UP, ord('k')):
                self.cur_row -= 1
                self.cur_row = clamp(self.cur_row, 0, max(0, len(self.model.rows) - 1))
                self.ensure_visible()
            elif ch in (curses.KEY_LEFT, ord('h')):
                self.cur_col -= 1
                self.cur_col = clamp(self.cur_col, 0, max(0, len(self.col_widths) - 1))
                self.ensure_visible()
            elif ch in (curses.KEY_RIGHT, ord('l')):
                self.cur_col += 1
                self.cur_col = clamp(self.cur_col, 0, max(0, len(self.col_widths) - 1))
                self.ensure_visible()
            elif ch == curses.KEY_NPAGE:
                h, w = self.stdscr.getmaxyx()
                self.cur_row += (h - 5)
                self.cur_row = clamp(self.cur_row, 0, max(0, len(self.model.rows) - 1))
                self.ensure_visible()
            elif ch == curses.KEY_PPAGE:
                h, w = self.stdscr.getmaxyx()
                self.cur_row -= (h - 5)
                self.cur_row = clamp(self.cur_row, 0, max(0, len(self.model.rows) - 1))
                self.ensure_visible()
            elif ch in (10, 13):  # Enter
                self.edit_cell()
            elif ch == ord('i'):
                self.model.insert_row(self.cur_row)
                self.cur_row += 1
                self.message = "Inserted row"
            elif ch == ord('d'):
                # delete current row
                if self.cur_row < len(self.model.rows):
                    self.model.delete_row(self.cur_row)
                    self.cur_row = clamp(self.cur_row, 0, max(0, len(self.model.rows) - 1))
                    self.message = "Deleted row"
                else:
                    self.message = "No row to delete"
            elif ch == ord('I'):
                self.model.insert_col(self.cur_col)
                self.cur_col += 1
                self.message = "Inserted column"
            elif ch == ord('D'):
                self.model.delete_col(self.cur_col)
                self.cur_col = clamp(self.cur_col, 0, max(0, len(self.col_widths) - 1))
                self.message = "Deleted column"
            elif ch == ord('s'):
                self.save()
            elif ch == ord('S'):
                path = self.prompt("Save as path: ")
                if path:
                    try:
                        self.model.save(path)
                        self.message = f"Saved to {path}"
                    except Exception as e:
                        self.message = f"Save failed: {e}"
                else:
                    self.message = "Save cancelled"
            elif ch == ord('/'):
                self.search()
            elif ch == ord('n'):
                self.next_match()
            elif ch == ord('u'):
                ok = self.model.undo()
                self.message = "Undo" if ok else "Nothing to undo"
                # ensure current cursor still valid
                self.cur_row = clamp(self.cur_row, 0, max(0, len(self.model.rows) - 1))
                self.cur_col = clamp(self.cur_col, 0, max(0, len(self.col_widths) - 1))
            elif ch == ord('o'):
                path = self.prompt("Open path: ")
                if path:
                    try:
                        new_model = CSVModel.load(path)
                        self.model = new_model
                        self.cur_row = self.cur_col = 0
                        self.top_row = self.left_col = 0
                        self.message = f"Loaded {path}"
                    except Exception as e:
                        self.message = f"Failed to load: {e}"
                else:
                    self.message = "Open cancelled"
            elif ch == ord('r'):
                ok = self.model.redo()
                self.message = "Redo" if ok else "Nothing to redo"
                self.cur_row = clamp(self.cur_row, 0, max(0, len(self.model.rows) - 1))
                self.cur_col = clamp(self.cur_col, 0, max(0, len(self.col_widths) - 1))
            elif ch in (ord('q'), 27):
                if self.model.dirty:
                    ans = self.prompt("Unsaved changes. Quit without saving? (y/N): ")
                    if ans and ans.lower().startswith('y'):
                        return
                    else:
                        self.message = "Quit cancelled"
                else:
                    return
            elif ch in (ord('h'), ord('?')):
                self.show_help()
            else:
                self.message = f"Key: {ch}"

    def show_help(self) -> None:
        help_lines = [
            "CSV editor — help",
            "Arrow keys or h/j/k/l : move",
            "Enter : edit cell (text only — no formulas evaluated)",
            "i : insert row below",
            "d : delete row",
            "I : insert column to right",
            "D : delete column",
            "o : open/load CSV file",
            "s : save, S : save as",
            "/ : search, n : next",
            "u : undo (multi-level), r : redo",
            "q : quit",
            "Press any key to return",
        ]
        h, w = self.stdscr.getmaxyx()
        self.stdscr.erase()
        for idx, ln in enumerate(help_lines):
            try:
                self.stdscr.addstr(idx + 2, 4, ln[: w - 8])
            except curses.error:
                pass
        self.stdscr.refresh()
        self.stdscr.getch()


def main(stdscr: Any, path: Optional[str]) -> None:
    model = CSVModel()
    if path:
        try:
            model = CSVModel.load(path)
        except Exception:
            model = CSVModel([])
            model.filename = path
            model.dirty = True
    editor = CSVEditor(stdscr, model)
    editor.run()


if __name__ == '__main__':
    path_arg = sys.argv[1] if len(sys.argv) > 1 else None
    curses.wrapper(main, path_arg)
