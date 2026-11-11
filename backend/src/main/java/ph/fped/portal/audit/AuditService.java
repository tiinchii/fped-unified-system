package ph.fped.portal.audit;

import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {

    private static final int MAX_DETAILS = 1000;

    private final AuditRepository repository;

    public AuditService(AuditRepository repository) {
        this.repository = repository;
    }

    /** Joins the caller's transaction, so the entry is saved only if the change itself is. */
    @Transactional
    public void log(String username, String action, String recordId, String details) {
        String d = details == null ? null : details.length() > MAX_DETAILS ? details.substring(0, MAX_DETAILS) : details;
        repository.save(new AuditEntry(Instant.now(), username, action, recordId, d));
    }
}
