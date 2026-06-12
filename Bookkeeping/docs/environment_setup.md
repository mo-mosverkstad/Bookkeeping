# Environment Setup

## Prerequisites

- **Compiler**: GCC 12+ or Clang 15+ with C++20 support
- **Build system**: GNU Make (or CMake if migrated later)
- **Platform libraries**:
  - SDL2 (graphics backend, window management, events)
  - SDL2_ttf or stb_truetype (font rendering)
- **Testing**: Custom test harness (built in-project)
- **OS**: Linux (primary), Windows (via MSYS2/MinGW or WSL)

## Build

```bash
make            # Build main executable
make test       # Build and run all unit tests
make bench      # Build and run benchmarks
make clean      # Remove build artifacts
```

## Dependencies installation

### Ubuntu/Debian
```bash
sudo apt install build-essential libsdl2-dev libsdl2-ttf-dev
```

### MSYS2 (Windows)
```bash
pacman -S mingw-w64-x86_64-gcc mingw-w64-x86_64-SDL2 mingw-w64-x86_64-SDL2_ttf
```

### macOS
```bash
brew install sdl2 sdl2_ttf
```

## Project structure

```
Bookkeeping/
├── docs/               # Documentation
├── graphics/           # Graphics library (existing foundation)
│   ├── basic_renderer/ # Renderer implementation
│   └── graphics_elements/  # Shape definitions
├── src/                # Application source (to be created per phase)
├── test/               # Unit tests and benchmarks
├── main.cpp            # Entry point
└── Makefile            # Build configuration
```
