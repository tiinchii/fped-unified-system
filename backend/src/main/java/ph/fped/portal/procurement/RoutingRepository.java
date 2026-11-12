package ph.fped.portal.procurement;

import org.springframework.data.jpa.repository.JpaRepository;

interface RoutingRepository extends JpaRepository<RoutingEntry, Long> {}
