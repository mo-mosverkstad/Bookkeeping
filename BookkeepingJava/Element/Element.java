package Bookkeeping.Element;

public abstract class Element {
    protected String name;

    protected Element(String name){
        this.name = name;
    }

    public final void setName(String name) {
        this.name = name;
    }

    public final String getName() {
        return name;
    }
}
