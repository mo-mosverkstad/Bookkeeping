CXX = g++
CXXFLAGS = -std=c++20 -Wall -Wextra -O2

TARGET = main

SRC = \
main.cpp \
graphics/basic_renderer/Renderer.cpp \
graphics/graphics_elements/Collision.cpp

all:
	$(CXX) $(CXXFLAGS) $(SRC) -I. -o $(TARGET)

clean:
	rm -f $(TARGET)