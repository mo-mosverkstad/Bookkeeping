#include "graphics/basic_renderer/Renderer.h"

void Renderer::draw(const Circle& c) const {
    std::cout << "Circle at (" << c.transform.x
              << ", " << c.transform.y << ")\n";
}

void Renderer::draw(const Rect& r) const {
    std::cout << "Rect at (" << r.transform.x
              << ", " << r.transform.y << ")\n";
}

void Renderer::render(const World& world) const {
    for (const auto& c : world.circles)
        draw(c);

    for (const auto& r : world.rects)
        draw(r);
}