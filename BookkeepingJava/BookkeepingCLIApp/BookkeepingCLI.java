package Bookkeeping.BookkeepingCLIApp;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.Scanner;

import Bookkeeping.Tables.TableInterface;
import Bookkeeping.Utils.DataToolsTest;

public class BookkeepingCLI {
    public static final String PROMPT = "> ";
    public static final String SPLIT_REGEX = "\\s+";

    public static final String COMMAND_EXIT = "exit";
    public static final String COMMAND_VIEW = "view";
    public static final String COMMAND_UPDATE = "update";
    public static final String COMMAND_UPDATE_SHORT = "u";
    // public static final String COMMAND_HELP = "help";

    public static final String DATATOOLS_INITIAL_MESSAGE = "DataToolsCLI is running...";
    public static final String DATATOOLS_EXIT_MESSAGE = "SUCCESS: Successfully exited DataToolsCLI!";

    public static final String UNRECOGNIZED_COMMAND_PROBLEM_FORMAT = "PROBLEM: Unrecognized command '%s'!";
    
    public static void main(String[] args) {
        TableInterface table = DataToolsTest.createTable();

        Map<String, CommandInterface> commandMap = new HashMap<>();
        commandMap.put(COMMAND_VIEW, new ViewCommand(table));
        commandMap.put(COMMAND_UPDATE, new UpdateCommand(table));
        commandMap.put(COMMAND_UPDATE_SHORT, new UpdateCommand(table));

        
        System.out.println(DATATOOLS_INITIAL_MESSAGE);
        try (Scanner scanner = new Scanner(System.in)){
            boolean continueFlag = true;
            while (continueFlag) {
                System.out.print(PROMPT);
                String inputLine = scanner.nextLine();
                String[] inputLineTokens = inputLine.split(SPLIT_REGEX);
                if (inputLineTokens.length != 0 && inputLineTokens[0].trim() != "") {
                    String command = inputLineTokens[0];
                    String[] arguments = Arrays.copyOfRange(inputLineTokens, 1, inputLineTokens.length);
                    if (command.equals(COMMAND_EXIT)) {
                        continueFlag = false;
                    }
                    else if (commandMap.containsKey(command)) {
                        commandMap.get(command).execute(arguments);
                    }
                    else{
                        System.out.println(String.format(UNRECOGNIZED_COMMAND_PROBLEM_FORMAT, command));
                    }
                }
            }
            System.out.println(DATATOOLS_EXIT_MESSAGE);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
