package ph.fped.portal.procurement;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/** Step 3: one line (activity / item / description + amount) of the SPPMP of a PR. */
@Entity
@Table(name = "sppmp_items")
public class SppmpItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "purchase_request_id", nullable = false)
    PurchaseRequest purchaseRequest;

    @Column(name = "line_no", nullable = false)
    int lineNo;

    @Column(nullable = false, length = 1000)
    String description;

    @Column(nullable = false, precision = 15, scale = 2)
    BigDecimal amount;

    protected SppmpItem() {}

    SppmpItem(PurchaseRequest purchaseRequest, int lineNo, String description, BigDecimal amount) {
        this.purchaseRequest = purchaseRequest;
        this.lineNo = lineNo;
        this.description = description;
        this.amount = amount;
    }
}
