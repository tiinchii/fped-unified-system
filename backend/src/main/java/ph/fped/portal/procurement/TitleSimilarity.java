package ph.fped.portal.procurement;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The repeat check: how alike two titles are. Same rules as the old Procurement System, and the same rules are
 * in the React app (procurement/similarity.ts) so the warning shown while typing matches the check done when
 * saving. Keep both in sync.
 */
public final class TitleSimilarity {

    /** Below this, two titles are not alike enough to mention. */
    public static final double MIN = 0.6;

    private static final Set<String> STOP = Set.of(("THE AND FOR WITH FROM INTO ONTO THRU VIA ITS OUR ALL ETC PER "
            + "ACTIVITY ACTIVITIES PROPOSAL REQUEST AUTHORITY CONDUCT CONDUCTING PURCHASE PROCUREMENT SUPPLY DELIVERY "
            + "BFAR BUREAU FISHERIES AQUATIC RESOURCES CENTRAL OFFICE BATCH "
            + "JAN JANUARY FEB FEBRUARY MAR MARCH APR APRIL MAY JUN JUNE JUL JULY AUG AUGUST SEP SEPT SEPTEMBER "
            + "OCT OCTOBER NOV NOVEMBER DEC DECEMBER").split(" "));

    private TitleSimilarity() {}

    /** "Training on Risk Management for CY 2026 (Batch 2)" -> [TRAINING, RISK, MANAGEMENT] */
    public static List<String> tokens(String text) {
        List<String> out = new ArrayList<>();
        for (String word : (text == null ? "" : text).toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", " ").split(" ")) {
            String w = word;
            if (w.length() < 3 || w.chars().anyMatch(Character::isDigit) || STOP.contains(w)) continue;
            if (w.length() > 4 && w.endsWith("S") && w.charAt(w.length() - 2) != 'S') w = w.substring(0, w.length() - 1); // WORKSHOPS -> WORKSHOP
            if (!out.contains(w)) out.add(w);
        }
        return out;
    }

    /**
     * Weight of each word: words found in many records (MEALS, VENUE, TRAINING) count little, rare words
     * (KYOCERA, HATCHERY) count a lot. docs = the words of each record.
     */
    public static Weights weights(List<List<String>> docs) {
        Map<String, Integer> count = new HashMap<>();
        for (List<String> doc : docs) for (String w : new HashSet<>(doc)) count.merge(w, 1, Integer::sum);
        double n = docs.size() + 1;
        Map<String, Double> weights = new HashMap<>();
        count.forEach((w, c) -> weights.put(w, Math.log(n / c)));
        return new Weights(weights, Math.log(n));
    }

    public record Weights(Map<String, Double> known, double unknown) {

        double of(String word) {
            return Math.max(known.getOrDefault(word, unknown), 0.05);
        }
    }

    /** 0..1, how alike two word lists are; 0 when they are not alike enough to mention. */
    public static double similarity(List<String> a, List<String> b, Weights weights) {
        if (a.isEmpty() || b.isEmpty()) return 0;
        Set<String> inB = new HashSet<>(b);
        List<String> common = a.stream().filter(inB::contains).toList();
        if (common.isEmpty()) return 0;
        double wa = a.stream().mapToDouble(weights::of).sum();
        double wb = b.stream().mapToDouble(weights::of).sum();
        double wc = common.stream().mapToDouble(weights::of).sum();
        double dice = 2 * wc / (wa + wb);
        if (dice >= MIN) return dice;
        // a short title found inside a longer one: "Risk Management Training" in "Materials for the Risk Management Training"
        double inside = wc / Math.min(wa, wb);
        if (common.size() >= 2 && inside >= 0.85) return Math.max(MIN, inside * 0.8);
        return 0;
    }
}
