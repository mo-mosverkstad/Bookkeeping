#pragma once
#include "src/core/color.h"
#include <cstdint>

// Text decoration flags — bit-packed into uint8_t
enum TextStyle : uint8_t {
    TEXT_NORMAL        = 0,
    TEXT_BOLD          = 1 << 0,
    TEXT_ITALIC        = 1 << 1,
    TEXT_UNDERLINE     = 1 << 2,
    TEXT_STRIKETHROUGH = 1 << 3,
    TEXT_SUBSCRIPT     = 1 << 4,
    TEXT_SUPERSCRIPT   = 1 << 5,
};

enum TextAlign : uint8_t {
    ALIGN_LEFT   = 0,
    ALIGN_CENTER = 1,
    ALIGN_RIGHT  = 2,
};

struct Text {
    float x, y;
    const char* content;  // may contain '\n' for multiline
    const char* font;
    float size;
    Color color;
    uint8_t style;        // TextStyle flags OR'd
    uint8_t align;        // TextAlign
    float max_width;      // 0 = no wrap
};
