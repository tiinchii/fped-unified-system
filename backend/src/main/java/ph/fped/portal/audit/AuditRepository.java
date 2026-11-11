package ph.fped.portal.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuditRepository extends JpaRepository<AuditEntry, Long> {

    @Query("""
            select a from AuditEntry a
            where :q = '' or lower(a.username) like concat('%', :q, '%')
               or lower(a.action) like concat('%', :q, '%')
               or lower(coalesce(a.recordId, '')) like concat('%', :q, '%')
               or lower(coalesce(a.details, '')) like concat('%', :q, '%')
            """)
    Page<AuditEntry> search(@Param("q") String q, Pageable pageable);
}
