#include "src/core/parser/csv.h"
#include <cstring>

// Internal: parse one field starting at pos, advance pos past it.
// Returns the field content as a Str (arena-allocated, \r\n normalized).
static Str parse_field(Arena* a, const char* text, uint32_t text_len, uint32_t* pos) {
    uint32_t p = *pos;

    if (p < text_len && text[p] == '"') {
        // Quoted field
        p++; // skip opening quote
        // First pass: compute length (handle escaped quotes "")
        uint32_t start = p;
        uint32_t content_len = 0;
        uint32_t scan = p;
        while (scan < text_len) {
            if (text[scan] == '"') {
                if (scan + 1 < text_len && text[scan + 1] == '"') {
                    content_len++;
                    scan += 2;
                } else {
                    break; // closing quote
                }
            } else if (text[scan] == '\r' && scan + 1 < text_len && text[scan + 1] == '\n') {
                content_len++; // \r\n → \n
                scan += 2;
            } else {
                content_len++;
                scan++;
            }
        }

        // Second pass: copy content
        char* buf = (char*)arena_alloc(a, content_len + 1, 1);
        if (!buf) { *pos = text_len; return str_empty(); }
        uint32_t out = 0;
        p = start;
        while (p < text_len) {
            if (text[p] == '"') {
                if (p + 1 < text_len && text[p + 1] == '"') {
                    buf[out++] = '"';
                    p += 2;
                } else {
                    p++; // closing quote
                    break;
                }
            } else if (text[p] == '\r' && p + 1 < text_len && text[p + 1] == '\n') {
                buf[out++] = '\n';
                p += 2;
            } else {
                buf[out++] = text[p++];
            }
        }
        buf[out] = '\0';
        *pos = p;
        return {buf, content_len};
    } else {
        // Unquoted field: read until comma or newline
        uint32_t start = p;
        while (p < text_len && text[p] != ',' && text[p] != '\n' && text[p] != '\r') {
            p++;
        }
        uint32_t len = p - start;
        *pos = p;
        return arena_str(a, text + start, len);
    }
}

// Count fields in first row to determine column count
static uint16_t count_columns(const char* text, uint32_t text_len) {
    uint16_t count = 1;
    uint32_t p = 0;
    bool in_quote = false;
    while (p < text_len && (text[p] != '\n' || in_quote)) {
        if (text[p] == '"') in_quote = !in_quote;
        if (text[p] == ',' && !in_quote) count++;
        if (text[p] == '\r' && !in_quote) break;
        p++;
    }
    return count;
}

// Count data rows (lines after header and type rows)
static uint32_t count_rows(const char* text, uint32_t text_len) {
    uint32_t count = 0;
    uint32_t p = 0;
    bool in_quote = false;
    int line = 0;
    while (p < text_len) {
        if (text[p] == '"') in_quote = !in_quote;
        if (!in_quote && (text[p] == '\n')) {
            line++;
            if (line >= 2) count++; // lines after header+types are data
        }
        p++;
    }
    // Last line without trailing newline
    if (line >= 2 || (line == 1 && p > 0)) {
        // Check if there's content after last newline
        // Find position of last newline
    }
    // Simpler: count total lines, subtract 2 (header + types)
    uint32_t total_lines = 1;
    p = 0; in_quote = false;
    while (p < text_len) {
        if (text[p] == '"') in_quote = !in_quote;
        if (!in_quote && text[p] == '\n') total_lines++;
        p++;
    }
    // Trailing newline doesn't add a row
    if (text_len > 0 && text[text_len - 1] == '\n') total_lines--;
    return total_lines > 2 ? total_lines - 2 : 0;
}

Table* csv_parse(Arena* a, Str name, const char* text, uint32_t text_len) {
    // Strip trailing \r\n
    while (text_len > 0 && (text[text_len - 1] == '\n' || text[text_len - 1] == '\r'))
        text_len--;

    if (text_len == 0) return nullptr;

    uint16_t col_count = count_columns(text, text_len);
    uint32_t data_row_count = count_rows(text, text_len);

    // Parse header row
    Column* cols = arena_array<Column>(a, col_count);
    uint32_t pos = 0;
    for (uint16_t c = 0; c < col_count; c++) {
        cols[c].name = parse_field(a, text, text_len, &pos);
        if (pos < text_len && text[pos] == ',') pos++;
    }
    // Skip newline
    if (pos < text_len && text[pos] == '\r') pos++;
    if (pos < text_len && text[pos] == '\n') pos++;

    // Parse type row
    for (uint16_t c = 0; c < col_count; c++) {
        cols[c].type_id = parse_field(a, text, text_len, &pos);
        if (pos < text_len && text[pos] == ',') pos++;
    }
    if (pos < text_len && text[pos] == '\r') pos++;
    if (pos < text_len && text[pos] == '\n') pos++;

    // Create table
    Table* t = table_create(a, name, cols, col_count, data_row_count + 64);

    // Parse data rows
    while (pos < text_len) {
        uint32_t row_idx = table_append_row(a, t);
        for (uint16_t c = 0; c < col_count; c++) {
            Str val = parse_field(a, text, text_len, &pos);
            t->rows[row_idx].cells[c].value = val;
            if (pos < text_len && text[pos] == ',') pos++;
        }
        if (pos < text_len && text[pos] == '\r') pos++;
        if (pos < text_len && text[pos] == '\n') pos++;
    }

    return t;
}

Str csv_serialize(Arena* a, const Table* t) {
    // Compute needed size (upper bound)
    uint32_t size = 0;
    for (uint16_t c = 0; c < t->col_count; c++) size += t->columns[c].name.len + 3;
    for (uint16_t c = 0; c < t->col_count; c++) size += t->columns[c].type_id.len + 3;
    for (uint32_t r = 0; r < t->row_count; r++)
        for (uint16_t c = 0; c < t->col_count; c++)
            size += t->rows[r].cells[c].value.len + 3;
    size += t->row_count * 2 + 64;

    char* buf = (char*)arena_alloc(a, size, 1);
    if (!buf) return str_empty();
    uint32_t out = 0;

    auto write_field = [&](Str s) {
        bool need_quote = false;
        for (uint32_t i = 0; i < s.len; i++) {
            if (s.data[i] == ',' || s.data[i] == '"' || s.data[i] == '\n') {
                need_quote = true; break;
            }
        }
        if (need_quote) {
            buf[out++] = '"';
            for (uint32_t i = 0; i < s.len; i++) {
                if (s.data[i] == '"') buf[out++] = '"';
                buf[out++] = s.data[i];
            }
            buf[out++] = '"';
        } else {
            memcpy(buf + out, s.data, s.len);
            out += s.len;
        }
    };

    // Header
    for (uint16_t c = 0; c < t->col_count; c++) {
        if (c > 0) buf[out++] = ',';
        write_field(t->columns[c].name);
    }
    buf[out++] = '\n';

    // Types
    for (uint16_t c = 0; c < t->col_count; c++) {
        if (c > 0) buf[out++] = ',';
        write_field(t->columns[c].type_id);
    }
    buf[out++] = '\n';

    // Data
    for (uint32_t r = 0; r < t->row_count; r++) {
        for (uint16_t c = 0; c < t->col_count; c++) {
            if (c > 0) buf[out++] = ',';
            write_field(t->rows[r].cells[c].value);
        }
        if (r + 1 < t->row_count) buf[out++] = '\n';
    }

    buf[out] = '\0';
    return {buf, out};
}
