#pragma once
#include "src/core/parser/math/math_ast.h"
#include "src/core/arena.h"
#include <cstring>
#include <cstdlib>

// Recursive descent math expression parser.
// Grammar precedence (low → high):
//   Comma, Relational (=,<,>,!=,...), Additive (+,-), Multiplicative (*,/,implicit), Power (^), Unary (-,+), Postfix (_,^,!), Primary

struct MathParser {
    Arena* arena;
    const char* src;
    uint32_t len;
    uint32_t pos;

    MathNode* alloc(MathNodeType t) {
        MathNode* n = arena_new<MathNode>(arena);
        n->type = t;
        return n;
    }

    void skip_ws() { while (pos < len && (src[pos] == ' ' || src[pos] == '\t')) pos++; }
    char peek() { skip_ws(); return pos < len ? src[pos] : 0; }
    bool match(char c) { skip_ws(); if (pos < len && src[pos] == c) { pos++; return true; } return false; }
    bool match_str(const char* s) {
        skip_ws(); uint32_t l = strlen(s);
        if (pos + l <= len && memcmp(src + pos, s, l) == 0) { pos += l; return true; }
        return false;
    }

    // ── Expression (comma-separated) ─────────────────────────────────────────
    MathNode* parse_expression() {
        MathNode* left = parse_relational();
        while (match(',')) {
            MathNode* right = parse_relational();
            MathNode* n = alloc(MATH_BINARY);
            n->binary = {",", left, right};
            left = n;
        }
        return left;
    }

    // ── Relational ───────────────────────────────────────────────────────────
    MathNode* parse_relational() {
        MathNode* left = parse_additive();
        while (true) {
            const char* op = nullptr;
            skip_ws();
            if (match_str("!=")) op = "!=";
            else if (match_str("<=")) op = "<=";
            else if (match_str(">=")) op = ">=";
            else if (match_str("->")) op = "->";
            else if (match('=')) op = "=";
            else if (match('<')) op = "<";
            else if (match('>')) op = ">";
            else break;
            MathNode* right = parse_additive();
            MathNode* n = alloc(MATH_BINARY);
            n->binary = {op, left, right};
            left = n;
        }
        return left;
    }

    // ── Additive ─────────────────────────────────────────────────────────────
    MathNode* parse_additive() {
        MathNode* left = parse_multiplicative();
        while (true) {
            skip_ws();
            if (match('+')) {
                MathNode* n = alloc(MATH_BINARY); n->binary = {"+", left, parse_multiplicative()}; left = n;
            } else if (pos < len && src[pos] == '-' && (pos+1 >= len || src[pos+1] != '>')) {
                pos++;
                MathNode* n = alloc(MATH_BINARY); n->binary = {"-", left, parse_multiplicative()}; left = n;
            } else break;
        }
        return left;
    }

    // ── Multiplicative ───────────────────────────────────────────────────────
    MathNode* parse_multiplicative() {
        MathNode* left = parse_power();
        while (true) {
            skip_ws();
            if (match('*')) {
                MathNode* n = alloc(MATH_BINARY); n->binary = {"*", left, parse_power()}; left = n;
            } else if (pos < len && src[pos] == '/') {
                pos++;
                MathNode* n = alloc(MATH_FRACTION); n->fraction = {left, parse_power()}; left = n;
            } else if (pos < len && (src[pos] == '(' || is_ident_start(src[pos]) || src[pos] == '"')) {
                // Implicit multiplication: 2x, x(y), etc.
                MathNode* n = alloc(MATH_BINARY); n->binary = {"*", left, parse_power()}; left = n;
            } else break;
        }
        return left;
    }

    // ── Power ────────────────────────────────────────────────────────────────
    MathNode* parse_power() {
        MathNode* base = parse_unary();
        while (true) {
            skip_ws();
            if (match('^')) {
                MathNode* exp = parse_unary();
                MathNode* n = alloc(MATH_SUPERSCRIPT); n->superscript = {base, exp}; base = n;
            } else if (match('_')) {
                MathNode* sub = parse_primary();
                MathNode* n = alloc(MATH_SUBSCRIPT); n->subscript = {base, sub}; base = n;
            } else break;
        }
        return base;
    }

    // ── Unary ────────────────────────────────────────────────────────────────
    MathNode* parse_unary() {
        skip_ws();
        if (pos < len && (src[pos] == '-' || src[pos] == '+') && (pos+1 < len && src[pos+1] != '{')) {
            char op[2] = {src[pos], 0}; pos++;
            MathNode* n = alloc(MATH_UNARY);
            n->unary = {arena_str(arena, op, 1).data, parse_unary()};
            return n;
        }
        return parse_primary();
    }

    // ── Primary ──────────────────────────────────────────────────────────────
    MathNode* parse_primary() {
        skip_ws();
        if (pos >= len) { MathNode* n = alloc(MATH_NUMBER); n->number = 0; return n; }

        // Number
        if (is_digit(src[pos]) || (src[pos] == '.' && pos+1 < len && is_digit(src[pos+1]))) {
            return parse_number();
        }
        // Parenthesized
        if (src[pos] == '(') {
            pos++;
            MathNode* inner = parse_expression();
            match(')');
            // Check if it's a function call (callee already parsed) — handled in multiplicative
            MathNode* n = alloc(MATH_PAREN); n->paren_expr = inner;
            return n;
        }
        // Set {a, b, c}
        if (src[pos] == '{') {
            return parse_set();
        }
        // Text literal "..."
        if (src[pos] == '"') {
            return parse_text();
        }
        // \\sqrt
        if (match_str("\\sqrt")) {
            match('{');
            MathNode* body = parse_expression();
            match('}');
            MathNode* n = alloc(MATH_SQRT); n->sqrt = {body};
            return n;
        }
        // Ellipsis
        if (match_str("...")) {
            return alloc(MATH_ELLIPSIS);
        }
        // Identifier
        if (is_ident_start(src[pos]) || src[pos] == '\\') {
            return parse_identifier();
        }

        // Fallback
        MathNode* n = alloc(MATH_NUMBER); n->number = 0; pos++;
        return n;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    bool is_digit(char c) { return c >= '0' && c <= '9'; }
    bool is_ident_start(char c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'); }
    bool is_ident_char(char c) { return is_ident_start(c) || is_digit(c); }

    MathNode* parse_number() {
        uint32_t start = pos;
        while (pos < len && (is_digit(src[pos]) || src[pos] == '.')) pos++;
        char buf[32]; uint32_t l = pos - start; if (l > 31) l = 31;
        memcpy(buf, src + start, l); buf[l] = 0;
        MathNode* n = alloc(MATH_NUMBER); n->number = (float)atof(buf);
        return n;
    }

    MathNode* parse_identifier() {
        uint32_t start = pos;
        uint8_t style = 1; // italic by default
        if (src[pos] == '\\') {
            pos++;
            start = pos;
            while (pos < len && is_ident_char(src[pos])) pos++;
            style = 3; // greek/command
        } else {
            while (pos < len && is_ident_char(src[pos])) pos++;
        }
        uint32_t l = pos - start;
        MathNode* n = alloc(MATH_IDENTIFIER);
        n->ident = {arena_str(arena, src + start, l).data, style};
        return n;
    }

    MathNode* parse_text() {
        pos++; // skip opening "
        uint32_t start = pos;
        while (pos < len && src[pos] != '"') pos++;
        uint32_t l = pos - start;
        if (pos < len) pos++; // skip closing "
        MathNode* n = alloc(MATH_TEXT);
        n->text = arena_str(arena, src + start, l).data;
        return n;
    }

    MathNode* parse_set() {
        pos++; // skip {
        MathNode* elems[64]; uint16_t count = 0;
        if (peek() != '}') {
            elems[count++] = parse_relational();
            while (match(',') && count < 64)
                elems[count++] = parse_relational();
        }
        match('}');
        MathNode* n = alloc(MATH_SET);
        n->set.count = count;
        n->set.elements = (MathNode**)arena_alloc(arena, sizeof(MathNode*) * count, 8);
        memcpy(n->set.elements, elems, sizeof(MathNode*) * count);
        return n;
    }
};

// Parse a math expression string. Returns AST root.
inline MathNode* math_parse(Arena* a, const char* text, uint32_t len) {
    MathParser p = {a, text, len, 0};
    return p.parse_expression();
}
