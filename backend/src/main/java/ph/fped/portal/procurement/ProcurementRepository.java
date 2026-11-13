package ph.fped.portal.procurement;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface ProcurementRepository extends JpaRepository<Procurement, Long> {

    @Query("select p from Procurement p join fetch p.office order by p.id")
    List<Procurement> findAllWithOffice();

    /** Records of this fiscal year and later (early procurements for next year). */
    @Query("select p from Procurement p join fetch p.office where p.fiscalYear >= :year order by p.id")
    List<Procurement> findFromYear(@Param("year") int year);

    @Query("select p.code from Procurement p where p.code like concat(:prefix, '%')")
    List<String> findCodesStartingWith(@Param("prefix") String prefix);

    @Query("select distinct p.fiscalYear from Procurement p")
    List<Integer> findYears();
}
