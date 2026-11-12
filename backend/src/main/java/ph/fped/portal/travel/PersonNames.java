package ph.fped.portal.travel;

import java.util.Locale;
import java.util.regex.Pattern;

/** Same rules as the old Travel Order System, so names compare the same way after the data is moved. */
public final class PersonNames {

    private static final Pattern PUNCTUATION = Pattern.compile("[.,`'\"]");
    private static final Pattern SPACES = Pattern.compile("\\s+");
    private static final Pattern TWO_LETTERS = Pattern.compile("[A-Z]{2,}");

    private PersonNames() {}

    /** How a name is stored: capital letters, single spaces. " Rinalyn  b. Dumol " -> "RINALYN B. DUMOL" */
    public static String clean(String name) {
        return SPACES.matcher(name == null ? "" : name).replaceAll(" ").trim().toUpperCase(Locale.ROOT);
    }

    /**
     * What two spellings of the same name have in common: "Rinalyn B. Dumol," and "RINALYN B DUMOL" both give
     * "RINALYN B DUMOL". Empty when the text is not a name (no word of two letters or more).
     */
    public static String key(String name) {
        String n = PUNCTUATION.matcher((name == null ? "" : name).toUpperCase(Locale.ROOT)).replaceAll(" ");
        n = SPACES.matcher(n).replaceAll(" ").trim();
        return TWO_LETTERS.matcher(n).find() ? n : "";
    }
}
