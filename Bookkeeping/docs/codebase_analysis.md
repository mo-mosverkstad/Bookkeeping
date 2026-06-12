# Codebase Analysis

A detailed guide to the Bookkeeping C/C++ application architecture.
Written for developers new to the codebase.

---

## Overall Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                         main.cpp                                   │
│                    (calls run_demo())                               │
├───────────────────────────────────────────────────────────────────┤
│                         src/demo.h                                 │
│              Application Demo (all features integrated)            │
├────────────────────┬──────────────────────────────────────────────┤
│   src/app/         │           src/platform/                       │
│  ┌─────────────┐   │          ┌─────────────────┐                 │
│  │ table_view  │   │          │ platform.h      │ ← abstract      │
│  │ table_editor│   │          │ (PlatformWindow)│   interface      │
│  │ graph_view  │   │          ├─────────────────┤                 │
│  │ edit_history│   │          │ sdl2_platform   │ ← SDL2 impl     │
│  └─────────────┘   │          └─────────────────┘                 │
├────────────────────┼──────────────────────────────────────────────┤
│   src/graphics/    │                                               │
│  ┌─────────────────┼──────────────────────────────────┐           │
│  │  ui.h           │  Fluent builder (VStack, HStack...)│          │
│  │  node_builder.h │  Node factories                    │          │
│  ├─────────────────┼──────────────────────────────────┤           │
│  │  elements/      │  Shapes: Rect, Ellipse, Line...   │          │
│  │  layout/        │  LayoutNode (compute, render, hit)│          │
│  │  backend/       │  RenderBackend interface           │          │
│  │                 │  ├── SoftwareBackend (testing)     │          │
│  │                 │  └── SDL2Backend (display)         │          │
│  └─────────────────┴──────────────────────────────────┘           │
├───────────────────────────────────────────────────────────────────┤
│   src/core/                                                        │
│  ┌────────────┐  ┌────────────┐  ┌───────────────────────┐       │
│  │ arena.h    │  │ str.h      │  │ model/                │       │
│  │ color.h    │  │ fixed.h    │  │  table.h  graph.h     │       │
│  └────────────┘  └────────────┘  └───────────────────────┘       │
│  ┌───────────────────────────────────────────────────────┐       │
│  │ parser/                                                │       │
│  │  csv.h  math/  chem/  physics  geometry  rich/         │       │
│  └───────────────────────────────────────────────────────┘       │
└───────────────────────────────────────────────────────────────────┘
```

**Key principle**: Dependencies flow downward. `app/` uses `graphics/` and `core/`.
`graphics/` uses only `core/`. `core/` has no dependencies.

---

## Phase 1 — Graphics Library Foundation

### What it does
Provides the building blocks for all visual rendering: shapes, layouts, and backends.

### Architecture

```
  LayoutNode (tree)
       │
       ├── elements[] ─── Each node has 0+ visual elements (Rect, Text, etc.)
       │
       └── children[] ─── Each node has 0+ child nodes (nested layout)
              │
       LayoutNode::compute(w, h)    ← fills x, y, width, height recursively
       LayoutNode::render(backend)  ← draws elements, recurses into children
       LayoutNode::hit_surface(x,y) ← finds topmost node at point
```

### Files explained

**`src/core/arena.h`** — Memory allocator
```
┌─────────────────────────────────────────┐
│  Arena (one big malloc'd block)          │
│  [████████████░░░░░░░░░░░░░░░░░░░░░░░░] │
│   ^offset                    ^capacity   │
│                                          │
│  arena_alloc() bumps offset forward      │
│  arena_reset() sets offset = 0 (free all)│
│  No individual free — bulk reset only    │
└─────────────────────────────────────────┘
```
Why: Avoids malloc/free overhead in hot paths. All allocations O(1).

**`src/graphics/elements/`** — One file per shape
- `rect.h`: x, y, w, h, fill color, stroke color, stroke width, corner radius
- `ellipse.h`: center (cx, cy), radii (rx, ry), fill, stroke
- `line.h`: endpoints (x1,y1)→(x2,y2), color, width
- `polyline.h`: array of points (open path), `PolyPoint` struct reused by polygon
- `polygon.h`: closed path (last point connects to first), fill + stroke
- `text.h`: position, content string, font, size, color, style flags (bold/italic/underline packed into 1 byte)
- `element.h`: Tagged union wrapping all shapes + factory functions

**`src/graphics/layout/layout.h`** — The LayoutNode struct
```cpp
struct LayoutNode {
    LayoutType type;        // COORDINATE, LINEAR, GRID, SCROLL
    float req_width, req_height;  // input constraints
    float x, y, width, height;    // computed output
    float y_offset;               // baseline shift (superscripts/subscripts)
    LayoutNode** children;        // child array
    Element* elements;            // visual elements at this node
    const char* id;               // for hit testing identification
    // ... layout-specific fields (gap, padding, direction, scroll_x/y, etc.)
};
```

**Layout types:**
```
COORDINATE: children at absolute (x,y) — like CSS position:absolute
LINEAR:     children stacked H or V — like CSS flexbox
GRID:       children in rows×cols — like CSS grid
SCROLL:     fixed viewport, children scroll — clips content
```

**`src/graphics/backend/`** — Rendering
```
RenderBackend (abstract interface)
    │
    ├── SoftwareBackend ← pixel buffer, used in tests (ASSERT_PIXEL)
    │
    └── SDL2Backend ← hardware accelerated, shows window
```
The backend is the ONLY place with `virtual` (polymorphism cost justified at platform boundary).

### Extension: ScrollLayout, Hit Testing, Text Measurement, Clipping

**ScrollLayout**: Children positioned in content space. `scroll_x/scroll_y` shift the viewport. Clipping prevents drawing outside viewport bounds.

**Hit testing**: Two modes:
- `hit_surface()`: Returns topmost (last-drawn) node at (x,y) — like "what did I click?"
- `hit_deep()`: Returns ALL nodes containing (x,y) — like "what's the full stack here?"

**Text measurement hook**: Pluggable function pointer. Default = mock (width = chars × size × 0.6). Can be replaced with real font metrics.

### Extension: FunctionalLayout + VirtualLayout

**FunctionalLayout**: Immutable cached render. Source tree rendered once into pixel buffer, then blitted as texture. Use for static content.

**VirtualLayout** (React-like pattern):
```
State (business data)
    │
    └── render_fn(state, arena) → LayoutNode*  (UI tree)
              │
              └── displayed on screen
    
User clicks → event_fn(state, event)
    │
    └── mutates state → marks dirty → re-renders
```

---

## Phase 2 — Table Model + CSV Parser

### What it does
In-memory data model for spreadsheet-like tables, loaded from CSV files.

### Data model
```
Table
  ├── name: "Chemistry reference"
  ├── columns[]: [{name:"Name", type_id:"text"}, {name:"Formula", type_id:"chem"}, ...]
  └── rows[]:
       ├── Row 0: cells[] = [{value:"Water", type:"text"}, {value:"H2O", type:"chem"}]
       ├── Row 1: cells[] = [{value:"Salt", type:"text"}, {value:"NaCl", type:"chem"}]
       └── ...
```

### CSV format
```
Name,Formula,Mass       ← Row 0: column names
text,chem,math          ← Row 1: column type IDs
Water,H2O,18.015       ← Row 2+: data
Salt,NaCl,58.44
```

### Parser design
Recursive field parser handles:
- Unquoted fields: read until `,` or newline
- Quoted fields: handle `""` (escaped quote), embedded `,`, embedded newlines
- `\r\n` normalized to `\n` at parse time

All strings arena-allocated (pointer + length, null-terminated for C compat).

---

## Phase 3 — Table Rendering

### What it does
Converts a `Table` model into a visual grid using the graphics layout system.

### Structure
```
table_view (LinearV)
  ├── header (LinearH)
  │    ├── Cell "Name" [Rect + Text]
  │    ├── Cell "Age"  [Rect + Text]
  │    └── Cell "City" [Rect + Text]
  └── scroll (SCROLL viewport)
       ├── row-0 (LinearH) [id="row-0"]
       │    ├── Cell "Alice" [Rect + Text]
       │    ├── Cell "30"    [Rect + Text]
       │    └── Cell "London"[Rect + Text]
       ├── row-1 (LinearH) [id="row-1"]
       └── ...
```

Column widths auto-sized from header text measurement. Alternating row colors. Scroll viewport clips overflow rows.

---

## Phase 4 — Math Expression Parser + Renderer

### What it does
Parses math notation (`x^2 + y^2 = r^2`) into an AST, then renders it as a layout tree with proper formatting (superscripts, fractions, etc.).

### Parser precedence (low→high)
```
Comma (,) < Relational (=,<,>,!=) < Additive (+,-) < Multiplicative (*,/,implicit) < Power (^) < Unary (-) < Primary
```

### AST structure
```
"x^2 + 2x + 1 = 0"
         │
    Binary("=")
    ├── Binary("+")
    │   ├── Binary("+")
    │   │   ├── Superscript(x, 2)
    │   │   └── Binary("*", 2, x)   [implicit]
    │   └── Number(1)
    └── Number(0)
```

### Renderer: AST → LayoutNode
```
Superscript(x, 2):
  HStack [gap=1]
    ├── leaf "x" (size=16, italic)
    └── leaf "2" (size=11.2, italic, y_offset=-6.4)  ← shifted UP

Fraction(a, b):
  VStack [gap=2]
    ├── [numerator rendered]
    ├── [horizontal bar rect]
    └── [denominator rendered]
```

The `y_offset` field on LayoutNode shifts rendering vertically without affecting layout flow — zero-cost way to achieve baseline shifting.

---

## Phase 5 — Cell Editing + Undo/Redo

### What it does
Interactive text editing within table cells, with full undo/redo history.

### Components
```
TableEditor
  ├── table: Table*          (the data)
  ├── history: EditHistory   (undo/redo stack)
  ├── selection: CellSelection (which cells are selected)
  ├── edit_buffer[512]       (current edit text)
  ├── cursor_pos             (position within buffer)
  └── editing: bool          (is a cell active?)
```

### Edit cycle
```
1. begin_edit(row, col)  → loads cell value into buffer
2. insert_char('X')      → modifies buffer, moves cursor
3. commit_edit()         → compares buffer vs original
                          → if different: push to history, update table
4. undo()               → pops history, restores old value
```

### EditHistory
```
actions[]: [edit0, edit1, edit2, edit3, ...]
                         ^past_count  ^future_count
                         
push()  → actions[past++], future=0
undo()  → past--, future++, return action
redo()  → future--, past++, return action
```

---

## Phase 6 — Chemistry/Physics/Geometry/Rich Text

### What it does
Domain-specific renderers for chemical formulas, physics equations, geometry, and a rich text parser that embeds them inline.

### Rich text flow
```
Input: "Water: $chem{H2O}\nEnergy: $phys{E = m*c^2}"

Parsing:
  Line 1: [Text "Water: "] [Chem render "H2O"]
  Line 2: [Text "Energy: "] [Math render "E = m*c^2"]

Output:
  VStack
    ├── HStack [Text("Water: "), chem_node]
    └── HStack [Text("Energy: "), math_node]
```

### Embed syntax
- `$math{expr}` — math with superscripts, fractions, etc.
- `$chem{formula}` — chemical formula (rendered as text)
- `$phys{expr}` — physics (delegates to math)
- `$geom{expr}` — geometry (delegates to math)

Newlines inside `$tag{...}` produce separate rendered lines (stacked).

---

## Phase 7 — Graph Model + Diagram Rendering

### What it does
Directed graph data structure and visual diagram renderer.

### Data model
```
Graph
  ├── nodes[]: [{id:"Start", label:"Start", x:50, y:50, w:100, h:30}, ...]
  └── edges[]: [{from:0, to:1, label:"next"}, ...]
```

### Rendering
```
graph_view (COORDINATE layout)
  │
  ├── elements[]: Line elements for edges (drawn BEHIND nodes)
  │    ├── Line(Start_center → Process_center, shortened to borders)
  │    └── ...
  │
  └── children[]: Node rectangles (drawn ON TOP of edges)
       ├── Node "Start" [Rect(fill) + Text(label)] at (x,y)
       ├── Node "Process" [Rect + Text] at (x,y)
       └── ...
```

Edge lines are shortened: instead of center-to-center, they stop at the node border (computed by normalizing the direction vector and subtracting half the node width).

### Layout
Currently uses grid layout (simple row-major positioning). Can be extended with force-directed or layered algorithms.

---

## Cross-cutting: Platform Abstraction

```
PlatformWindow (abstract)
  ├── poll_event(InputEvent&) → bool
  ├── begin_frame()
  ├── end_frame()
  └── backend() → RenderBackend*

SDL2Window : PlatformWindow
  └── wraps SDL_Window + SDL_Renderer + SDL_Event → InputEvent translation
```

Application code (demo.h) NEVER includes SDL headers. It uses only `PlatformWindow` and `InputEvent`. Swapping to Vulkan/DirectX/etc. only requires a new `xxx_platform.cpp`.

---

## Cross-cutting: UI Builder (React-like API)

```cpp
// Declarative tree construction:
auto root = VStack(&arena, 8).padding(12).id("root")
    .child(Label(&arena, "Title", 14))
    .child(HStack(&arena, 5)
        .child(ColorBox(&arena, 60, 40, COLOR_RED))
        .child(ColorBox(&arena, 60, 40, COLOR_BLUE)))
    .child(Scroll(&arena, 370, 150, 2)
        .children(items, 20));

LayoutNode* tree = build(root);
tree->compute(800, 600);
tree->render(backend);
```

Methods on `UI` struct are `inline` — compile to direct field assignment. Zero runtime cost vs manual struct initialization.

---

## Performance Techniques Used

| Technique | Where applied |
|---|---|
| Arena allocation | All models, parsers, layout nodes, elements |
| Bit-packed flags | TextStyle (6 flags in 1 byte), LayoutType (3 bits) |
| Zero-cost methods | LayoutNode::compute/render/hit (non-virtual) |
| Virtual only at boundary | RenderBackend, PlatformWindow (2 vtables total) |
| No malloc in hot path | All rendering, layout, hit testing from arena |
| Bulk free | arena_reset() frees everything at once |
