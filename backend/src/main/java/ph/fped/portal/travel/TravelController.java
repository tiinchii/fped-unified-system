package ph.fped.portal.travel;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import ph.fped.portal.auth.PortalPrincipal;
import ph.fped.portal.travel.TravelDtos.OrderView;
import ph.fped.portal.travel.TravelDtos.PersonView;
import ph.fped.portal.travel.TravelDtos.Reschedule;
import ph.fped.portal.travel.TravelDtos.SaveChecklist;
import ph.fped.portal.travel.TravelDtos.SaveOrder;
import ph.fped.portal.travel.TravelDtos.SavePerson;
import ph.fped.portal.travel.TravelDtos.SaveResult;
import ph.fped.portal.travel.TravelDtos.StatusChange;
import ph.fped.portal.travel.TravelDtos.Summary;
import ph.fped.portal.travel.TravelDtos.TravelData;

/** Everyone who is logged in may read; only Admin and Encoder may change (see SecurityConfig: /api/travel/**). */
@RestController
@RequestMapping("/api/travel")
public class TravelController {

    private final TravelService service;

    public TravelController(TravelService service) {
        this.service = service;
    }

    @GetMapping("/data")
    public TravelData data(@RequestParam(required = false) Integer year) {
        return service.data(year);
    }

    @GetMapping("/summary")
    public Summary summary() {
        return service.summary();
    }

    @PostMapping("/orders")
    public SaveResult createOrder(@AuthenticationPrincipal PortalPrincipal me, @Valid @RequestBody SaveOrder req) {
        return service.saveOrder(me.username(), null, req);
    }

    @PutMapping("/orders/{id}")
    public SaveResult updateOrder(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                                  @Valid @RequestBody SaveOrder req) {
        return service.saveOrder(me.username(), id, req);
    }

    @PutMapping("/orders/{id}/checklist")
    public OrderView saveChecklist(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                                   @Valid @RequestBody SaveChecklist req) {
        return service.saveChecklist(me.username(), id, req.checkedDocumentIds());
    }

    @PostMapping("/orders/{id}/cancel")
    public OrderView cancel(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                            @Valid @RequestBody StatusChange req) {
        return service.cancel(me.username(), id, req.reason());
    }

    @PostMapping("/orders/{id}/restore")
    public SaveResult restore(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                              @Valid @RequestBody StatusChange req) {
        return service.restore(me.username(), id, req.reason());
    }

    @PostMapping("/orders/{id}/reschedule")
    public SaveResult reschedule(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                                 @Valid @RequestBody Reschedule req) {
        return service.reschedule(me.username(), id, req);
    }

    @PostMapping("/personnel")
    public PersonView addPerson(@AuthenticationPrincipal PortalPrincipal me, @Valid @RequestBody SavePerson req) {
        return service.savePerson(me.username(), null, req);
    }

    @PutMapping("/personnel/{id}")
    public PersonView updatePerson(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                                   @Valid @RequestBody SavePerson req) {
        return service.savePerson(me.username(), id, req);
    }
}
