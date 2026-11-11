package ph.fped.portal.auth;

import java.io.Serializable;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import ph.fped.portal.user.Role;
import ph.fped.portal.user.User;

/** The logged-in user, as kept in the session. */
public record PortalPrincipal(long id, String username, String fullName, Role role) implements Serializable {

    public static PortalPrincipal of(User u) {
        return new PortalPrincipal(u.getId(), u.getUsername(), u.getFullName(), u.getRole());
    }

    public Authentication toAuthentication() {
        return UsernamePasswordAuthenticationToken.authenticated(this, null,
                List.of(new SimpleGrantedAuthority(role.authority())));
    }
}
