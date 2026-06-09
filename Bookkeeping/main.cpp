#include "graphics/graphics_elements/World.h"
#include "graphics/graphics_elements/Collision.h"
#include "graphics/basic_renderer/Renderer.h"

int main() {
    World world;

    world.circles.emplace_back(
        Transform{0, 0, 0},
        Color{1, 0, 0, 1},
        10
    );

    world.rects.emplace_back(
        Transform{5, 5, 0},
        Color{0, 1, 0, 1},
        10,
        20
    );

    Renderer renderer;
    Collision collision;

    renderer.render(world);
    collision.update(world);

    // renderer.render(world);

    return 0;
}