package ph.fped.portal.procurement;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import ph.fped.portal.procurement.Enums.RouteAction;

/** Step 4: to whom the papers went / who reviewed them, and when. */
@Entity
@Table(name = "routing_entries")
public class RoutingEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "procurement_id", nullable = false)
    Procurement procurement;

    /** Empty = about the proposal / the whole procurement. */
    @ManyToOne
    @JoinColumn(name = "purchase_request_id")
    PurchaseRequest purchaseRequest;

    @Column(name = "happened_at", nullable = false)
    Instant happenedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    RouteAction action;

    @Column(nullable = false, length = 150)
    String person;

    @Column(length = 1000)
    String remarks;

    @Column(name = "encoded_by", nullable = false, length = 60)
    String encodedBy;

    @Column(name = "encoded_at", nullable = false)
    Instant encodedAt;

    protected RoutingEntry() {}

    RoutingEntry(Procurement procurement, PurchaseRequest purchaseRequest, Instant happenedAt, RouteAction action,
                 String person, String remarks, String encodedBy) {
        this.procurement = procurement;
        this.purchaseRequest = purchaseRequest;
        this.happenedAt = happenedAt;
        this.action = action;
        this.person = person;
        this.remarks = remarks;
        this.encodedBy = encodedBy;
        this.encodedAt = Instant.now();
    }
}
