package ph.fped.portal.common;

import java.util.Collection;

/** The IDs people write on papers: P0001, TO-2027-00001, PROC-2027-00001, PR-2027-00001. */
public final class Codes {

    private Codes() {}

    /** Prefix + one more than the highest number in use among the codes that start with the prefix. */
    public static String next(Collection<String> codes, String prefix, int digits) {
        int max = 0;
        for (String code : codes) {
            if (!code.startsWith(prefix)) continue;
            try {
                max = Math.max(max, Integer.parseInt(code.substring(prefix.length())));
            } catch (NumberFormatException e) {
                // not one of ours (e.g. typed by hand in the old sheet): ignore
            }
        }
        return prefix + String.format("%0" + digits + "d", max + 1);
    }

    /** 2027 from "PROC-2027-00001"; 0 when the code has no year. */
    public static int yearOf(String code) {
        String[] parts = code.split("-");
        try {
            return parts.length >= 3 ? Integer.parseInt(parts[1]) : 0;
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
