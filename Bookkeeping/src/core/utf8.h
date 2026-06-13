#pragma once
#include <cstdint>

// ── UTF-8 navigation helpers ─────────────────────────────────────────────────
// Zero-cost inline functions for navigating multi-byte UTF-8 sequences.

// Find byte offset of previous code point start
static inline uint16_t utf8_prev(const char* buf, uint16_t pos) {
    if (pos == 0) return 0;
    pos--;
    while (pos > 0 && (buf[pos] & 0xC0) == 0x80) pos--;
    return pos;
}

// Find byte offset of next code point start
static inline uint16_t utf8_next(const char* buf, uint16_t len, uint16_t pos) {
    if (pos >= len) return len;
    pos++;
    while (pos < len && (buf[pos] & 0xC0) == 0x80) pos++;
    return pos;
}
