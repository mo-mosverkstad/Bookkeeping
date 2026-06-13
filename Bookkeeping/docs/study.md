# Study — Porting Bookkeeping Webapp to C/C++

## Objective

Port the Bookkeeping application from TypeScript/HTML/CSS (web) to a native
C/C++ desktop application. The result must preserve all core functionality
(CSV tables, math/chemistry/physics/geometry rendering, graph visualization,
search, edit history) while achieving native performance and eliminating
browser dependency.

---

## Porting Strategy

### What ports literally (core logic)

These components are pure computation — no DOM or browser APIs:

| Webapp module | C/C++ equivalent | Notes |
|---|---|---|
| `model/` (Table, Row, Cell, Graph, etc.) | C structs + arena-allocated arrays | Direct translation |
| `data/csv.ts` (PEG CSV parser) | C PEG parser (hand-written recursive descent) | Performance-critical; arena alloc |
| `engine/PEGParser.ts` | C recursive descent engine | Core parsing infra |
| `cell-renderers/math/grammar.ts` | Math expression parser in C | Produces AST nodes |
| `cell-renderers/math/types.ts` | Tagged union / enum + union struct | Bit-pack node type tag |
| `cell-renderers/chemistry/` | Chemistry parser in C | Same approach |
| `cell-renderers/geometry/` | Geometry parser in C | Same approach |
| `cell-renderers/physics/` | Physics parser in C | Same approach |
| `controller/` (edit history, undo/redo) | C command pattern with arena | Direct translation |
| `search/` | C string search | Can use SIMD for perf |
| `model/Graph.ts`, `AssociationGraph.ts` | Adjacency list in C | Arena-allocated |

### What CANNOT port naively (UI/rendering)

The Webapp renders everything via HTML+CSS — DOM elements, flexbox, CSS
transforms, styled text. The C/C++ port replaces this with a custom graphics
library.

| Webapp concept | C/C++ replacement |
|---|---|
| HTML `<table>` | GridLayout + Rect + Text elements |
| CSS flexbox | LinearLayout (horizontal/vertical) |
| CSS grid | GridLayout |
| `<span>`, `<div>` (inline/block) | Text + Rect composition |
| CSS `position: sticky` | Custom scroll-aware layout pass |
| Font rendering, `font-style: italic` | Font subsystem (FreeType or stb_truetype) |
| SVG diagrams | Direct shape rendering (Line, Polyline, Polygon, Ellipse) |
| DOM events (click, drag, wheel) | Platform event loop (SDL2 events) |
| `<input>`, `<textarea>` | Custom text input widget |
| CSS `transform: scale()` / `zoom` | Viewport transform matrix |

### Graphics library architecture

```
┌─────────────────────────────────────────────────┐
│              Application Layer                    │
│  (Table view, Diagram view, Editor, Navigation)  │
├─────────────────────────────────────────────────┤
│              Interface Layer                      │
│  Shapes: Rect, Ellipse, Line, Polyline,         │
│          Polygon, Text (multiline, decorations)  │
│  Layouts: CoordinateLayout, LinearLayout,        │
│           GridLayout, StackLayout, ScrollLayout   │
│  Widgets: Button, Checkbox, TextInput, ScrollBar │
├─────────────────────────────────────────────────┤
│              Backend Layer (Visitor)              │
│  SDL2Backend  │  VulkanBackend  │  SoftwareBackend│
│  (SDL2_Render)│  (future)       │  (pixel buffer) │
└─────────────────────────────────────────────────┘
```

**Interface layer** — Platform-independent. Defines:
- **Shapes**: Rect, Ellipse, Line, Polyline, Polygon, Text
- **Text capabilities**: multiline, font family/size/weight, italic,
  underline, strikethrough, subscript/superscript, color, alignment
- **Layouts**: position children according to layout rules
- **Hit testing**: which element is at (x, y)?

**Backend layer** — Visitor pattern. Each backend implements a visitor
that knows how to render each shape type:
```cpp
struct RenderVisitor {
    virtual void visit(const Rect&) = 0;
    virtual void visit(const Ellipse&) = 0;
    virtual void visit(const Line&) = 0;
    virtual void visit(const Polyline&) = 0;
    virtual void visit(const Polygon&) = 0;
    virtual void visit(const Text&) = 0;
};
```

Backends: SDL2 (immediate, good for development), software rasterizer
(for testing/headless), potentially Vulkan later.

---

## Performance techniques

### 1. Bit packing

```cpp
// Instead of:
struct NodeFlags {
    bool visible;      // 1 byte wasted
    bool selected;     // 1 byte wasted
    uint8_t type;      // only needs 3 bits
    uint8_t state;     // only needs 2 bits
};  // 4 bytes, mostly padding

// Use:
struct NodeFlags {
    uint8_t packed;    // 1 byte total
    // bit 0: visible
    // bit 1: selected
    // bits 2-4: type (3 bits, 8 values)
    // bits 5-6: state (2 bits, 4 values)
};
```

### 2. Arena allocation

```cpp
struct Arena {
    uint8_t* base;
    size_t offset;
    size_t capacity;
};

void* arena_alloc(Arena* a, size_t size, size_t align) {
    size_t aligned = (a->offset + align - 1) & ~(align - 1);
    void* ptr = a->base + aligned;
    a->offset = aligned + size;
    return ptr;
}

void arena_reset(Arena* a) { a->offset = 0; }
```

### 3. Trig LUT

```cpp
// Precompute at 0.1° resolution: 900 entries covers 0°–90°
#define TRIG_RESOLUTION 900
static int32_t sin_lut[TRIG_RESOLUTION + 1]; // fixed-point 16.16
static int32_t cos_lut[TRIG_RESOLUTION + 1];

void init_trig_lut() {
    for (int i = 0; i <= TRIG_RESOLUTION; i++) {
        double rad = (i * M_PI) / (2.0 * TRIG_RESOLUTION);
        sin_lut[i] = (int32_t)(sin(rad) * 65536.0);
        cos_lut[i] = (int32_t)(cos(rad) * 65536.0);
    }
}
```

### 4. Fixed-point math

```cpp
// Fixed-point layout is ARBITRARY — chosen based on value range and precision needs.
// Format: uint<N>_t with I integer bits and F fractional bits (I.F layout).
//
// Choosing a layout requires:
//   1. Estimate the VALUE RANGE (max/min the number will reach)
//   2. Estimate the PRECISION needed (smallest meaningful increment)
//   3. Pick the smallest integer type that fits I+F bits
//
// Examples:
//   - Screen coordinate (0–4096 px, sub-pixel precision):
//     uint16_t 12.4 — 12 bits for 0–4095, 4 bits for 1/16 px precision
//
//   - Normalized color channel (0.0–1.0, 256 levels):
//     uint8_t 0.8 — full byte is fractional, range 0–0.996
//
//   - Audio sample amplitude (-1.0 to +1.0, high precision):
//     int16_t 1.15 — 1 sign/int bit, 15 fractional
//
//   - Angle in degrees (0–360, fine rotation):
//     uint16_t 9.7 — 9 bits for 0–511 (covers 360), 7 bits for 1/128° ≈ 0.008°
//
//   - Pricing in cents (0–999.99):
//     uint32_t biased ×100 — store 99999 max, decode by /100
//
//   - Age (0–255): uint8_t plain integer. No fractional needed.
//
// NEVER over-allocate: don't use 64-bit where 16-bit suffices.
// ALWAYS document the layout choice with its reasoning.

// Generic fixed-point operations (parameterized by shift)
#define FP_FROM_INT(x, frac_bits) ((x) << (frac_bits))
#define FP_FROM_FLOAT(x, frac_bits) ((int32_t)((x) * (1 << (frac_bits))))
#define FP_TO_INT(x, frac_bits) ((x) >> (frac_bits))
#define FP_MUL(a, b, frac_bits) ((int32_t)(((int64_t)(a) * (b)) >> (frac_bits)))
#define FP_DIV(a, b, frac_bits) ((int32_t)(((int64_t)(a) << (frac_bits)) / (b)))
```

---

## Phased porting plan

### Phase 1 — Graphics library foundation

**Goal**: Shape primitives, layout engine, SDL2 backend, text rendering.

**Tasks**:
- Rect, Ellipse, Line, Polyline, Polygon structs (POD, bit-packed flags)
- Text struct: multiline, font family/size/weight, italic, underline, strikethrough, subscript/superscript, color, alignment
- CoordinateLayout (absolute x,y positioning)
- LinearLayout (horizontal/vertical stacking with gap, alignment)
- GridLayout (rows × cols, cell spanning, fixed/auto column widths)
- ScrollLayout (virtual viewport, scroll offset)
- RenderVisitor interface + SDL2Backend implementation
- SoftwareBackend (pixel buffer) for headless testing
- Font loading via stb_truetype or FreeType
- Arena allocator for all element allocation
- Hit testing (point-in-element query)

**Tests**: Render shapes to SoftwareBackend, capture framebuffer, validate pixels.
**Benchmark**: Layout pass for 1000-element tree, render pass for 10k shapes.

---

### Phase 2 — Table model + CSV parser

**Goal**: In-memory table data model and CSV file parsing, arena-allocated.

**Tasks**:
- Table, Row, Cell, Column structs (arena-backed)
- CSV parser (recursive descent, handles quoting, multiline fields, escaping)
- Table API: getCellValue, setCellValue, appendRow, insertRow, removeRow, moveRow
- String interning or arena-backed string storage
- `\r\n` normalization at parse time

**Tests**: Parse various CSV inputs (empty, quoted, multiline, escaped), verify cell values.
**Benchmark**: Parse 10MB CSV file, measure time and memory.

---

### Phase 3 — Table rendering

**Goal**: Render a Table as a visual grid using the graphics library.

**Tasks**:
- Map Table model → GridLayout + Text elements
- Column headers (sticky top via scroll-aware layout)
- Checkbox column (sticky left), actions column (sticky right)
- Row selection highlighting
- Scroll (vertical + horizontal) with viewport clipping
- Zoom (scale factor applied to layout)

**Tests**: Render small tables, verify element positions and text content.
**Benchmark**: Render 10,000-row × 20-col table, measure layout + render time.

---

### Phase 4 — Math expression parser + renderer

**Goal**: Parse math syntax and render as formatted graphics elements.

**Tasks**:
- Port math grammar (recursive descent in C)
- AST node types as tagged union (bit-packed type tag)
- Math renderer: AST → graphics elements (fractions, superscripts, subscripts, sqrt, matrices, sets, text literals)
- Operator precedence, parenthesization logic
- Cambria Math font metrics for proper sizing

**Tests**: Parse+render all expression types, validate output structure.
**Benchmark**: Parse 1000 complex expressions, measure parse time.

---

### Phase 5 — Cell editing + undo/redo

**Goal**: Interactive cell editing with full undo/redo history.

**Tasks**:
- Text input widget (cursor, selection, insert/delete, clipboard)
- Cell activation on click, commit on blur/enter
- EditHistory: arena-allocated action stack (push, undo, redo)
- Action types: cell edit, add/delete/move row, moveCells
- Dirty tracking with baseline comparison
- Multi-cell selection (shift-click range, ctrl-click toggle)
- Drag-to-select, drag-to-move with ghost overlay
- Cut/paste (Ctrl+X, Ctrl+V)
- Keyboard navigation (arrows, shift+arrows)

**Tests**: Simulate edit sequences, verify model state after undo/redo chains.
**Benchmark**: 10,000 undo/redo cycles, measure time.

---

### Phase 6 — Chemistry / Physics / Geometry parsers + renderers

**Goal**: Port remaining domain-specific parsers and renderers.

**Tasks**:
- Chemistry parser + renderer (molecules, reactions, equations)
- Physics parser + renderer (circuits, units, vectors)
- Geometry parser + renderer (shapes, angles, constructions)
- Rich text parser: `$math{...}`, `$chem{...}`, `$geom{...}`, `$phys{...}` embedding with multiline support

**Tests**: Parse+render expressions from each domain, validate output.
**Benchmark**: Batch-parse all test resource CSV files' cells.

---

### Phase 7 — Graph model + diagram rendering

**Goal**: Graph data structure and visual diagram rendering.

**Tasks**:
- Graph, GraphNode, GraphEdge structs (arena-allocated)
- AssociationGraph (relationships between entities)
- Flowchart/state diagram renderer (node positioning, edge routing)
- Sequence diagram renderer
- SVG-equivalent rendering using Line, Polyline, Polygon, Text, Rect, Ellipse
- Pan + zoom on diagram viewport

**Tests**: Build graphs, verify layout positions, render and validate.
**Benchmark**: Layout 500-node graph, measure time.

---

### Phase 8 — Search + navigation tree + workspace

**Goal**: Full-text search, hierarchical navigation, tabbed workspace.

**Tasks**:
- Text search across all cells (substring, identifier-aware)
- Graph neighbourhood query
- Cross-table join search
- Navigation tree widget (expandable/collapsible hierarchy)
- Tab strip widget (open, close, switch tabs)
- Workspace controller (mount/unmount views, saved state)

**Tests**: Search queries returning correct hits, tab switching preserving state.
**Benchmark**: Search across 100k cells, measure latency.

---

### Phase 9 — File I/O

**Goal**: Load and save files from disk.

**Tasks**:
- File open dialog (platform-native or SDL2 file dialog)
- Load CSV files, control.json, .graph.json, .diagram files
- Save modified files back to disk
- Dirty detection + save prompt on exit
- Session persistence (remember last-opened files)

**Tests**: Round-trip load → edit → save → reload, verify content preserved.

---

### Phase 10 — Polish + integration

**Goal**: Final UX polish, ensuring feature parity with Webapp.

**Tasks**:
- Row drag-to-reorder (multi-row)
- Column sorting (if re-added)
- Zoom control bar widget
- Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+S, etc.)
- Status bar with dirty indicator
- Error display for parse failures
- Performance profiling pass — identify and fix any hot-path issues
- Full regression test suite passing

**Tests**: End-to-end integration tests simulating full user workflows.
**Benchmark**: Full application startup to first-frame-rendered, measure time.

---

## Key differences from Webapp

| Concern | Webapp | C/C++ port |
|---|---|---|
| Memory | GC (JS engine) | Manual: arena + pool allocators |
| Strings | JS immutable strings | `char*` with length, arena-backed |
| Layout | CSS engine (browser) | Custom layout pass (single-pass or two-pass) |
| Rendering | DOM + compositing | Immediate mode via SDL2 |
| Events | DOM events | SDL2 event poll loop |
| Text shaping | Browser's text engine | stb_truetype or FreeType |
| Testing | Vitest + happy-dom | Custom test harness + framebuffer capture |


---

## Webapp Parity — Additional Phases

These phases bring the C/C++ port to full visual and functional parity with the
TypeScript/HTML/CSS Webapp.

---

### Phase 11 — Visual Theme + Layout Parity

**Goal**: Match the Webapp's exact layout structure, color palette, fonts, and spacing.

**Tasks**:
- Implement the Webapp's light theme color palette:
  - `--bg`: #f8fafc (light gray background)
  - `--surface`: #ffffff (white panels)
  - `--border`: #e2e8f0 (light border)
  - `--text`: #1e293b (dark text)
  - `--text-secondary`: #334155
  - `--text-muted`: #64748b (gray annotations)
  - `--accent-light`: #f1f5f9 (hover highlight)
  - Tab active: white surface, bold, raised 2px
  - Tab inactive: #cbd5e1 background, #475569 text
  - Status bar: #f1f5f9 background, 0.8em text
- Match the layout structure (top to bottom):
  1. Toolbar bar (2.4em height, white, border-bottom)
  2. Tab bar (2em, #e2e8f0 background, tabs with close ✕)
  3. Content area (flex row):
     - Nav tree panel (220px, left, collapsible)
     - Workspace (flex:1, white, scrollable)
     - Sidebar/Source editor (340px, right, collapsible)
  4. Status bar (1.6em, accent-light)
- Font: primary body = "SangBleu Sunrise Light" fallback "Segoe UI";
  heading = "SangBleu Empire"; UI = Arial. Size: 13px base.
- Table styling: border-collapse, sticky header, row-number column (2.5em),
  checkbox column (sticky left, 2em), actions column (sticky right, 3.2em),
  alternating row hover (#f8fafc)

**Tests**: Visual regression via pixel capture comparing against reference colors.

---

### Phase 12 — control.json + Folder Loading

**Goal**: Load `control.json` manifests and multi-CSV folder structures.

**Tasks**:
- Parse `control.json` format:
  ```json
  {
    "entries": [
      { "type": "table", "id": "basic-algebra", "file": "Basic algebra.csv" },
      { "type": "table", "id": "derivatives", "file": "Derivatives.csv" }
    ]
  }
  ```
  Also support extended format with diagram declarations:
  ```json
  { "id": "flow", "view": "flow", "nodes": {"file":"nodes.csv","mapping":{...}}, "edges": {...} }
  ```
- Folder loading: given a directory path, find `control.json`, parse it,
  load all referenced CSV files relative to that directory
- If no `control.json`, load all `.csv` files in the directory as standalone tables
- Populate the navigation tree from the folder structure:
  - Root folder → nav folder node (📁 icon)
  - Each table entry → nav leaf (▤ icon)
  - Each graph/diagram entry → nav leaf (◈ icon)
- Load the testresources/ folders as demo data

**Tests**: Load Mathematics/Chemistry/Software reference sheets, verify table counts and content.

---

### Phase 13 — Source Editor Panel

**Goal**: A text editor panel in the right sidebar for editing cell source code.

**Tasks**:
- Text editor widget: monospace textarea with cursor, selection, scroll
- Syntax highlighting overlay (color-coded tokens for math/chem/physics/text)
- Syntax types: math, chemistry, geometry, physics, table-source, graph-source, text, rich
- Token colors: keyword=#7c3aed, number=#b45309, string=#15803d, operator=#dc2626,
  comment=#94a3b8 italic, element=#0f766e bold
- Local undo/redo stack (independent of table EditHistory)
- 300ms debounce parsing with live preview
- "Parse" button (manual trigger) and "Apply" button (commit to model)
- Toggle collapse (▾/▸ button)
- Focus state: 2px blue border when focused, 1px thin when not
- Layout: header row (label + buttons) → editor pane (flex:1) → preview pane (35%)

**Tests**: Parse various expressions, verify highlight tokens, test local undo/redo.

---

### Phase 14 — Flow Diagram View

**Goal**: SVG-style flow diagram renderer matching the Webapp's FlowDiagramView.

**Tasks**:
- Layout algorithm: Tarjan SCC → cycle nodes on circle, DAG nodes in layered ranks
- Node shapes: rect (default), ellipse, diamond — driven by `nodeStyles` config
- Node sizing: width = max(64, label.length * 7 + 28), height = 32
- Edge routing: orthogonal for DAG edges, curved arcs for back-edges
- Edge arrows: open, filled, flat — driven by `edgeStyles` config
- Diagram view: pan (mouse drag), zoom (Ctrl+scroll), node selection (click)
- Sequence diagram mode: actors as columns, messages as horizontal arrows
- Spatial diagram mode: nodes positioned by x,y from data, edges connect them
- Interactive: click node → show in source editor, drag to reposition

**Tests**: Layout 10+ node graphs, verify positions, render to pixels.

---

### Phase 15 — Document View

**Goal**: Composite view that renders a Document as stacked sections.

**Tasks**:
- Document model: name + ordered sections, each section has: id, title, block (table or graph)
- Render as vertical stack: sticky document title (heading font, border-bottom)
- Each section: collapsible header (toggle ▼/▸ + title) + body (table or diagram)
- Section header styling: accent-light background, cursor pointer, hover highlight
- Mount/unmount child views (TableView or FlowDiagramView) per section
- Scroll state and collapse state preserved across tab switches

**Tests**: Create document with mixed sections, verify render and collapse.

---

### Phase 16 — Graph Filter + Association Panel

**Goal**: Filter tables by graph relationships and show association details.

**Tasks**:
- Association graph model: entities linked by typed relations (directed edges)
- Graph filter UI: two dropdowns (Relation type, Target entity) + Filter/All buttons
- Filter action: show only table rows whose entity appears in filtered graph
- Association detail panel: floating popup showing outgoing/incoming edges for an entity
- Entity links: clickable, navigate to the entity's associations
- Relation types: support inverse relation names

**Tests**: Filter by relation, verify correct rows shown. Click entity, verify associations.

---

### Phase 17 — Table Polish (drag-to-reorder, multi-cell, clipboard)

**Goal**: Full table interaction parity with the Webapp.

**Tasks**:
- Row checkbox column (sticky left): select rows for bulk operations
- Row drag-to-reorder: visual drop indicator (2px line), ghost opacity 0.35
- Row actions column (sticky right): insert (+) and delete (×) buttons per row
- Multi-cell selection: Shift+click range, Ctrl+click toggle, visual highlight (#dbeafe)
- Cut/Paste: Ctrl+X cuts cells (dashed outline #d97706), Ctrl+V pastes
- Cell drag-to-move: selected cells draggable to new position (green dashed ghost)
- Arrow key navigation between cells
- Active cell styling: 2px solid #475569 outline, accent-light background
- Row number column (2.5em, right-aligned, gray, sticky)

**Tests**: Simulate multi-select, drag, cut/paste, verify model state.

---

### Phase 18 — Search + Neighbourhood Panels

**Goal**: Match the Webapp's search UI with floating result panels.

**Tasks**:
- Search bar in toolbar: text input (160px) + "Search" button + identifier input + "Find Symbol" + "Clear"
- Floating results panel: fixed position below toolbar, max-height 260px, shadow, scrollable
- Result items: location (muted, small) + value (monospace) with match highlight (yellow #fef08a)
- Graph neighbourhood panel: triggered from entity clicks, shows nodes within N hops
- Neighbourhood items: hop count badge + node label + relation type (italic)
- Close panels on outside click

**Tests**: Search, verify panel content. Click entity, verify neighbourhood panel.

---

### Phase 19 — Cell Renderers (math/chem/physics/geometry fidelity)

**Goal**: Match the Webapp's native-math.css rendering exactly.

**Tasks**:
- Math renderer: match Cambria Math font, fractions (inline-block, border-bottom),
  large operators (1.5em), integral (inline-flex), sqrt (border-top + √ pseudo-element),
  matrix (inline-table), piecewise (table with left border), opstack (subscript/superscript stacking)
- Chemistry: subscript numbers, reaction arrows, state symbols
- Physics: same as math (delegated)
- Geometry: same as math (delegated)
- Rich text cells: inline rendering with embedded $math{}, $chem{}, $phys{}, $geom{}
- Line-height: 1.6 for rich cells
- Error display: red monospace for parse failures within cells

**Tests**: Render complex expressions, compare pixel output against reference.

---

### Phase 20 — Final Integration + Toolbar

**Goal**: Complete toolbar, keyboard shortcuts, session management, and polish.

**Tasks**:
- Toolbar layout: Open | (dynamic) | Save + Export + ◀Editor + ☰Nav | Filter | Search
- Dynamic toolbar: context-sensitive buttons from active view (e.g., "+ Row" for tables)
- File open: load from filesystem path (platform dialog or CLI argument)
- Export CSV: serialize active table, write to file
- Toggle sidebar/nav: animated collapse (width 0 transition)
- Session banner in status bar: shows last restore info
- Dirty indicator: file names marked with * when modified
- Ctrl+S saves all modified files
- Error message panel: red background, monospace, below sidebar

**Tests**: Full end-to-end workflow: open folder → navigate → edit → save → verify.
**Benchmark**: Full application with 20-table reference sheet loaded, measure startup + first-frame time.
