package Bookkeeping.Graphs;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import Bookkeeping.Element.Element;

class Vertex{
    private String name;
    private Set<Integer> neighbors = new HashSet<>();

    public Vertex(String name) {
        this.name = name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public void addNeighbor(int neighbor) {
        neighbors.add(neighbor);
    }

    public void removeNeighbor(int neighbor) {
        neighbors.remove(neighbor);
    }

    public void clearNeighbors() {
        neighbors.clear();
    }

    public Set<Integer> getNeighbors() {
        return neighbors;
    }
}

public class Graph extends Element {
    private static final String NEWLINE_CHARACTER = "\n";
    private static final String SPACE_CHARACTER = " ";
    private static final String LEFT_PARENTHESIS = "(";
    private static final String RIGHT_PARENTHESIS_SPACE = ") ";
    private static final String COLON_SPACE = ": ";

    private final List<Vertex> adjacencyList = new ArrayList<>();
    
    public Graph(String name) {
        super(name);
    }

    public void updateVertex(int vertexIndex, String vertexName){
        while (vertexIndex >= adjacencyList.size()){
            adjacencyList.add(new Vertex(null));
        }
        adjacencyList.get(vertexIndex).setName(vertexName);
    }

    public boolean hasVertex(int vertexIndex){
        return vertexIndex < adjacencyList.size();
    }

    public void addEdge(int vertexIndex1, int vertexIndex2){
        adjacencyList.get(vertexIndex1).addNeighbor(vertexIndex2);
    }

    public boolean hasEdge(int vertexIndex1, int vertexIndex2){
        return adjacencyList.get(vertexIndex1).getNeighbors().contains(vertexIndex2);
    }

    public void removeEdge(int vertexIndex1, int vertexIndex2){
        adjacencyList.get(vertexIndex1).removeNeighbor(vertexIndex2);
    }

    public void addBidirectionalEdge(int vertexIndex1, int vertexIndex2){
        adjacencyList.get(vertexIndex1).addNeighbor(vertexIndex2);
        adjacencyList.get(vertexIndex2).addNeighbor(vertexIndex1);
    }

    @Override
    public String toString(){
        StringBuilder content = new StringBuilder();
        content.append("----- Graph(").append(name).append(") -----\n");
        for (int i = 0; i < adjacencyList.size(); i++) {
            content.append(LEFT_PARENTHESIS).append(i).append(RIGHT_PARENTHESIS_SPACE);
            content.append(adjacencyList.get(i).getName()).append(COLON_SPACE);
            content.append(adjacencyList.get(i).getNeighbors()).append(SPACE_CHARACTER);
            content.append(NEWLINE_CHARACTER);
        }
        return content.toString();
    }
}