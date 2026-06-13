#pragma once
#include "src/core/arena.h"
#include "src/core/str.h"
#include "src/core/model/table.h"
#include "src/core/file_io.h"
#include <cstring>
#include <cstdio>

// ── control.json parser ──────────────────────────────────────────────────────
// Format: {"entries": [{"type":"table","id":"...","file":"..."}, ...]}

struct ControlEntry {
    const char* type;  // "table"
    const char* id;
    const char* file;
};

struct ControlFile {
    ControlEntry* entries;
    uint16_t count;
    uint16_t capacity;
};

inline ControlFile control_parse(Arena* a, const char* json, uint32_t len) {
    ControlFile cf;
    cf.entries = (ControlEntry*)arena_alloc(a, sizeof(ControlEntry) * 64, 8);
    cf.count = 0; cf.capacity = 64;

    // Find "entries" array
    const char* p = strstr(json, "\"entries\"");
    if (!p) return cf;
    p = strchr(p, '[');
    if (!p) return cf;
    p++;
    const char* end = json + len;

    while (p < end && *p != ']' && cf.count < cf.capacity) {
        // Find next '{'
        while (p < end && *p != '{') p++;
        if (p >= end) break;
        p++; // skip '{'

        const char* type = nullptr;
        const char* id = nullptr;
        const char* file = nullptr;

        // Parse key-value pairs until '}'
        while (p < end && *p != '}') {
            // Find opening quote of key
            while (p < end && *p != '"' && *p != '}') p++;
            if (p >= end || *p == '}') break;
            p++; // skip opening quote
            const char* key_start = p;
            while (p < end && *p != '"') p++;
            uint32_t klen = (uint32_t)(p - key_start);
            if (p >= end) break;
            p++; // skip closing quote

            // Skip colon
            while (p < end && *p != ':') p++;
            if (p >= end) break;
            p++; // skip ':'

            // Find opening quote of value
            while (p < end && *p != '"') p++;
            if (p >= end) break;
            p++; // skip opening quote
            const char* val_start = p;
            while (p < end && *p != '"') p++;
            uint32_t vlen = (uint32_t)(p - val_start);
            if (p >= end) break;
            p++; // skip closing quote

            Str val = arena_str(a, val_start, vlen);
            if (klen == 4 && memcmp(key_start, "type", 4) == 0) type = val.data;
            else if (klen == 2 && memcmp(key_start, "id", 2) == 0) id = val.data;
            else if (klen == 4 && memcmp(key_start, "file", 4) == 0) file = val.data;
            else if (klen == 4 && memcmp(key_start, "view", 4) == 0) type = val.data;
        }
        if (p < end && *p == '}') p++;

        if (type && id && file) {
            cf.entries[cf.count++] = {type, id, file};
        }
    }

    return cf;
}

// ── Folder loader ────────────────────────────────────────────────────────────
// Given a directory path, load control.json and all referenced CSV files.

struct LoadedFolder {
    const char* name;       // folder name (last path component)
    Table** tables;
    const char** table_ids;
    const char** table_paths; // full file paths for saving
    uint16_t table_count;
};

inline LoadedFolder folder_load(Arena* a, const char* dir_path) {
    LoadedFolder result = {};

    // Extract folder name from path
    const char* name = dir_path;
    const char* p = dir_path;
    while (*p) { if (*p == '/' || *p == '\\') name = p + 1; p++; }
    result.name = arena_str_cstr(a, name).data;

    // Try to load control.json
    char ctrl_path[512];
    snprintf(ctrl_path, 512, "%s/control.json", dir_path);
    Str ctrl_content = file_read(a, ctrl_path);

    if (ctrl_content.len > 0) {
        // Parse control.json
        ControlFile cf = control_parse(a, ctrl_content.data, ctrl_content.len);
        result.tables = (Table**)arena_alloc(a, sizeof(Table*) * cf.count, 8);
        result.table_ids = (const char**)arena_alloc(a, sizeof(const char*) * cf.count, 8);
        result.table_paths = (const char**)arena_alloc(a, sizeof(const char*) * cf.count, 8);
        result.table_count = 0;

        for (uint16_t i = 0; i < cf.count; i++) {
            if (strcmp(cf.entries[i].type, "table") != 0) continue;
            // Build full path in arena (persists)
            uint32_t plen = (uint32_t)(strlen(dir_path) + 1 + strlen(cf.entries[i].file));
            char* file_path = (char*)arena_alloc(a, plen + 1, 1);
            snprintf(file_path, plen + 1, "%s/%s", dir_path, cf.entries[i].file);
            Table* t = file_load_csv(a, file_path);
            if (t) {
                result.tables[result.table_count] = t;
                result.table_ids[result.table_count] = cf.entries[i].id;
                result.table_paths[result.table_count] = file_path;
                result.table_count++;
            }
        }
    }

    return result;
}
