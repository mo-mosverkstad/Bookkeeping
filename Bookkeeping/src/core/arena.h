#pragma once
#include <cstdint>
#include <cstddef>
#include <cstdlib>
#include <cstring>
#include <new>

// Arena allocator — bump allocation, bulk free.
// No per-object free. Reset the entire arena to reclaim all memory.
struct Arena {
    uint8_t* base;
    size_t offset;
    size_t capacity;
};

inline Arena arena_create(size_t capacity) {
    Arena a;
    a.base = (uint8_t*)malloc(capacity);
    a.offset = 0;
    a.capacity = capacity;
    return a;
}

inline void arena_destroy(Arena* a) {
    free(a->base);
    a->base = nullptr;
    a->offset = 0;
    a->capacity = 0;
}

inline void arena_reset(Arena* a) { a->offset = 0; }

inline void* arena_alloc(Arena* a, size_t size, size_t align = 8) {
    size_t aligned = (a->offset + align - 1) & ~(align - 1);
    if (aligned + size > a->capacity) return nullptr; // OOM
    void* ptr = a->base + aligned;
    a->offset = aligned + size;
    return ptr;
}

// Typed allocation helper
template<typename T>
inline T* arena_new(Arena* a) {
    void* mem = arena_alloc(a, sizeof(T), alignof(T));
    if (!mem) return nullptr;
    return new (mem) T{};
}

template<typename T>
inline T* arena_array(Arena* a, size_t count) {
    void* mem = arena_alloc(a, sizeof(T) * count, alignof(T));
    if (!mem) return nullptr;
    memset(mem, 0, sizeof(T) * count);
    return (T*)mem;
}
