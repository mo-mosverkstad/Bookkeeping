#pragma once
#include "src/graphics/layout/virtual_layout.h"
#include <cstdint>

struct RenderBackend; // forward declaration

// Platform-agnostic application interface.
// The demo/app code uses only this — never touches SDL, Win32, etc.

// Input event (platform-independent)
struct InputEvent {
    enum Type : uint8_t {
        QUIT = 0,
        MOUSE_DOWN,
        MOUSE_UP,
        MOUSE_MOVE,
        MOUSE_WHEEL,
        KEY_DOWN,
        KEY_UP,
    };
    Type type;
    float x, y;         // mouse position
    float scroll_x, scroll_y; // wheel delta
    int key;            // key code
    uint8_t button;     // mouse button (1=left, 2=middle, 3=right)
    uint16_t mod;       // modifier flags (shift, ctrl, alt)
};

// Window + rendering context — abstract interface.
// Only the backend implements this.
struct PlatformWindow {
    virtual ~PlatformWindow() = default;
    virtual bool poll_event(InputEvent& out) = 0;   // returns false if no more events
    virtual RenderBackend* backend() = 0;           // get the render backend
    virtual void begin_frame() = 0;
    virtual void end_frame() = 0;
    virtual int width() const = 0;
    virtual int height() const = 0;
};

// Factory — creates a window using whatever backend is compiled in.
PlatformWindow* create_window(const char* title, int w, int h);
void destroy_window(PlatformWindow* win);
