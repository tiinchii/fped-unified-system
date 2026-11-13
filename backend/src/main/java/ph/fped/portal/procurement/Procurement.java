package ph.fped.portal.procurement;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import ph.fped.portal.common.Codes;
import ph.fped.portal.procurement.Enums.DocStatus;
import ph.fped.portal.procurement.Enums.ProcType;
import ph.fped.portal.procurement.Enums.ProposalType;
import ph.fped.portal.procurement.Enums.RecordStatus;
import ph.fped.portal.procurement.Enums.RepeatType;
import ph.fped.portal.travel.Office;

/**
 * One procurement (step 1: the proposal), followed through its PRs, SPPMP and routing.
 *
 * <p>The classes of this package read each other's fields directly, so the links between them (record of a PR,
 * the PR a PR replaces, the record a record repeats) are loaded at once, not lazily: a lazy link is a stand-in
 * object whose fields are empty until one of its methods is called.
 */
@Entity
@Table(name = "procurements")
public class Procurement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    /** PROC-2027-00001; the year is the fiscal year, so the ID changes when the fiscal year is changed. */
    @Column(nullable = false, unique = true, length = 20)
    String code;

    @Column(name = "date_received")
    LocalDate dateReceived;

    /** The year whose funds this is for: the year received, or next year for an early procurement. */
    @Column(name = "fiscal_year", nullable = false)
    int fiscalYear;

    @ManyToOne(optional = false)
    @JoinColumn(name = "office_id", nullable = false)
    Office office;

    @Column(name = "prepared_by", length = 150)
    String preparedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "proposal_type", nullable = false, length = 20)
    ProposalType proposalType = ProposalType.NONE;

    @Column(name = "with_atc", nullable = false)
    boolean withAtc;

    @Enumerated(EnumType.STRING)
    @Column(name = "proc_type", nullable = false, length = 20)
    ProcType procType;

    @Column(nullable = false, length = 500)
    String title;

    @Column(name = "item_details", length = 2000)
    String details;

    @Column(length = 500)
    String venue;

    @Column(name = "start_date")
    LocalDate startDate;

    @Column(name = "end_date")
    LocalDate endDate;

    @Column(precision = 15, scale = 2)
    BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "proposal_status", length = 30)
    DocStatus proposalStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "atc_status", length = 30)
    DocStatus atcStatus;

    @Column(name = "dts_no", length = 100)
    String dtsNo;

    @Column(name = "logbook_no", length = 100)
    String logbookNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    RecordStatus status = RecordStatus.ACTIVE;

    @Column(name = "cancelled_at")
    Instant cancelledAt;

    @Column(name = "cancel_requested_by", length = 150)
    String cancelRequestedBy;

    @Column(name = "cancel_reason", length = 500)
    String cancelReason;

    @Column(name = "cancelled_by", length = 60)
    String cancelledBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "repeat_type", length = 20)
    RepeatType repeatType;

    @ManyToOne
    @JoinColumn(name = "repeat_of_id")
    Procurement repeatOf;

    @Column(name = "repeat_note", length = 500)
    String repeatNote;

    @Column(length = 2000)
    String remarks;

    /** "Import 2026" on rows that came from the 2026 file; such rows are checked less strictly. */
    @Column(length = 40)
    String source;

    @Column(name = "encoded_by", nullable = false, length = 60, updatable = false)
    String encodedBy;

    @Column(name = "encoded_at", nullable = false, updatable = false)
    Instant encodedAt;

    @Column(name = "updated_by", nullable = false, length = 60)
    String updatedBy;

    @Column(name = "updated_at", nullable = false)
    Instant updatedAt;

    @OneToMany(mappedBy = "procurement")
    @OrderBy("id")
    List<PurchaseRequest> prs = new ArrayList<>();

    @OneToMany(mappedBy = "procurement", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("happenedAt, id")
    List<RoutingEntry> routing = new ArrayList<>();

    protected Procurement() {}

    Procurement(String code, String encodedBy, Instant now) {
        this.code = code;
        this.encodedBy = encodedBy;
        this.encodedAt = now;
        touch(encodedBy, now);
    }

    void touch(String username, Instant now) {
        this.updatedBy = username;
        this.updatedAt = now;
    }

    boolean isCancelled() {
        return status == RecordStatus.CANCELLED;
    }

    /** The fiscal year: the list it is shown in and the budget its PRs are deducted from. */
    int year() {
        return fiscalYear != 0 ? fiscalYear : dateReceived != null ? dateReceived.getYear() : Codes.yearOf(code);
    }

    /** Received before the year whose funds it is for (e.g. received Nov 2026 for 2027). */
    boolean isEarly() {
        return dateReceived != null && dateReceived.getYear() < year();
    }

    public Long getId() { return id; }
    public String getCode() { return code; }
}
