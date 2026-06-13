#include "src/platform/platform.h"
#include "src/graphics/backend/sdl2_backend.h"

struct SDL2Window : PlatformWindow {
    SDL2Backend* sdl_backend;
    int w, h;

    SDL2Window(const char* title, int width, int height) : w(width), h(height) {
        sdl_backend = new SDL2Backend(title, width, height);
    }
    ~SDL2Window() override { delete sdl_backend; }

    bool poll_event(InputEvent& out) override {
        SDL_Event ev;
        while (SDL_PollEvent(&ev)) {
            switch (ev.type) {
                case SDL_QUIT:
                    out.type = InputEvent::QUIT;
                    return true;
                case SDL_MOUSEBUTTONDOWN:
                    out.type = InputEvent::MOUSE_DOWN;
                    out.x = (float)ev.button.x;
                    out.y = (float)ev.button.y;
                    out.button = ev.button.button;
                    return true;
                case SDL_MOUSEBUTTONUP:
                    out.type = InputEvent::MOUSE_UP;
                    out.x = (float)ev.button.x;
                    out.y = (float)ev.button.y;
                    out.button = ev.button.button;
                    return true;
                case SDL_MOUSEMOTION:
                    out.type = InputEvent::MOUSE_MOVE;
                    out.x = (float)ev.motion.x;
                    out.y = (float)ev.motion.y;
                    return true;
                case SDL_MOUSEWHEEL:
                    out.type = InputEvent::MOUSE_WHEEL;
                    out.scroll_x = (float)ev.wheel.x;
                    out.scroll_y = (float)ev.wheel.y;
                    return true;
                case SDL_KEYDOWN:
                    out.type = InputEvent::KEY_DOWN;
                    out.key = ev.key.keysym.sym;
                    out.mod = ev.key.keysym.mod;
                    out.text[0] = 0;
                    return true;
                case SDL_KEYUP:
                    out.type = InputEvent::KEY_UP;
                    out.key = ev.key.keysym.sym;
                    out.mod = ev.key.keysym.mod;
                    out.text[0] = 0;
                    return true;
                case SDL_TEXTINPUT:
                    out.type = InputEvent::TEXT_INPUT;
                    memcpy(out.text, ev.text.text, 7);
                    out.text[7] = 0;
                    return true;
                case SDL_WINDOWEVENT:
                    if (ev.window.event == SDL_WINDOWEVENT_RESIZED) {
                        w = ev.window.data1;
                        h = ev.window.data2;
                        out.type = InputEvent::WINDOW_RESIZE;
                        out.x = (float)w;
                        out.y = (float)h;
                        return true;
                    }
                    break;
            }
        }
        return false;
    }

    RenderBackend* backend() override { return sdl_backend; }
    void begin_frame() override { sdl_backend->begin_frame((float)w, (float)h); }
    void end_frame() override { sdl_backend->end_frame(); }
    int width() const override { return w; }
    int height() const override { return h; }
};

PlatformWindow* create_window(const char* title, int w, int h) {
    return new SDL2Window(title, w, h);
}

void destroy_window(PlatformWindow* win) {
    delete win;
}
