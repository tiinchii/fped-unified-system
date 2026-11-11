package ph.fped.portal.user;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public final class UserDtos {

    private UserDtos() {}

    public record UserView(long id, String username, String fullName, Role role, boolean active,
                           boolean locked, @Schema(nullable = true) Instant lastLoginAt, Instant createdAt) {

        public static UserView of(User u) {
            return new UserView(u.getId(), u.getUsername(), u.getFullName(), u.getRole(), u.isActive(),
                    u.isLocked(Instant.now()), u.getLastLoginAt(), u.getCreatedAt());
        }
    }

    public record CreateUser(
            @NotBlank(message = "Username is required.")
            @Pattern(regexp = "^[a-z0-9._-]{3,30}$", message = "Username: 3–30 small letters, numbers, dot, dash or underscore.")
            String username,
            @NotBlank(message = "Full name is required.") @Size(max = 150) String fullName,
            @NotNull(message = "Role is required.") Role role,
            @NotBlank(message = "Password is required.")
            @Size(min = 8, max = 100, message = "Password must be at least 8 characters.")
            String password) {}

    /** password is optional: blank keeps the current one. */
    public record UpdateUser(
            @NotBlank(message = "Full name is required.") @Size(max = 150) String fullName,
            @NotNull(message = "Role is required.") Role role,
            @NotNull Boolean active,
            @Size(max = 100) String password) {}
}
