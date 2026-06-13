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

This is a strict **layered architecture** (sometimes called "onion" or "clean architecture"):
- No circular dependencies between layers
- Upper layers can call lower layers, never vice versa
- Each layer is testable in isolation (core has zero deps, graphics only needs core)

The design also applies the **Dependency Inversion Principle** at the platform boundary:
`app/` depends on the *abstract* `PlatformWindow` interface, not on SDL2 directly.
The concrete SDL2 implementation is injected at link time via `sdl2_platform.cpp`.

```cpp
// main.cpp — the entire application entry point:
#include "src/demo.h"
int main() { return run_demo(); }
```

The single `run_demo()` function orchestrates all subsystems. There is no framework,
no event bus, no DI container — just direct function calls through a clear hierarchy.

---

## Phase 1 — Graphics Library Foundation

### What it does
Provides the building blocks for all visual rendering: shapes, layouts, and backends.

### Design Patterns

**Composite Pattern** — `LayoutNode` is a tree where each node can contain child nodes
and leaf elements. The same `compute()` / `render()` / `hit_test()` operations work
uniformly on any subtree regardless of depth.

**Strategy Pattern** — `RenderBackend` defines a rendering strategy. The layout tree
doesn't know whether it's drawing to a pixel buffer (tests) or an SDL window (display).
Backends are swapped without changing any tree logic.

**Tagged Union (Discriminated Union)** — Elements use a C-style tagged union instead of
virtual inheritance. This avoids vtable overhead for shape types (which are allocated
by the millions):

```cpp
// src/graphics/elements/element.h
enum ElementType : uint8_t {
    ELEM_RECT = 0, ELEM_ELLIPSE, ELEM_LINE,
    ELEM_POLYLINE, ELEM_POLYGON, ELEM_TEXT,
};

struct Element {
    ElementType type;  // 1-byte tag
    union {
        Rect rect; Ellipse ellipse; Line line;
        Polyline polyline; Polygon polygon; Text text;
    };
};

// Factory: construct + tag in one call
inline Element elem_rect(Rect r) { Element e; e.type = ELEM_RECT; e.rect = r; return e; }
```

This is the **Data-Oriented Design** approach: store related data contiguously, tag it,
and dispatch on the tag. No pointer chasing, no vtable indirection.

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

The arena implements the **Bump Allocator** pattern — the simplest possible allocator:

```cpp
// src/core/arena.h
inline void* arena_alloc(Arena* a, size_t size, size_t align = 8) {
    size_t aligned = (a->offset + align - 1) & ~(align - 1);
    if (aligned + size > a->capacity) return nullptr; // OOM
    void* ptr = a->base + aligned;
    a->offset = aligned + size;
    return ptr;
}

inline void arena_reset(Arena* a) { a->offset = 0; }  // free everything at once
```

Key insight: there is no `free()` for individual objects. The arena follows a
**region-based memory management** strategy where all allocations in a region
share the same lifetime. When the region is done, one `arena_reset()` call
reclaims all memory in O(1). This eliminates use-after-free bugs and fragmentation.

Typed helpers provide ergonomic construction:

```cpp
template<typename T>
inline T* arena_new(Arena* a) {
    void* mem = arena_alloc(a, sizeof(T), alignof(T));
    return new (mem) T{};  // placement new with zero-init
}
```

**`src/graphics/elements/`** — One file per shape

Each shape is a plain **POD struct** (Plain Old Data) — no constructors, no destructors,
no virtual methods. This means they can be `memcpy`'d, stored in arrays without gaps,
and initialized with aggregate syntax:

- `rect.h`: x, y, w, h, fill color, stroke color, stroke width, corner radius
- `ellipse.h`: center (cx, cy), radii (rx, ry), fill, stroke
- `line.h`: endpoints (x1,y1)→(x2,y2), color, width
- `polyline.h`: array of points (open path), `PolyPoint` struct reused by polygon
- `polygon.h`: closed path (last point connects to first), fill + stroke
- `text.h`: position, content string, font, size, color, style flags (bold/italic/underline packed into 1 byte)
- `element.h`: Tagged union wrapping all shapes + factory functions

**Bit-packing** in TextStyle demonstrates the data density approach:

```cpp
// src/graphics/elements/text.h
enum TextStyle : uint8_t {
    TEXT_NORMAL        = 0,
    TEXT_BOLD          = 1 << 0,  // bit 0
    TEXT_ITALIC        = 1 << 1,  // bit 1
    TEXT_UNDERLINE     = 1 << 2,  // bit 2
    TEXT_STRIKETHROUGH = 1 << 3,  // bit 3
    TEXT_SUBSCRIPT     = 1 << 4,  // bit 4
    TEXT_SUPERSCRIPT   = 1 << 5,  // bit 5
};
// 6 boolean flags in 1 byte. Scattered bools would take 6 bytes + padding.
```

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

This follows the principle of **minimal abstraction cost**: virtual dispatch (indirect
function call via vtable) is only used where runtime polymorphism is genuinely needed.
The rendering visitor switches based on the `ElementType` tag:

```cpp
// src/graphics/layout/layout.cpp — render dispatch
void LayoutNode::render(RenderBackend* backend, float offset_x, float offset_y) {
    float abs_x = offset_x + x;
    float abs_y = offset_y + y + y_offset;
    for (uint16_t i = 0; i < element_count; i++) {
        Element& e = elements[i];
        switch (e.type) {
            case ELEM_RECT:    backend->render_rect(abs_x, abs_y, e.rect); break;
            case ELEM_ELLIPSE: backend->render_ellipse(abs_x, abs_y, e.ellipse); break;
            case ELEM_LINE:    backend->render_line(abs_x, abs_y, e.line); break;
            // ... etc
        }
    }
    // Recurse into children (clip if SCROLL type)
    ...
}
```

The `LayoutNode::compute()` method implements a **single-pass top-down layout algorithm**:
parent determines available space, each child computes within that space. This is
analogous to CSS flexbox but without two-pass min/max negotiation.

### Extension: ScrollLayout, Hit Testing, Text Measurement, Clipping

**ScrollLayout**: Children positioned in content space. `scroll_x/scroll_y` shift the viewport. Clipping prevents drawing outside viewport bounds.

**Hit testing**: Two modes:
- `hit_surface()`: Returns topmost (last-drawn) node at (x,y) — like "what did I click?"
- `hit_deep()`: Returns ALL nodes containing (x,y) — like "what's the full stack here?"

**Text measurement hook**: Pluggable function pointer. Default = mock (width = chars × size × 0.6). Can be replaced with real font metrics.

This is the **Strategy Pattern via function pointer** — lighter weight than a virtual class:

```cpp
// src/graphics/layout/layout.h
typedef TextMeasure (*TextMeasureFn)(const char* text, uint32_t len,
                                     const char* font, float size, uint8_t style);
void set_text_measure_hook(TextMeasureFn fn);

// Default implementation (used in tests):
static TextMeasure default_measure(const char* text, uint32_t len, ...) {
    return { max_line_chars * size * 0.6f, lines * size };
}
```

In production, SDL2_ttf provides real glyph metrics. In tests, the mock lets us
validate layout logic without loading font files.

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

This is **Unidirectional Data Flow** (inspired by React/Elm/Redux):
state is the single source of truth, the UI is a pure function of state,
and events modify state which triggers a re-render. The separation makes
the UI deterministic and testable:

```cpp
// Render function: state → UI tree (pure, no side effects)
static LayoutNode* counter_render(void* state, Arena* a) {
    CounterState* cs = (CounterState*)state;
    char* txt = (char*)arena_alloc(a, 48, 1);
    snprintf(txt, 48, "Clicks: %d", cs->count);
    auto row = HStack(a, 3).size(370, 40).id("counter");
    row.child(Label(a, txt, 12));
    return build(row);
}

// Event handler: state + event → mutated state
static bool counter_event(void* state, const UIEvent* ev) {
    if (ev->type == EVENT_CLICK) { ((CounterState*)state)->count++; return true; }
    return false;
}
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

The string type follows the **fat pointer** pattern — storing length alongside data
avoids strlen() scans and enables O(1) comparison short-circuit:

```cpp
// src/core/str.h
struct Str {
    const char* data;
    uint32_t len;
};

inline Str arena_str(Arena* a, const char* src, uint32_t len) {
    char* buf = (char*)arena_alloc(a, len + 1, 1);
    memcpy(buf, src, len);
    buf[len] = '\0';  // null-terminated for C compat
    return {buf, len};
}

inline bool str_eq(Str a, Str b) {
    if (a.len != b.len) return false;      // fast path: length mismatch
    return memcmp(a.data, b.data, a.len) == 0;
}
```

The Table API uses the **Repository Pattern** — pure CRUD operations on an
in-memory data structure, with no knowledge of persistence or rendering:

```cpp
// src/core/model/table.h — clean data access interface
Str table_get_cell(const Table* t, uint32_t row, uint16_t col);
void table_set_cell(Arena* a, Table* t, uint32_t row, uint16_t col, Str value);
uint32_t table_append_row(Arena* a, Table* t);
void table_insert_row(Arena* a, Table* t, uint32_t at);
void table_remove_row(Table* t, uint32_t at);
void table_move_row(Table* t, uint32_t from, uint32_t to);
```

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

The table renderer demonstrates the **Model-View separation** — the Table model
(Phase 2) has no rendering knowledge; `table_view_build()` is a pure function that
transforms model → visual tree:

```cpp
// src/app/table_view.h — transforms data model to visual layout
inline LayoutNode* table_view_build(Arena* a, const Table* table, const TableViewConfig& cfg) {
    // Measure column widths from header text
    for (uint16_t c = 0; c < cols; c++) {
        TextMeasure m = measure_text(table->columns[c].name.data, ...);
        col_widths[c] = m.width + 16;
    }
    // Build header row (LinearH)
    // Build data rows inside ScrollLayout
    // Return root (LinearV containing header + scroll)
}
```

The config struct acts as a **Value Object** encapsulating all visual parameters,
making the renderer fully configurable without modifying code.

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

The math parser is implemented as a classic **Recursive Descent Parser** with
**Pratt precedence climbing**. Each precedence level is a function that calls
the next higher level, producing an AST node:

```
parse_relational() calls parse_additive()
  parse_additive() calls parse_multiplicative()
    parse_multiplicative() calls parse_power()
      parse_power() calls parse_unary()
        parse_unary() calls parse_primary()
          parse_primary() → Number | Identifier | Paren | Sqrt | Set
```

The renderer then performs a **tree-to-tree transformation**: MathAST → LayoutNode.
This is the **Interpreter Pattern** — each AST node type has a render rule that
produces the corresponding visual subtree.

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

This is the **Command Pattern** — each edit is reified as a data object (`EditAction`)
that can be executed (apply), undone (reverse), or replayed (redo). The history stack
uses a fixed-capacity arena-allocated array — no heap allocation during editing:

```cpp
// src/app/edit_history.h
struct EditAction {
    EditActionType type;     // EDIT_CELL, EDIT_ADD_ROW, etc.
    uint32_t row;
    uint16_t col;
    Str old_value;           // for undo
    Str new_value;           // for redo
};

struct EditHistory {
    EditAction* actions;     // pre-allocated in arena
    uint16_t capacity;
    uint16_t past_count;
    uint16_t future_count;

    void push(EditAction action) {
        actions[past_count++] = action;
        future_count = 0;    // push clears redo stack
    }
    EditAction* undo() { past_count--; future_count++; return &actions[past_count]; }
    EditAction* redo() { future_count--; return &actions[past_count++]; }
};
```

The `TableEditor` aggregates the command pattern with an **edit buffer** (in-place
text editing) and a **selection model** (multi-cell tracking). This is the
**Mediator Pattern** — the editor coordinates between table, history, and selection
without them knowing about each other.

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

The rich text parser uses the **Template Method** approach — a common parsing loop
that detects `$tag{...}` markers, dispatches to the appropriate domain renderer,
and assembles all fragments into a unified layout tree. Each domain renderer is
a plug-in that conforms to the same interface (input string → LayoutNode*):

```
rich_render(arena, text, len, font_size, color)
  │
  ├── encounters plain text → creates Text element directly
  ├── encounters $math{...} → delegates to math_render(arena, expr)
  ├── encounters $chem{...} → delegates to chem_render(arena, formula)
  ├── encounters $phys{...} → delegates to math_render (same as math)
  └── encounters $geom{...} → delegates to math_render (same as math)
```

This is the **Open/Closed Principle** in action — adding a new domain renderer
requires only adding a new `else if` branch in the parser, without changing
existing renderers.

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

The graph renderer demonstrates the **Coordinate Layout** pattern — nodes are positioned
absolutely based on their computed x/y coordinates, while edges are drawn as root-level
elements behind the children (exploiting draw order = z-order):

```cpp
// src/app/graph_view.h — edge shortening to node borders
float dx = x2 - x1, dy = y2 - y1;
float len = sqrtf(dx*dx + dy*dy);
if (len > 0) {
    float nx = dx / len, ny = dy / len;  // normalized direction
    x1 += nx * (from.w / 2);             // start at source border
    y1 += ny * (from.h / 2);
    x2 -= nx * (to.w / 2);              // end at target border
    y2 -= ny * (to.h / 2);
}
root->elements[i] = elem_line({x1, y1, x2, y2, cfg.edge_color, 1.5f});
```

The `Graph` struct uses an **adjacency list** representation via indexed arrays
(nodes[] + edges[] with from/to as indices). This is cache-friendly compared to
pointer-based adjacency lists.

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

This is the **Abstract Factory + Bridge Pattern** combination:

```cpp
// src/platform/platform.h — abstract interface
struct InputEvent {
    enum Type : uint8_t { QUIT, MOUSE_DOWN, MOUSE_UP, MOUSE_MOVE, MOUSE_WHEEL, KEY_DOWN, KEY_UP };
    Type type;
    float x, y;
    float scroll_x, scroll_y;
    int key;
    uint8_t button;
    uint16_t mod;       // modifier flags (ctrl, shift, alt)
};

struct PlatformWindow {
    virtual bool poll_event(InputEvent& out) = 0;
    virtual RenderBackend* backend() = 0;
    virtual void begin_frame() = 0;
    virtual void end_frame() = 0;
};

// Factory function — hides implementation details
PlatformWindow* create_window(const char* title, int w, int h);
```

The SDL2 implementation translates platform-specific events into the generic format:

```cpp
// src/platform/sdl2_platform.cpp
case SDL_KEYDOWN:
    out.type = InputEvent::KEY_DOWN;
    out.key = ev.key.keysym.sym;    // SDL keycode → generic int
    out.mod = ev.key.keysym.mod;    // SDL modifier → generic uint16
    return true;
```

The application only sees `InputEvent` — it never touches SDL types, making the
entire app layer portable to any windowing system.

---

## Phase 8 — Search + Navigation Tree + Workspace

### What it does
Provides full-text search across table cells, hierarchical file navigation, tabbed multi-view workspace, and graph neighbourhood queries.

### Search Engine (`src/core/search.h`)

```
SearchResult = search_table(arena, table, "query", len)
  │
  └── For each cell: case-insensitive substring match
       Returns: [{row, col, match_offset, match_len}, ...]

SearchResult = search_table_identifier(arena, table, "x", 1)
  │
  └── Same scan but checks word boundaries:
       left boundary:  i==0 or !is_ident_char(prev)
       right boundary: i+len==end or !is_ident_char(next)
```

**Graph neighbourhood** (BFS from a start node):
```
NeighbourResult = graph_neighbours(arena, graph, start_idx, max_depth)
  │
  └── BFS queue (arena-allocated)
       Returns all reachable node indices within depth limit
```

The BFS implementation is notable for using the arena as a queue — no `std::queue`
or linked list. The queue is a flat array where `qhead` and `qtail` advance forward:

```cpp
// src/core/search.h — arena-backed BFS
uint16_t* queue = (uint16_t*)arena_alloc(a, sizeof(uint16_t) * cap, 2);
uint16_t* depths = (uint16_t*)arena_alloc(a, sizeof(uint16_t) * cap, 2);
uint16_t qhead = 0, qtail = 0;

queue[qtail] = start; depths[qtail] = 0; qtail++;
seen[start] = 1;

while (qhead < qtail) {
    uint16_t cur = queue[qhead];
    uint16_t d = depths[qhead]; qhead++;
    visited[vcount++] = cur;
    if (d >= max_depth) continue;
    for (uint16_t e = 0; e < g->edge_count; e++) {
        // ... traverse edges, enqueue unseen neighbours
    }
}
```

This is a **monotonic queue** — it only grows forward, perfectly suited for arena allocation.

**Cross-table join**:
```
JoinResult = search_join(arena, table_a, col_a, table_b, col_b)
  │
  └── For each row in A, scan all rows in B for exact value match
       Returns: [{row_a, row_b, col_a, col_b}, ...]
```

### Navigation Tree (`src/app/nav_tree.h`)

```
NavTree
  └── root[]: NavNode[]
       ├── NavNode {label, id, children[], expanded, depth}
       │    ├── NavNode (child)
       │    └── NavNode (child)
       └── NavNode ...

Operations:
  add_root(arena, label, id)   → add top-level category
  add_child(arena, parent, label, id) → nest under parent
  toggle(id)                    → expand/collapse by id
```

Rendering produces a VStack of HStack rows with indent spacers. Wrapped in a ScrollLayout for overflow. Expand/collapse indicators: `▼` (expanded), `▶` (collapsed).

### Tab Strip (`src/app/tab_strip.h`)

```
TabStrip
  └── tabs[]: Tab[]
       ├── Tab {label, id, active}
       └── ...
  active_index: which tab is showing

Operations:
  open(label, id)    → add tab or reactivate existing
  close(idx)         → remove tab, activate neighbour
  close_by_id(id)    → find + close
  activate(idx)      → switch active tab
  find(id) → int     → lookup by id
```

Rendering produces an HStack of tab nodes. Each tab is itself an HStack containing:
- A label box (click to activate)
- A close button box with id `"close:<tabid>"` (click to close)

Active/inactive tabs have distinct background and text colors.

### Workspace (`src/app/workspace.h`)

```
Workspace
  ├── tabs: TabStrip
  ├── nav: NavTree
  └── views[]: ViewSlot[]
       └── ViewSlot {id, type, data*, cached_tree*}

Operations:
  mount(label, id, type, data)  → register view + open tab
  unmount(id)                   → remove view + close tab
  active_view()                 → get current ViewSlot*
  invalidate(id)                → clear cached layout tree
```

ViewType enum: `VIEW_NONE`, `VIEW_TABLE`, `VIEW_GRAPH`, `VIEW_SEARCH_RESULTS`.

The Workspace follows the **Controller Pattern** (MVC) — it coordinates between
the data model (views/tabs) and the UI rendering, handling mount/unmount lifecycle:

```cpp
// src/app/workspace.h
int Workspace::mount(const char* label, const char* id, ViewType type, void* data) {
    int tab_idx = tabs.open(label, id);   // open/reactivate tab
    // ... register or update view slot
    views[view_count++] = {id, type, data, nullptr};
    return tab_idx;
}

void Workspace::unmount(const char* id) {
    tabs.close_by_id(id);                 // remove tab
    // ... remove view slot (memmove to preserve order)
}
```

The `void* data` pointer uses **type erasure** — the workspace doesn't know
the concrete type of each view's data. The `ViewType` enum enables safe
downcasting when the view needs to be rendered.

### Demo integration
```
┌─────────────────────────────────────────────────────┐
│ Phase 8: Workspace | Tabs | Nav | Search           │
├─────────────────────────────────────────────────────┤
│ Search: _________                                   │
├─────────────────────────────────────────────────────┤
│ [People] [Cities] [Workflow]    ← tab strip        │
├─────────┬───────────────────────────────────────────┤
│ ▼ Tables│  ┌──────────────────────────────────┐    │
│   People│  │  (active table/graph view)        │    │
│   Cities│  │                                   │    │
│ ▼ Graphs│  └──────────────────────────────────┘    │
│   Workfl│                                          │
└─────────┴───────────────────────────────────────────┘
```

Controls:
- Click tabs to switch views
- Click "x" on a tab to close it
- Click nav items to expand/collapse or activate (re-opens closed views)
- Click search bar or Ctrl+F to activate search
- Type to filter (live results shown below), arrow keys move cursor
- Click outside search bar or ESC to deactivate search
- All previous editing (click cell, type, Ctrl+Z/Y) still works
- Scroll clamps at content boundary (no infinite scroll)
- Click "◀ Editor" button to toggle source editor sidebar
- Click a cell → source editor loads cell value, type shown in header
- Edit in source editor (supports multiline via Enter, full Unicode)
- Click [Apply] to commit source editor text back to the cell
- Click [Parse] to see parsed preview
- Click [Open] to load a CSV file, Click [Save] to persist to disk
- Active cell highlighted with blue background + dark border
- Table columns auto-size to content width
- Table rows expand vertically for multiline content
- Window resizable — layout adapts dynamically

---

## Phase 9 — File I/O

### What it does
Loads and saves CSV tables and graph JSON files from/to disk. Tracks dirty state
and persists the user's session (last-opened files).

### File I/O Architecture (`src/core/file_io.h`)

```
file_read(arena, path)  → Str (entire file in arena)
file_write(path, data, len) → bool

file_load_csv(arena, path) → Table*
file_save_csv(arena, table, path) → bool

file_load_graph(arena, path) → Graph*
file_save_graph(arena, graph, path) → bool
```

The design follows the **Gateway Pattern** — file I/O is isolated in a single module
that the rest of the application calls through simple functions. No file handles leak
into business logic.

### Graph JSON Format

```json
{
  "nodes": [
    {"id": "Start", "label": "Start Node"},
    {"id": "End", "label": "End Node"}
  ],
  "edges": [
    {"from": "Start", "to": "End", "label": "next"}
  ]
}
```

The parser is hand-rolled (no external JSON dependency). It uses `strstr` to find
array keys, then parses objects with a simple state machine that extracts quoted
string key-value pairs.

### Dirty Tracking

```cpp
struct DirtyState {
    bool table_dirty;
    bool graph_dirty;
    uint32_t last_save_history_pos;

    void mark_clean(uint32_t history_pos);
    void mark_table_dirty();
    bool is_dirty() const;
};
```

Dirty state enables save prompts on exit and visual indicators.

### Session Persistence

Session file format: one file path per line.

```
/home/user/data.csv
/home/user/workflow.json
```

On exit, open file paths are saved. On startup, the session is restored
so the user continues where they left off.

---

## Phase 10 — Polish + Integration

### What it does
Final UX polish layer: column sorting, row reordering, zoom control, status bar
with dirty indicator, and full integration testing across all subsystems.

### Column Sorting (`src/app/table_sort.h`)

Stable insertion sort on table rows by a given column:

```cpp
inline void table_sort(Table* t, uint16_t col, uint8_t direction) {
    // direction: 0=ascending, 1=descending
    // Insertion sort: O(n²) but stable and in-place
    for (uint32_t i = 1; i < t->row_count; i++) {
        Row tmp = t->rows[i];
        Str val_i = tmp.cells[col].value;
        uint32_t j = i;
        while (j > 0) {
            int cmp = memcmp(val_i.data, t->rows[j-1].cells[col].value.data, ...);
            if (direction == 0 ? cmp >= 0 : cmp <= 0) break;
            t->rows[j] = t->rows[j-1]; j--;
        }
        t->rows[j] = tmp;
    }
}
```

### Status Bar

Displays at the bottom of the window:
```
[*] Modified | Zoom: 120% | Table
```
- `[*] Modified` / `Saved` — dirty indicator
- `Zoom: N%` — current zoom level
- `Table` / `Graph` — active view type

### Zoom Control

Ctrl+Plus/Minus scales the viewport height proportionally. The zoom factor
is applied to the table and graph view configs before rebuilding:

```cpp
tvcfg.viewport_height = (float)(int)(200 * zoom);
gvcfg.viewport_height = (float)(int)(90 * zoom);
```

### Row Reorder

Ctrl+Up/Down moves the currently selected row using `table_move_row()`:

```cpp
if (ev.key == 1073741906 /* Up */ && editor.active_cell.row > 0) {
    table_move_row((Table*)v->data, editor.active_cell.row, editor.active_cell.row - 1);
    editor.active_cell.row--;
}
```

---

## Phase 11 — Visual Theme + Layout Parity

### What it does
Brings the C++ port's visual appearance to match the Webapp's light theme,
structural layout, and interactive sidebar.

### Theme System (`src/core/theme.h`)

A centralized struct holding all design tokens extracted from the Webapp's CSS `:root`:

```cpp
struct Theme {
    Color bg;            // #f8fafc — page background
    Color surface;       // #ffffff — panel/card background
    Color accent_light;  // #f1f5f9 — hover highlight
    Color border;        // #e2e8f0 — standard border
    Color text;          // #1e293b — primary text
    Color text_secondary;// #334155
    Color text_muted;    // #64748b — annotations
    // ... 50+ color fields for tabs, tables, status bar, etc.
    float font_base;     // 13.0px
    float font_small;    // 11.4px (0.88em)
    float font_tiny;     // 10.1px (0.78em)
};

inline Theme theme_light() { /* returns populated struct */ }
```

This is the **Design Token Pattern** — all visual constants centralized in one place.
Changing the theme requires modifying only this struct, not searching through render code.

### Application Layout Structure

The layout matches the Webapp's HTML structure exactly:

```
┌────────────────────────────────────────────────────────────┐
│ [Open] | [Save] | [◀ Editor] |  Search...       ← Toolbar │  31px
├────────────────────────────────────────────────────────────┤
│ [People] [Cities] [Workflow] [integrals] ...   ← Tab bar  │  26px
├───────────┬─────────────────────────┬──────────────────────┤
│ Contents  │                         │ Source Editor [type]  │
│ ▼ Tables  │  (active table/graph)   │ [Parse] [Apply]      │
│   People  │                         │ ┌──────────────────┐ │
│   Cities  │                         │ │ editable text... │ │
│ ▼ Graphs  │                         │ └──────────────────┘ │
│   Workfl  │                         │ (preview area)       │
│ ← 180px → │ ← flex (fills rest) →  │ ← 260px →           │
├───────────┴─────────────────────────┴──────────────────────┤
│ People [modified]  Zoom: 100%                  ← Status    │  21px
└────────────────────────────────────────────────────────────┘
```

Built in `rebuild_ui()` as a VStack of: toolbar HStack → tab_bar HStack → content HStack
(nav_panel + workspace + sidebar) → status_bar HStack.

### Window Resize

SDL2's `SDL_WINDOWEVENT_RESIZED` is translated to `InputEvent::WINDOW_RESIZE`:

```cpp
// Platform layer translates resize
case SDL_WINDOWEVENT:
    if (ev.window.event == SDL_WINDOWEVENT_RESIZED) {
        out.type = InputEvent::WINDOW_RESIZE;
        out.x = (float)ev.window.data1;
        out.y = (float)ev.window.data2;
    }

// Demo updates dimensions and triggers rebuild
if (ev.type == InputEvent::WINDOW_RESIZE) {
    win_w = ev.x; win_h = ev.y;
    need_rebuild = true;
}
```

All layout dimensions derive from `win_w`/`win_h`, so resizing adapts naturally.

### Source Editor Panel

The sidebar implements a basic source-code editor matching the Webapp's `SourceEditorView`:

```
┌─────────────────────────┐
│ Source Editor [math]     │ ← header (type indicator)
├─────────────────────────┤
│ [Parse]  [Apply]        │ ← button row
├─────────────────────────┤
│ a^2 + b^2 = c^2|        │ ← editable text (cursor shown as |)
│                          │    focused: 2px blue border
│                          │    unfocused: 1px gray border
├─────────────────────────┤
│ Parsed [math]: "a^2..." │ ← preview area
└─────────────────────────┘
```

**Interaction flow:**
1. Click a table cell → value loaded into source editor, becomes focused
2. Type/edit text (supports Enter=newline, full UTF-8, arrow key navigation)
3. Click [Parse] → preview shows parsed representation
4. Click [Apply] → commits text back to the table cell

### UTF-8 Text Handling

Two helpers ensure correct multi-byte character handling:

```cpp
// Find start of previous UTF-8 code point
static inline uint16_t utf8_prev(const char* buf, uint16_t pos) {
    if (pos == 0) return 0;
    pos--;
    while (pos > 0 && (buf[pos] & 0xC0) == 0x80) pos--; // skip continuation bytes
    return pos;
}

// Find start of next UTF-8 code point
static inline uint16_t utf8_next(const char* buf, uint16_t len, uint16_t pos) {
    if (pos >= len) return len;
    pos++;
    while (pos < len && (buf[pos] & 0xC0) == 0x80) pos++;
    return pos;
}
```

Used by Backspace (delete prev code point), Delete (delete next code point), and
arrow keys (move by whole code points). This handles accented chars (2 bytes),
CJK (3 bytes), and emoji (4 bytes) correctly.

### SDL2 TEXT_INPUT Event

Character insertion uses `SDL_TEXTINPUT` instead of `SDL_KEYDOWN` to get proper
shift/caps/dead-key handling from the OS:

```cpp
case SDL_TEXTINPUT:
    out.type = InputEvent::TEXT_INPUT;
    memcpy(out.text, ev.text.text, 7);  // up to 7 bytes UTF-8
    out.text[7] = 0;
    return true;
```

This provides uppercase letters, special characters (`!@#$%`), accented characters
(`éñü`), and any other OS keyboard output without manual shift-key mapping.

### Cell Highlight

The active cell gets a visual indicator matching the Webapp's `.cell-active`:

```cpp
// In table_view_build:
bool is_active = ((int32_t)r == cfg.active_row && (int16_t)c == cfg.active_col);
Color cell_bg = is_active ? cfg.active_cell_bg : bg;       // #dbeafe
Color cell_border = is_active ? cfg.active_cell_border : cfg.border; // #475569
float sw = is_active ? 2.0f : 1.0f;
```

### Auto-sizing Columns and Rows

Columns auto-size to the widest content (sampling first 50 rows):

```cpp
for (uint32_t r = 0; r < scan; r++) {
    Str val = table_get_cell(table, r, c);
    TextMeasure cm = measure_text(val.data, val.len, "sans", 12, TEXT_NORMAL);
    if (cm.width + 16 > col_widths[c]) col_widths[c] = cm.width + 16;
}
```

Rows expand vertically for multiline content:

```cpp
uint32_t lines = 1;
for (uint32_t i = 0; i < val.len; i++)
    if (val.data[i] == '\n') lines++;
float needed = lines * 14.0f + 8;
if (needed > row_h) row_h = needed;
```

---

## Phase 12 — control.json + Folder Loading

### What it does
Loads multi-CSV folder workspaces using a `control.json` manifest file.
Enables opening entire reference sheets (Mathematics, Chemistry, Software)
with 20+ tables in one action.

### control.json Format

```json
{
  "entries": [
    { "type": "table", "id": "basic-algebra", "file": "Basic algebra.csv" },
    { "type": "table", "id": "derivatives", "file": "Derivatives.csv" }
  ]
}
```

Each entry declares a content item: its type (`"table"`), a unique id, and the
filename relative to the folder.

### Parser Architecture (`src/core/control.h`)

The parser uses a hand-rolled **streaming scanner** — no JSON library dependency:

```cpp
inline ControlFile control_parse(Arena* a, const char* json, uint32_t len) {
    // 1. Find "entries" key via strstr
    const char* p = strstr(json, "\"entries\"");
    p = strchr(p, '[');  // find array start
    p++;

    // 2. For each object in the array:
    while (p < end && *p != ']') {
        while (p < end && *p != '{') p++;  // find '{'
        p++;
        // 3. Extract key-value pairs until '}'
        while (p < end && *p != '}') {
            // scan for key quotes → extract key
            // scan for value quotes → extract value
            // match key to "type", "id", or "file"
        }
        // 4. If all three fields found, store entry
        if (type && id && file)
            cf.entries[cf.count++] = {type, id, file};
    }
}
```

This avoids the complexity of a full JSON parser — the control.json format is
simple enough that string scanning with quote-delimited extraction suffices.

### Folder Loader

```cpp
inline LoadedFolder folder_load(Arena* a, const char* dir_path) {
    // 1. Read control.json from directory
    char ctrl_path[512];
    snprintf(ctrl_path, 512, "%s/control.json", dir_path);
    Str ctrl_content = file_read(a, ctrl_path);

    // 2. Parse entries
    ControlFile cf = control_parse(a, ctrl_content.data, ctrl_content.len);

    // 3. Load each CSV file
    for (uint16_t i = 0; i < cf.count; i++) {
        char file_path[512];
        snprintf(file_path, 512, "%s/%s", dir_path, cf.entries[i].file);
        Table* t = file_load_csv(a, file_path);
        if (t) result.tables[result.table_count++] = t;
    }
    return result;
}
```

### Memory Strategy

Large reference sheets (Chemistry's Isomer table = 249KB, Software's Python ref = 67KB)
require substantial arena space. The folder loader uses a **dedicated load arena**
(4MB) separate from the main arena. This arena is kept alive for the app's lifetime
since the loaded tables reference strings within it.

```cpp
// In Open button handler:
Arena load_arena = arena_create(4 * 1024 * 1024);
LoadedFolder lf = folder_load(&load_arena, folder_path);
// load_arena is NOT destroyed — tables live there
```

### Integration with Workspace + Nav Tree

After loading, each table is mounted as a view and added to the nav tree:

```cpp
NavNode* nav_folder = ws.nav.add_root(&arena, lf.name, "loaded-folder", 32);
for (uint16_t ti = 0; ti < lf.table_count; ti++) {
    ws.mount(lf.table_ids[ti], lf.table_ids[ti], VIEW_TABLE, lf.tables[ti]);
    NavTree::add_child(&arena, nav_folder, lf.table_ids[ti], lf.table_ids[ti], 0);
}
```

This creates:
```
📁 Mathematics reference sheet     ← nav folder (expandable)
    ▤ arithmetics                  ← nav leaf (click → activate tab)
    ▤ basic-algebra
    ▤ derivatives
    ▤ integrals
    ... (21 total)
```

### Capacity Management

Loading 21+ tables requires increased capacities:
- Workspace views/tabs: 16 → 64
- Nav tree child capacity: 16 → 32 per folder
- Frame arena: 256KB → 8MB (rendering 400+ row tables)
- Main arena: 512KB → 4MB (workspace structures + editor state)
- Hit result buffer: 16 → 32 (deeper layout nesting)

---

## Phase 13 — Source Editor (Local Undo/Redo + Parse Preview)

### What it does
Enhances the source editor panel with an independent undo/redo history and
type-aware parsing, matching the Webapp's `SourceEditorView` behavior where
the editor has its own local history separate from the global table EditHistory.

### Design: Dual Undo Stacks

The application now has **two independent undo stacks**:

```
┌─────────────────────────────────────────────────────────────────┐
│  Table EditHistory (global)       │  Source Editor LocalHistory  │
│  ─────────────────────────────    │  ────────────────────────── │
│  Tracks cell value changes:       │  Tracks keystrokes in editor:│
│    push(old→new cell value)       │    push(full buffer snapshot)│
│    undo → restore old cell        │    undo → restore prev text  │
│    redo → reapply new cell        │    redo → restore next text  │
│                                   │                              │
│  Ctrl+Z/Y when NOT in editor     │  Ctrl+Z/Y when IN editor    │
└─────────────────────────────────────────────────────────────────┘
```

This mirrors the Webapp's architecture where `EditHistory` handles model-level
changes and `LocalHistory` handles text-level edits within the source textarea.

### Implementation: Snapshot Stack

```cpp
// Fixed-size stack of full buffer snapshots
struct SourceSnapshot { char text[512]; uint16_t len; uint16_t cursor; };
SourceSnapshot source_undo[32];
SourceSnapshot source_redo_stack[32];
uint8_t source_undo_count = 0;
uint8_t source_redo_count = 0;
```

**Push** (called before every edit):
```cpp
auto source_push_undo = [&]() {
    if (source_undo_count < 32) {
        memcpy(source_undo[source_undo_count].text, source_buf, source_len + 1);
        source_undo[source_undo_count].len = source_len;
        source_undo[source_undo_count].cursor = source_cursor;
        source_undo_count++;
        source_redo_count = 0;  // new edit clears redo
    }
};
```

**Undo** (swaps current ↔ top of undo stack, pushes current to redo):
```cpp
auto source_do_undo = [&]() {
    if (source_undo_count == 0) return;
    // Save current state to redo stack
    memcpy(source_redo_stack[source_redo_count].text, source_buf, ...);
    source_redo_count++;
    // Restore from undo stack
    source_undo_count--;
    memcpy(source_buf, source_undo[source_undo_count].text, ...);
    source_len = source_undo[source_undo_count].len;
    source_cursor = source_undo[source_undo_count].cursor;
};
```

### Keyboard Routing

When `source_focused` is true, Ctrl+Z/Y is intercepted before the global handler:

```cpp
// Source editor: Ctrl+Z/Y local undo/redo (checked BEFORE global handler)
if (ev.type == InputEvent::KEY_DOWN && source_focused && (ev.mod & 0x00C0)) {
    if (ev.key == 'z') { source_do_undo(); need_rebuild = true; }
    else if (ev.key == 'y') { source_do_redo(); need_rebuild = true; }
    continue;  // consume — don't fall through to table undo
}
```

This matches the Webapp where `SourceEditorView` uses `e.stopPropagation()` to
prevent the global keyboard handler from seeing Ctrl+Z when the textarea is focused.

### Edit Points (where undo snapshots are pushed)

Every destructive operation pushes a snapshot before modifying:

| Operation | Trigger |
|---|---|
| Backspace | `ev.key == 8` |
| Delete | `ev.key == 127` |
| Enter (newline) | `ev.key == 13` |
| Character input | `TEXT_INPUT` event |

Arrow keys, Home, End do NOT push undo (cursor movement isn't undoable).

### Parse Preview

The Parse button provides type-aware feedback:

```cpp
if (strcmp(source_type, "math") == 0)
    snprintf(source_preview, 256, "✓ Math: \"%.*s\"", ...);
else if (strcmp(source_type, "chem") == 0)
    snprintf(source_preview, 256, "✓ Chem: \"%.*s\"", ...);
else
    snprintf(source_preview, 256, "✓ Text (%u chars, %u lines)", ...);
```

In the Webapp, Parse triggers the actual cell renderer and shows the visual result.
In the C++ port, the preview is textual (full visual rendering will be added with
Phase 19 cell renderer fidelity).

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

This is the **Builder Pattern** with a fluent (chaining) API. Each method returns
`*this` by reference, enabling call chains. At compile time, the optimizer inlines
everything into simple struct field writes:

```cpp
// src/graphics/ui.h — the builder struct
struct UI {
    LayoutNode node;
    Arena* arena;

    UI& id(const char* s)    { node.id = s; return *this; }
    UI& padding(float p)     { node.padding = p; return *this; }
    UI& gap(float g)         { node.gap = g; return *this; }
    UI& child(UI&& c)        { return add_child(c); }  // move semantics
    UI& bg(Color fill, ...)  { /* append Rect element */ return *this; }
    UI& text(const char* s, ...) { /* append Text element */ return *this; }
};
```

The factory functions act as **named constructors** that produce pre-configured builders:

```cpp
inline UI VStack(Arena* a, float g = 0) {
    UI ui = {}; ui.arena = a;
    ui.node.type = LAYOUT_LINEAR; ui.node.direction = LINEAR_VERTICAL; ui.node.gap = g;
    return ui;
}
```

`build(ui)` finalizes the builder by copying the node into the arena, returning a
persistent pointer. This mirrors React's `React.createElement()` → virtual DOM node pattern.

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
| Frame arena pattern | UI rebuilt every frame from a resettable arena |

### Frame Arena (Double-Buffer Memory)

The demo uses two arenas: a **persistent arena** (holds data that lives across frames:
tables, graphs, workspace state) and a **frame arena** (holds transient UI layout nodes,
reset every frame). This prevents memory growth during interaction:

```cpp
Arena arena = arena_create(512 * 1024);  // persistent data
Arena frame = arena_create(256 * 1024);  // UI layout (reset each rebuild)

auto rebuild_ui = [&]() -> LayoutNode* {
    arena_reset(&frame);       // reclaim all UI memory in O(1)
    Arena* a = &frame;
    // ... build entire UI tree from scratch using frame arena
    LayoutNode* root = build(root_ui);
    root->compute(600, 500);
    return root;
};
```

This is the **double-buffering** strategy applied to memory: one buffer is stable
(data), the other is volatile (rendering). It guarantees bounded memory usage regardless
of how many times the UI is rebuilt.
