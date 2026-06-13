#pragma once
#include "src/core/arena.h"
#include "src/core/str.h"
#include "src/core/model/table.h"
#include "src/core/model/graph.h"
#include "src/core/parser/csv.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>

// ── File read/write primitives ───────────────────────────────────────────────

// Read entire file into arena. Returns {nullptr, 0} on failure.
inline Str file_read(Arena* a, const char* path) {
    FILE* f = fopen(path, "rb");
    if (!f) return str_empty();
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    if (size <= 0) { fclose(f); return str_empty(); }
    fseek(f, 0, SEEK_SET);
    char* buf = (char*)arena_alloc(a, (size_t)size + 1, 1);
    if (!buf) { fclose(f); return str_empty(); }
    size_t read = fread(buf, 1, (size_t)size, f);
    fclose(f);
    buf[read] = '\0';
    return {buf, (uint32_t)read};
}

// Write buffer to file. Returns true on success.
inline bool file_write(const char* path, const char* data, uint32_t len) {
    FILE* f = fopen(path, "wb");
    if (!f) return false;
    size_t written = fwrite(data, 1, len, f);
    fclose(f);
    return written == len;
}

// ── CSV file load/save ───────────────────────────────────────────────────────

inline Table* file_load_csv(Arena* a, const char* path) {
    Str content = file_read(a, path);
    if (content.len == 0) return nullptr;
    // Extract filename for table name
    const char* name = path;
    const char* p = path;
    while (*p) { if (*p == '/' || *p == '\\') name = p + 1; p++; }
    return csv_parse(a, arena_str_cstr(a, name), content.data, content.len);
}

inline bool file_save_csv(Arena* a, const Table* table, const char* path) {
    Str csv = csv_serialize(a, table);
    if (csv.len == 0) return false;
    return file_write(path, csv.data, csv.len);
}

// ── Graph JSON format ────────────────────────────────────────────────────────
// Simple JSON: {"nodes":[{"id":"X","label":"Y"},...], "edges":[{"from":"A","to":"B","label":"L"},...]}
// Minimal parser — no external JSON library.

// Parse a quoted JSON string value starting at pos (after opening quote).
// Returns the string content and advances pos past the closing quote.
static inline Str json_parse_string(Arena* a, const char* text, uint32_t len, uint32_t* pos) {
    uint32_t start = *pos;
    while (*pos < len && text[*pos] != '"') {
        if (text[*pos] == '\\') (*pos)++; // skip escaped char
        (*pos)++;
    }
    Str s = arena_str(a, text + start, *pos - start);
    if (*pos < len) (*pos)++; // skip closing quote
    return s;
}

static inline void json_skip_ws(const char* text, uint32_t len, uint32_t* pos) {
    while (*pos < len && (text[*pos] == ' ' || text[*pos] == '\n' || text[*pos] == '\r' || text[*pos] == '\t'))
        (*pos)++;
}

inline Graph* file_load_graph(Arena* a, const char* path) {
    Str content = file_read(a, path);
    if (content.len == 0) return nullptr;

    Graph* g = arena_new<Graph>(a);
    g->init(a, path, 64, 128);

    const char* t = content.data;
    uint32_t len = content.len;
    uint32_t pos = 0;

    // Find "nodes" array
    const char* nodes_key = "\"nodes\"";
    const char* found = strstr(t, nodes_key);
    if (!found) return g;
    pos = (uint32_t)(found - t) + (uint32_t)strlen(nodes_key);
    json_skip_ws(t, len, &pos);
    if (pos < len && t[pos] == ':') pos++;
    json_skip_ws(t, len, &pos);
    if (pos < len && t[pos] == '[') pos++;

    // Parse nodes
    while (pos < len && t[pos] != ']') {
        json_skip_ws(t, len, &pos);
        if (t[pos] == '{') {
            pos++;
            Str id = str_empty(), label = str_empty();
            while (pos < len && t[pos] != '}') {
                json_skip_ws(t, len, &pos);
                if (t[pos] == '"') {
                    pos++;
                    Str key = json_parse_string(a, t, len, &pos);
                    json_skip_ws(t, len, &pos);
                    if (pos < len && t[pos] == ':') pos++;
                    json_skip_ws(t, len, &pos);
                    if (pos < len && t[pos] == '"') {
                        pos++;
                        Str val = json_parse_string(a, t, len, &pos);
                        if (str_eq_cstr(key, "id")) id = val;
                        else if (str_eq_cstr(key, "label")) label = val;
                    }
                }
                json_skip_ws(t, len, &pos);
                if (pos < len && t[pos] == ',') pos++;
            }
            if (pos < len) pos++; // skip }
            if (id.len > 0) g->add_node(id.data, label.len > 0 ? label.data : id.data);
        }
        json_skip_ws(t, len, &pos);
        if (pos < len && t[pos] == ',') pos++;
    }

    // Find "edges" array
    const char* edges_key = "\"edges\"";
    found = strstr(t, edges_key);
    if (!found) return g;
    pos = (uint32_t)(found - t) + (uint32_t)strlen(edges_key);
    json_skip_ws(t, len, &pos);
    if (pos < len && t[pos] == ':') pos++;
    json_skip_ws(t, len, &pos);
    if (pos < len && t[pos] == '[') pos++;

    // Parse edges
    while (pos < len && t[pos] != ']') {
        json_skip_ws(t, len, &pos);
        if (t[pos] == '{') {
            pos++;
            Str from_id = str_empty(), to_id = str_empty(), elabel = str_empty();
            while (pos < len && t[pos] != '}') {
                json_skip_ws(t, len, &pos);
                if (t[pos] == '"') {
                    pos++;
                    Str key = json_parse_string(a, t, len, &pos);
                    json_skip_ws(t, len, &pos);
                    if (pos < len && t[pos] == ':') pos++;
                    json_skip_ws(t, len, &pos);
                    if (pos < len && t[pos] == '"') {
                        pos++;
                        Str val = json_parse_string(a, t, len, &pos);
                        if (str_eq_cstr(key, "from")) from_id = val;
                        else if (str_eq_cstr(key, "to")) to_id = val;
                        else if (str_eq_cstr(key, "label")) elabel = val;
                    }
                }
                json_skip_ws(t, len, &pos);
                if (pos < len && t[pos] == ',') pos++;
            }
            if (pos < len) pos++; // skip }
            int fi = g->find_node(from_id.data);
            int ti = g->find_node(to_id.data);
            if (fi >= 0 && ti >= 0)
                g->add_edge((uint16_t)fi, (uint16_t)ti, elabel.len > 0 ? elabel.data : nullptr);
        }
        json_skip_ws(t, len, &pos);
        if (pos < len && t[pos] == ',') pos++;
    }

    return g;
}

inline bool file_save_graph(Arena* a, const Graph* g, const char* path) {
    // Estimate size: ~100 bytes per node + ~80 per edge + overhead
    size_t est = 64 + g->node_count * 100 + g->edge_count * 80;
    char* buf = (char*)arena_alloc(a, est, 1);
    if (!buf) return false;

    int off = 0;
    off += snprintf(buf + off, est - off, "{\n  \"nodes\": [\n");
    for (uint16_t i = 0; i < g->node_count; i++) {
        off += snprintf(buf + off, est - off, "    {\"id\": \"%s\", \"label\": \"%s\"}%s\n",
            g->nodes[i].id, g->nodes[i].label, i + 1 < g->node_count ? "," : "");
    }
    off += snprintf(buf + off, est - off, "  ],\n  \"edges\": [\n");
    for (uint16_t i = 0; i < g->edge_count; i++) {
        const char* lbl = g->edges[i].label ? g->edges[i].label : "";
        off += snprintf(buf + off, est - off, "    {\"from\": \"%s\", \"to\": \"%s\", \"label\": \"%s\"}%s\n",
            g->nodes[g->edges[i].from].id, g->nodes[g->edges[i].to].id, lbl,
            i + 1 < g->edge_count ? "," : "");
    }
    off += snprintf(buf + off, est - off, "  ]\n}\n");
    return file_write(path, buf, (uint32_t)off);
}

// ── Dirty tracking ───────────────────────────────────────────────────────────

struct DirtyState {
    bool table_dirty;
    bool graph_dirty;
    uint32_t last_save_history_pos; // EditHistory past_count at last save

    void mark_clean(uint32_t history_pos) { table_dirty = false; last_save_history_pos = history_pos; }
    void mark_table_dirty() { table_dirty = true; }
    void mark_graph_dirty() { graph_dirty = true; }
    bool is_dirty() const { return table_dirty || graph_dirty; }
};

// ── Session persistence ──────────────────────────────────────────────────────
// Saves last-opened file paths to a session file (one path per line).

inline bool session_save(const char* session_path, const char** paths, uint16_t count) {
    FILE* f = fopen(session_path, "w");
    if (!f) return false;
    for (uint16_t i = 0; i < count; i++)
        fprintf(f, "%s\n", paths[i]);
    fclose(f);
    return true;
}

struct SessionData {
    const char** paths;
    uint16_t count;
};

inline SessionData session_load(Arena* a, const char* session_path) {
    SessionData s = {nullptr, 0};
    Str content = file_read(a, session_path);
    if (content.len == 0) return s;

    // Count lines
    uint16_t lines = 0;
    for (uint32_t i = 0; i < content.len; i++)
        if (content.data[i] == '\n') lines++;

    s.paths = (const char**)arena_alloc(a, sizeof(const char*) * lines, 8);
    s.count = 0;

    const char* start = content.data;
    for (uint32_t i = 0; i <= content.len; i++) {
        if (i == content.len || content.data[i] == '\n') {
            uint32_t line_len = (uint32_t)(&content.data[i] - start);
            if (line_len > 0) {
                Str path = arena_str(a, start, line_len);
                s.paths[s.count++] = path.data;
            }
            start = &content.data[i + 1];
        }
    }
    return s;
}
