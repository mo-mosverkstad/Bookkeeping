package Bookkeeping.Tables;

import java.util.List;

public interface TableInterface {
    void setName(String name);
    String getName();
    int rowSize();
    int columnSize();
    List<CollationEntry> getCollation();
    String toString();
    boolean isValidRow(List<Object> rowData);
    void appendRow(List<Object> rowData);
    void updateRow(int index, List<Object> rowData);
    void addColumn(CollationEntry collationEntry);
}
