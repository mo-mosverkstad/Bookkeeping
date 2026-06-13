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


---

## Phase 4 — Math parser + renderer tests (50 tests)

### Parser — basic (21 tests)
| Test | Description | Result |
|---|---|---|
| math_parse_number | Integer 42 | PASS |
| math_parse_float | Float 3.14 | PASS |
| math_parse_identifier | Single var x | PASS |
| math_parse_addition | x+y → Binary(+) | PASS |
| math_parse_subtraction | a-b → Binary(-) | PASS |
| math_parse_multiplication | a*b → Binary(*) | PASS |
| math_parse_fraction | a/b → Fraction | PASS |
| math_parse_power | x^2 → Superscript | PASS |
| math_parse_subscript | x_0 → Subscript | PASS |
| math_parse_unary_minus | -x → Unary(-) | PASS |
| math_parse_parens | (x+y) → Paren | PASS |
| math_parse_equality | x=5 → Binary(=) | PASS |
| math_parse_inequality | a!=b → Binary(!=) | PASS |
| math_parse_implicit_mult | 2x → Binary(*) | PASS |
| math_parse_comma_sep | a,b,c → nested Binary(,) | PASS |
| math_parse_set | {1,2,3} → Set(3) | PASS |
| math_parse_text_literal | "MTBF" → Text | PASS |
| math_parse_sqrt | \sqrt{x+1} → Sqrt | PASS |
| math_parse_complex_expr | x^2+2x+1=0 → Binary(=) | PASS |
| math_parse_precedence | a+b*c → +(a, *(b,c)) | PASS |
| math_parse_ellipsis | ... → Ellipsis | PASS |

### Parser — complex (15 tests)
| Test | Description | Result |
|---|---|---|
| math_parse_nested_fraction | a/b/c → nested Fraction | PASS |
| math_parse_power_of_power | x^2^3 → nested Superscript | PASS |
| math_parse_subscript_superscript | x_0^2 → Sup(Sub(x,0),2) | PASS |
| math_parse_quadratic_formula | (-b+√{b²-4ac})/(2a) | PASS |
| math_parse_nested_parens | ((a+b)*(c+d)) | PASS |
| math_parse_multivar_equation | 2x+3y=9, 5x+3y=0 | PASS |
| math_parse_set_with_expressions | {x^2, x+1, 2x-3} | PASS |
| math_parse_text_as_operator | A "cols" "linear independent" | PASS |
| math_parse_comparison_chain | 0<=x<=1 | PASS |
| math_parse_greek_identifier | \alpha+\beta | PASS |
| math_parse_mixed_sub_sup_frac | x_i^2+y_j^2=r^2 | PASS |
| math_parse_implicit_mult_parens | (x+1)(x-1) | PASS |
| math_parse_deeply_nested | \sqrt{a^2+b^2+c^2} | PASS |
| math_parse_unary_in_expression | a+-b | PASS |
| math_parse_empty_set | {} → Set(0) | PASS |

### Renderer (13 tests)
| Test | Description | Result |
|---|---|---|
| math_render_number | 42 → leaf with TEXT elem | PASS |
| math_render_addition | x+y → HStack(3 children) | PASS |
| math_render_fraction | a/b → VStack(3: num,bar,den) | PASS |
| math_render_superscript | x^2 → HStack(base, sup) | PASS |
| math_render_sqrt | \sqrt{9} → HStack(√, body) | PASS |
| math_render_set | {a,b} → HStack(5: {,a,,,b,}) | PASS |
| math_render_complex | x^2+2x+1=0 computes width>0 | PASS |
| math_render_to_pixels | x+1 renders without crash | PASS |
| math_render_quadratic | Full equation has width>50 | PASS |
| math_render_fraction_nested | (a+b)/(c+d) stacks tall | PASS |
| math_render_subscript_superscript | x_0^2 renders | PASS |
| math_render_system_of_equations | Wide rendering | PASS |
| math_render_empty_set | {} → 2 children | PASS |

### Benchmarks
| Benchmark | Iterations | Time/iter |
|---|---|---|
| math_parse 100x complex expr | 1,000 | ~35 μs |


---

## Phase 5 — Editor tests (23 tests)

### Edit history (5 tests)
| Test | Description | Result |
|---|---|---|
| history_push_and_undo | Push then undo toggles flags | PASS |
| history_redo | Undo then redo restores | PASS |
| history_push_clears_redo | New push after undo clears future | PASS |
| history_multiple_undo | 3 pushes, 3 undos = empty | PASS |
| history_empty_undo_returns_null | Undo on empty = nullptr | PASS |

### Cell selection (4 tests)
| Test | Description | Result |
|---|---|---|
| selection_single | Select one cell | PASS |
| selection_toggle | Add/remove cells | PASS |
| selection_range | 3×3 range = 9 cells | PASS |
| selection_clear | Clear resets to 0 | PASS |

### Table editor (14 tests)
| Test | Description | Result |
|---|---|---|
| editor_begin_edit_loads_value | Buffer = cell value | PASS |
| editor_commit_changes_cell | Commit updates table | PASS |
| editor_commit_no_change_no_history | Same value = no action | PASS |
| editor_undo_restores_value | Undo reverts cell | PASS |
| editor_redo_reapplies | Redo restores change | PASS |
| editor_insert_char | Append char at cursor | PASS |
| editor_insert_char_mid | Insert in middle | PASS |
| editor_delete_back | Backspace removes prev char | PASS |
| editor_delete_forward | Delete removes next char | PASS |
| editor_cursor_movement | Home/End/Left/Right | PASS |
| editor_clear_selected_cells | Multi-cell clear | PASS |
| editor_move_selection | Move cell value to dest | PASS |
| editor_multiple_edits_undo_all | 3 edits, 3 undos restores all | PASS |
| editor_cancel_edit_no_change | Cancel discards buffer | PASS |


---

## Phase 6 — Renderer tests (34 tests)

### Chemistry (12 tests)
| Test | Description | Result |
|---|---|---|
| chem_simple_formula | H2O renders | PASS |
| chem_reaction | 2H2 + O2 -> 2H2O | PASS |
| chem_ionic | Na+ + Cl- | PASS |
| chem_parenthesized | Ca(OH)2 | PASS |
| chem_complex_reaction | KMnO4 + HCl reaction | PASS |
| chem_render_computes | H2SO4 computes width>0 | PASS |
| chem_single_element | Fe | PASS |
| chem_multi_subscript | C6H12O6 | PASS |
| chem_only_arrow | -> | PASS |
| chem_coefficient_only | 3Fe + 4H2O | PASS |
| chem_empty_string | "" | PASS |
| chem_nested_parentheses | Al2(SO4)3 | PASS |

### Physics (6 tests)
| Test | Description | Result |
|---|---|---|
| physics_basic_equation | F = m*a | PASS |
| physics_kinetic_energy | E = 1/2 m v^2 | PASS |
| physics_ohms_law | V = I*R | PASS |
| physics_einstein | E = m*c^2 | PASS |
| physics_wave_equation | v = f * lambda | PASS |
| physics_coulombs_law | F = k*q1*q2/r^2 | PASS |

### Geometry (4 tests)
| Test | Description | Result |
|---|---|---|
| geometry_pythagorean | a^2 + b^2 = c^2 | PASS |
| geometry_area_circle | A = pi * r^2 | PASS |
| geometry_distance | sqrt((x2-x1)^2 + (y2-y1)^2) | PASS |
| geometry_angle_sum | alpha + beta + gamma = 180 | PASS |

### Rich text (12 tests)
| Test | Description | Result |
|---|---|---|
| rich_plain_text | Single line | PASS |
| rich_multiline_text | 3 lines | PASS |
| rich_math_embed | $math{x^2+y^2=r^2} | PASS |
| rich_chem_embed | $chem{H2O} | PASS |
| rich_multiline_math | Newlines inside $math{} | PASS |
| rich_mixed_embeds | Physics + chemistry on 2 lines | PASS |
| rich_empty | Empty string | PASS |
| rich_renders_to_pixels | No crash on render | PASS |
| rich_text_before_and_after | Text surrounding embed | PASS |
| rich_multiple_embeds_one_line | 3 embeds on 1 line | PASS |
| rich_nested_braces | $math{\sqrt{x+1}} | PASS |
| rich_geom_embed | $geom{a^2+b^2=c^2} | PASS |


---

## Phase 7 — Graph tests (14 tests)

### Graph model (6 tests)
| Test | Description | Result |
|---|---|---|
| graph_create_empty | Init with 0 nodes/edges | PASS |
| graph_add_nodes | Add 2 nodes, verify labels | PASS |
| graph_add_edges | Add edges with labels | PASS |
| graph_find_node | Find by id, miss returns -1 | PASS |
| graph_layout_grid | Grid positions correct | PASS |
| graph_many_nodes | 50 nodes layout | PASS |

### Graph model — edge cases (7 tests)
| Test | Description | Result |
|---|---|---|
| graph_duplicate_node_ids | Find returns first match | PASS |
| graph_self_edge | Self-loop (from==to) | PASS |
| graph_disconnected_nodes | No edges, positions differ | PASS |
| graph_parallel_edges | Multiple edges same pair | PASS |
| graph_layout_single_node | One node positioned | PASS |
| graph_capacity_limit | Overflow capped at capacity | PASS |
| graph_node_default_size | Default w=100, h=30 | PASS |

### Graph view (8 tests)
| Test | Description | Result |
|---|---|---|
| graphview_builds_tree | Returns "graph-view" with children | PASS |
| graphview_nodes_positioned | Children at expected coords | PASS |
| graphview_edge_is_line | Edge element is ELEM_LINE | PASS |
| graphview_computes | Width/height match config | PASS |
| graphview_renders | Pixel at node pos matches fill color | PASS |
| graphview_hit_test_node | Hit finds correct node id | PASS |
| graphview_no_edges_empty | Solo node, 0 edge elements | PASS |
| graphview_complex_graph | 10 nodes, 11 edges | PASS |

### Graph view — edge cases (6 tests)
| Test | Description | Result |
|---|---|---|
| graphview_self_loop_renders | Self-loop renders no crash | PASS |
| graphview_hit_test_miss | Click empty → hits root | PASS |
| graphview_many_edges_no_crash | 90 edges fully connected | PASS |
| graphview_node_labels_are_text_elements | Rect + text verified | PASS |
| graphview_edge_shortening | Line endpoints shortened | PASS |
| graphview_deep_hit_includes_root | Deep hit has root + node | PASS |


---

## Phase 8 — Workspace tests (31 tests)

### Search — substring (5 tests)
| Test | Description | Result |
|---|---|---|
| search_substring_basic | "london" finds 2 hits in City col | PASS |
| search_substring_case_insensitive | "HELLO" matches all case variants | PASS |
| search_substring_no_match | "xyz" returns 0 hits | PASS |
| search_substring_empty_query | Empty query returns 0 hits | PASS |
| search_substring_partial_match | "world" in "hello_world" at offset 6 | PASS |

### Search — identifier-aware (3 tests)
| Test | Description | Result |
|---|---|---|
| search_identifier_basic | "foo" matches only exact word, not foo_bar or foobar | PASS |
| search_identifier_at_boundaries | "x" in "x + y" and "2*x+3" but not "x_var" | PASS |
| search_max_hits_limit | Stops at max_hits=3 despite 10 matches | PASS |

### Graph neighbourhood (4 tests)
| Test | Description | Result |
|---|---|---|
| graph_neighbours_depth_1 | A→B→C→D, depth=1 from A → {A,B} | PASS |
| graph_neighbours_depth_2 | Same graph, depth=2 → {A,B,C} | PASS |
| graph_neighbours_all | depth=10, all 3 connected nodes found | PASS |
| graph_neighbours_disconnected | Isolated B not reached from A | PASS |

### Cross-table join (3 tests)
| Test | Description | Result |
|---|---|---|
| join_basic | Join on Dept column → 2 matches | PASS |
| join_no_match | No common values → 0 hits | PASS |
| join_multiple_matches | Duplicate keys → cartesian product (4 hits) | PASS |

### Navigation tree (4 tests)
| Test | Description | Result |
|---|---|---|
| nav_tree_basic | Add root + children, verify structure | PASS |
| nav_tree_toggle | Toggle expands/collapses | PASS |
| nav_tree_deep_find | Find deeply nested node by id | PASS |
| nav_tree_render | Build produces SCROLL layout with correct dimensions | PASS |

### Tab strip (7 tests)
| Test | Description | Result |
|---|---|---|
| tab_open_activate | Open 2 tabs, last one active | PASS |
| tab_switch | Activate tab 0, verify flags | PASS |
| tab_close_active | Close active → previous becomes active | PASS |
| tab_close_inactive | Close inactive → active index adjusts | PASS |
| tab_reopen_existing | Open same id → reactivates, no duplicate | PASS |
| tab_close_last | Close only tab → active_index=UINT16_MAX | PASS |
| tab_strip_render | Build produces HStack with 2 children | PASS |

### Workspace (4 tests)
| Test | Description | Result |
|---|---|---|
| workspace_mount_unmount | Mount adds view+tab, unmount removes both | PASS |
| workspace_multiple_views | 2 views, switch between them | PASS |
| workspace_invalidate | Clears cached_tree to nullptr | PASS |
| workspace_remount_updates_data | Same id remount updates data pointer | PASS |

### Benchmarks
| Benchmark | Input | Time | Notes |
|---|---|---|---|
| search 10k cells (exact match) | 1000×10 table, "val_500_5" | 242μs/iter | 100 iterations |
| search 10k cells (many matches) | 1000×10 table, "val_5" | 468μs/iter | 100 iterations |

### Bugs found and fixed during Phase 8
| Bug | Cause | Fix |
|---|---|---|
| Segfault after many tab switches | Frame arena exhaustion — UI nodes accumulated in main arena | Separate 256KB frame arena, reset each rebuild |
| Tab close button not responding | Single node for tab; click always activated | Split into label + close child node with id `close:<tabid>` |
| Nav sidebar clicks not working | Tab handler matched nav leaf ids (same strings) | Scoped tab click to `tab-strip` ancestry |
| Nav leaf can't reopen closed view | `unmount()` removed view; `find()` returned -1 | Re-mount view on nav leaf click if missing |
| Ctrl+F / Ctrl+Z not working | Checked ASCII control codes (6, 26); SDL sends keysym + mod | Added `mod` field to InputEvent, check `key == 'f'` with ctrl mod |
| Infinite table scroll | Clamp only applied when `max_s > 0`; content < viewport → no clamp | Always clamp: `if (max_s < 0) max_s = 0` |
