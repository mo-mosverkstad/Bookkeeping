#pragma once
#include <cstdint>

// Color: RGBA packed into 32 bits (8 bits per channel).
// Range per channel: 0–255. Layout: 8.0 per component, no fractional.
struct Color {
    uint8_t r, g, b, a;
};

inline Color color_rgba(uint8_t r, uint8_t g, uint8_t b, uint8_t a = 255) {
    return {r, g, b, a};
}

// Common colors
constexpr Color COLOR_BLACK   = {0, 0, 0, 255};
constexpr Color COLOR_WHITE   = {255, 255, 255, 255};
constexpr Color COLOR_RED     = {255, 0, 0, 255};
constexpr Color COLOR_GREEN   = {0, 255, 0, 255};
constexpr Color COLOR_BLUE    = {0, 0, 255, 255};
constexpr Color COLOR_TRANSPARENT = {0, 0, 0, 0};
