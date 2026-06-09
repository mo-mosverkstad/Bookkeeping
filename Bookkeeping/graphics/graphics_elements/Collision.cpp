#include "graphics/graphics_elements/Collision.h"
#include <cmath>

bool Collision::intersects(const Circle& a, const Circle& b) const {
    float dx = a.transform.x - b.transform.x;
    float dy = a.transform.y - b.transform.y;

    float r = a.radius + b.radius;
    return dx*dx + dy*dy <= r*r;
}

bool Collision::intersects(const Circle& c, const Rect& r) const {
    float cx = c.transform.x;
    float cy = c.transform.y;

    float rx = r.transform.x;
    float ry = r.transform.y;

    float hw = r.width * 0.5f;
    float hh = r.height * 0.5f;

    float closestX = std::max(rx - hw, std::min(cx, rx + hw));
    float closestY = std::max(ry - hh, std::min(cy, ry + hh));

    float dx = cx - closestX;
    float dy = cy - closestY;

    return (dx*dx + dy*dy) <= (c.radius * c.radius);
}

void Collision::update(World& world) const {
    for (size_t i = 0; i < world.circles.size(); ++i) {
        for (size_t j = i + 1; j < world.circles.size(); ++j) {
            if (intersects(world.circles[i], world.circles[j])) {
                // handle circle-circle collision
            }
        }
    }

    for (const auto& c : world.circles) {
        for (const auto& r : world.rects) {
            if (intersects(c, r)) {
                // handle circle-rect collision
            }
        }
    }
}