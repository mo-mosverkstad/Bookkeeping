#pragma once
#include "src/core/arena.h"
#include "src/core/str.h"
#include <cstdint>
#include <cstring>

// Edit action types for undo/redo
enum EditActionType : uint8_t {
    EDIT_CELL = 0,
    EDIT_ADD_ROW,
    EDIT_DELETE_ROW,
    EDIT_MOVE_ROW,
};

struct EditAction {
    EditActionType type;
    uint32_t row;
    uint16_t col;
    Str old_value;
    Str new_value;
    uint32_t move_to; // for EDIT_MOVE_ROW
};

// Edit history — fixed-size stack, no heap allocation in hot path.
// Past actions grow forward, future (for redo) backward.
struct EditHistory {
    EditAction* actions;
    uint16_t capacity;
    uint16_t past_count;
    uint16_t future_count;

    void init(Arena* a, uint16_t cap) {
        capacity = cap;
        actions = (EditAction*)arena_alloc(a, sizeof(EditAction) * cap, 8);
        past_count = 0;
        future_count = 0;
    }

    void push(EditAction action) {
        if (past_count >= capacity) return; // full
        actions[past_count++] = action;
        future_count = 0; // clear redo stack
    }

    EditAction* undo() {
        if (past_count == 0) return nullptr;
        past_count--;
        future_count++;
        return &actions[past_count];
    }

    EditAction* redo() {
        if (future_count == 0) return nullptr;
        future_count--;
        EditAction* a = &actions[past_count];
        past_count++;
        return a;
    }

    bool can_undo() const { return past_count > 0; }
    bool can_redo() const { return future_count > 0; }
    void clear() { past_count = 0; future_count = 0; }
};
