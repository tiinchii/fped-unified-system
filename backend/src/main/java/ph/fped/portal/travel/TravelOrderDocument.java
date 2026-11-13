package ph.fped.portal.travel;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

/** A ticked line of the checklist of a travel order: this document is there. */
@Entity
@Table(name = "travel_order_documents")
public class TravelOrderDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "travel_order_id", nullable = false)
    private TravelOrder travelOrder;

    @ManyToOne(optional = false)
    @JoinColumn(name = "document_type_id", nullable = false)
    private DocumentType type;

    @Column(name = "checked_by", nullable = false, length = 60)
    private String checkedBy;

    @Column(name = "checked_at", nullable = false)
    private Instant checkedAt;

    protected TravelOrderDocument() {}

    TravelOrderDocument(TravelOrder travelOrder, DocumentType type, String checkedBy, Instant checkedAt) {
        this.travelOrder = travelOrder;
        this.type = type;
        this.checkedBy = checkedBy;
        this.checkedAt = checkedAt;
    }

    public DocumentType getType() { return type; }
    public String getCheckedBy() { return checkedBy; }
    public Instant getCheckedAt() { return checkedAt; }
}
