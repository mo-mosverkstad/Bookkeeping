#pragma once

#include "graphics/graphics_elements/World.h"

class Collision {
public:
    bool intersects(const Circle& a, const Circle& b) const;
    bool intersects(const Circle& c, const Rect& r) const;

    void update(World& world) const;
};