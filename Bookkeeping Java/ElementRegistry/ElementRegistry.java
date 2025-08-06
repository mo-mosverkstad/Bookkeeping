package Bookkeeping.ElementRegistry;

import java.util.ArrayList;
import java.util.List;

import Bookkeeping.Element.Element;

public class ElementRegistry {
    private final List<Element> layouts = new ArrayList<>();
    public ElementRegistry(){}

    public Element get(int index){
        return layouts.get(index);
    }

    public void add(Element layout){
        layouts.add(layout);
    }

    public String toString(){
        StringBuilder content = new StringBuilder();
        content.append("ElementRegistry: [");
        for (int i = 0; i < layouts.size(); i++){
            content.append(layouts.get(i).getClass().getSimpleName()).append("[").append(i).append("]");
            content.append(", ");
        }
        content.append("]");
        return content.toString();
    }
}
