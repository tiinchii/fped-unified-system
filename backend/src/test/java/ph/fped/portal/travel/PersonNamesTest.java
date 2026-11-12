package ph.fped.portal.travel;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PersonNamesTest {

    @Test
    void twoSpellingsOfOneNameGiveTheSameKey() {
        assertThat(PersonNames.key("Rinalyn B. Dumol,")).isEqualTo("RINALYN B DUMOL");
        assertThat(PersonNames.key("RINALYN  B DUMOL")).isEqualTo("RINALYN B DUMOL");
        assertThat(PersonNames.key("Juan A. Dela Cruz Jr.")).isEqualTo(PersonNames.key("JUAN A DELA CRUZ JR"));
    }

    @Test
    void aMissingMiddleInitialIsADifferentKey() {
        // caught on screen as a "similar name" warning, not refused: it may really be another person
        assertThat(PersonNames.key("ABIGAIL JAVIER")).isNotEqualTo(PersonNames.key("ABIGAIL M. JAVIER"));
    }

    @Test
    void textThatIsNotANameGivesNoKey() {
        assertThat(PersonNames.key("")).isEmpty();
        assertThat(PersonNames.key(null)).isEmpty();
        assertThat(PersonNames.key("A. B.")).isEmpty();
        assertThat(PersonNames.key("123")).isEmpty();
    }

    @Test
    void namesAreStoredInCapitalsWithSingleSpaces() {
        assertThat(PersonNames.clean("  Rinalyn   b. Dumol ")).isEqualTo("RINALYN B. DUMOL");
    }
}
