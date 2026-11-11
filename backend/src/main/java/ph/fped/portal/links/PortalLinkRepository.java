package ph.fped.portal.links;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PortalLinkRepository extends JpaRepository<PortalLink, Long> {

    List<PortalLink> findAllByOrderBySortOrderAscNameAsc();

    boolean existsByCode(String code);
}
