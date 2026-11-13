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
import ph.fped.portal.procurement.Enums.DocStatus;
import ph.fped.portal.procurement.Enums.Facility;
import ph.fped.portal.procurement.Enums.Plan;
import ph.fped.portal.procurement.Enums.ProcType;
import ph.fped.portal.procurement.Enums.RecordStatus;

/** Step 2: a Purchase Request of a procurement, with its attachments. Its SPPMP items are step 3. */
@Entity
@Table(name = "purchase_requests")
public class PurchaseRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    /** PR-2027-00001 */
    @Column(nullable = false, unique = true, length = 20)
    String code;

    @ManyToOne(optional = false)
    @JoinColumn(name = "procurement_id", nullable = false)
    Procurement procurement;

    @Column(name = "dts_no", length = 100)
    String dtsNo;

    @Column(name = "date_received")
    LocalDate dateReceived;

    @Column(name = "pr_date")
    LocalDate prDate;

    @Column(length = 150)
    String requisitioner;

    @Column(nullable = false, length = 500)
    String title;

    @Column(length = 500)
    String venue;

    @Column(name = "start_date")
    LocalDate startDate;

    @Column(name = "end_date")
    LocalDate endDate;

    @Column(nullable = false, precision = 15, scale = 2)
    BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(length = 10)
    Plan plan;

    @Column(name = "sppmp_justification", length = 2000)
    String justification;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    Facility facility;

    @Column(name = "facility_justification", length = 2000)
    String facilityJustification;

    @Enumerated(EnumType.STRING)
    @Column(name = "pr_status", length = 30)
    DocStatus prStatus;

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

    @ManyToOne
    @JoinColumn(name = "replaces_id")
    PurchaseRequest replaces;

    @Column(length = 2000)
    String remarks;

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

    @OneToMany(mappedBy = "purchaseRequest", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo")
    List<SppmpItem> items = new ArrayList<>();

    protected PurchaseRequest() {}

    PurchaseRequest(String code, Procurement procurement, String encodedBy, Instant now) {
        this.code = code;
        this.procurement = procurement;
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

    /** The fiscal year of its procurement: the budget it is deducted from. */
    int year() {
        return procurement.year();
    }

    /**
     * An attachment is missing (rules of step 2), so the papers go back to the office. PRs from the 2026 file
     * are not checked. The same rules are in the React app (prMissing), which also names what is missing.
     */
    boolean isIncomplete() {
        if (source != null || isCancelled()) return false;
        if (plan == null) return true;
        if (plan == Plan.SPPMP && blank(justification)) return true;
        if (procurement.procType == ProcType.EVENT && facility == null) return true;
        return facility == Facility.NON_GOVERNMENT && blank(facilityJustification);
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    public Long getId() { return id; }
    public String getCode() { return code; }
}
