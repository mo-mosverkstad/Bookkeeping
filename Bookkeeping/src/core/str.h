#pragma once
#include "src/core/arena.h"
#include <cstring>

// Arena-backed string: pointer + length. Not null-terminated internally,
// but arena_str() appends a null for C compatibility.
struct Str {
    const char* data;
    uint32_t len;
};

inline Str str_empty() { return {"", 0}; }

inline Str arena_str(Arena* a, const char* src, uint32_t len) {
    char* buf = (char*)arena_alloc(a, len + 1, 1);
    if (!buf) return str_empty();
    if (len > 0) memcpy(buf, src, len);
    buf[len] = '\0';
    return {buf, len};
}

inline Str arena_str_cstr(Arena* a, const char* src) {
    return arena_str(a, src, (uint32_t)strlen(src));
}

inline bool str_eq(Str a, Str b) {
    if (a.len != b.len) return false;
    return memcmp(a.data, b.data, a.len) == 0;
}

inline bool str_eq_cstr(Str a, const char* b) {
    uint32_t blen = (uint32_t)strlen(b);
    if (a.len != blen) return false;
    return memcmp(a.data, b, blen) == 0;
}
