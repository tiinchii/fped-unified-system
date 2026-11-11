package ph.fped.portal.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Expected values were computed with the same steps as hash_() in the old Apps Script (Code.gs), in Node. */
class LegacyPasswordHasherTest {

    @Test
    void sameHashAsTheOldAppsScript() {
        assertThat(LegacyPasswordHasher.hash("cicel-test-pass", "3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab"))
                .isEqualTo("Vt3nnVTdH3HoniDHt3pl1Uj96bh9oq4u6mEx7MJAWP0=");
    }

    @Test
    void lettersOutsideAsciiAreHashedAsUtf8() {
        assertThat(LegacyPasswordHasher.hash("Pässword ñ 123", "salt-2"))
                .isEqualTo("5im69Czyzz0tgB07xd1Zq1XDX0URAKJRVxseeHbHuf0=");
    }

    @Test
    void matchesOnlyTheRightPassword() {
        String salt = "3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab", hash = "Vt3nnVTdH3HoniDHt3pl1Uj96bh9oq4u6mEx7MJAWP0=";
        assertThat(LegacyPasswordHasher.matches("cicel-test-pass", salt, hash)).isTrue();
        assertThat(LegacyPasswordHasher.matches("cicel-test-pasS", salt, hash)).isFalse();
    }
}
