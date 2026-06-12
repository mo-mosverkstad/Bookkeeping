CXX = g++
CXXFLAGS = -std=c++20 -Wall -Wextra -O2 -I.
SDL_FLAGS = $(shell sdl2-config --cflags --libs) -lm

TARGET = main
TEST_TARGET = test_runner

SRC = main.cpp \
      src/graphics/layout/layout.cpp \
      src/graphics/backend/backend.cpp

TEST_SRC = test/test_graphics.cpp \
           src/graphics/layout/layout.cpp \
           src/graphics/backend/backend.cpp

all: $(TARGET)

$(TARGET): $(SRC)
	$(CXX) $(CXXFLAGS) $(SRC) -o $(TARGET) $(SDL_FLAGS)

test: $(TEST_SRC)
	$(CXX) $(CXXFLAGS) $(TEST_SRC) -o $(TEST_TARGET) -lm
	./$(TEST_TARGET)

bench: test

clean:
	rm -f $(TARGET) $(TEST_TARGET)

.PHONY: all test bench clean
