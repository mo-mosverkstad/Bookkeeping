# Testing

This document records testing activities, results, and bug reports.

---

## Testing philosophy

1. **Comprehensive coverage** — Test all corners: happy path, edge cases,
   boundary conditions, empty inputs, overflow, invalid data.

2. **Self-evaluating** — Every test programmatically verifies correctness.
   No manual visual inspection for pass/fail determination.

3. **Graphics validation** — For rendering tests:
   - Render to a software backend (in-memory pixel buffer)
   - Capture the framebuffer
   - Compare against expected pixel values at specific coordinates
   - Tolerance threshold for alpha blending differences

4. **Regression tests** — Every fixed bug gets a test that reproduces the
   original failure and verifies the fix.

5. **Benchmarks** — Performance-critical code has benchmarks that:
   - Measure wall-clock time (median of N runs)
   - Compare multiple algorithm variants where applicable
   - Track against baseline to detect regressions
   - Report: operation, input size, time (ns/μs/ms), throughput

---

## Test harness

Custom lightweight test framework in `test/test.h`:
- `TEST(name)` — auto-registered test function
- `ASSERT_EQ(a, b)` — equality check with file/line reporting
- `ASSERT_TRUE(x)` — boolean check
- `ASSERT_NEAR(a, b, tol)` — floating point approximate equality
- `ASSERT_PIXEL(backend, x, y, color)` — pixel-level framebuffer validation
- `BENCH(name, iters) { ... } BENCH_END(name, iters)` — timing block

---

## Phase 1 — Graphics library tests (45 tests)

### Arena allocator (8 tests)
| Test | Description | Result |
|---|---|---|
| arena_create_and_alloc | Basic create + alloc + write | PASS |
| arena_reset | Reset offset to 0 | PASS |
| arena_oom_returns_null | Allocation beyond capacity | PASS |
| arena_typed_new | Template arena_new<T> | PASS |
| arena_multiple_allocs_no_overlap | Sequential allocs don't overlap | PASS |
| arena_alignment | 16-byte alignment respected | PASS |
| arena_array_zeroed | arena_array zero-initializes | PASS |
| arena_fill_to_capacity | Fill exact capacity, then OOM | PASS |

### Layout engine (12 tests)
| Test | Description | Result |
|---|---|---|
| layout_linear_h_positions | Horizontal child positioning | PASS |
| layout_linear_h_auto_height | Auto height = tallest child | PASS |
| layout_linear_h_with_padding | Padding offsets children | PASS |
| layout_linear_v_positions | Vertical stacking with gap | PASS |
| layout_linear_v_auto_width | Auto width = widest child | PASS |
| layout_linear_v_with_padding | Padding on vertical layout | PASS |
| layout_grid_2x2 | 2×2 grid positions | PASS |
| layout_grid_3x1_single_row | 3 columns, 1 row | PASS |
| layout_grid_custom_col_widths | Explicit column widths | PASS |
| layout_coordinate_children_at_set_positions | Absolute positioning | PASS |
| layout_no_children | Empty layout node | PASS |
| layout_nested | LinearH inside LinearV | PASS |

### Software backend rendering (15 tests)
| Test | Description | Result |
|---|---|---|
| sw_clear_to_transparent | Frame clear to (0,0,0,0) | PASS |
| sw_rect_fill_inside | Pixels inside rect are colored | PASS |
| sw_rect_fill_outside | Pixels outside rect are transparent | PASS |
| sw_rect_at_origin | Rect at (0,0) fills corners | PASS |
| sw_rect_with_offset | Absolute offset applied | PASS |
| sw_rect_clipped_at_boundary | Out-of-bounds pixels safe | PASS |
| sw_multiple_rects_no_overlap | Two rects in different positions | PASS |
| sw_line_horizontal | Horizontal line pixels | PASS |
| sw_line_vertical | Vertical line pixels | PASS |
| sw_line_diagonal | Bresenham diagonal | PASS |
| sw_ellipse_center | Ellipse center filled | PASS |
| sw_ellipse_edge | Ellipse boundary correctness | PASS |
| sw_polyline | Multi-segment open path | PASS |
| sw_polygon_edges | Closed polygon edges | PASS |
| sw_alpha_blending | Semi-transparent overlay compositing | PASS |

### Render tree integration (4 tests)
| Test | Description | Result |
|---|---|---|
| render_tree_single_element | Single rect dispatched | PASS |
| render_tree_nested_layout | Nested absolute position accumulation | PASS |
| render_tree_linear_v_layout | Layout + render combined | PASS |
| render_tree_multiple_elements_per_node | Multiple elements per node | PASS |

### Element creation (3 tests)
| Test | Description | Result |
|---|---|---|
| element_tagged_union_rect | Rect factory + type tag | PASS |
| element_tagged_union_line | Line factory | PASS |
| element_tagged_union_text | Text with bit-packed style flags | PASS |

### Benchmarks
| Benchmark | Iterations | Time/iter |
|---|---|---|
| layout_1000_linear_v | 10,000 | ~7 μs |
| render_100_rects | 1,000 | ~637 μs |
| arena_10000_allocs | 1,000 | <1 ns |

---

## Phase 2 — Table model + CSV parser tests (23 tests)

### String (4 tests)
| Test | Description | Result |
|---|---|---|
| str_empty_is_empty | Empty string has len 0 | PASS |
| str_eq_same | Equal strings match | PASS |
| str_eq_different | Different strings don't match | PASS |
| str_eq_cstr | Compare Str to C string literal | PASS |

### Table model (7 tests)
| Test | Description | Result |
|---|---|---|
| table_create_empty | Create with columns, 0 rows | PASS |
| table_append_and_get | Append row, set cell, get cell | PASS |
| table_get_out_of_bounds | OOB returns empty | PASS |
| table_insert_row | Insert shifts subsequent rows | PASS |
| table_remove_row | Remove shifts rows up | PASS |
| table_move_row_forward | Move row to higher index | PASS |
| table_move_row_backward | Move row to lower index | PASS |

### CSV parser (10 tests)
| Test | Description | Result |
|---|---|---|
| csv_parse_simple | Basic 2-col, 2-row CSV | PASS |
| csv_parse_quoted_fields | Embedded commas + escaped quotes | PASS |
| csv_parse_multiline_field | Newline inside quoted field | PASS |
| csv_parse_crlf | \r\n line endings | PASS |
| csv_parse_crlf_in_quoted | \r\n normalized to \n in quoted | PASS |
| csv_parse_empty_fields | Empty cells preserved | PASS |
| csv_parse_trailing_newline | Trailing \n doesn't add row | PASS |
| csv_parse_single_column | Single-column table | PASS |
| csv_parse_empty_input | Empty string returns nullptr | PASS |
| csv_roundtrip_simple | Parse→serialize matches original | PASS |
| csv_roundtrip_quoted | Quoted field survives round-trip | PASS |

### Benchmarks
| Benchmark | Iterations | Time/iter |
|---|---|---|
| csv_parse_1000_rows (5 cols) | 1,000 | ~67 μs |
