package ph.fped.portal.links;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import ph.fped.portal.audit.AuditService;
import ph.fped.portal.auth.PortalPrincipal;
import ph.fped.portal.common.ApiException;
import ph.fped.portal.user.Role;

@RestController
public class PortalLinkController {

    private final PortalLinkRepository links;
    private final AuditService audit;

    public PortalLinkController(PortalLinkRepository links, AuditService audit) {
        this.links = links;
        this.audit = audit;
    }

    public record LinkView(long id, String code, String name, @Schema(nullable = true) String description,
                           @Schema(nullable = true) String url, Set<Role> roles,
                           String color, int sortOrder, boolean active) {

        static LinkView of(PortalLink l) {
            return new LinkView(l.getId(), l.getCode(), l.getName(), l.getDescription(), l.getUrl(), l.roleSet(),
                    l.getColor(), l.getSortOrder(), l.isActive());
        }
    }

    /** code is only used when creating; it cannot be changed afterwards. */
    public record SaveLink(
            @Pattern(regexp = "^[a-z0-9-]{2,20}$", message = "Code: 2–20 small letters, numbers or dash.") String code,
            @NotBlank(message = "Name is required.") @Size(max = 80) String name,
            @Size(max = 255) String description,
            @Size(max = 500) @Pattern(regexp = "^$|^https?://\\S+$", message = "The address must start with http:// or https://") String url,
            @NotEmpty(message = "Choose at least one role.") Set<Role> roles,
            @NotBlank @Pattern(regexp = "^#[0-9a-fA-F]{6}$", message = "Color must look like #1f4e79.") String color,
            @Min(1) @Max(999) int sortOrder,
            @NotNull Boolean active) {}

    /** The links the logged-in user may see, for the menu. */
    @GetMapping("/api/links")
    @Transactional(readOnly = true)
    public List<LinkView> mine(@AuthenticationPrincipal PortalPrincipal me) {
        return links.findAllByOrderBySortOrderAscNameAsc().stream()
                .filter(l -> l.isActive() && l.roleSet().contains(me.role()))
                .map(LinkView::of).toList();
    }

    @GetMapping("/api/admin/links")
    @Transactional(readOnly = true)
    public List<LinkView> all() {
        return links.findAllByOrderBySortOrderAscNameAsc().stream().map(LinkView::of).toList();
    }

    @PostMapping("/api/admin/links")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public LinkView create(@AuthenticationPrincipal PortalPrincipal me, @Valid @RequestBody SaveLink req) {
        if (req.code() == null || req.code().isBlank()) throw ApiException.badRequest("Code is required.");
        if (links.existsByCode(req.code())) throw ApiException.conflict("Code \"" + req.code() + "\" is already used.");
        PortalLink link = new PortalLink(req.code());
        apply(link, req);
        links.save(link);
        audit.log(me.username(), "ADD_LINK", link.getCode(), link.getName() + " | " + link.getUrl());
        return LinkView.of(link);
    }

    @PutMapping("/api/admin/links/{id}")
    @Transactional
    public LinkView update(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id, @Valid @RequestBody SaveLink req) {
        PortalLink link = links.findById(id).orElseThrow(() -> ApiException.notFound("Link not found."));
        apply(link, req);
        audit.log(me.username(), "UPDATE_LINK", link.getCode(),
                link.getName() + " | " + link.getUrl() + " | " + (link.isActive() ? "active" : "hidden"));
        return LinkView.of(link);
    }

    private static void apply(PortalLink link, SaveLink req) {
        link.setName(req.name().trim());
        link.setDescription(req.description() == null || req.description().isBlank() ? null : req.description().trim());
        link.setUrl(req.url() == null || req.url().isBlank() ? null : req.url().trim());
        link.setRoleSet(req.roles());
        link.setColor(req.color().toLowerCase());
        link.setSortOrder(req.sortOrder());
        link.setActive(req.active());
    }
}
