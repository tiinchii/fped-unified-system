package ph.fped.portal.travel;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;

/** One change of the dates and/or the place of a travel order. Rows are only ever added. */
@Entity
@Table(name = "travel_order_changes")
public class TravelOrderChange {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "travel_order_id", nullable = false)
    private TravelOrder travelOrder;

    @Column(name = "old_start_date", nullable = false)
    private LocalDate oldStartDate;

    @Column(name = "old_end_date", nullable = false)
    private LocalDate oldEndDate;

    @Column(name = "new_start_date", nullable = false)
    private LocalDate newStartDate;

    @Column(name = "new_end_date", nullable = false)
    private LocalDate newEndDate;

    @Column(name = "old_destination", nullable = false, length = 500)
    private String oldDestination;

    @Column(name = "new_destination", nullable = false, length = 500)
    private String newDestination;

    @Column(nullable = false, length = 1000)
    private String reason;

    @Column(name = "changed_by", nullable = false, length = 60)
    private String changedBy;

    @Column(name = "changed_at", nullable = false)
    private Instant changedAt;

    protected TravelOrderChange() {}

    TravelOrderChange(TravelOrder travelOrder, LocalDate newStartDate, LocalDate newEndDate, String newDestination,
                      String reason, String changedBy, Instant changedAt) {
        this.travelOrder = travelOrder;
        this.oldStartDate = travelOrder.getStartDate();
        this.oldEndDate = travelOrder.getEndDate();
        this.oldDestination = travelOrder.getDestination();
        this.newStartDate = newStartDate;
        this.newEndDate = newEndDate;
        this.newDestination = newDestination;
        this.reason = reason;
        this.changedBy = changedBy;
        this.changedAt = changedAt;
    }

    public boolean datesChanged() {
        return !oldStartDate.equals(newStartDate) || !oldEndDate.equals(newEndDate);
    }

    public boolean placeChanged() {
        return !oldDestination.equals(newDestination);
    }

    /** The same line the old system wrote in its Reschedule History column; used in the audit log. */
    public String describe() {
        return oldStartDate + " to " + oldEndDate + " → " + newStartDate + " to " + newEndDate
                + " · " + reason + (placeChanged() ? " · Place: " + oldDestination + " → " + newDestination : "");
    }

    public Long getId() { return id; }
    public LocalDate getOldStartDate() { return oldStartDate; }
    public LocalDate getOldEndDate() { return oldEndDate; }
    public LocalDate getNewStartDate() { return newStartDate; }
    public LocalDate getNewEndDate() { return newEndDate; }
    public String getOldDestination() { return oldDestination; }
    public String getNewDestination() { return newDestination; }
    public String getReason() { return reason; }
    public String getChangedBy() { return changedBy; }
    public Instant getChangedAt() { return changedAt; }
}
