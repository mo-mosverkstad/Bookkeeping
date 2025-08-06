package Bookkeeping.BookkeepingCLIApp;

import java.util.ArrayList;
import java.util.List;

import Bookkeeping.Tables.CollationEntry;
import Bookkeeping.Tables.CollationTypes;
import Bookkeeping.Tables.TableInterface;
import Bookkeeping.Utils.Util;

public final class UpdateCommand implements CommandInterface{
    private final static String BOOLEAN_KEYWORD_TRUE = "true";
    private final static String BOOLEAN_KEYWORD_FALSE = "false";

    private final static String MISMATCH_ARGUMENT_NUMBER_PROBLEM_FORMAT = "PROBLEM: Numbers of arguments (%d) mismatch with table collation columns (%d)";
    private final static String MALFORMED_INTEGER_PROBLEM_FORMAT = "PROBLEM: Malformed integer argument on argument %d: %s";
    private final static String MALFORMED_BOOLEAN_PROBLEM_FORMAT = "PROBLEM: Malformed boolean argument on argument %d: %s";
    private final static String UNRECOGNIZED_ARGUMENT_PROBLEM_FORMAT = "PROBLEM: Unrecognized argument on argument %d: %s";

    private final TableInterface table;
    public UpdateCommand(TableInterface table){
        this.table = table;
    }

    @Override
    public void execute(String[] arguments){
        List<CollationEntry> collationEntries = table.getCollation();

        int collationEntriesSize = collationEntries.size();
        int argumentsSize = arguments.length;

        List<Object> rowData = new ArrayList<>(collationEntriesSize);
        if (collationEntriesSize != argumentsSize){
            System.out.println(String.format(MISMATCH_ARGUMENT_NUMBER_PROBLEM_FORMAT, argumentsSize, collationEntriesSize));
            return;
        }
        for (int i = 0; i < argumentsSize; i++) {
            CollationTypes columnType = collationEntries.get(i).type();
            String argument = arguments[i];
            if (columnType == CollationTypes.INTEGER) {
                if (Util.isStringDigit(argument)) {
                    rowData.add(Integer.parseInt(argument));
                }
                else{
                    System.out.println(String.format(MALFORMED_INTEGER_PROBLEM_FORMAT, i, argument));
                    return;
                }
            }
            else if (columnType == CollationTypes.BOOLEAN) {
                argument = argument.toLowerCase();
                if (argument.equals(BOOLEAN_KEYWORD_TRUE)) {
                    rowData.add(true);
                }
                else if (argument.equals(BOOLEAN_KEYWORD_FALSE)) {
                    rowData.add(false);
                }
                else{
                    System.out.println(String.format(MALFORMED_BOOLEAN_PROBLEM_FORMAT, i, argument));
                    return;
                }
            }
            else if (columnType == CollationTypes.STRING) {
                rowData.add(argument);
            }
            else{
                System.out.println(String.format(UNRECOGNIZED_ARGUMENT_PROBLEM_FORMAT, i, argument));
                return;
            }
        }
        table.updateRow((int) rowData.get(0) - 1, rowData);
    }
}
