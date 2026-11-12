package ph.fped.portal.travel;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ph.fped.portal.auth.PortalPrincipal;
import ph.fped.portal.travel.TravelDtos.OfficeView;
import ph.fped.portal.travel.TravelDtos.SaveOffice;

/** Admin only (see SecurityConfig: /api/admin/**). The list itself comes with /api/travel/data. */
@RestController
@RequestMapping("/api/admin/offices")
public class OfficeAdminController {

    private final TravelService service;

    public OfficeAdminController(TravelService service) {
        this.service = service;
    }

    @PostMapping
    public OfficeView create(@AuthenticationPrincipal PortalPrincipal me, @Valid @RequestBody SaveOffice req) {
        return service.saveOffice(me.username(), null, req);
    }

    @PutMapping("/{id}")
    public OfficeView update(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                             @Valid @RequestBody SaveOffice req) {
        return service.saveOffice(me.username(), id, req);
    }
}
