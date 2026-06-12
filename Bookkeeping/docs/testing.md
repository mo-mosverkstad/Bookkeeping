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
   - Compare against reference images (pixel diff) or computed expected
     values (e.g., "pixel at (50,50) must be red")
   - Tolerance threshold for anti-aliasing differences

4. **Regression tests** — Every fixed bug gets a test that reproduces the
   original failure and verifies the fix.

5. **Benchmarks** — Performance-critical code has benchmarks that:
   - Measure wall-clock time (median of N runs)
   - Compare multiple algorithm variants where applicable
   - Track against baseline to detect regressions
   - Report: operation, input size, time (ns/μs/ms), throughput

---

## Test harness

Custom lightweight test framework (no external dependency):

```cpp
#define TEST(name) void test_##name()
#define ASSERT_EQ(a, b) do { if ((a) != (b)) { fail(__FILE__, __LINE__, #a, #b); } } while(0)
#define ASSERT_TRUE(x) do { if (!(x)) { fail(__FILE__, __LINE__, #x, "true"); } } while(0)
#define BENCH(name, iterations) for (int _i = 0; _i < iterations; _i++)
```

---

## Test results

(To be filled as phases are completed)
