package ph.fped.portal.procurement;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;
import ph.fped.portal.procurement.Enums.DocStatus;
import ph.fped.portal.procurement.Enums.Facility;
import ph.fped.portal.procurement.Enums.Plan;
import ph.fped.portal.procurement.Enums.ProcType;
import ph.fped.portal.procurement.Enums.ProposalType;
import ph.fped.portal.procurement.Enums.RecordStatus;
import ph.fped.portal.procurement.Enums.RepeatType;
import ph.fped.portal.procurement.Enums.RouteAction;
import ph.fped.portal.travel.TravelDtos.OfficeView;

public final class ProcurementDtos {

    private ProcurementDtos() {}

    /* ---------- what the API sends ---------- */

    /** When a record or PR was cancelled, who asked for it and why. */
    public record CancelView(Instant at, String requestedBy, String reason, String by) {}

    public record ItemView(String description, BigDecimal amount) {}

    public record PrView(long id, String code, long recordId, String dtsNo, @Schema(nullable = true) LocalDate dateReceived,
                         @Schema(nullable = true) LocalDate prDate, String requisitioner, String title, String venue,
                         @Schema(nullable = true) LocalDate startDate, @Schema(nullable = true) LocalDate endDate,
                         BigDecimal amount, @Schema(nullable = true) Plan plan, String justification,
                         @Schema(nullable = true) Facility facility, String facilityJustification,
                         @Schema(nullable = true) DocStatus prStatus, RecordStatus status,
                         @Schema(nullable = true) CancelView cancel, @Schema(nullable = true) Long replacesId,
                         String remarks, String source, String encodedBy, Instant encodedAt, String updatedBy,
                         List<ItemView> items) {

        static PrView of(PurchaseRequest p) {
            return new PrView(p.id, p.code, p.procurement.id, text(p.dtsNo), p.dateReceived, p.prDate, text(p.requisitioner),
                    p.title, text(p.venue), p.startDate, p.endDate, p.amount, p.plan, text(p.justification), p.facility,
                    text(p.facilityJustification), p.prStatus, p.status,
                    p.isCancelled() ? new CancelView(p.cancelledAt, text(p.cancelRequestedBy), text(p.cancelReason), text(p.cancelledBy)) : null,
                    p.replaces == null ? null : p.replaces.id, text(p.remarks), text(p.source), p.encodedBy, p.encodedAt,
                    p.updatedBy, p.items.stream().map(i -> new ItemView(i.description, i.amount)).toList());
        }
    }

    public record RouteView(long id, @Schema(nullable = true) Long prId, Instant happenedAt, RouteAction action,
                            String person, String remarks, String encodedBy) {

        static RouteView of(RoutingEntry e) {
            return new RouteView(e.id, e.purchaseRequest == null ? null : e.purchaseRequest.id, e.happenedAt, e.action,
                    e.person, text(e.remarks), e.encodedBy);
        }
    }

    /** A record with everything: its PRs (with SPPMP items) and its routing. */
    /** fiscalYear = the year whose funds it is for; early = received before that year. */
    public record RecordView(long id, String code, @Schema(nullable = true) LocalDate dateReceived, int fiscalYear, boolean early, long officeId,
                             String office, String preparedBy, ProposalType proposalType, boolean withAtc,
                             ProcType procType, String title, String details, String venue,
                             @Schema(nullable = true) LocalDate startDate, @Schema(nullable = true) LocalDate endDate,
                             @Schema(nullable = true) BigDecimal amount, @Schema(nullable = true) DocStatus proposalStatus,
                             @Schema(nullable = true) DocStatus atcStatus, String dtsNo, String logbookNo,
                             RecordStatus status, @Schema(nullable = true) CancelView cancel,
                             @Schema(nullable = true) RepeatType repeatType, @Schema(nullable = true) Long repeatOfId,
                             String repeatNote, String remarks, String source, String encodedBy, Instant encodedAt,
                             String updatedBy, List<PrView> prs, List<RouteView> routing) {

        static RecordView of(Procurement r) {
            return new RecordView(r.id, r.code, r.dateReceived, r.year(), r.isEarly(), r.office.getId(), r.office.getName(), text(r.preparedBy),
                    r.proposalType, r.withAtc, r.procType, r.title, text(r.details), text(r.venue), r.startDate, r.endDate,
                    r.amount, r.proposalStatus, r.atcStatus, text(r.dtsNo), text(r.logbookNo), r.status,
                    r.isCancelled() ? new CancelView(r.cancelledAt, text(r.cancelRequestedBy), text(r.cancelReason), text(r.cancelledBy)) : null,
                    r.repeatType, r.repeatOf == null ? null : r.repeatOf.id, text(r.repeatNote), text(r.remarks),
                    text(r.source), r.encodedBy, r.encodedAt, r.updatedBy,
                    r.prs.stream().map(PrView::of).toList(),
                    r.routing.stream().sorted(Comparator.comparing((RoutingEntry e) -> e.happenedAt).thenComparing(e -> e.id))
                            .map(RouteView::of).toList());
        }
    }

    public record LitePr(long id, String code, String dtsNo, RecordStatus status, String title) {}

    /**
     * Short form of a record of another year: enough for the repeat check, the Repeated page and finding a
     * record by DTS. Opening one fetches its full details.
     */
    public record LiteRecord(long id, String code, @Schema(nullable = true) LocalDate dateReceived, int fiscalYear, boolean early, long officeId,
                             String office, String title, RecordStatus status, @Schema(nullable = true) RepeatType repeatType,
                             @Schema(nullable = true) Long repeatOfId, @Schema(nullable = true) LocalDate startDate,
                             @Schema(nullable = true) LocalDate endDate, ProcType procType, String dtsNo, List<LitePr> prs) {

        static LiteRecord of(Procurement r) {
            return new LiteRecord(r.id, r.code, r.dateReceived, r.year(), r.isEarly(), r.office.getId(), r.office.getName(), r.title, r.status,
                    r.repeatType, r.repeatOf == null ? null : r.repeatOf.id, r.startDate, r.endDate, r.procType, text(r.dtsNo),
                    r.prs.stream().map(p -> new LitePr(p.id, p.code, text(p.dtsNo), p.status, p.title)).toList());
        }
    }

    /** budget is empty when no budget was set; used = PRs of that fiscal year that are not cancelled. */
    public record BudgetLine(long officeId, String office, @Schema(nullable = true) BigDecimal budget, BigDecimal used, int prs) {}

    public record ProcurementData(List<RecordView> records, List<LiteRecord> otherYears, List<BudgetLine> budgets,
                                  List<OfficeView> offices, LocalDate today, int year, List<Integer> years) {}

    /** An earlier record whose title (or a PR title) looks like the one being saved. score is 60–100. */
    public record Similar(long id, String code, int score, String matched, String title, long officeId, String office,
                          @Schema(nullable = true) LocalDate dateReceived, RecordStatus status) {}

    /** The record after a change, with the budget summary of the year shown in the browser. */
    public record RecordResult(RecordView record, List<BudgetLine> budgets) {}

    /**
     * record is empty when nothing was saved: the title looks like an earlier record of the same office (see
     * similar) and it was not said yet whether this is a repeat.
     */
    public record ProposalResult(@Schema(nullable = true) RecordView record, List<Similar> similar, List<BudgetLine> budgets) {}

    /** For the home page: active records of this year and the early ones for next year. */
    public record ProcurementSummary(long forReview, long incompletePrs, long withoutPr) {}

    /* ---------- what the API accepts ---------- */

    /** fiscalYear empty = the year received. */
    public record SaveRecord(
            LocalDate dateReceived,
            Integer fiscalYear,
            @NotNull(message = "Office is required.") Long officeId,
            @Size(max = 150) String preparedBy,
            @NotNull(message = "Choose Activity Proposal, Project Proposal or None.") ProposalType proposalType,
            boolean withAtc,
            @NotNull(message = "Choose the kind of procurement.") ProcType procType,
            @NotBlank(message = "Title is required.") @Size(max = 500, message = "Title is too long.") String title,
            @Size(max = 2000) String details,
            @Size(max = 500) String venue,
            LocalDate startDate,
            LocalDate endDate,
            @DecimalMin(value = "0", message = "Amount cannot be negative.") @Digits(integer = 13, fraction = 2, message = "Amount is too large.") BigDecimal amount,
            DocStatus proposalStatus,
            DocStatus atcStatus,
            @Size(max = 100) String dtsNo,
            @Size(max = 100) String logbookNo,
            @Size(max = 1000, message = "Remarks are too long.") String remarks,
            RepeatType repeatType,
            Long repeatOfId,
            @Size(max = 500) String repeatNote) {}

    public record SavePr(
            @Size(max = 100) String dtsNo,
            @NotNull(message = "Date received of the PR is required.") LocalDate dateReceived,
            LocalDate prDate,
            @Size(max = 150) String requisitioner,
            @NotBlank(message = "Title of the PR is required.") @Size(max = 500, message = "Title is too long.") String title,
            @Size(max = 500) String venue,
            LocalDate startDate,
            LocalDate endDate,
            @NotNull(message = "Amount of the PR is required.") @DecimalMin(value = "0.01", message = "Amount of the PR is required.")
            @Digits(integer = 13, fraction = 2, message = "Amount is too large.") BigDecimal amount,
            Plan plan,
            @Size(max = 2000) String justification,
            Facility facility,
            @Size(max = 2000) String facilityJustification,
            @NotNull(message = "Choose the status of the Purchase Request.") DocStatus prStatus,
            Long replacesId,
            @Size(max = 1000, message = "Remarks are too long.") String remarks) {}

    public record SaveItem(@Size(max = 1000) String description, @Digits(integer = 13, fraction = 2) BigDecimal amount) {}

    public record SaveSppmp(@Size(max = 2000) String justification, @NotNull List<@Valid SaveItem> items) {}

    /** date + time (Philippine time) = when it was cancelled; requestedBy = who said to cancel it. */
    public record CancelRequest(
            @NotNull(message = "Enter the date and time of the cancellation.") LocalDate date,
            LocalTime time,
            @NotBlank(message = "Enter who asked for the cancellation.") @Size(max = 150) String requestedBy,
            @NotBlank(message = "Please enter the reason for cancelling.") @Size(max = 500) String reason) {}

    public record RestoreRequest(@Size(max = 500) String reason) {}

    /** prId empty = about the proposal / the whole procurement. */
    public record AddRouting(
            Long prId,
            @NotNull(message = "Enter the date and time.") LocalDate date,
            LocalTime time,
            @NotNull(message = "Choose what happened.") RouteAction action,
            @NotBlank(message = "Enter the name of the person.") @Size(max = 150) String person,
            @Size(max = 1000) String remarks) {}

    /** amount empty = remove the budget. */
    public record SaveBudget(
            @NotNull Integer year,
            @NotNull(message = "Office is required.") Long officeId,
            @DecimalMin(value = "0", message = "Enter the budget amount.") @Digits(integer = 13, fraction = 2, message = "Amount is too large.") BigDecimal amount) {}

    private static String text(String s) {
        return s == null ? "" : s;
    }
}
