package ph.fped.portal.procurement;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface PurchaseRequestRepository extends JpaRepository<PurchaseRequest, Long> {

    @Query("select pr.code from PurchaseRequest pr where pr.code like concat(:prefix, '%')")
    List<String> findCodesStartingWith(@Param("prefix") String prefix);

    /** { procurement id, PR title } of every PR, for the repeat check. */
    @Query("select pr.procurement.id, pr.title from PurchaseRequest pr")
    List<Object[]> findAllTitles();

    /** PRs that count against a budget: not cancelled, and their procurement not cancelled. */
    @Query("""
            select pr from PurchaseRequest pr join fetch pr.procurement p join fetch p.office
            where pr.status = ph.fped.portal.procurement.Enums.RecordStatus.ACTIVE
              and p.status = ph.fped.portal.procurement.Enums.RecordStatus.ACTIVE
            """)
    List<PurchaseRequest> findCounted();
}
