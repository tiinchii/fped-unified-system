package ph.fped.portal.user;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import ph.fped.portal.auth.PortalPrincipal;
import ph.fped.portal.user.UserDtos.CreateUser;
import ph.fped.portal.user.UserDtos.UpdateUser;
import ph.fped.portal.user.UserDtos.UserView;

/** Admin only (see SecurityConfig: /api/admin/**). */
@RestController
@RequestMapping("/api/admin/users")
public class UserAdminController {

    private final UserService service;

    public UserAdminController(UserService service) {
        this.service = service;
    }

    @GetMapping
    public List<UserView> list() {
        return service.list().stream().map(UserView::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserView create(@AuthenticationPrincipal PortalPrincipal me, @Valid @RequestBody CreateUser req) {
        return UserView.of(service.create(me.username(), req));
    }

    @PutMapping("/{id}")
    public UserView update(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                           @Valid @RequestBody UpdateUser req) {
        return UserView.of(service.update(me.username(), id, req));
    }
}
