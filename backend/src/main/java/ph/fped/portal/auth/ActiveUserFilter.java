package ph.fped.portal.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;
import ph.fped.portal.user.User;
import ph.fped.portal.user.UserRepository;

/**
 * A login lasts 8 hours, but an Admin may deactivate a user or change their role in the meantime.
 * So every request re-checks the user: deactivated = logged out at once, new role or name = applied at once.
 */
public class ActiveUserFilter extends OncePerRequestFilter {

    private final UserRepository users;
    private final SecurityContextRepository contextRepository;

    public ActiveUserFilter(UserRepository users, SecurityContextRepository contextRepository) {
        this.users = users;
        this.contextRepository = contextRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof PortalPrincipal principal) {
            User user = users.findById(principal.id()).orElse(null);
            if (user == null || !user.isActive()) {
                HttpSession session = request.getSession(false);
                if (session != null) session.invalidate();
                SecurityContextHolder.clearContext();
            } else {
                PortalPrincipal current = PortalPrincipal.of(user);
                if (!current.equals(principal)) {
                    SecurityContext context = SecurityContextHolder.createEmptyContext();
                    context.setAuthentication(current.toAuthentication());
                    SecurityContextHolder.setContext(context);
                    contextRepository.saveContext(context, request, response);
                }
            }
        }
        chain.doFilter(request, response);
    }
}
