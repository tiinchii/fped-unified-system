package ph.fped.portal.travel;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OfficeRepository extends JpaRepository<Office, Long> {

    List<Office> findAllByOrderByNameAsc();

    Optional<Office> findByNameIgnoreCase(String name);
}
