package Bookkeeping.BookkeepingCLIApp;

import Bookkeeping.Tables.TableInterface;

public final class ViewCommand implements CommandInterface{
    private static final String NO_ARGUMENTS_ACCEPTED_PROBLEM_FORMAT = "PROBLEM: No arguments are accepted to view command! Number of arguments: %d";

    private final TableInterface table;
    public ViewCommand(TableInterface table){
        this.table = table;
    }

    @Override
    public void execute(String[] arguments){
        if (arguments.length != 0) {
            System.out.println(String.format(NO_ARGUMENTS_ACCEPTED_PROBLEM_FORMAT, arguments.length));
            return;
        }
        System.out.println(table);
    }
}
