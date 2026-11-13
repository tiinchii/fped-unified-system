package ph.fped.portal.travel;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Entity
@Table(name = "travel_orders")
public class TravelOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** TO-2026-00001: the ID already used in the old system. */
    @Column(nullable = false, unique = true, length = 20, updatable = false)
    private String code;

    @Column(name = "date_filed", nullable = false)
    private LocalDate dateFiled;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "office_id", nullable = false)
    private Office office;

    @Column(nullable = false, length = 500)
    private String destination;

    @Column(nullable = false, length = 2000)
    private String purpose;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "dts_no", length = 100)
    private String dtsNo;

    @Column(name = "to_no", length = 100)
    private String toNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TravelStatus status = TravelStatus.ACTIVE;

    @Column(length = 2000)
    private String remarks;

    @Column(name = "overlap_reason", length = 1000)
    private String overlapReason;

    @Column(name = "encoded_by", nullable = false, length = 60, updatable = false)
    private String encodedBy;

    @Column(name = "encoded_at", nullable = false, updatable = false)
    private Instant encodedAt;

    @Column(name = "updated_by", nullable = false, length = 60)
    private String updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @ManyToMany
    @JoinTable(name = "travel_order_travelers",
            joinColumns = @JoinColumn(name = "travel_order_id"),
            inverseJoinColumns = @JoinColumn(name = "personnel_id"))
    private Set<Personnel> travelers = new LinkedHashSet<>();

    @OneToMany(mappedBy = "travelOrder", cascade = CascadeType.ALL)
    @OrderBy("id")
    private List<TravelOrderChange> changes = new ArrayList<>();

    @OneToMany(mappedBy = "travelOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<TravelOrderDocument> documents = new LinkedHashSet<>();

    protected TravelOrder() {}

    public TravelOrder(String code, String encodedBy, Instant now) {
        this.code = code;
        this.encodedBy = encodedBy;
        this.encodedAt = now;
        touch(encodedBy, now);
    }

    public void touch(String username, Instant now) {
        this.updatedBy = username;
        this.updatedAt = now;
    }

    /** Moves the travel to new dates and/or a new place; the old ones are kept as a change row. */
    public TravelOrderChange change(LocalDate newStart, LocalDate newEnd, String newDestination, String reason,
                                    String username, Instant now) {
        TravelOrderChange change = new TravelOrderChange(this, newStart, newEnd, newDestination, reason, username, now);
        changes.add(change);
        this.startDate = newStart;
        this.endDate = newEnd;
        this.destination = newDestination;
        return change;
    }

    public void addRemark(String note) {
        this.remarks = remarks == null || remarks.isBlank() ? note : remarks + " | " + note;
    }

    public Long getId() { return id; }
    public String getCode() { return code; }
    public LocalDate getDateFiled() { return dateFiled; }
    public void setDateFiled(LocalDate dateFiled) { this.dateFiled = dateFiled; }
    public Office getOffice() { return office; }
    public void setOffice(Office office) { this.office = office; }
    public String getDestination() { return destination; }
    public void setDestination(String destination) { this.destination = destination; }
    public String getPurpose() { return purpose; }
    public void setPurpose(String purpose) { this.purpose = purpose; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }
    public String getDtsNo() { return dtsNo; }
    public void setDtsNo(String dtsNo) { this.dtsNo = dtsNo; }
    public String getToNo() { return toNo; }
    public void setToNo(String toNo) { this.toNo = toNo; }
    public TravelStatus getStatus() { return status; }
    public void setStatus(TravelStatus status) { this.status = status; }
    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }
    public String getOverlapReason() { return overlapReason; }
    public void setOverlapReason(String overlapReason) { this.overlapReason = overlapReason; }
    public String getEncodedBy() { return encodedBy; }
    public Instant getEncodedAt() { return encodedAt; }
    public String getUpdatedBy() { return updatedBy; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Set<Personnel> getTravelers() { return travelers; }
    public List<TravelOrderChange> getChanges() { return changes; }
    public Set<TravelOrderDocument> getDocuments() { return documents; }
}
