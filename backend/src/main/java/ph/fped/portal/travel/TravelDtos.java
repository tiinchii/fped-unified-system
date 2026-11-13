package ph.fped.portal.travel;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class TravelDtos {

    private TravelDtos() {}

    /* ---------- what the API sends ---------- */

    public record OfficeView(long id, String name, boolean active) {

        public static OfficeView of(Office o) {
            return new OfficeView(o.getId(), o.getName(), o.isActive());
        }
    }

    public record PersonView(long id, String code, String name, @Schema(nullable = true) Long officeId, String office,
                             String position, @Schema(nullable = true) Employment employment, boolean active) {

        static PersonView of(Personnel p) {
            Office o = p.getOffice();
            return new PersonView(p.getId(), p.getCode(), p.getName(), o == null ? null : o.getId(),
                    o == null ? "" : o.getName(), text(p.getPosition()), p.getEmployment(), p.isActive());
        }
    }

    public record ChangeView(long id, LocalDate oldStartDate, LocalDate oldEndDate, LocalDate newStartDate,
                             LocalDate newEndDate, String oldDestination, String newDestination, String reason,
                             String changedBy, Instant changedAt) {

        static ChangeView of(TravelOrderChange c) {
            return new ChangeView(c.getId(), c.getOldStartDate(), c.getOldEndDate(), c.getNewStartDate(),
                    c.getNewEndDate(), c.getOldDestination(), c.getNewDestination(), c.getReason(), c.getChangedBy(),
                    c.getChangedAt());
        }
    }

    public record OrderView(long id, String code, LocalDate dateFiled, long officeId, String office, String destination,
                            String purpose, LocalDate startDate, LocalDate endDate, String dtsNo, String toNo,
                            TravelStatus status, String remarks, String overlapReason, String encodedBy,
                            Instant encodedAt, String updatedBy, Instant updatedAt, List<Long> travelerIds,
                            List<ChangeView> changes, List<CheckedDocument> checklist) {

        static OrderView of(TravelOrder t) {
            return new OrderView(t.getId(), t.getCode(), t.getDateFiled(), t.getOffice().getId(), t.getOffice().getName(),
                    t.getDestination(), t.getPurpose(), t.getStartDate(), t.getEndDate(), text(t.getDtsNo()),
                    text(t.getToNo()), t.getStatus(), text(t.getRemarks()), text(t.getOverlapReason()),
                    t.getEncodedBy(), t.getEncodedAt(), t.getUpdatedBy(), t.getUpdatedAt(),
                    t.getTravelers().stream().map(Personnel::getId).toList(),
                    t.getChanges().stream().map(ChangeView::of).toList(),
                    t.getDocuments().stream().map(d -> new CheckedDocument(d.getType().getId(), d.getCheckedBy(), d.getCheckedAt()))
                            .sorted(java.util.Comparator.comparing(CheckedDocument::typeId)).toList());
        }
    }

    /** A document of the checklist that is there, and who ticked it when. */
    public record CheckedDocument(long typeId, String checkedBy, Instant checkedAt) {}

    public record DocumentTypeView(long id, String name, int sortOrder, boolean active) {

        static DocumentTypeView of(DocumentType d) {
            return new DocumentTypeView(d.getId(), d.getName(), d.getSortOrder(), d.isActive());
        }
    }

    /** A traveler already has this other travel on the dates asked for. */
    public record Conflict(long personId, String personName, long orderId, String orderCode, LocalDate startDate,
                           LocalDate endDate, String destination, String office) {}

    public record Window(LocalDate from, LocalDate to) {}

    /**
     * Everything the Travel Orders screens need for one year. Travel orders from December of the year before to
     * January of the year after are included, so overlaps across New Year are still seen.
     */
    public record TravelData(List<OrderView> orders, List<PersonView> people, List<OfficeView> offices,
                             List<DocumentTypeView> documentTypes, LocalDate today, int year, Window window, List<Integer> years) {}

    /**
     * order is empty when nothing was saved: a traveler has other travel on those dates (see conflicts) and no
     * reason for allowing the overlap was given.
     */
    public record SaveResult(@Schema(nullable = true) OrderView order, List<Conflict> conflicts) {}

    /** For the home page. */
    public record Summary(LocalDate today, long onTravelToday, long startingIn7Days, long withoutToNo, long checklistIncomplete) {}

    /* ---------- what the API accepts ---------- */

    public record SaveOrder(
            @NotNull(message = "Start date is required.") LocalDate startDate,
            @NotNull(message = "End date is required.") LocalDate endDate,
            LocalDate dateFiled,
            @NotNull(message = "Office is required.") Long officeId,
            @NotBlank(message = "Destination is required.") @Size(max = 500, message = "Destination is too long.") String destination,
            @NotBlank(message = "Purpose is required.") @Size(max = 2000, message = "Purpose is too long.") String purpose,
            @Size(max = 100, message = "DTS No. is too long.") String dtsNo,
            @Size(max = 100, message = "TO No. is too long.") String toNo,
            @Size(max = 1000, message = "Remarks are too long.") String remarks,
            @NotEmpty(message = "Add at least one traveler.") List<@NotNull Long> travelerIds,
            @Size(max = 1000, message = "The reason is too long.") String overlapReason,
            List<@NotNull Long> checkedDocumentIds) {}

    /** The documents of the checklist that are there; the others are taken as missing. */
    public record SaveChecklist(@NotNull List<@NotNull Long> checkedDocumentIds) {}

    public record SaveDocumentType(
            @NotBlank(message = "Name is required.") @Size(max = 150, message = "Name is too long.") String name,
            Integer sortOrder,
            Boolean active) {}

    public record StatusChange(@Size(max = 500, message = "The reason is too long.") String reason) {}

    /** destination blank = keep the current place. */
    public record Reschedule(
            @NotNull(message = "New start date is required.") LocalDate startDate,
            @NotNull(message = "New end date is required.") LocalDate endDate,
            @Size(max = 500, message = "Destination is too long.") String destination,
            @NotBlank(message = "Please enter the reason for the change.") @Size(max = 500, message = "The reason is too long.") String reason,
            @Size(max = 1000, message = "The reason is too long.") String overlapReason) {}

    public record SavePerson(
            @NotBlank(message = "Name is required.") @Size(max = 150, message = "Name is too long.") String name,
            Long officeId,
            @Size(max = 150, message = "Position is too long.") String position,
            Employment employment,
            Boolean active) {}

    public record SaveOffice(
            @NotBlank(message = "Name is required.") @Size(max = 60, message = "Name is too long.") String name,
            Boolean active) {}

    private static String text(String s) {
        return s == null ? "" : s;
    }
}
