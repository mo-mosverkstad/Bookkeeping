#pragma once
#include "src/core/str.h"
#include <cstdint>

// Math AST node types — tagged union.
// Matches the Webapp's MathNode types.

enum MathNodeType : uint8_t {
    MATH_NUMBER = 0,
    MATH_IDENTIFIER,
    MATH_BINARY,
    MATH_UNARY,
    MATH_CALL,
    MATH_SUBSCRIPT,
    MATH_SUPERSCRIPT,
    MATH_FRACTION,
    MATH_SQRT,
    MATH_MATRIX,
    MATH_SET,
    MATH_TEXT,
    MATH_ELLIPSIS,
    MATH_PAREN,
};

struct MathNode;

struct MathBinary { const char* op; MathNode* left; MathNode* right; };
struct MathUnary { const char* op; MathNode* operand; };
struct MathCall { MathNode* callee; MathNode** args; uint16_t arg_count; };
struct MathSubscript { MathNode* base; MathNode* sub; };
struct MathSuperscript { MathNode* base; MathNode* sup; };
struct MathFraction { MathNode* num; MathNode* den; };
struct MathSqrt { MathNode* body; };
struct MathMatrix { MathNode** cells; uint16_t rows; uint16_t cols; };
struct MathSet { MathNode** elements; uint16_t count; };

struct MathNode {
    MathNodeType type;
    union {
        float number;                   // MATH_NUMBER
        struct { const char* name; uint8_t style; } ident; // MATH_IDENTIFIER (style: 0=plain,1=italic,2=bold,3=greek)
        MathBinary binary;              // MATH_BINARY
        MathUnary unary;                // MATH_UNARY
        MathCall call;                  // MATH_CALL
        MathSubscript subscript;        // MATH_SUBSCRIPT
        MathSuperscript superscript;    // MATH_SUPERSCRIPT
        MathFraction fraction;          // MATH_FRACTION
        MathSqrt sqrt;                  // MATH_SQRT
        MathMatrix matrix;              // MATH_MATRIX
        MathSet set;                    // MATH_SET
        const char* text;               // MATH_TEXT
        MathNode* paren_expr;           // MATH_PAREN
    };
};
