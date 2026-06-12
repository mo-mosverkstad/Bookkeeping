CXX = g++
CXXFLAGS = -std=c++20 -Wall -Wextra -O2 -I. -Wno-array-bounds -Wno-stringop-overflow -Wno-format-truncation
SDL_FLAGS = $(shell sdl2-config --cflags --libs) -lm

TARGET = main
TEST_GFX = test_gfx
TEST_TABLE = test_table
TEST_UI = test_ui

SRC = main.cpp \
      src/graphics/layout/layout.cpp \
      src/graphics/backend/backend.cpp \
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

all: $(TARGET)

$(TARGET): $(SRC)
	$(CXX) $(CXXFLAGS) $(SRC) -o $(TARGET) $(SDL_FLAGS)

test: test-gfx test-table test-ui

test-gfx: $(TEST_GFX_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_GFX_SRC) -o $(TEST_GFX) -lm
	./$(TEST_GFX)

test-table: $(TEST_TABLE_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_TABLE_SRC) -o $(TEST_TABLE) -lm
	./$(TEST_TABLE)

test-ui: $(TEST_UI_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_UI_SRC) -o $(TEST_UI) -lm
	./$(TEST_UI)

bench: test

clean:
	rm -f $(TARGET) $(TEST_GFX) $(TEST_TABLE) $(TEST_UI)

.PHONY: all test test-gfx test-table bench clean
