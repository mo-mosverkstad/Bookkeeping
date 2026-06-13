#pragma once
#include "src/core/model/table.h"
#include "src/core/str.h"
#include <cstring>

// ── Column sorting ───────────────────────────────────────────────────────────
// Sort table rows by a given column. Stable insertion sort (good for small N).
// direction: 0 = ascending, 1 = descending

inline void table_sort(Table* t, uint16_t col, uint8_t direction) {
    if (col >= t->col_count || t->row_count < 2) return;
    // Insertion sort (stable, in-place on Row array)
    for (uint32_t i = 1; i < t->row_count; i++) {
        Row tmp = t->rows[i];
        Str val_i = tmp.cells[col].value;
        uint32_t j = i;
        while (j > 0) {
            Str val_j = t->rows[j - 1].cells[col].value;
            int cmp = 0;
            uint32_t min_len = val_i.len < val_j.len ? val_i.len : val_j.len;
            cmp = memcmp(val_i.data, val_j.data, min_len);
            if (cmp == 0) cmp = (int)val_i.len - (int)val_j.len;
            if (direction == 0) { // ascending: move left if val_i < val_j
                if (cmp >= 0) break;
            } else { // descending: move left if val_i > val_j
                if (cmp <= 0) break;
            }
            t->rows[j] = t->rows[j - 1];
            j--;
        }
        t->rows[j] = tmp;
    }
}
