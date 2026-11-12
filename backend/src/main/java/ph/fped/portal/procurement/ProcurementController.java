package ph.fped.portal.procurement;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import ph.fped.portal.auth.PortalPrincipal;
import ph.fped.portal.procurement.ProcurementDtos.AddRouting;
import ph.fped.portal.procurement.ProcurementDtos.BudgetLine;
import ph.fped.portal.procurement.ProcurementDtos.CancelRequest;
import ph.fped.portal.procurement.ProcurementDtos.ProcurementData;
import ph.fped.portal.procurement.ProcurementDtos.ProposalResult;
import ph.fped.portal.procurement.ProcurementDtos.RecordResult;
import ph.fped.portal.procurement.ProcurementDtos.RecordView;
import ph.fped.portal.procurement.ProcurementDtos.RestoreRequest;
import ph.fped.portal.procurement.ProcurementDtos.SaveBudget;
import ph.fped.portal.procurement.ProcurementDtos.SavePr;
import ph.fped.portal.procurement.ProcurementDtos.SaveRecord;
import ph.fped.portal.procurement.ProcurementDtos.SaveSppmp;
import ph.fped.portal.procurement.ProcurementDtos.ProcurementSummary;

/**
 * Everyone who is logged in may read; only Admin and Encoder may change (see SecurityConfig: /api/procurement/**).
 * "year" on a change is the year shown in the browser: the budget summary of that year comes back with the answer.
 */
@RestController
@RequestMapping("/api/procurement")
public class ProcurementController {

    private final ProcurementService service;

    public ProcurementController(ProcurementService service) {
        this.service = service;
    }

    @GetMapping("/data")
    public ProcurementData data(@RequestParam(required = false) Integer year) {
        return service.data(year);
    }

    @GetMapping("/summary")
    public ProcurementSummary summary() {
        return service.summary();
    }

    @GetMapping("/records/{id}")
    public RecordView record(@PathVariable long id) {
        return service.record(id);
    }

    @PostMapping("/records")
    public ProposalResult createRecord(@AuthenticationPrincipal PortalPrincipal me, @Valid @RequestBody SaveRecord req,
                                       @RequestParam(required = false) Integer year) {
        return service.saveRecord(me.username(), null, req, year);
    }

    @PutMapping("/records/{id}")
    public ProposalResult updateRecord(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                                       @Valid @RequestBody SaveRecord req, @RequestParam(required = false) Integer year) {
        return service.saveRecord(me.username(), id, req, year);
    }

    @PostMapping("/records/{id}/cancel")
    public RecordResult cancelRecord(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                                     @Valid @RequestBody CancelRequest req, @RequestParam(required = false) Integer year) {
        return service.cancelRecord(me.username(), id, req, year);
    }

    @PostMapping("/records/{id}/restore")
    public RecordResult restoreRecord(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                                      @Valid @RequestBody RestoreRequest req, @RequestParam(required = false) Integer year) {
        return service.restoreRecord(me.username(), id, req.reason(), year);
    }

    @PostMapping("/records/{id}/prs")
    public RecordResult createPr(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                                 @Valid @RequestBody SavePr req, @RequestParam(required = false) Integer year) {
        return service.savePr(me.username(), id, null, req, year);
    }

    @PutMapping("/records/{id}/prs/{prId}")
    public RecordResult updatePr(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id, @PathVariable long prId,
                                 @Valid @RequestBody SavePr req, @RequestParam(required = false) Integer year) {
        return service.savePr(me.username(), id, prId, req, year);
    }

    @PutMapping("/prs/{prId}/sppmp")
    public RecordResult saveSppmp(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long prId,
                                  @Valid @RequestBody SaveSppmp req, @RequestParam(required = false) Integer year) {
        return service.saveSppmp(me.username(), prId, req, year);
    }

    @PostMapping("/prs/{prId}/cancel")
    public RecordResult cancelPr(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long prId,
                                 @Valid @RequestBody CancelRequest req, @RequestParam(required = false) Integer year) {
        return service.cancelPr(me.username(), prId, req, year);
    }

    @PostMapping("/prs/{prId}/restore")
    public RecordResult restorePr(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long prId,
                                  @Valid @RequestBody RestoreRequest req, @RequestParam(required = false) Integer year) {
        return service.restorePr(me.username(), prId, req.reason(), year);
    }

    @PostMapping("/records/{id}/routing")
    public RecordResult addRouting(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long id,
                                   @Valid @RequestBody AddRouting req, @RequestParam(required = false) Integer year) {
        return service.addRouting(me.username(), id, req, year);
    }

    @DeleteMapping("/routing/{entryId}")
    public RecordResult deleteRouting(@AuthenticationPrincipal PortalPrincipal me, @PathVariable long entryId,
                                      @RequestParam(required = false) Integer year) {
        return service.deleteRouting(me, entryId, year);
    }

    @PutMapping("/budgets")
    public List<BudgetLine> saveBudget(@AuthenticationPrincipal PortalPrincipal me, @Valid @RequestBody SaveBudget req) {
        return service.saveBudget(me.username(), req);
    }
}
