package ph.fped.portal.procurement;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class TitleSimilarityTest {

    @Test
    void fillerWordsNumbersAndMonthsAreLeftOut() {
        assertThat(TitleSimilarity.tokens("Training on Risk Management for CY 2026 (Batch 2)")).containsExactly("TRAINING", "RISK", "MANAGEMENT");
        assertThat(TitleSimilarity.tokens("BFAR Workshops, March 2027")).containsExactly("WORKSHOP");
        assertThat(TitleSimilarity.tokens("Glass class")).containsExactly("GLASS", "CLASS"); // -SS and short words keep their S
    }

    @Test
    void theSameTitleWithAnotherBatchOrYearIsAlike() {
        List<String> a = TitleSimilarity.tokens("BFAR Risk Management Enhancement Training");
        List<String> b = TitleSimilarity.tokens("Risk Management Enhancement Training 2027 (Batch 2)");
        List<String> other = TitleSimilarity.tokens("Procurement of 2 units laptop");
        TitleSimilarity.Weights w = TitleSimilarity.weights(List.of(a, b, other));
        assertThat(TitleSimilarity.similarity(a, b, w)).isEqualTo(1.0);
        assertThat(TitleSimilarity.similarity(a, other, w)).isZero();
    }

    @Test
    void aShortTitleInsideALongerOneIsAlike() {
        List<String> small = TitleSimilarity.tokens("Risk Management Training");
        List<String> big = TitleSimilarity.tokens("Meals and venue for the Risk Management Training of regional focal persons");
        TitleSimilarity.Weights w = TitleSimilarity.weights(List.of(small, big));
        assertThat(TitleSimilarity.similarity(small, big, w)).isGreaterThanOrEqualTo(TitleSimilarity.MIN);
    }

    @Test
    void oneCommonWordIsNotEnough() {
        List<String> a = TitleSimilarity.tokens("Training on hatchery operations");
        List<String> b = TitleSimilarity.tokens("Training on seaweed farming methods");
        TitleSimilarity.Weights w = TitleSimilarity.weights(List.of(a, b));
        assertThat(TitleSimilarity.similarity(a, b, w)).isZero();
    }
}
