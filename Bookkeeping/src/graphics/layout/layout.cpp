#include "src/graphics/layout/layout.h"
#include "src/graphics/backend/backend.h"
#include <cstring>

// ── Text measurement ─────────────────────────────────────────────────────────

static TextMeasure default_measure(const char* text, uint32_t len, const char*, float size, uint8_t) {
    uint32_t max_line = 0, cur_line = 0, lines = 1;
    for (uint32_t i = 0; i < len; i++) {
        if (text[i] == '\n') { if (cur_line > max_line) max_line = cur_line; cur_line = 0; lines++; }
        else cur_line++;
    }
    if (cur_line > max_line) max_line = cur_line;
    return { max_line * size * 0.6f, lines * size };
}

static TextMeasureFn g_measure_fn = default_measure;
void set_text_measure_hook(TextMeasureFn fn) { g_measure_fn = fn ? fn : default_measure; }
TextMeasure measure_text(const char* text, uint32_t len, const char* font, float size, uint8_t style) {
    return g_measure_fn(text, len, font, size, style);
}

// ── Layout computation ───────────────────────────────────────────────────────

void LayoutNode::compute(float avail_width, float avail_height) {
    if (req_width > 0) width = req_width; else width = avail_width;
    if (req_height > 0) height = req_height; else height = avail_height;

    switch (type) {
    case LAYOUT_COORDINATE: {
        float max_w = 0, max_h = 0;
        for (uint16_t i = 0; i < child_count; i++) {
            LayoutNode* c = children[i];
            c->compute(c->req_width, c->req_height);
            if (c->x + c->width > max_w) max_w = c->x + c->width;
            if (c->y + c->height > max_h) max_h = c->y + c->height;
        }
        if (req_width <= 0) width = max_w + padding * 2;
        if (req_height <= 0) height = max_h + padding * 2;
        break;
    }
    case LAYOUT_LINEAR: {
        bool horiz = (direction == LINEAR_HORIZONTAL);
        float cursor = padding, max_cross = 0;
        for (uint16_t i = 0; i < child_count; i++) {
            LayoutNode* c = children[i];
            float cw = c->req_width > 0 ? c->req_width : (horiz ? 0 : avail_width - padding * 2);
            float ch = c->req_height > 0 ? c->req_height : 0;
            c->compute(cw, ch);
            if (horiz) { c->x = cursor; c->y = padding; cursor += c->width + gap; if (c->height > max_cross) max_cross = c->height; }
            else       { c->x = padding; c->y = cursor; cursor += c->height + gap; if (c->width > max_cross) max_cross = c->width; }
        }
        float total = child_count > 0 ? cursor - gap + padding : padding * 2;
        if (horiz) { if (req_width <= 0) width = total; if (req_height <= 0) height = max_cross + padding * 2; }
        else       { if (req_width <= 0) width = max_cross + padding * 2; if (req_height <= 0) height = total; }
        break;
    }
    case LAYOUT_GRID: {
        if (grid_cols == 0) break;
        uint16_t cols = grid_cols;
        uint16_t rows = (child_count + cols - 1) / cols;
        float col_w = (avail_width - padding * 2 - gap * (cols - 1)) / cols;
        float cursor_y = padding;
        for (uint16_t r = 0; r < rows; r++) {
            float row_h = 0;
            for (uint16_t c = 0; c < cols; c++) { uint16_t idx = r*cols+c; if (idx >= child_count) break;
                float cw = (col_widths && col_widths[c] > 0) ? col_widths[c] : col_w;
                children[idx]->compute(cw, children[idx]->req_height);
                if (children[idx]->height > row_h) row_h = children[idx]->height; }
            float cursor_x = padding;
            for (uint16_t c = 0; c < cols; c++) { uint16_t idx = r*cols+c; if (idx >= child_count) break;
                float cw = (col_widths && col_widths[c] > 0) ? col_widths[c] : col_w;
                children[idx]->x = cursor_x; children[idx]->y = cursor_y; children[idx]->width = cw;
                cursor_x += cw + gap; }
            cursor_y += row_h + gap;
        }
        if (req_width <= 0) width = avail_width;
        if (req_height <= 0) height = cursor_y - gap + padding;
        break;
    }
    case LAYOUT_SCROLL: {
        float cursor = 0, max_w = 0;
        for (uint16_t i = 0; i < child_count; i++) {
            LayoutNode* c = children[i];
            c->compute(c->req_width > 0 ? c->req_width : width, c->req_height);
            c->x = 0; c->y = cursor;
            cursor += c->height + gap;
            if (c->width > max_w) max_w = c->width;
        }
        content_width = max_w;
        content_height = cursor > 0 ? cursor - gap : 0;
        break;
    }
    }
}

// ── Rendering ────────────────────────────────────────────────────────────────

void LayoutNode::render(RenderBackend* backend, float offset_x, float offset_y) {
    float abs_x = offset_x + x;
    float abs_y = offset_y + y;

    for (uint16_t i = 0; i < element_count; i++) {
        Element& e = elements[i];
        switch (e.type) {
            case ELEM_RECT:     backend->render_rect(abs_x, abs_y, e.rect); break;
            case ELEM_ELLIPSE:  backend->render_ellipse(abs_x, abs_y, e.ellipse); break;
            case ELEM_LINE:     backend->render_line(abs_x, abs_y, e.line); break;
            case ELEM_POLYLINE: backend->render_polyline(abs_x, abs_y, e.polyline); break;
            case ELEM_POLYGON:  backend->render_polygon(abs_x, abs_y, e.polygon); break;
            case ELEM_TEXT:     backend->render_text(abs_x, abs_y, e.text); break;
        }
    }

    if (type == LAYOUT_SCROLL) {
        backend->set_clip({abs_x, abs_y, width, height});
        for (uint16_t i = 0; i < child_count; i++)
            children[i]->render(backend, abs_x - scroll_x, abs_y - scroll_y);
        backend->reset_clip();
    } else {
        for (uint16_t i = 0; i < child_count; i++)
            children[i]->render(backend, abs_x, abs_y);
    }
}

// ── Hit testing ──────────────────────────────────────────────────────────────

HitResult LayoutNode::hit_surface(float px, float py, float offset_x, float offset_y) {
    float abs_x = offset_x + x;
    float abs_y = offset_y + y;
    if (px < abs_x || px >= abs_x + width || py < abs_y || py >= abs_y + height)
        return {nullptr, 0, 0};

    float child_ox = abs_x, child_oy = abs_y;
    if (type == LAYOUT_SCROLL) { child_ox -= scroll_x; child_oy -= scroll_y; }

    for (int i = child_count - 1; i >= 0; i--) {
        HitResult r = children[i]->hit_surface(px, py, child_ox, child_oy);
        if (r.node) return r;
    }
    return {this, px - abs_x, py - abs_y};
}

int LayoutNode::hit_deep(float px, float py, HitResult* results, int capacity, float offset_x, float offset_y) {
    float abs_x = offset_x + x;
    float abs_y = offset_y + y;
    if (px < abs_x || px >= abs_x + width || py < abs_y || py >= abs_y + height)
        return 0;

    int count = 0;
    if (count < capacity) { results[count++] = {this, px - abs_x, py - abs_y}; }

    float child_ox = abs_x, child_oy = abs_y;
    if (type == LAYOUT_SCROLL) { child_ox -= scroll_x; child_oy -= scroll_y; }

    for (uint16_t i = 0; i < child_count; i++) {
        int n = children[i]->hit_deep(px, py, results + count, capacity - count, child_ox, child_oy);
        count += n;
        if (count >= capacity) break;
    }
    return count;
}

// ── Legacy free-function wrappers (for backward compat with tests) ───────────

void layout_compute(LayoutNode* root, float w, float h) { root->compute(w, h); }
HitResult hit_test_surface(LayoutNode* root, float x, float y, float ox, float oy) { return root->hit_surface(x, y, ox, oy); }
int hit_test_deep(LayoutNode* root, float x, float y, HitResult* r, int cap, float ox, float oy) { return root->hit_deep(x, y, r, cap, ox, oy); }
void render_tree(RenderBackend* backend, LayoutNode* root, float ox, float oy) { root->render(backend, ox, oy); }
