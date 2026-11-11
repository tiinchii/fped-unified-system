package ph.fped.portal.user;

import java.util.List;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ph.fped.portal.audit.AuditService;
import ph.fped.portal.common.ApiException;
import ph.fped.portal.user.UserDtos.CreateUser;
import ph.fped.portal.user.UserDtos.UpdateUser;

@Service
public class UserService {

    public static final int MIN_PASSWORD_LENGTH = 8;

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final AuditService audit;

    public UserService(UserRepository users, PasswordEncoder passwordEncoder, AuditService audit) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<User> list() {
        return users.findAllByOrderByUsernameAsc();
    }

    @Transactional
    public User create(String actor, CreateUser req) {
        String username = req.username().trim().toLowerCase();
        if (users.existsByUsername(username)) {
            throw ApiException.conflict("Username \"" + username + "\" is already taken.");
        }
        User u = new User(username, req.fullName().trim(), req.role());
        u.setBcryptPassword(passwordEncoder.encode(req.password()));
        users.save(u);
        audit.log(actor, "ADD_USER", username, req.role().name());
        return u;
    }

    @Transactional
    public User update(String actor, long id, UpdateUser req) {
        User u = users.findById(id).orElseThrow(() -> ApiException.notFound("User not found."));
        boolean self = u.getUsername().equals(actor);
        if (self && (req.role() != Role.ADMIN || !req.active())) {
            throw ApiException.badRequest("You cannot remove your own Admin access.");
        }
        boolean losesAdmin = u.getRole() == Role.ADMIN && u.isActive() && (req.role() != Role.ADMIN || !req.active());
        if (losesAdmin && users.countByRoleAndActiveTrue(Role.ADMIN) <= 1) {
            throw ApiException.badRequest("There must be at least one active Admin.");
        }
        boolean newPassword = req.password() != null && !req.password().isBlank();
        if (newPassword && req.password().length() < MIN_PASSWORD_LENGTH) {
            throw ApiException.badRequest("Password must be at least " + MIN_PASSWORD_LENGTH + " characters.");
        }
        u.setFullName(req.fullName().trim());
        u.setRole(req.role());
        u.setActive(req.active());
        if (newPassword) {
            u.setBcryptPassword(passwordEncoder.encode(req.password()));
            u.setFailedAttempts(0);
            u.setLockedUntil(null);
        }
        audit.log(actor, "UPDATE_USER", u.getUsername(),
                req.role() + ", " + (req.active() ? "active" : "inactive") + (newPassword ? ", password reset" : ""));
        return u;
    }
}
