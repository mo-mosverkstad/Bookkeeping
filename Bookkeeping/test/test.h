#pragma once
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <chrono>

static int _tests_run = 0;
static int _tests_passed = 0;
static int _tests_failed = 0;

#define TEST(name) static void test_##name(); \
    static struct _Reg_##name { _Reg_##name() { _test_register(#name, test_##name); } } _reg_##name; \
    static void test_##name()

struct _TestEntry { const char* name; void (*fn)(); };
static _TestEntry _tests[1024];
static int _test_count = 0;

inline void _test_register(const char* name, void (*fn)()) {
    _tests[_test_count++] = {name, fn};
}

#define ASSERT_EQ(a, b) do { \
    auto _a = (a); auto _b = (b); \
    if (_a != _b) { \
        printf("  FAIL %s:%d: %s != %s\n", __FILE__, __LINE__, #a, #b); \
        _tests_failed++; return; \
    } } while(0)

#define ASSERT_TRUE(x) do { if (!(x)) { \
    printf("  FAIL %s:%d: %s\n", __FILE__, __LINE__, #x); \
    _tests_failed++; return; \
    } } while(0)

#define ASSERT_NEAR(a, b, tol) do { \
    auto _a = (a); auto _b = (b); \
    if ((_a - _b) > (tol) || (_b - _a) > (tol)) { \
        printf("  FAIL %s:%d: %s ≈ %s (tol=%f)\n", __FILE__, __LINE__, #a, #b, (double)(tol)); \
        _tests_failed++; return; \
    } } while(0)

#define ASSERT_PIXEL(backend, px, py, expected_color) do { \
    Color _c = (backend).get_pixel(px, py); \
    Color _e = (expected_color); \
    if (_c.r != _e.r || _c.g != _e.g || _c.b != _e.b || _c.a != _e.a) { \
        printf("  FAIL %s:%d: pixel(%d,%d) = (%d,%d,%d,%d), expected (%d,%d,%d,%d)\n", \
            __FILE__, __LINE__, px, py, _c.r, _c.g, _c.b, _c.a, _e.r, _e.g, _e.b, _e.a); \
        _tests_failed++; return; \
    } } while(0)

inline int run_all_tests() {
    printf("Running %d tests...\n", _test_count);
    for (int i = 0; i < _test_count; i++) {
        _tests_run++;
        int prev_failed = _tests_failed;
        _tests[i].fn();
        if (_tests_failed == prev_failed) {
            _tests_passed++;
            printf("  PASS %s\n", _tests[i].name);
        } else {
            printf("  ^^^ in test: %s\n", _tests[i].name);
        }
    }
    printf("\nResults: %d passed, %d failed, %d total\n", _tests_passed, _tests_failed, _tests_run);
    return _tests_failed > 0 ? 1 : 0;
}

// Benchmark utility
#define BENCH(name, iterations) \
    { auto _start = std::chrono::high_resolution_clock::now(); \
      for (int _i = 0; _i < (iterations); _i++)

#define BENCH_END(name, iterations) \
      auto _end = std::chrono::high_resolution_clock::now(); \
      auto _ns = std::chrono::duration_cast<std::chrono::nanoseconds>(_end - _start).count(); \
      printf("  BENCH %s: %lld ns total, %lld ns/iter (%d iters)\n", \
          name, (long long)_ns, (long long)(_ns / (iterations)), iterations); }
