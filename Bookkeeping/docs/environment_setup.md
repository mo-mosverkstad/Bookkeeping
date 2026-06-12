# Environment Setup

## Prerequisites

- **Compiler**: GCC 12+ or Clang 15+ with C++20 support
- **Build system**: GNU Make
- **Libraries**: SDL2, SDL2_ttf
- **Fonts**: DejaVu Math TeX Gyre (for math rendering), DejaVu Sans (UI text)

---

## WSL (Windows Subsystem for Linux) — Ubuntu/Debian

### 1. Install build tools
```bash
sudo apt update
sudo apt install -y build-essential g++
```

### 2. Install SDL2 and SDL2_ttf
```bash
sudo apt install -y libsdl2-dev libsdl2-ttf-dev
```

### 3. Install math fonts
```bash
sudo apt install -y fonts-dejavu fonts-stix
```

### 4. Verify
```bash
g++ --version          # should show 12+
sdl2-config --version  # should show 2.x
ls /usr/share/fonts/truetype/dejavu/DejaVuMathTeXGyre.ttf  # math font
```

### 5. Display (WSLg or X server)
- **Windows 11 (WSLg)**: Graphics work out of the box
- **Windows 10**: Install [VcXsrv](https://vcxsrv.com/), run it, then:
  ```bash
  export DISPLAY=:0
  ```

### 6. Build and run
```bash
cd Bookkeeping/
make clean && make
./main          # opens SDL2 window
make test       # runs all tests (no window needed)
```

---

## Ubuntu/Debian (native)

```bash
sudo apt update
sudo apt install -y build-essential g++ libsdl2-dev libsdl2-ttf-dev fonts-dejavu fonts-stix
make clean && make
./main
```

---

## Arch Linux

```bash
sudo pacman -S base-devel gcc sdl2 sdl2_ttf ttf-dejavu otf-stix
make clean && make
./main
```

---

## Fedora/RHEL

```bash
sudo dnf install -y gcc-c++ make SDL2-devel SDL2_ttf-devel dejavu-sans-fonts dejavu-math-fonts
make clean && make
./main
```

---

## macOS (Homebrew)

```bash
brew install sdl2 sdl2_ttf
# DejaVu Math font: download from https://dejavu-fonts.github.io/
# Place .ttf in /Library/Fonts/ or ~/Library/Fonts/
make clean && make
./main
```

Note: Update font paths in `src/graphics/backend/sdl2_backend.h` if fonts are in non-standard locations on macOS.

---

## Windows (MSYS2/MinGW)

### 1. Install MSYS2
Download from https://www.msys2.org/ and install.

### 2. Open MSYS2 MinGW64 terminal
```bash
pacman -Syu
pacman -S mingw-w64-x86_64-gcc mingw-w64-x86_64-make mingw-w64-x86_64-SDL2 mingw-w64-x86_64-SDL2_ttf
```

### 3. Build
```bash
cd /path/to/Bookkeeping/
mingw32-make clean && mingw32-make
./main.exe
```

Note: Cambria Math is available natively on Windows at `C:\Windows\Fonts\cambria.ttc`. Update font paths in `sdl2_backend.h` for Windows builds.

---

## Project structure

```
Bookkeeping/
├── docs/                   # Documentation
├── src/
│   ├── core/               # Arena, string, model, parsers
│   │   ├── arena.h         # Arena allocator
│   │   ├── str.h           # Arena-backed strings
│   │   ├── color.h         # RGBA color
│   │   ├── model/          # Table, Row, Cell
│   │   └── parser/         # CSV, math, chem, physics, geometry, rich
│   ├── graphics/           # Graphics library
│   │   ├── elements/       # Rect, Ellipse, Line, Polyline, Polygon, Text
│   │   ├── layout/         # LayoutNode, compute, hit test, scroll, virtual, functional
│   │   ├── backend/        # RenderBackend, SoftwareBackend, SDL2Backend
│   │   ├── ui.h            # React-like fluent builder API
│   │   └── node_builder.h  # Node factory functions
│   ├── app/                # Application layer
│   │   ├── table_view.h    # Table model → visual grid
│   │   ├── table_editor.h  # Cell editing + undo/redo
│   │   └── edit_history.h  # Edit action stack
│   ├── platform/           # Platform abstraction
│   │   ├── platform.h      # PlatformWindow interface
│   │   └── sdl2_platform.cpp  # SDL2 implementation
│   └── demo.h              # Interactive demo
├── test/                   # Unit tests + benchmarks
├── main.cpp                # Entry point (calls run_demo)
├── Makefile                # Build configuration
└── .vscode/                # VS Code IntelliSense config
```

---

## Build targets

| Command | Description |
|---|---|
| `make` | Build main executable |
| `make test` | Build and run all test suites |
| `make test-gfx` | Graphics + layout tests only |
| `make test-table` | Table model + CSV parser tests |
| `make test-ui` | UI builder tests |
| `make test-tview` | Table view tests |
| `make test-math` | Math parser + renderer tests |
| `make test-editor` | Cell editor + undo/redo tests |
| `make test-rend` | Chemistry/physics/geometry/rich text tests |
| `make bench` | Run all tests including benchmarks |
| `make clean` | Remove all build artifacts |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `SDL2/SDL.h: No such file or directory` | Install `libsdl2-dev` |
| `SDL2/SDL_ttf.h: No such file or directory` | Install `libsdl2-ttf-dev` |
| No window appears on WSL | Install VcXsrv or use Windows 11 WSLg |
| Text appears as boxes/rectangles | Install `fonts-dejavu` and `fonts-stix` |
| IntelliSense errors in VS Code | Check `.vscode/c_cpp_properties.json` points to WSL paths |
| `make: Nothing to be done` | Source unchanged since last build; use `make clean && make` |
