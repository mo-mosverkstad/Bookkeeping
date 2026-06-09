#pragma once

#include "graphics/graphics_elements/World.h"
#include <iostream>

class Renderer {
public:
    void draw(const Circle& c) const;
    void draw(const Rect& r) const;

    void render(const World& world) const;
};