#pragma once
#include "src/graphics/elements/element.h"
#include "src/graphics/layout/layout.h"

struct ClipRect { float x, y, w, h; };

// Render backend interface — visitor pattern.
struct RenderBackend {
    virtual ~RenderBackend() = default;
    virtual void begin_frame(float width, float height) = 0;
    virtual void end_frame() = 0;
    virtual void set_clip(ClipRect rect) = 0;
    virtual void reset_clip() = 0;
    virtual void render_rect(float abs_x, float abs_y, const Rect& r) = 0;
    virtual void render_ellipse(float abs_x, float abs_y, const Ellipse& e) = 0;
    virtual void render_line(float abs_x, float abs_y, const Line& l) = 0;
    virtual void render_polyline(float abs_x, float abs_y, const Polyline& p) = 0;
    virtual void render_polygon(float abs_x, float abs_y, const Polygon& p) = 0;
    virtual void render_text(float abs_x, float abs_y, const Text& t) = 0;
};

// Render a layout tree using the given backend.
// Handles scroll nodes (applies clip + offset).
void render_tree(RenderBackend* backend, LayoutNode* root, float offset_x = 0, float offset_y = 0);
