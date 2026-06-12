#pragma once
#include "src/core/model/table.h"
#include "src/core/arena.h"

// Parse CSV text into a Table. Format:
//   Row 0: column names
//   Row 1: column type IDs
//   Row 2+: data rows
// Handles: quoted fields, embedded commas, embedded newlines, escaped quotes ("").
// Normalizes \r\n → \n in cell values.
// Returns nullptr on parse error.
Table* csv_parse(Arena* a, Str name, const char* text, uint32_t text_len);

// Serialize a Table back to CSV text (arena-allocated).
Str csv_serialize(Arena* a, const Table* t);
