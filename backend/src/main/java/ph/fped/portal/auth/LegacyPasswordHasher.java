package ph.fped.portal.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

/**
 * The password hash of the old Apps Script apps (hash_ in Code.gs), so users imported from the Google Sheet
 * can log in with the password they already have:
 *
 *   h = salt + "|" + password;  200 times: h = base64(sha256(h + salt))
 *
 * Only used to check an imported password once; after that the password is stored with BCrypt.
 */
public final class LegacyPasswordHasher {

    private static final int ROUNDS = 200;

    private LegacyPasswordHasher() {}

    public static String hash(String password, String salt) {
        try {
            MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
            String h = salt + "|" + password;
            for (int i = 0; i < ROUNDS; i++) {
                h = Base64.getEncoder().encodeToString(sha256.digest((h + salt).getBytes(StandardCharsets.UTF_8)));
            }
            return h;
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static boolean matches(String password, String salt, String expectedHash) {
        return MessageDigest.isEqual(hash(password, salt).getBytes(StandardCharsets.UTF_8),
                expectedHash.getBytes(StandardCharsets.UTF_8));
    }
}
