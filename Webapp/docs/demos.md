# Demos

## Phase 1 — Math Syntax: Expression Parser & Renderer

---

## Environment Setup

See `environment_setup.md` for the full guide on installing Node.js and npm.

Quick summary — in WSL Ubuntu or a terminal at the `Webapp/` folder:
```bash
npm install
```
This installs Vite and TypeScript locally from `package.json`. No global
installs are needed.

---

## How to Build

### Development build (with hot reload)
```bash
npm run dev
```
Vite starts a local server. Output will look like:
```
  VITE v8.x.x  ready in Xms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```
Open `http://localhost:5173` in a browser. The page reloads automatically
whenever you save a source file.

### Production build
```bash
npm run build
```
This runs `tsc` (type-check only) then Vite bundles everything into `dist/`.
The output is a static site that can be hosted anywhere.

### Preview the production build
```bash
npm run preview
```
Serves the `dist/` folder locally so you can verify the production build
before deploying.

---

## How to Run the Demo

1. Run `npm run dev`
2. Open `http://localhost:5173`
3. The page loads with the first test case `-2*(3+5)*4e^x^2` pre-filled
   and rendered automatically
4. To cycle through all Phase 1 test cases, open the browser console
   (`F12`) and call:
   ```js
   __nextTest()
   ```
   Each call advances to the next test case and re-renders.
5. To try your own expression: type into the input and click **Render**

---

## Expected Results

### Test case cycle (call `__nextTest()` in console to advance)

| # | Input | Expected visual |
|---|-------|-----------------|
| 1 | `-2*(3+5)*4e^x^2` | `(-2)(3 + 5)(4)e`^`(x`^`2)` |
| 2 | `a/b + c/d` | two stacked fractions joined by ` + ` |
| 3 | `\int{0, 1, x^2}` | ∫ with 0 below, 1 above, body x² **beside** the sign |
| 4 | `\sqrt{x+1}` | radical sign over x + 1 |
| 5 | `` `1T / `1t `` | fraction: right-skewed T over right-skewed t |
| 6 | `\a + \1b` | α + right-skewed β |
| 7 | `\int{0, \p, \s*x^2 + 2x - 1}` | integral from 0 to π, body σx² + 2x − 1 |
| 8 | `(a/b) / (c/d)` | nested stacked fraction |
| 9 | `2x^3 + 3x^2 - x + 1` | polynomial with superscripts |
| 10 | `\int{-1, 1, f(x)*g(x)}` | integral, body f(x)g(x) |
| 11 | `x_i + x_j + x_k` | three subscripted variables |
| 12 | `\a*x^2 + \b*x + \g` | αx² + βx + γ |
| 13 | `a^b^c^d` | right-associative nested superscripts |
| 14 | `--x + -y` | double negation + negation |
| 15 | `2\p r^2` | 2πr² (implicit multiplication with Greek) |

---

## Troubleshooting

### `npm install` fails with `ENOENT: package.json not found`
You are in the wrong directory. Make sure you are inside `Webapp/`, not the
project root `Bookkeeping/`:
```bash
cd Webapp
npm install
```

### `npm run dev` fails with `command not found: vite`
Run `npm install` first. Vite is a local dev dependency, not a global tool.

### The page is blank or shows no output
Open the browser console (`F12 → Console`) and check for errors. Common causes:
- TypeScript compile error — the console will show the file and line
- Missing DOM element — check that `index.html` has `id="input"`, `id="render"`,
  `id="result"`, and `id="error-message"`

### Parse error shown in red on the page
The error message shows the line, column, and what was expected. Example:
```
error: unexpected ')'
 --> inputString:1:6
  |
1 | 2+(3))
  |      ^
  |
  = expected: EOF
```
This means the parser successfully parsed `2+(3)` but found an extra `)` at
the end. Fix the input expression.

### Hot reload not working in WSL
If you are working from `/mnt/c/...` (Windows filesystem via WSL), Vite's file
watcher may not detect changes. Try adding `--poll` to the dev command in
`package.json`:
```json
"dev": "vite --watch-poll"
```
Or copy the project to a native Linux path as described in `environ-setup.md`.

### TypeScript errors on `npm run build`
Run `npx tsc --noEmit` to see all type errors. The most common cause is a
missing import after adding a new file. Check that all types used in a file
are imported from `../parser/types.ts`.

---

## Phase 2 — Math Syntax: Linear Algebra, Rollout Notation & Extended Operators

---

## How to Run the Demo

Same as Phase 1:

```bash
cd Webapp
npm install    # first time only
npm run dev
```

Open `http://localhost:5173` in the Windows browser. Call `__nextTest()` in
the browser console to cycle through all test cases.

---

## Expected Results (Phase 2 test cases)

| # | Input | Expected visual |
|---|-------|-----------------|
| 7 | `[a]` | a with arrow over it (a⃗) |
| 8 | `[[a, b], [c, d]]` | 2×2 matrix with brackets |
| 9 | `(a, b, c)` | 3×1 column vector |
| 10 | `A[k]` | A with subscript k (index) |
| 11 | `u.v` | u · v (centre dot) |
| 12 | `+{k=0, n, A[k]}` | Σ with k=0 below, n above, body A[k] |
| 13 | `*{k=0, n, A[k]}` | Π with k=0 below, n above, body A[k] |
| 14 | `x_i^2` | x with subscript i and superscript 2 stacked |
| 15 | `a <= b` | a ≤ b |
| 16 | `x != y` | x ≠ y |
| 17 | `x \in \\R` | x∈ℝ (implicit multiplication rendering) |
| 18 | `\ha_0` | ℵ with subscript 0 |
| 19 | `n!` | n! |
| 20 | `f'(x)` | f′(x) |
| 21 | `f''(x)` | f′′(x) |
| 22 | `|x|` | |x| |
| 23 | `[a_1, ..., a_n]` | row vector [a₁, …, aₙ] |
| 24 | `\floor{x+1}` | ⌊x+1⌋ |
| 25 | `\ceil{x}` | ⌈x⌉ |
| 26 | `\bar{x}` | x with overline |
| 27 | `\hat{x}` | x with hat |
| 28 | `\inner{x, y}` | ⟨x, y⟩ |
| 29 | `\binom{n, r}` | binomial coefficient (n over r) |
| 30 | `\S{k=0, n, k^2}` | Σ from k=0 to n of k² |
| 31 | `\lim{x->0, f(x)}` | lim with x→0 below, body f(x) |

---

## Design Notes for Phase 2

### Backslash relational operators

The study.md specifies `\sub`, `\in`, `\notin`, etc. as relational operators
at the grammar level. In the implementation, these are handled as regular
backslash identifiers that render via `GLYPH_TABLE`. The visual output is
correct (`x∈ℝ`) but the AST represents them as implicit multiplication
rather than a relational binary expression.

This is a deliberate implementation compromise: the PEG grammar cannot
distinguish `\in` as an operator from `\in` as an identifier without
complex negative lookaheads in the implicit multiplication rule. The
visual rendering is identical either way. A future semantic pass could
reinterpret these nodes if needed.

### Piecewise syntax

The study.md specifies semicolons as separators: `\piecewise{x, x>=0; -x, x<0}`.
The implementation uses commas throughout: `\piecewise{x, x>=0, -x, x<0}`.
The renderer interprets the flat argument list as pairs of (expression, condition).
This avoids grammar complexity while producing the same visual output.


---

## Phase 3 — Plugin System & CSV Table Display

---

## How to Run the Demo

```bash
cd Webapp
npm install    # first time only
npm run dev
```

Open `http://localhost:5173` in the Windows browser.

---

## Demo Steps

### 1. Expression renderer (unchanged from Phase 1-2)

The top section still works as before. Type a math expression, click Render.
Call `__nextTest()` in the console to cycle through all test cases.

### 2. Load the sample CSV

**Option A — File picker:**
1. Click the "Load CSV file" file picker
2. Navigate to `Webapp/public/sample.csv`
3. Select and open

**Option B — Drag and drop:**
1. Open a file explorer window
2. Drag `public/sample.csv` onto the "Drop a .csv file here" zone

### 3. Verify the table

After loading, a table appears with 4 columns:
- **Name** (text) — plain text, no formatting
- **Definition** (text) — plain text descriptions
- **Formula** (math) — rendered with fractions, superscripts, Greek, etc.
- **Domain** (text) — plain text category

### 4. Verify math rendering in cells

| Row | Formula cell should show |
|-----|-------------------------|
| Pythagorean Theorem | a² + b² = c² |
| Quadratic Formula | fraction with √ in numerator |
| Euler's Identity | e^(π·i) + 1 = 0 |
| Derivative Power Rule | f(x) = xⁿ → f′(x) = n·x^(n-1) |
| Integration by Parts | ∫ with bounds and body |
| Area of Circle | A = π·r² |
| Binomial Theorem | Σ with binomial coefficient |
| Aleph Null | ℵ₀ = |ℕ| |

### 5. Test column sorting

1. Click the "Name" column header → rows sort A-Z (▲ indicator)
2. Click "Name" again → rows sort Z-A (▼ indicator)
3. Click "Domain" → sorts by domain alphabetically

### 6. Test error handling

Create a test CSV file with an invalid math cell:
```csv
Name,Expr
text,math
Good,x^2
Bad,@@@invalid
```
Load it. The "Good" row renders `x²`. The "Bad" row shows a red
"Parse error:" message with the caret pointing to the problem character.
The table does not crash.

### 7. Test unknown plugin type fallback

Create a CSV with an unknown type:
```csv
Name,Data
text,unknown_type
Test,some raw data
```
Load it. The "Data" column falls back to plain text rendering — shows
"some raw data" as-is without error.

---

## CSV File Format

```
Row 0: Column display names (comma-separated)
Row 1: Column types — plugin type_id per column ("text", "math", ...)
Row 2+: Data rows
```

The types row tells the system which plugin to use for each column.
Currently supported types:
- `text` — plain text, no formatting
- `math` — BobaMath expression, fully rendered

Any unknown type falls back to `text` gracefully.


---

## Codebase Restructuring

### How to run tests after restructuring

```bash
cd Webapp
npm test
```

Test files now mirror the src structure:

| Test file | What it tests |
|-----------|--------------|
| `test/engine/PEGParser.test.ts` | PEG engine primitives |
| `test/plugins/math/grammar.test.ts` | Math grammar rules |
| `test/plugins/math/render.test.ts` | Math renderer |
| `test/data/csv.test.ts` | CSV parser |
| `test/ui/table.test.ts` | Table component + plugin registry |

### How to run the demo after restructuring

Unchanged — same as Phase 3:

```bash
npm run dev
```

Open `http://localhost:5173`. The expression renderer and CSV table loader
both work as before. The restructuring is internal — no user-visible changes.


---

## Phase 4 — Association Graph & Filtered Table View

---

## How to Run the Demo

```bash
cd Webapp
npm run dev
```

Open `http://localhost:5173` in the Windows browser.

---

## Demo Steps

### 1. Load multiple CSV files

1. Click the file picker (now labeled "Load CSV file(s)")
2. Navigate to `Webapp/public/`
3. Hold Ctrl and select both `theorems.csv` and `definitions.csv`
4. Click Open

Both tables appear below the filter controls.

### 2. Explore the graph filter

After loading, the filter UI appears with:
- **Relation** dropdown — shows "uses" and "is-used-by"
- **Target** dropdown — shows all entity IDs from both files

### 3. Filter by relation

1. Select relation: `uses`
2. Select target: `integral`
3. Click **Filter**
4. Only theorems that use "integral" appear:
   - Fundamental Theorem of Calculus
   - Integration by Parts

### 4. Reset filter

Click **Show All** — all tables reappear unfiltered.

### 5. Inspect entity associations

1. Click any entity name (underlined, first column) — e.g., "Chain Rule"
2. The association detail panel appears showing:
   - **Outgoing:** uses → derivative, uses → composition
3. Click "derivative" link in the panel
4. Panel updates to show derivative's associations:
   - **Incoming:** is-used-by ← Fundamental Theorem of Calculus, is-used-by ← Chain Rule

### 6. Cross-file navigation

The definitions table has inverse associations. Clicking "integral" in the
definitions table shows:
- **Incoming:** is-used-by ← Fundamental Theorem of Calculus, is-used-by ← Integration by Parts

These point to entities in the theorems table — the graph connects both files.

---

## Association Format Reference

### In CSV files

Add a column named `_associations` with semicolon-separated entries:
```
relation-type:target-entity-id;relation-type:target-id
```

Example row:
```csv
Fundamental Theorem of Calculus,"...",Calculus,uses:derivative;uses:integral
```

### Vocabulary file (optional)

`vocabulary.json` defines relation types and their inverses:
```json
{
  "relations": [
    { "name": "uses", "inverse": "is-used-by", "symmetric": false }
  ]
}
```

Without a vocabulary file, the graph still works — inverse names just won't
be resolved in the detail panel.

---

## Phase 5 — Inline Editor

---

## How to Run the Demo

```bash
cd Webapp
npm run dev
```

Open `http://localhost:5173` in the Windows browser.

---

## Demo Steps

### 1. Load a CSV file

1. Click the file picker and select `Webapp/public/sample.csv`
   (or drag it onto the drop zone)
2. The table appears as before

### 2. Edit a text cell

1. Click any cell in a `text`-type column (e.g. the Name column)
2. The cell becomes a source editor — the text is directly editable in place
3. Type a new value
4. Press **Enter** to commit — the cell updates
5. Click the same cell again, change the value, press **Escape** — the
   original value is restored

### 3. Edit a math cell

1. Click any cell in the `math`-type column (e.g. the Formula column)
2. The cell becomes a source editor showing the raw BobaMath source
3. The **Preview bar** appears above the table showing the live rendered
   output of the current source — it updates as you type
4. Edit the source (e.g. change `x^2` to `x^3 + 1`)
5. The preview bar updates in real time
6. Press **Enter** to commit — the cell switches back to rendered view
7. Press **Escape** to cancel — the original source and rendered view are restored

### 4. Verify one-cell-at-a-time constraint

1. Click a math cell — it enters edit mode, preview bar appears
2. Click a different cell without pressing Enter or Escape
3. The first cell commits and returns to rendered view; the new cell
   enters edit mode

### 5. Verify preview bar is blank for text cells and when idle

1. With no cell active: the preview bar is hidden
2. Click a text cell: the preview bar remains hidden (text cells have no
   syntax rendering)
3. Click a math cell: the preview bar appears with the rendered formula
4. Press Escape: the preview bar disappears again

### 6. Undo and redo

1. Edit a cell and commit (Enter)
2. Press **Ctrl+Z** — the cell reverts to its previous value
3. Press **Ctrl+Y** (or Ctrl+Shift+Z) — the edit is re-applied
4. Make several edits across different cells, then undo each one in order

### 7. Add a row

1. Click **+ Add Row** below the table
2. A new empty row appears at the bottom
3. Click cells in the new row to fill them in
4. Press **Ctrl+Z** — the added row is removed

### 8. Delete a row

1. Click the **✕** button at the right end of any row
2. A confirmation dialog appears: "Delete row \"...\"?"
3. Confirm — the row is removed
4. Press **Ctrl+Z** — the row is restored at its original position

### 9. Export CSV

1. Make some edits (add a row, change a cell value)
2. Click **⬇ Export CSV** below the table
3. A `.csv` file is downloaded with the table's current name
4. Open the downloaded file in a text editor — verify it contains the
   updated values, with the correct header row, types row, and data rows
5. Drag the downloaded file back onto the drop zone — the table reloads
   with the exported data intact (round-trip verification)

---

## Troubleshooting

### Preview bar does not appear when editing a math cell
Check that `id="cell-edit-bar"` and `id="cell-edit-preview"` exist in
`index.html`. The bar is hidden by default (`hidden` attribute) and shown
by `TableView` when a syntax cell is activated.

### Clicking a cell does not enter edit mode
The first column of each row is reserved for entity navigation (click =
show associations). Edit mode is triggered by clicking any other column,
or the first column if no `onEntityClick` handler is set.

### Undo does not work
Ctrl+Z is handled by a `keydown` listener on `document` in `main.ts`.
If focus is inside a `contenteditable` cell, the browser may intercept
Ctrl+Z for its own undo. Press Escape first to exit the cell, then Ctrl+Z.

---

## Phase 6 — Binary Format (Skipped)

Phase 6 was skipped. There is no binary file demo.

The application loads and saves CSV files only. The file picker accepts
`.csv` files. Exported files are `.csv` text files.

**Current file format support:**

| Format | Load | Save | Notes |
|--------|------|------|-------|
| CSV    | ✅   | ✅   | Only supported format |
| Binary | ❌   | ❌   | Phase skipped — not implemented |

To load data: use the file picker or drag a `.csv` file onto the drop zone.
To save data: use the **⬇ Export CSV** button below any table.

---

## Phase 7 — Search, Indexing & Tooling

---

## How to Run the Demo

```bash
cd Webapp
npm run dev
```

Open `http://localhost:5173` in the Windows browser.

---

## Demo Steps

### 1. Load a multi-table knowledge base

1. Click the file picker and hold Ctrl to select both `theorems.csv` and
   `definitions.csv` from `Webapp/public/`
2. Both tables appear as before

### 2. Full-text search

1. In the **Search text cells…** input, type `rate`
2. Click **Search**
3. The results panel shows the "derivative" entity from the definitions table
   with the word "rate" highlighted in yellow
4. Click the result row — the neighbourhood panel appears showing connected
   entities

### 3. Symbol search (domain tool)

1. In the **Find symbol…** input, type `int`
2. Click **Find Symbol**
3. The results panel shows all theorems whose math cells contain `\int`
   (the Fundamental Theorem of Calculus)
4. Try `derivative` — shows all theorems using the derivative identifier

### 4. Graph neighbourhood

1. Click any entity name in the table (underlined first column)
2. The neighbourhood panel appears showing all entities within 2 hops
3. Each entry shows: hop count, relation name, direction arrow, entity name,
   and which table it belongs to
4. Click any entry in the neighbourhood panel to navigate to that entity's
   neighbourhood

### 5. Session persistence

1. Load `theorems.csv` and `definitions.csv`
2. Close the browser tab
3. Reopen `http://localhost:5173`
4. A yellow banner appears: "Last session: theorems, definitions — reload
   these files to restore your knowledge base."
5. Click Dismiss to hide the banner, or reload the files manually

### 6. Cross-table join (via console)

The cross-table join is available programmatically via the controller.
Open the browser console and run:

```js
// Access the controller (exposed for debugging)
// Load theorems (idx 0) and definitions (idx 1), then:
// This is accessible via the app's internal state
```

The join is used internally when the neighbourhood panel shows cross-table
connections.

---

## Troubleshooting

### Search returns no results
Check that at least one CSV file is loaded. The search runs over the
in-memory model — if no files are loaded, there is nothing to search.

### Symbol search finds nothing
The identifier name must match the raw name in the math source exactly.
`\int` has raw name `int`, `\alpha` has raw name `a`, `\ha` has raw name `ha`.
Try the raw name without the backslash.

### Session banner does not appear
`localStorage` must be available. In private/incognito mode, `localStorage`
may be disabled. The banner only appears if files were loaded in a previous
session.

---

## Phase 9 — Geometry Syntax Plugin

---

## How to Run the Demo

```bash
cd Webapp
npm run dev
```

Open `http://localhost:5173` in the Windows browser.

---

## Demo Steps

### 1. Load the geometry sample CSV

1. Click **📂 Open** in the menu bar
2. Navigate to `Webapp/public/geometry-sample.csv`
3. Select and open

The table appears with three columns: **Name** (text), **Diagram** (geometry),
**Notes** (text). Each cell in the Diagram column renders as an SVG diagram.

---

### 2. Verify rendered diagrams

| Row | Expected diagram |
|-----|-----------------|
| Right Triangle | Triangle with vertices A, B, C; segments labelled 3, 4, 5; perpendicular mark at A |
| Parallel Lines | Two horizontal lines with parallel tick marks |
| Circle | Circle through three points A, B, C with centre O |
| Angle Demo | Two segments from B with an angle arc between them |

---

### 3. Edit a geometry cell

1. Click any cell in the **Diagram** column
2. The cell stays rendered — the formula bar at the top fills with the raw
   geometry source (multi-line)
3. The source is editable in the formula bar textarea
4. Add a new statement on a new line using **Alt+Enter**:
   ```
   Segment(A,C)
   ```
5. The cell re-renders live as you type — the new segment appears in the diagram
6. Press **Enter** to commit

---

### 4. Write a geometry cell from scratch

1. Click **+ Row** in the toolbar to add a new row
2. Click the empty Diagram cell
3. Type the following in the formula bar (use **Alt+Enter** between lines):
   ```
   Point(A,B,C)
   Point(A)=(0,0)
   Point(B)=(4,0)
   Point(C)=(2,3)
   Triangle(A,B,C)
   Segment(A,B)=4
   ```
4. Press **Enter** — the cell renders a triangle with a labelled base

---

### 5. Test multi-line editing

1. Click a geometry cell with multiple statements
2. The formula bar expands to show all lines
3. Use **Alt+Enter** to insert a new line between existing statements
4. Use plain **Enter** to commit
5. Use **Escape** to cancel and restore the original source

---

### 6. Test parse error display

1. Click a geometry cell
2. In the formula bar, type an invalid statement:
   ```
   UnknownConstruct(A,B)
   ```
3. The cell shows a red **Parse error:** message inline
4. The rest of the table is unaffected
5. Press **Escape** to restore the original

---

### 7. Geometry syntax reference

The following constructs are supported in geometry cells:

**Declarations:**
```
System(2,Euclidean)        — coordinate system (default if omitted)
Point(A,B,C)               — declare points
Point(A)=(2,3)             — point with coordinates
Axis(x)                    — coordinate axis
Origin(O)                  — origin declaration
```

**Primitives:**
```
Segment(A,B)               — line segment
Segment(A,B)=5             — segment with measurement label
Line(A,B)                  — infinite line (dashed)
Ray(A,B)                   — ray from A through B
Arrow(A,B)                 — directed arrow, tip at B
Angle(A,B,C)               — angle at vertex B
Angle(A,B,C)=30            — angle with value label
```

**Relations:**
```
Parallel(Line(A,B),Line(C,D))
Perpendicular(Line(A,B),Line(C,D))
Intersection(Line(A,B),Line(C,D))=E
Midpoint(M,Segment(A,B))
```

**Polygons:**
```
Triangle(A,B,C)
Quadrilateral(A,B,C,D)
Polygon(A,B,C,D,E)
```

**Curves:**
```
Circle((A,B,C),O)          — circle through A,B,C with centre O
Circle((A,B,C),O,4)        — with explicit radius
Ellipse((A,B,C),O,5,3)     — with major/minor axes
Arc(A,B,O)                 — arc from A to B on circle centred at O
```

**Higher-dimensional:**
```
Plane(A,B,C)               — plane through three points
Plane(x+y+z=1)             — plane by equation
Geodesic(A,B)              — geodesic (non-Euclidean)
```

---

## Troubleshooting

### Geometry cell shows a parse error for valid-looking source
Check that each statement is on its own line. The geometry parser is
newline-sensitive — statements must be separated by newlines, not semicolons
or spaces. Use **Alt+Enter** in the formula bar to insert newlines.

### Alt+Enter inserts a newline but focus is lost
This is a browser-specific issue. The `suppressBlur` flag in `TableView`
should prevent this. If it still occurs, click back on the formula bar
textarea and continue editing.

### Diagram renders but points are in unexpected positions
Points without explicit coordinates are auto-laid-out in a circle. To
control positions, add `Point(A)=(x,y)` declarations with numeric coordinates.
The renderer scales all explicit coordinates to fit the 400×300 viewport.

### Circle or Ellipse renders as a dot
The circumference points `(A,B,C)` must be declared and have coordinates
(or be auto-laid-out) before the circle can compute its radius. If all
points land at the same auto-layout position, the radius will be zero.
Add explicit coordinates: `Point(A)=(2,0)`, `Point(O)=(0,0)`, etc.

---

## Phase 10 — Physics Free-Body Syntax Plugin

---

## How to Run the Demo

```bash
cd Webapp
npm run dev
```

Open `http://localhost:5173` in the Windows browser.

---

## Demo Steps

### 1. Load the physics sample CSV

1. Click **📂 Open** in the menu bar
2. Navigate to `Webapp/public/physics-sample.csv`
3. Select and open

The table appears with three columns: **Name** (text), **Diagram** (physics), **Notes** (text). Each Diagram cell renders as an SVG free-body diagram combining geometry and physics elements.

---

### 2. Verify rendered diagrams

| Row | Expected diagram |
|-----|-----------------|
| Block on surface | Rectangle (polygon), three force arrows: W downward (red), N upward (red), f rightward (red) |
| Inclined plane | Triangle, two force arrows, pin joint circle at A, roller triangle at B |
| Spring-mass | Two points, pin joint at A, purple zigzag spring between A and B, downward force at B |

---

### 3. Physics syntax reference

A physics cell mixes geometry declarations and physics statements freely on separate lines. Geometry lines are parsed by the geometry plugin; physics lines are parsed by the physics plugin.

**Bodies:**
```
Body(B1)                      — declare a rigid body
Body(B1)=mass(m)              — body with mass
Body(B1)=mass(m),moment(I)    — body with mass and moment of inertia
```

**Forces** (red arrows):
```
Force(F1,A,\d)=mg             — force at point A, direction down, magnitude mg
Force(N,A,\u)=N               — normal force upward
Force(f,A,\r)=f               — friction force rightward
Force(F1,A,\l)=T              — force leftward
```

Direction shorthands: `\d` down, `\u` up, `\r` right, `\l` left.

**Motion vectors:**
```
Velocity(v,A,\r)=v_0          — velocity arrow (blue)
Acceleration(a,A,\r)=a_0      — acceleration arrow (orange)
```

**Constraints:**
```
Fixed(A)                      — pin joint at A (circle + hatch)
Roller(B,\u)                  — roller at B (triangle + circle)
Spring(A,B)=k                 — spring between A and B (zigzag, purple)
Damper(A,B)=c                 — damper between A and B (rectangle, cyan)
String(A,B)                   — inextensible string (dashed line)
Contact(A,B)                  — contact between bodies
```

**Equations of motion:**
```
EOM(m*a)
EOM(\S{F}=m*a)
```

---

### 4. Write a physics cell from scratch

1. Click **+ Row** in the toolbar
2. Click the empty Diagram cell
3. Type the following in the formula bar (use **Alt+Enter** between lines):
   ```
   Point(A,B)
   Point(A)=(0,1)
   Point(B)=(3,1)
   Segment(A,B)
   Fixed(A)
   Body(m1)=mass(m)
   Force(W,B,\d)=mg
   ```
4. Press **Enter** — the cell renders a hanging mass on a string with a fixed support

---

### 5. Test parse error display

1. Click a physics cell
2. In the formula bar, type an unknown statement:
   ```
   UnknownPhysics(A,B)
   ```
3. The cell shows a red **Parse error:** message
4. Press **Escape** to restore the original

---

## Troubleshooting

### Physics cell shows a parse error for valid-looking source
Check that each statement is on its own line. Use **Alt+Enter** in the formula bar to insert newlines between statements.

### Force arrows not visible
The force arrow is drawn from the named point. Make sure the point is declared with `Point(A)` and optionally given coordinates with `Point(A)=(x,y)`. If the point has no coordinates it will be auto-laid-out, which may place it outside the visible area.

### CSV fails to load with a field count error
Ensure that any Notes or text column values containing commas are either quoted in the CSV or have their commas removed. The CSV parser splits on unquoted commas, which can produce rows with more fields than columns.

---

## Phase 11 — Chemistry Reaction Syntax Plugin

---

## How to Run the Demo

```bash
cd Webapp
npm run dev
```

Open `http://localhost:5173` in the Windows browser.

---

## Demo Steps

### 1. Load the chemistry sample CSV

1. Click **📂 Open** in the menu bar
2. Navigate to `Webapp/public/chemistry-sample.csv`
3. Select and open

The table appears with three columns: **Name** (text), **Notes** (text),
**chemistry** (chemistry). Each cell in the chemistry column renders as a
formatted chemical equation or annotation.

---

### 2. Verify rendered output

| Row | Expected rendering |
|-----|--------------------|
| Combustion of hydrogen | `2H₂ + O₂ → 2H₂O` — horizontal reaction with subscripts |
| Haber process | `N₂ + 3H₂ ⇌ 2NH₃` with `T=450°, P=200atm, cat=Fe` above the arrow |
| Ionic precipitation | `Ca²⁺(aq) + 2Cl⁻(aq) → CaCl₂(s)` — charged species with states |
| Nuclear fission | `²³⁵₉₂U + n → ¹⁴¹₅₆Ba + ⁹²₃₆Kr + 3n` — isotope notation |
| Thermodynamics | `ΔH = -286 kJ/mol` — rendered with math plugin for the value |
| Structural rows | Atom/Bond/Group declarations listed as text |

---

### 3. Chemistry syntax reference

**Reaction equations:**
```
Reaction(2H2 + O2 -> 2H2O)
Reaction(N2 + 3H2 <=> 2NH3, cond(T=450\deg, P=200atm, cat=Fe))
Reaction(2H2O -> 2H2 + O2, cond(electric))
```

**Reaction arrows** (longest-first in parser):
```
<=>    equilibrium (double arrow, ⇌)
<->    reversible equilibrium (⇌)
-->    slow/multi-step (⟶)
->     forward irreversible (→)
```

**Charged species** — `{compound, charge}` wrapper:
```
{Na, +}              sodium ion (Na⁺)
{Ca, 2+}             calcium ion (Ca²⁺)
{SO4, 2-}            sulfate ion (SO₄²⁻)
{Fe(CN)6, 3-}        hexacyanoferrate complex ion
{H3O, +}(aq)         hydronium in aqueous state
```

**State symbols** (postfix, lowercase closed set):
```
H2O(l)    liquid
NaCl(s)   solid
CO2(g)    gas
HCl(aq)   aqueous
```

**Isotopes and nuclear notation:**
```
^14C              carbon-14 (mass number prefix)
^14_6C            carbon-14 with atomic number
^235_92U          uranium-235
```

**Particles:**
```
n         neutron
p         proton
e-        electron
e+        positron
\a        alpha particle (α)
\b-       beta minus (β⁻)
\b+       beta plus (β⁺)
\g        gamma photon (γ)
```

**Conditions** (inside `cond(...)`):
```
cond(T=450\deg, P=200atm, cat=Fe)
cond(light)
cond(heat, cat=Pt)
```

**Thermodynamic quantities:**
```
DeltaH = -286kJ/mol
DeltaG = -237kJ/mol
DeltaS = -163J/(mol*K)
Ka = 1.8e-5
Ksp = 3.2e-9
Ea = 50kJ/mol
```

**Structural formula:**
```
Atom(C1)
Atom(C2)
Bond(C1, C2, single)
Bond(C1, C2, double)
Bond(C1, C2, triple)
Bond(C1, C2, aromatic)
Group(C1, OH)
Group(C1, COOH)
Group(C1, NH2)
```

---

### 4. Write a chemistry cell from scratch

1. Click **+ Row** in the toolbar
2. Click the empty chemistry cell
3. Type in the formula bar:
   ```
   Reaction(^235_92U + n -> ^141_56Ba + ^92_36Kr + 3n)
   ```
4. Press **Enter** — the cell renders the nuclear fission reaction with
   stacked mass/atomic number notation

---

### 5. Test parse error display

1. Click a chemistry cell
2. In the formula bar, type an invalid statement:
   ```
   Reaction(H2O)
   ```
   (missing arrow — not a valid reaction)
3. The cell shows a red **Parse error:** message
4. Press **Escape** to restore the original

---

## Troubleshooting

### Chemistry cell shows plain text instead of rendered output
Check that the CSV has a types row as the second row with `chemistry` in the
correct column. Without the types row, all cells fall back to the `text` plugin.

### Parse error: `expected "cond("`
Conditions must use `cond(...)` syntax, not `[...]` brackets:
```
Reaction(N2 + 3H2 <=> 2NH3, cond(T=450\deg, cat=Fe))   ✓
Reaction(N2 + 3H2 <=> 2NH3, [T=450\deg, cat=Fe])        ✗
```

### Charged species not rendering correctly
Charges must use the `{compound, charge}` wrapper syntax:
```
{Ca, 2+}(aq)    ✓
Ca2+(aq)        ✗  (not supported — ambiguous with atom count)
```

### Isotope notation not rendering
Isotope prefix must use `^mass` or `^mass_atomic` directly before the element
symbol with no space:
```
^14C      ✓
^14 C     ✗  (space not allowed)
^ 14C     ✗  (space not allowed)
```
