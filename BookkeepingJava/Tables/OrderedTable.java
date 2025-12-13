package Bookkeeping.Tables;

import java.util.ArrayList;
import java.util.List;

public final class OrderedTable extends AbstractTable{
    private static final String INVALID_ROW_DATA_ERROR = "Row data is not valid for this table";
    private static final String NEGATIVE_ROW_INDEX_ERROR = "Row index cannot be negative";

    public OrderedTable(String name){
        super(name);
    }

    @Override
    public void updateRow(int index, List<Object> rowData) throws IllegalArgumentException {
        if (index < 0) throw new IllegalArgumentException(NEGATIVE_ROW_INDEX_ERROR);
        if (!isValidRow(rowData)) throw new IllegalArgumentException(INVALID_ROW_DATA_ERROR);

        while (index >= rows.size()) {
            // Fill with nulls to match column size
            List<Object> emptyRow = new ArrayList<>();
            for (int i = 0; i < columnSize(); i++) {
                emptyRow.add(null);
            }
            rows.add(emptyRow);
        }

        rows.set(index, rowData);
    }

}
