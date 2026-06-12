#pragma once
#include <cstdint>

// Fixed-point math utilities.
// Layout is parameterized — caller specifies fractional bits.
// Choose layout based on value range and precision needs.

// Pixel coordinates: int32_t 20.12
//   Range: ±524288 px (covers any screen), precision: 1/4096 px
//   Reason: sub-pixel precision for anti-aliased rendering
constexpr int COORD_FRAC = 12;
typedef int32_t Coord;

#define COORD_FROM_INT(x) ((Coord)(x) << COORD_FRAC)
#define COORD_FROM_FLOAT(x) ((Coord)((x) * (1 << COORD_FRAC)))
#define COORD_TO_INT(x) ((x) >> COORD_FRAC)
#define COORD_TO_FLOAT(x) ((float)(x) / (1 << COORD_FRAC))
#define COORD_MUL(a, b) ((Coord)(((int64_t)(a) * (b)) >> COORD_FRAC))
#define COORD_DIV(a, b) ((Coord)(((int64_t)(a) << COORD_FRAC) / (b)))

// Size values (always non-negative): uint16_t 12.4
//   Range: 0–4095 px, precision: 1/16 px
//   Reason: UI elements rarely exceed 4096px; 1/16 sub-pixel is fine
// NOTE: For simplicity in Phase 1, we use float for sizes and positions
// and introduce fixed-point selectively where benchmarks show benefit.

// Phase 1 uses float for coordinates/sizes for simplicity.
// Fixed-point will be introduced in performance-critical paths as needed.
