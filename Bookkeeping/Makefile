CXX = g++
CXXFLAGS = -std=c++20 -Wall -Wextra -O2 -I. -Wno-array-bounds -Wno-stringop-overflow -Wno-format-truncation
SDL_FLAGS = $(shell sdl2-config --cflags --libs) -lSDL2_ttf -lm

TARGET = main
TEST_GFX = test_gfx
TEST_TABLE = test_table
TEST_UI = test_ui
TEST_TVIEW = test_tview
TEST_MATH = test_math
TEST_EDITOR = test_editor
TEST_REND = test_rend
TEST_GRAPH = test_graph
TEST_WORKSPACE = test_workspace
TEST_FILE_IO = test_file_io

SRC = main.cpp \
      src/graphics/layout/layout.cpp \
      src/graphics/backend/backend.cpp \
      src/core/model/table.cpp \
      src/core/parser/csv.cpp \
      src/platform/sdl2_platform.cpp

TEST_GFX_SRC = test/test_graphics.cpp \
               src/graphics/layout/layout.cpp \
               src/graphics/backend/backend.cpp

TEST_TABLE_SRC = test/test_table.cpp \
                 src/core/model/table.cpp \
                 src/core/parser/csv.cpp

TEST_UI_SRC = test/test_ui.cpp \
              src/graphics/layout/layout.cpp \
              src/graphics/backend/backend.cpp

TEST_TVIEW_SRC = test/test_table_view.cpp \
                 src/core/model/table.cpp \
                 src/core/parser/csv.cpp \
                 src/graphics/layout/layout.cpp \
                 src/graphics/backend/backend.cpp

TEST_MATH_SRC = test/test_math.cpp \
                src/graphics/layout/layout.cpp \
                src/graphics/backend/backend.cpp

TEST_EDITOR_SRC = test/test_editor.cpp \
                  src/core/model/table.cpp \
                  src/core/parser/csv.cpp

TEST_REND_SRC = test/test_renderers.cpp \
                src/graphics/layout/layout.cpp \
                src/graphics/backend/backend.cpp

TEST_GRAPH_SRC = test/test_graph.cpp \
                 src/graphics/layout/layout.cpp \
                 src/graphics/backend/backend.cpp

TEST_WORKSPACE_SRC = test/test_workspace.cpp \
                     src/core/model/table.cpp \
                     src/core/parser/csv.cpp \
                     src/graphics/layout/layout.cpp \
                     src/graphics/backend/backend.cpp

TEST_FILE_IO_SRC = test/test_file_io.cpp \
                   src/core/model/table.cpp \
                   src/core/parser/csv.cpp

all: $(TARGET)

$(TARGET): $(SRC)
	$(CXX) $(CXXFLAGS) $(SRC) -o $(TARGET) $(SDL_FLAGS)

test: test-gfx test-table test-ui test-tview test-math test-editor test-rend test-graph test-workspace test-file-io

test-gfx: $(TEST_GFX_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_GFX_SRC) -o $(TEST_GFX) -lm
	./$(TEST_GFX)

test-table: $(TEST_TABLE_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_TABLE_SRC) -o $(TEST_TABLE) -lm
	./$(TEST_TABLE)

test-ui: $(TEST_UI_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_UI_SRC) -o $(TEST_UI) -lm
	./$(TEST_UI)

test-tview: $(TEST_TVIEW_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_TVIEW_SRC) -o $(TEST_TVIEW) -lm
	./$(TEST_TVIEW)

test-math: $(TEST_MATH_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_MATH_SRC) -o $(TEST_MATH) -lm
	./$(TEST_MATH)

test-editor: $(TEST_EDITOR_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_EDITOR_SRC) -o $(TEST_EDITOR) -lm
	./$(TEST_EDITOR)

test-rend: $(TEST_REND_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_REND_SRC) -o $(TEST_REND) -lm
	./$(TEST_REND)

test-graph: $(TEST_GRAPH_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_GRAPH_SRC) -o $(TEST_GRAPH) -lm
	./$(TEST_GRAPH)

test-workspace: $(TEST_WORKSPACE_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_WORKSPACE_SRC) -o $(TEST_WORKSPACE) -lm
	./$(TEST_WORKSPACE)

test-file-io: $(TEST_FILE_IO_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_FILE_IO_SRC) -o $(TEST_FILE_IO) -lm
	./$(TEST_FILE_IO)

bench: test

clean:
	rm -f $(TARGET) $(TEST_GFX) $(TEST_TABLE) $(TEST_UI) $(TEST_TVIEW) $(TEST_MATH) $(TEST_EDITOR) $(TEST_REND) $(TEST_GRAPH) $(TEST_WORKSPACE) $(TEST_FILE_IO)

.PHONY: all test test-gfx test-table bench clean
