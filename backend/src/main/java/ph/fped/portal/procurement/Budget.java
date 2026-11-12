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
import java.time.Instant;
import ph.fped.portal.travel.Office;

/** The budget of an office for one year. The PRs received that year are deducted from it. */
@Entity
@Table(name = "budgets")
public class Budget {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @Column(name = "budget_year", nullable = false)
    int year;

    @ManyToOne(optional = false)
    @JoinColumn(name = "office_id", nullable = false)
    Office office;

    @Column(nullable = false, precision = 15, scale = 2)
    BigDecimal amount;

    @Column(name = "updated_by", nullable = false, length = 60)
    String updatedBy;

    @Column(name = "updated_at", nullable = false)
    Instant updatedAt;

    protected Budget() {}

    Budget(int year, Office office) {
        this.year = year;
        this.office = office;
    }
}
