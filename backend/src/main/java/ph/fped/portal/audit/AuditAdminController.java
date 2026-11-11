package ph.fped.portal.audit;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Admin only (see SecurityConfig: /api/admin/**). */
@RestController
@RequestMapping("/api/admin/audit")
public class AuditAdminController {

    private static final int MAX_PAGE_SIZE = 200;

    private final AuditRepository repository;

    public AuditAdminController(AuditRepository repository) {
        this.repository = repository;
    }

    public record AuditView(long id, Instant loggedAt, String username, String action,
                            @Schema(nullable = true) String recordId, @Schema(nullable = true) String details) {}

    public record AuditPage(List<AuditView> items, int page, int size, long total) {}

    @GetMapping
    public AuditPage list(@RequestParam(defaultValue = "") String q,
                          @RequestParam(defaultValue = "0") int page,
                          @RequestParam(defaultValue = "50") int size) {
        int safeSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        Page<AuditEntry> result = repository.search(q.trim().toLowerCase(Locale.ROOT),
                PageRequest.of(Math.max(0, page), safeSize, Sort.by(Sort.Direction.DESC, "id")));
        List<AuditView> items = result.getContent().stream()
                .map(a -> new AuditView(a.getId(), a.getLoggedAt(), a.getUsername(), a.getAction(), a.getRecordId(), a.getDetails()))
                .toList();
        return new AuditPage(items, result.getNumber(), result.getSize(), result.getTotalElements());
    }
}
