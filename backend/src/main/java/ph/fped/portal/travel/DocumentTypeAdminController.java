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
import ph.fped.portal.travel.TravelDtos.DocumentTypeView;
import ph.fped.portal.travel.TravelDtos.SaveDocumentType;

/** Admin only (see SecurityConfig: /api/admin/**). The list itself comes with /api/travel/data. */
@RestController
@RequestMapping("/api/admin/to-documents")
public class DocumentTypeAdminController {

    private final TravelService service;

    public DocumentTypeAdminController(TravelService service) {
        this.service = service;
    }

    @PostMapping
    public DocumentTypeView create(@AuthenticationPrincipal PortalPrincipal me, @Valid @RequestBody SaveDocumentType req) {
        return service.saveDocumentType(me.username(), null, req);
    }

    @PutMapping("/{id}")
    public DocumentTypeView update(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                                   @Valid @RequestBody SaveDocumentType req) {
        return service.saveDocumentType(me.username(), id, req);
    }
}
