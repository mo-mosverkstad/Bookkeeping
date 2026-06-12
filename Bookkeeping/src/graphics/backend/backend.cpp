#include "src/graphics/backend/backend.h"

void render_tree(RenderBackend* backend, LayoutNode* root, float offset_x, float offset_y) {
    float abs_x = offset_x + root->x;
    float abs_y = offset_y + root->y;

    // Render elements attached to this node
    for (uint16_t i = 0; i < root->element_count; i++) {
        Element& e = root->elements[i];
        switch (e.type) {
            case ELEM_RECT:     backend->render_rect(abs_x, abs_y, e.rect); break;
            case ELEM_ELLIPSE:  backend->render_ellipse(abs_x, abs_y, e.ellipse); break;
            case ELEM_LINE:     backend->render_line(abs_x, abs_y, e.line); break;
            case ELEM_POLYLINE: backend->render_polyline(abs_x, abs_y, e.polyline); break;
            case ELEM_POLYGON:  backend->render_polygon(abs_x, abs_y, e.polygon); break;
            case ELEM_TEXT:     backend->render_text(abs_x, abs_y, e.text); break;
        }
    }

    // For scroll nodes: apply clip rect and adjust child offset by scroll
    if (root->type == LAYOUT_SCROLL) {
        backend->set_clip({abs_x, abs_y, root->width, root->height});
        for (uint16_t i = 0; i < root->child_count; i++) {
            render_tree(backend, root->children[i], abs_x - root->scroll_x, abs_y - root->scroll_y);
        }
        backend->reset_clip();
    } else {
        for (uint16_t i = 0; i < root->child_count; i++) {
            render_tree(backend, root->children[i], abs_x, abs_y);
        }
    }
}
