#pragma once
#include "src/graphics/layout/layout.h"
#include "src/graphics/backend/software_backend.h"

// FunctionalLayout: an immutable, cached layout node.
// On first render (or after invalidation), it renders its children into
// an internal pixel buffer. Subsequent renders just blit the cached buffer.
// Use for static content that rarely changes (sprites, icons, precomputed UI).

struct FunctionalLayout {
    float req_width;
    float req_height;

    // Computed
    float x, y, width, height;

    // The source tree to render into the cache (set once, immutable)
    LayoutNode* source;

    // Cached pixel buffer (rendered on demand)
    uint8_t* cache;       // RGBA pixel data
    int cache_w, cache_h;
    bool dirty;           // true = needs re-render into cache

    const char* id;
};

// Initialize a FunctionalLayout. Caller provides the source tree.
// The cache is allocated and marked dirty.
inline void functional_init(FunctionalLayout* fl, LayoutNode* source, int w, int h) {
    fl->source = source;
    fl->cache_w = w;
    fl->cache_h = h;
    fl->cache = new uint8_t[w * h * 4];
    fl->dirty = true;
    fl->req_width = (float)w;
    fl->req_height = (float)h;
}

// Invalidate the cache (forces re-render on next frame)
inline void functional_invalidate(FunctionalLayout* fl) {
    fl->dirty = true;
}

// Free cache memory
inline void functional_destroy(FunctionalLayout* fl) {
    delete[] fl->cache;
    fl->cache = nullptr;
}
