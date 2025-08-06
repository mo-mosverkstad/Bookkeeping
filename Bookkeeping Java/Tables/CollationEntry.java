package Bookkeeping.Tables;

public record CollationEntry(String name, CollationTypes type) {

    public boolean validate(Object object) {
        return type().validate(object);
    }
}
