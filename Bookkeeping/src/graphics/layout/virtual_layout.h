#pragma once
#include "src/graphics/layout/layout_base.h"
#include <cstdint>

// ── Event types ──────────────────────────────────────────────────────────────

enum EventType : uint8_t {
    EVENT_CLICK = 0,
    EVENT_MOUSE_DOWN,
    EVENT_MOUSE_UP,
    EVENT_MOUSE_MOVE,
    EVENT_SCROLL,
    EVENT_KEY_DOWN,
    EVENT_KEY_UP,
};

struct UIEvent {
    EventType type;
    float x, y;          // mouse position (relative to the target node)
    int key;             // key code (for key events)
    float scroll_delta;  // scroll amount (for scroll events)
    void* target;        // the LayoutNode* that was hit
};

// Event handler callback: receives event + userdata, returns true if handled
typedef bool (*EventHandlerFn)(const UIEvent* event, void* userdata);

// ── VirtualLayout ────────────────────────────────────────────────────────────
//
// Reactive rendering pattern: a render function produces the layout tree
// from an opaque state (business data). The cycle:
//
//   1. render_fn(state) → LayoutNode* (the UI tree for current state)
//   2. Layout is computed and rendered to screen
//   3. User interaction → UIEvent dispatched to event_fn
//   4. event_fn mutates state (business logic)
//   5. Mark dirty → re-run render_fn on next frame
//
// This separates business logic from rendering, like React's component model.

struct VirtualLayout {
    // The render function: state → LayoutNode tree
    // Called whenever dirty=true. The returned tree lives in the provided arena.
    typedef LayoutNode* (*RenderFn)(void* state, struct Arena* arena);

    // Event handler: called when any event occurs on a node within this tree
    typedef bool (*EventFn)(void* state, const UIEvent* event);

    RenderFn render_fn;
    EventFn event_fn;
    void* state;           // opaque pointer to business data

    // Internal state
    LayoutNode* current_tree;  // last rendered tree (owned by arena)
    struct Arena* render_arena;// arena for the rendered tree (reset on re-render)
    bool dirty;                // true = needs re-render

    float req_width;
    float req_height;
    float x, y, width, height; // computed position

    const char* id;
};

// Create a VirtualLayout with initial state and render function.
// arena_size: how much memory to reserve for each render pass.
inline void virtual_init(VirtualLayout* vl, VirtualLayout::RenderFn render_fn,
                         VirtualLayout::EventFn event_fn, void* state, size_t arena_size) {
    vl->render_fn = render_fn;
    vl->event_fn = event_fn;
    vl->state = state;
    vl->current_tree = nullptr;
    vl->render_arena = (Arena*)malloc(sizeof(Arena));
    *vl->render_arena = arena_create(arena_size);
    vl->dirty = true;
}

// Mark the VirtualLayout as needing a re-render (state changed)
inline void virtual_set_dirty(VirtualLayout* vl) {
    vl->dirty = true;
}

// Re-render if dirty: resets arena, calls render_fn, stores result.
// Returns the current tree (newly rendered or cached).
inline LayoutNode* virtual_render(VirtualLayout* vl) {
    if (vl->dirty && vl->render_fn) {
        arena_reset(vl->render_arena);
        vl->current_tree = vl->render_fn(vl->state, vl->render_arena);
        vl->dirty = false;
    }
    return vl->current_tree;
}

// Dispatch an event to the VirtualLayout's handler.
// Returns true if the event was handled (and typically marks dirty).
inline bool virtual_dispatch(VirtualLayout* vl, const UIEvent* event) {
    if (vl->event_fn) {
        bool handled = vl->event_fn(vl->state, event);
        if (handled) vl->dirty = true;
        return handled;
    }
    return false;
}

// Free the VirtualLayout's arena
inline void virtual_destroy(VirtualLayout* vl) {
    arena_destroy(vl->render_arena);
    free(vl->render_arena);
    vl->render_arena = nullptr;
    vl->current_tree = nullptr;
}
