package ph.fped.portal.auth;

import java.time.Instant;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ph.fped.portal.audit.AuditService;
import ph.fped.portal.common.ApiException;
import ph.fped.portal.config.AppProperties;
import ph.fped.portal.user.User;
import ph.fped.portal.user.UserRepository;
import ph.fped.portal.user.UserService;

@Service
public class AuthService {

    private static final String WRONG = "Wrong username or password.";

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final AuditService audit;
    private final AppProperties.Login settings;
    /** Checked when the username does not exist, so a wrong username takes as long as a wrong password. */
    private final String dummyHash;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, AuditService audit, AppProperties properties) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.audit = audit;
        this.settings = properties.login();
        this.dummyHash = passwordEncoder.encode("not-a-real-password");
    }

    /**
     * Checks the password. Wrong attempts are counted on the user; after too many the username is locked for a while.
     * ApiException does not roll back, so the counter is saved even though the login is refused.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public User login(String rawUsername, String password) {
        String username = rawUsername == null ? "" : rawUsername.trim().toLowerCase(Locale.ROOT);
        String pw = password == null ? "" : password;
        Instant now = Instant.now();

        User user = users.findByUsername(username).orElse(null);
        if (user == null) {
            passwordEncoder.matches(pw, dummyHash);
            throw new ApiException(HttpStatus.UNAUTHORIZED, WRONG);
        }
        if (user.isLocked(now)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many wrong attempts. Try again after " + settings.lockDuration().toMinutes() + " minutes.");
        }
        if (!user.isActive() || !passwordMatches(user, pw)) {
            int fails = user.getFailedAttempts() + 1;
            if (fails >= settings.maxFailedAttempts()) {
                user.setFailedAttempts(0);
                user.setLockedUntil(now.plus(settings.lockDuration()));
                audit.log(username, "LOGIN_LOCKED", username, "Locked after " + fails + " wrong attempts");
            } else {
                user.setFailedAttempts(fails);
            }
            throw new ApiException(HttpStatus.UNAUTHORIZED, WRONG);
        }

        if (user.hasLegacyPassword()) {
            user.setBcryptPassword(passwordEncoder.encode(pw)); // first login here: keep the password, store it with BCrypt
        }
        user.setFailedAttempts(0);
        user.setLockedUntil(null);
        user.setLastLoginAt(now);
        audit.log(username, "LOGIN", username, null);
        return user;
    }

    @Transactional
    public void changePassword(long userId, String currentPassword, String newPassword) {
        User user = users.findById(userId).orElseThrow(() -> ApiException.notFound("User not found."));
        if (newPassword == null || newPassword.length() < UserService.MIN_PASSWORD_LENGTH) {
            throw ApiException.badRequest("New password must be at least " + UserService.MIN_PASSWORD_LENGTH + " characters.");
        }
        if (!passwordMatches(user, currentPassword == null ? "" : currentPassword)) {
            throw ApiException.badRequest("Current password is wrong.");
        }
        user.setBcryptPassword(passwordEncoder.encode(newPassword));
        audit.log(user.getUsername(), "CHANGE_PASSWORD", user.getUsername(), null);
    }

    private boolean passwordMatches(User user, String password) {
        if (user.getPasswordHash() != null) return passwordEncoder.matches(password, user.getPasswordHash());
        if (user.hasLegacyPassword()) return LegacyPasswordHasher.matches(password, user.getLegacySalt(), user.getLegacyHash());
        return false;
    }
}
