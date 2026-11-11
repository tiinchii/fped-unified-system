package ph.fped.portal.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** Who did what, when. Rows are only ever added. */
@Entity
@Table(name = "audit_log")
public class AuditEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "logged_at", nullable = false)
    private Instant loggedAt;

    @Column(nullable = false, length = 60)
    private String username;

    @Column(nullable = false, length = 40)
    private String action;

    @Column(name = "record_id", length = 60)
    private String recordId;

    @Column(length = 1000)
    private String details;

    protected AuditEntry() {}

    public AuditEntry(Instant loggedAt, String username, String action, String recordId, String details) {
        this.loggedAt = loggedAt;
        this.username = username;
        this.action = action;
        this.recordId = recordId;
        this.details = details;
    }

    public Long getId() { return id; }
    public Instant getLoggedAt() { return loggedAt; }
    public String getUsername() { return username; }
    public String getAction() { return action; }
    public String getRecordId() { return recordId; }
    public String getDetails() { return details; }
}
