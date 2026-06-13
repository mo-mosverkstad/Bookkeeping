#pragma once
#include <cstdint>
#include <cstring>

// ══════════════════════════════════════════════════════════════════════════════
// Source Editor Local History — independent undo/redo for text editing
// Zero-cost: fixed-size stack, no heap allocation during editing.
// ══════════════════════════════════════════════════════════════════════════════

struct SourceSnapshot {
    char text[512];
    uint16_t len;
    uint16_t cursor;
};

struct SourceHistory {
    SourceSnapshot undo_stack[32];
    SourceSnapshot redo_stack[32];
    uint8_t undo_count = 0;
    uint8_t redo_count = 0;

    void push(const char* buf, uint16_t len, uint16_t cursor) {
        if (undo_count < 32) {
            memcpy(undo_stack[undo_count].text, buf, len + 1);
            undo_stack[undo_count].len = len;
            undo_stack[undo_count].cursor = cursor;
            undo_count++;
            redo_count = 0;
        }
    }

    bool do_undo(char* buf, uint16_t& len, uint16_t& cursor) {
        if (undo_count == 0) return false;
        // Push current to redo
        if (redo_count < 32) {
            memcpy(redo_stack[redo_count].text, buf, len + 1);
            redo_stack[redo_count].len = len;
            redo_stack[redo_count].cursor = cursor;
            redo_count++;
        }
        undo_count--;
        memcpy(buf, undo_stack[undo_count].text, undo_stack[undo_count].len + 1);
        len = undo_stack[undo_count].len;
        cursor = undo_stack[undo_count].cursor;
        return true;
    }

    bool do_redo(char* buf, uint16_t& len, uint16_t& cursor) {
        if (redo_count == 0) return false;
        // Push current to undo
        if (undo_count < 32) {
            memcpy(undo_stack[undo_count].text, buf, len + 1);
            undo_stack[undo_count].len = len;
            undo_stack[undo_count].cursor = cursor;
            undo_count++;
        }
        redo_count--;
        memcpy(buf, redo_stack[redo_count].text, redo_stack[redo_count].len + 1);
        len = redo_stack[redo_count].len;
        cursor = redo_stack[redo_count].cursor;
        return true;
    }

    void clear() { undo_count = 0; redo_count = 0; }
};
