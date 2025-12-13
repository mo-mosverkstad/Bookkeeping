"""
Simple terminal CSV editor (multiline cell support)

Changes made:
- Multiline cells supported and displayed correctly on the grid.
- Cell editor is a scrollable textbox (uses curses.textpad). "Enter" inside the editor inserts a newline.
- Commit the edit with Ctrl+G (default Textbox EOF). Ctrl+G means "commit" as requested.
- Always uses type annotations.

Usage: same as before.
"""
from __future__ import annotations

import curses
import curses.textpad as textpad
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
        self.top_row = 0  # index of topmost model row displayed
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
                # consider longest line in a multiline cell
                lines = str(cell).splitlines() or [""]
                max_line_len = max((len(ln) for ln in lines), default=0)
                w = max(MIN_COL_WIDTH, max_line_len + PADDING)
                if j < len(widths):
                    widths[j] = max(widths[j], min(w, max_width // 2))
                else:
                    widths.append(min(w, max_width // 2))
        self.col_widths = widths

    def _row_height(self, row: List[str], visible_cols: List[int]) -> int:
        # height is maximum number of lines among visible cells in the row
        max_lines = 1
        for j in visible_cols:
            if j < len(row):
                lines = str(row[j]).splitlines() or [""]
                max_lines = max(max_lines, len(lines))
        return max_lines

    
    
    def _render_footer(self, w: int) -> str:
        """
        Build a formula/status bar line that reliably fits width w.
        Left (left gravity): filename[*] [two-space] action/message (if any)
        Right (right gravity): "row:col | total_rows"
        Returns string exactly w characters long (or shorter when w < 10).
        """
        # safety minimum
        if w < 10:
            # very narrow terminal — minimal footer
            right = f"{self.cur_row}:{self.cur_col}|{len(self.model.rows)}"
            left = (self.model.filename or "<unnamed>")[: max(0, w - len(right) - 1)]
            line = f"{left}{' ' * max(1, w - len(left) - len(right))}{right}"
            return line[:w]

        # prepare right text and measure
        right = f"{self.cur_row}:{self.cur_col} | {len(self.model.rows)}"
        right_len = len(right)

        # prepare left parts
        fname = self.model.filename or "<unnamed>"
        dirty = "*" if self.model.dirty else ""
        # action/message placed immediately to the right of filename (with two spaces)
        action = (self.message or "").strip()
        # Compose base left text (filename + dirty)
        left_base = fname + dirty

        # Determine how much width is available for left side (including one leading and trailing padding)
        avail_for_left = w - right_len - 2  # spaces for padding: one leading, one between left and right
        if avail_for_left <= 0:
            # extremely tight: only show right text
            line = right.rjust(w)
            return line[:w]

        # Reserve at least 8 chars for filename when possible
        min_fname = 8
        # Build left_text = left_base + ("  " + action) if action exists
        if action:
            sep = "  "
            left_full = f"{left_base}{sep}{action}"
        else:
            left_full = left_base

        # If left_full fits, use it; otherwise ellipsize filename (keep action visible if possible)
        if len(left_full) <= avail_for_left:
            left_display = left_full
        else:
            # try to keep action portion fully if possible
            if action and len(action) + 3 < avail_for_left:
                # keep tail (action) and ellipsize filename
                max_fname_len = avail_for_left - len(action) - 3  # allow for "..." and two-space sep
                if max_fname_len < min_fname:
                    # force show minimal fname head
                    max_fname_len = max(3, min_fname)
                # ellipsize filename preserving end (extension)
                if "." in fname and len(fname) > max_fname_len + 3:
                    base, _, ext = fname.rpartition(".")
                    # keep some head of base and extension
                    keep_head = max(1, max_fname_len - len(ext) - 1)
                    fname_short = fname[:keep_head] + "..." + ext
                else:
                    fname_short = fname[: max(0, max_fname_len - 3)] + "..."
                left_display = f"{fname_short}{dirty}{sep}{action}"
                # if still too long, truncate rightmost of action
                if len(left_display) > avail_for_left:
                    left_display = left_display[:avail_for_left]
            else:
                # no (useful) action or action too large — ellipsize overall left_full
                if len(left_base) > avail_for_left - 3:
                    left_display = left_base[: max(0, avail_for_left - 3)] + "..."
                else:
                    left_display = left_base[:avail_for_left]

        # compute spacing between left_display and right so that total length is w
        space_between = w - len(left_display) - right_len
        if space_between < 1:
            # ensure at least one space; trim left_display if needed
            trim = 1 - space_between
            left_display = left_display[: max(0, len(left_display) - trim)]
            space_between = 1
        middle = " " * space_between

        line = f"{left_display}{middle}{right}"
        # If shorter, pad at right (shouldn't normally happen)
        if len(line) < w:
            line = line + " " * (w - len(line))
        return line[:w]

    
    def draw(self) -> None:
        self.stdscr.erase()
        h, w = self.stdscr.getmaxyx()
        # Reserve 1 row for footer at bottom — grid can use h-1 rows
        usable_h = max(1, h - 1)
        usable_w = w - 1
        self.fit_column_widths(usable_w)

        # determine which columns are visible starting from left_col
        visible_cols: List[int] = []
        total_w = 0
        for j in range(self.left_col, len(self.col_widths)):
            cw = self.col_widths[j]
            if total_w + cw + 1 > usable_w:
                break
            visible_cols.append(j)
            total_w += cw + 1

        # draw header (single line)
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

        # draw visible rows with multiline support
        screen_line = 1
        row_idx = self.top_row
        # stop before last row reserved for footer
        while screen_line <= usable_h - 1 and row_idx < len(self.model.rows):
            row = self.model.rows[row_idx]
            row_h = self._row_height(row, visible_cols)
            for subline in range(row_h):
                if screen_line > usable_h - 1:
                    break
                # show row number only on first subline
                prefix = f"{row_idx:4d} " if subline == 0 else "     "
                line = prefix
                for j in visible_cols:
                    cw = self.col_widths[j]
                    cell = row[j] if j < len(row) else ""
                    lines = str(cell).splitlines() or [""]
                    text = lines[subline] if subline < len(lines) else ""
                    if len(text) > cw:
                        text = text[: max(0, cw - 1)] + "~"
                    line += text.ljust(cw + 1)[: cw + 1]
                try:
                    # if this line contains the current cell, highlight that region
                    if row_idx == self.cur_row:
                        # compute x position of cur_col
                        if self.cur_col in visible_cols:
                            rel_index = visible_cols.index(self.cur_col)
                            x = 5 + sum(self.col_widths[self.left_col + i] + 1 for i in range(rel_index))
                            cw = self.col_widths[self.cur_col]
                            # draw left part
                            self.stdscr.addstr(screen_line, 0, line[: w - 1])
                            # apply reverse for cell area
                            try:
                                substr = line[x: x + cw + 1]
                                self.stdscr.addstr(screen_line, x, substr[: max(0, w - x - 1)], curses.A_REVERSE)
                            except curses.error:
                                pass
                        else:
                            self.stdscr.addstr(screen_line, 0, line[: w - 1])
                    else:
                        self.stdscr.addstr(screen_line, 0, line[: w - 1])
                except curses.error:
                    pass
                screen_line += 1
            row_idx += 1

        # ---------- Footer area (bottom-most line): formula/status bar (includes action/message) ----------
        footer = self._render_footer(w)
        try:
            # draw footer with reverse attribute to stand out
            self.stdscr.addstr(h - 1, 0, footer, curses.A_REVERSE)
        except curses.error:
            try:
                self.stdscr.addstr(h - 1, 0, footer[: w - 1], curses.A_REVERSE)
            except curses.error:
                pass

        self.stdscr.refresh()


    def edit_cell(self) -> None:
        """Open a scrollable multiline text box for editing the current cell.

        - Enter inside the box inserts newline.
        - Commit with Ctrl+G (Textpad default EOF).
        """
        h, w = self.stdscr.getmaxyx()
        old = self.model.get_cell(self.cur_row, self.cur_col)
        # choose box size: up to half the terminal height, leave space for borders
        box_h = min(max(3, (h // 2)), h - 6)
        box_w = min(max(10, (w - 10)), w - 6)
        start_y = max(1, (h - box_h) // 2)
        start_x = max(1, (w - box_w) // 2)

        # create bordered window
        win = curses.newwin(box_h + 2, box_w + 2, start_y - 1, start_x - 1)
        win.box()
        title = f" Edit ({self.cur_row},{self.cur_col}) — Ctrl+G to commit "
        try:
            win.addstr(0, 2, title[: box_w - 2], curses.A_BOLD)
        except curses.error:
            pass
        # inner window for textpad
        edit_win = curses.newwin(box_h, box_w, start_y, start_x)
        edit_win.keypad(True)
        # prefill with existing content
        lines = old.splitlines() or [""]
        for idx, ln in enumerate(lines[: box_h]):
            try:
                edit_win.addstr(idx, 0, ln[: box_w - 1])
            except curses.error:
                pass
        self.stdscr.refresh()
        win.refresh()

        tb = textpad.Textbox(edit_win, insert_mode=True)
        # textpad.Textbox.edit() returns after Ctrl+G (ASCII 7) by default
        curses.curs_set(1)
        try:
            edited = tb.edit()
        except KeyboardInterrupt:
            edited = old
        curses.curs_set(0)
        # Textbox.gather may include trailing newlines/spaces; keep as-is
        new = edited.rstrip('\n')
        if new != old:
            self.model.set_cell(self.cur_row, self.cur_col, new)
            self.message = "Cell updated"
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

        # if cursor row above current top, bring it to top
        if self.cur_row < self.top_row:
            self.top_row = self.cur_row
            return
        # if cursor row is equal or below, ensure cumulative heights fit
        # compute visible range starting from top_row
        total = 0
        idx = self.top_row
        last_visible = self.top_row
        visible_rows: List[int] = []
        while idx < len(self.model.rows) and total < usable_h:
            row = self.model.rows[idx]
            # assume columns previously computed
            visible_cols = list(range(self.left_col, min(len(self.col_widths), self.left_col + 50)))
            rh = self._row_height(row, visible_cols)
            total += rh
            if total <= usable_h:
                visible_rows.append(idx)
                last_visible = idx
            idx += 1
        if self.cur_row > last_visible:
            # scroll down until cur_row visible
            while self.cur_row > last_visible and self.top_row < self.cur_row:
                self.top_row += 1
                # recompute last_visible
                total = 0
                idx = self.top_row
                last_visible = self.top_row
                while idx < len(self.model.rows) and total < usable_h:
                    row = self.model.rows[idx]
                    visible_cols = list(range(self.left_col, min(len(self.col_widths), self.left_col + 50)))
                    rh = self._row_height(row, visible_cols)
                    total += rh
                    if total <= usable_h:
                        last_visible = idx
                    idx += 1

        # horizontal (simple existing behaviour)
        if self.cur_col < self.left_col:
            self.left_col = self.cur_col
        else:
            total_w = 0
            j = self.left_col
            while j < len(self.col_widths) and total_w + self.col_widths[j] + 1 < (w - 1):
                total_w += self.col_widths[j] + 1
                j += 1
            rightmost_visible_col = j - 1
            if self.cur_col > rightmost_visible_col:
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
            elif ch in (10, 13):  # Enter -> open multiline editor
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
               pass 

    def show_help(self) -> None:
        """
        Show a focused help page. Note: '?' is help — 'h' is navigation (left).
        """
        help_lines = [
            "CSV editor — help",
            "",
            "Movement:",
            "  Arrow keys or h/j/k/l  : move left/down/up/right",
            "",
            "Editing:",
            "  Enter    : edit cell (opens multiline editor; inside editor Enter inserts newline)",
            "  Ctrl+G   : commit edit",
            "  Ctrl+C / Esc : cancel edit",
            "",
            "File & history:",
            "  s : save    | S : save as",
            "  o : open/load CSV file",
            "  u : undo   | r : redo",
            "",
            "Other:",
            "  / : search   | n : next match",
            "  ? : this help screen",
            "  q : quit",
            "",
            "Press any key to return",
        ]
        h, w = self.stdscr.getmaxyx()
        self.stdscr.erase()
        # center the help vertically a bit and indent for readability
        top = max(1, (h - len(help_lines)) // 3)
        for idx, ln in enumerate(help_lines):
            try:
                self.stdscr.addstr(top + idx, 4, ln[: w - 8])
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
