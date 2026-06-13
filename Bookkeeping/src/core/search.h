#pragma once
#include "src/core/arena.h"
#include "src/core/str.h"
#include "src/core/model/table.h"
#include "src/core/model/graph.h"
#include <cstring>
#include <cctype>

// ── Search result ────────────────────────────────────────────────────────────

struct SearchHit {
    uint32_t row;
    uint16_t col;
    uint16_t match_offset; // byte offset within cell value
    uint16_t match_len;
};

struct SearchResult {
    SearchHit* hits;
    uint32_t count;
    uint32_t capacity;
};

inline SearchResult search_create(Arena* a, uint32_t cap) {
    SearchResult r;
    r.hits = (SearchHit*)arena_alloc(a, sizeof(SearchHit) * cap, 4);
    r.count = 0;
    r.capacity = cap;
    return r;
}

// ── Case-insensitive substring search ────────────────────────────────────────

static inline bool ci_match(const char* haystack, uint32_t hlen, const char* needle, uint32_t nlen, uint16_t* out_offset) {
    if (nlen == 0 || nlen > hlen) return false;
    for (uint32_t i = 0; i <= hlen - nlen; i++) {
        bool match = true;
        for (uint32_t j = 0; j < nlen; j++) {
            if (tolower((unsigned char)haystack[i + j]) != tolower((unsigned char)needle[j])) {
                match = false; break;
            }
        }
        if (match) { *out_offset = (uint16_t)i; return true; }
    }
    return false;
}

// Search all cells in a table for substring match
inline SearchResult search_table(Arena* a, const Table* t, const char* query, uint32_t qlen, uint32_t max_hits = 256) {
    SearchResult res = search_create(a, max_hits);
    for (uint32_t r = 0; r < t->row_count && res.count < res.capacity; r++) {
        for (uint16_t c = 0; c < t->col_count && res.count < res.capacity; c++) {
            Str val = table_get_cell(t, r, c);
            uint16_t off;
            if (ci_match(val.data, val.len, query, qlen, &off)) {
                res.hits[res.count++] = {r, c, off, (uint16_t)qlen};
            }
        }
    }
    return res;
}

// ── Identifier-aware search ──────────────────────────────────────────────────
// Matches only at word boundaries (before/after must be non-alnum or start/end)

static inline bool is_ident_char(char c) {
    return isalnum((unsigned char)c) || c == '_';
}

inline SearchResult search_table_identifier(Arena* a, const Table* t, const char* query, uint32_t qlen, uint32_t max_hits = 256) {
    SearchResult res = search_create(a, max_hits);
    for (uint32_t r = 0; r < t->row_count && res.count < res.capacity; r++) {
        for (uint16_t c = 0; c < t->col_count && res.count < res.capacity; c++) {
            Str val = table_get_cell(t, r, c);
            if (qlen > val.len) continue;
            for (uint32_t i = 0; i <= val.len - qlen; i++) {
                bool match = true;
                for (uint32_t j = 0; j < qlen; j++) {
                    if (tolower((unsigned char)val.data[i + j]) != tolower((unsigned char)query[j])) {
                        match = false; break;
                    }
                }
                if (!match) continue;
                // Check boundaries
                bool left_ok = (i == 0) || !is_ident_char(val.data[i - 1]);
                bool right_ok = (i + qlen >= val.len) || !is_ident_char(val.data[i + qlen]);
                if (left_ok && right_ok) {
                    res.hits[res.count++] = {r, c, (uint16_t)i, (uint16_t)qlen};
                    break; // one hit per cell
                }
            }
        }
    }
    return res;
}

// ── Graph neighbourhood query ────────────────────────────────────────────────
// Returns indices of nodes within `depth` edges from `start_node`

struct NeighbourResult {
    uint16_t* node_indices;
    uint16_t count;
};

inline NeighbourResult graph_neighbours(Arena* a, const Graph* g, uint16_t start, uint16_t max_depth) {
    uint16_t cap = g->node_count;
    uint16_t* visited = (uint16_t*)arena_alloc(a, sizeof(uint16_t) * cap, 2);
    uint8_t* seen = (uint8_t*)arena_alloc(a, cap, 1);
    memset(seen, 0, cap);

    // BFS using the arena for queue
    uint16_t* queue = (uint16_t*)arena_alloc(a, sizeof(uint16_t) * cap, 2);
    uint16_t* depths = (uint16_t*)arena_alloc(a, sizeof(uint16_t) * cap, 2);
    uint16_t qhead = 0, qtail = 0;
    uint16_t vcount = 0;

    queue[qtail] = start; depths[qtail] = 0; qtail++;
    seen[start] = 1;

    while (qhead < qtail) {
        uint16_t cur = queue[qhead];
        uint16_t d = depths[qhead];
        qhead++;
        visited[vcount++] = cur;
        if (d >= max_depth) continue;
        for (uint16_t e = 0; e < g->edge_count; e++) {
            uint16_t next = UINT16_MAX;
            if (g->edges[e].from == cur) next = g->edges[e].to;
            else if (g->edges[e].to == cur) next = g->edges[e].from;
            if (next != UINT16_MAX && !seen[next]) {
                seen[next] = 1;
                queue[qtail] = next; depths[qtail] = d + 1; qtail++;
            }
        }
    }

    NeighbourResult nr; nr.node_indices = visited; nr.count = vcount;
    return nr;
}

// ── Cross-table join search ──────────────────────────────────────────────────
// Given a value in table A, find matching cells in table B (equi-join on value)

struct JoinHit {
    uint32_t row_a, row_b;
    uint16_t col_a, col_b;
};

struct JoinResult {
    JoinHit* hits;
    uint32_t count;
    uint32_t capacity;
};

inline JoinResult search_join(Arena* a, const Table* ta, uint16_t col_a,
                              const Table* tb, uint16_t col_b, uint32_t max_hits = 256) {
    JoinResult jr;
    jr.hits = (JoinHit*)arena_alloc(a, sizeof(JoinHit) * max_hits, 4);
    jr.count = 0; jr.capacity = max_hits;

    for (uint32_t ra = 0; ra < ta->row_count && jr.count < jr.capacity; ra++) {
        Str va = table_get_cell(ta, ra, col_a);
        if (va.len == 0) continue;
        for (uint32_t rb = 0; rb < tb->row_count && jr.count < jr.capacity; rb++) {
            Str vb = table_get_cell(tb, rb, col_b);
            if (str_eq(va, vb)) {
                jr.hits[jr.count++] = {ra, rb, col_a, col_b};
            }
        }
    }
    return jr;
}
