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

## Phase 1 Extension — Scroll, hit testing, text measurement, clipping (22 tests)

### ScrollLayout (5 tests)
| Test | Description | Result |
|---|---|---|
| scroll_layout_content_size | Computes content_height from children | PASS |
| scroll_layout_children_positioned_sequentially | Children at y=0, 40, 80 with gap | PASS |
| scroll_layout_clipping_hides_content | Content below viewport is clipped | PASS |
| scroll_layout_scrolled_offset | Scrolling reveals second child | PASS |
| scroll_layout_empty_content | No children → content_height=0 | PASS |

### Hit testing (7 tests)
| Test | Description | Result |
|---|---|---|
| hit_surface_direct | Hit root node directly | PASS |
| hit_surface_miss | Point outside root returns nullptr | PASS |
| hit_surface_topmost_child | Overlapping children: last wins | PASS |
| hit_surface_non_overlapping | Separate children: correct one hit | PASS |
| hit_surface_in_scroll_with_offset | Scroll offset adjusts hit coordinates | PASS |
| hit_deep_returns_all | Returns root + child (2 nodes) | PASS |
| hit_deep_nested | 3-level nesting returns all 3 | PASS |

### Text measurement (5 tests)
| Test | Description | Result |
|---|---|---|
| text_measure_default_single_line | 5 chars × 0.6 × size | PASS |
| text_measure_multiline | Max line width, N × height | PASS |
| text_measure_empty | Empty string → 0 width, 1×height | PASS |
| text_measure_custom_hook | Custom hook returns fixed value | PASS |
| text_measure_after_hook_reset | Reset restores default mock | PASS |

### Clipping (5 tests)
| Test | Description | Result |
|---|---|---|
| clip_restricts_rendering | Rect only visible inside clip | PASS |
| clip_reset_allows_full_render | Reset restores full buffer | PASS |
| clip_line_clipped | Line only visible inside clip | PASS |
| clip_ellipse_clipped | Ellipse only visible inside clip | PASS |
| clip_multiple_regions | Two sequential clips each work | PASS |

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

---

## Phase 1 Refactoring — UI builder + platform tests (27 tests)

### UI Fluent Builder (15 tests)
| Test | Description | Result |
|---|---|---|
| ui_box_creates_node | Box factory sets dimensions | PASS |
| ui_vstack_type | VStack sets LINEAR + VERTICAL | PASS |
| ui_hstack_type | HStack sets LINEAR + HORIZONTAL | PASS |
| ui_grid_type | Grid sets type + cols | PASS |
| ui_scroll_type | Scroll sets type + dimensions | PASS |
| ui_absolute_type | Absolute sets COORDINATE | PASS |
| ui_child_adds_to_tree | child() appends to children array | PASS |
| ui_children_bulk | children() sets array from items | PASS |
| ui_bg_adds_element | bg() appends RECT element | PASS |
| ui_text_adds_element | text() appends TEXT element | PASS |
| ui_multiple_elements | Multiple element decorations | PASS |
| ui_chaining_modifiers | size/padding/gap/id chain | PASS |
| ui_colorbox_convenience | ColorBox creates box + bg | PASS |
| ui_label_measures_text | Label auto-sizes from text | PASS |
| ui_build_returns_arena_node | build() returns valid pointer | PASS |

### Method-based API (5 tests)
| Test | Description | Result |
|---|---|---|
| method_compute_sets_dimensions | compute() fills dimensions | PASS |
| method_render_draws | render() draws to backend | PASS |
| method_hit_surface_finds_node | hit_surface() finds correct child | PASS |
| method_hit_deep_returns_hierarchy | hit_deep() returns parent+child | PASS |
| method_render_nested | Nested render with offset | PASS |

### Integration (7 tests)
| Test | Description | Result |
|---|---|---|
| ui_scroll_clips_children | Scroll viewport clips | PASS |
| ui_scroll_with_offset | Scroll offset reveals content | PASS |
| ui_virtual_render_cycle | VirtualLayout state→render | PASS |
| ui_virtual_event_updates_state | Event dispatch mutates state | PASS |
| ui_functional_cache_content | FunctionalLayout caches pixels | PASS |
| ui_full_tree_render_and_hit | Full VStack+HStack render+hit | PASS |
| ui_grid_render_and_hit | Grid render + hit test cells | PASS |


---

## Phase 3 — Table view tests (18 tests)

### Table view structure (7 tests)
| Test | Description | Result |
|---|---|---|
| tableview_builds_tree | Returns node with id "table-view" | PASS |
| tableview_header_has_columns | Header has 3 column cells | PASS |
| tableview_scroll_has_rows | Scroll has 3 data rows | PASS |
| tableview_row_has_cells | Each row has 3 cells | PASS |
| tableview_cells_have_content | Cell text = "Alice" | PASS |
| tableview_empty_table | 0-row table renders safely | PASS |
| tableview_single_cell | 1×1 table works | PASS |

### Table view rendering (4 tests)
| Test | Description | Result |
|---|---|---|
| tableview_computes_layout | Scroll viewport matches config | PASS |
| tableview_renders_without_crash | Header bg pixels correct | PASS |
| tableview_scroll_clips_rows | Content below viewport clipped | PASS |
| tableview_many_rows | 100 rows → content_height > viewport | PASS |

### Scroll isolation (5 tests)
| Test | Description | Result |
|---|---|---|
| tableview_two_scrolls_independent | Correct scroll found per position | PASS |
| tableview_scroll_not_hit_when_outside | No scroll hit outside scroll area | PASS |
| tableview_nested_scroll_innermost_hit | Deepest scroll wins in nested case | PASS |
| tableview_scroll_clamp_bounds | scroll_y clamped to valid range | PASS |
| tableview_scroll_hit_with_offset | Hit maps to correct child after scroll | PASS |

### Hit testing (1 test)
| Test | Description | Result |
|---|---|---|
| tableview_hit_test_finds_row | Deep hit finds "row-0" | PASS |

### Benchmarks
| Benchmark | Iterations | Time/iter |
|---|---|---|
| table_view_build+compute 100 rows | 1,000 | (measured) |
