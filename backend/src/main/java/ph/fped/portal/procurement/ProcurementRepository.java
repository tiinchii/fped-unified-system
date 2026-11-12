package ph.fped.portal.procurement;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface ProcurementRepository extends JpaRepository<Procurement, Long> {

    @Query("select p from Procurement p join fetch p.office order by p.id")
    List<Procurement> findAllWithOffice();

    /** Records of one year: by date received, or by the year in the code when there is no date. */
    @Query("""
            select p from Procurement p join fetch p.office
            where (p.dateReceived >= :from and p.dateReceived <= :to)
               or (p.dateReceived is null and p.code like concat(:prefix, '%'))
            order by p.id
            """)
    List<Procurement> findOfYear(@Param("from") LocalDate from, @Param("to") LocalDate to, @Param("prefix") String prefix);

    @Query("select p.code from Procurement p where p.code like concat(:prefix, '%')")
    List<String> findCodesStartingWith(@Param("prefix") String prefix);

    @Query("select distinct extract(year from p.dateReceived) from Procurement p where p.dateReceived is not null")
    List<Integer> findYears();
}
