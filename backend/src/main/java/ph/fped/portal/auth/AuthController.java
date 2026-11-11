package ph.fped.portal.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import ph.fped.portal.user.Role;
import ph.fped.portal.user.User;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;
    private final SecurityContextRepository contextRepository;

    public AuthController(AuthService auth, SecurityContextRepository contextRepository) {
        this.auth = auth;
        this.contextRepository = contextRepository;
    }

    public record LoginRequest(@NotBlank(message = "Enter your username and password.") String username,
                               @NotBlank(message = "Enter your username and password.") String password) {}

    public record ChangePasswordRequest(@NotBlank(message = "Enter your current password.") String currentPassword,
                                        @NotBlank(message = "Enter a new password.") String newPassword) {}

    public record Me(long id, String username, String fullName, Role role) {

        static Me of(PortalPrincipal p) {
            return new Me(p.id(), p.username(), p.fullName(), p.role());
        }
    }

    @PostMapping("/login")
    public Me login(@Valid @RequestBody LoginRequest req, HttpServletRequest request, HttpServletResponse response) {
        User user = auth.login(req.username(), req.password());
        PortalPrincipal principal = PortalPrincipal.of(user);

        HttpSession old = request.getSession(false);
        if (old != null) request.changeSessionId(); // a session id from before the login must not survive it
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(principal.toAuthentication());
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
        return Me.of(principal);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) session.invalidate();
        SecurityContextHolder.clearContext();
    }

    @GetMapping("/me")
    public Me me(@AuthenticationPrincipal PortalPrincipal principal) {
        return Me.of(principal);
    }

    @PostMapping("/change-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@AuthenticationPrincipal PortalPrincipal principal, @Valid @RequestBody ChangePasswordRequest req) {
        auth.changePassword(principal.id(), req.currentPassword(), req.newPassword());
    }
}
