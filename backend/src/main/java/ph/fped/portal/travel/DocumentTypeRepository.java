package ph.fped.portal.travel;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentTypeRepository extends JpaRepository<DocumentType, Long> {

    List<DocumentType> findAllByOrderBySortOrderAscNameAsc();

    List<DocumentType> findAllByActiveTrue();

    Optional<DocumentType> findByNameIgnoreCase(String name);
}
