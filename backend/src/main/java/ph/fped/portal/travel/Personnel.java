package ph.fped.portal.travel;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

/** Master list of names, so the same person is always spelled the same. */
@Entity
@Table(name = "personnel")
public class Personnel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** P0001: the ID already used in the old system. */
    @Column(nullable = false, unique = true, length = 12, updatable = false)
    private String code;

    @Column(nullable = false, length = 150)
    private String name;

    /** See {@link PersonNames#key}; unique, so one person cannot be added twice with a slightly different spelling. */
    @Column(name = "name_key", nullable = false, unique = true, length = 150)
    private String nameKey;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "office_id")
    private Office office;

    @Column(name = "position_title", length = 150)
    private String position;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private Employment employment;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Personnel() {}

    public Personnel(String code) {
        this.code = code;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
        updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public void setName(String name) {
        this.name = name;
        this.nameKey = PersonNames.key(name);
    }

    public Long getId() { return id; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public String getNameKey() { return nameKey; }
    public Office getOffice() { return office; }
    public void setOffice(Office office) { this.office = office; }
    public String getPosition() { return position; }
    public void setPosition(String position) { this.position = position; }
    public Employment getEmployment() { return employment; }
    public void setEmployment(Employment employment) { this.employment = employment; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
