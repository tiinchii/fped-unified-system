package ph.fped.portal.travel;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TravelOrderRepository extends JpaRepository<TravelOrder, Long> {

    /** Travel orders with at least one day inside [from, to]. */
    @Query("""
            select t from TravelOrder t join fetch t.office
            where t.startDate <= :to and t.endDate >= :from
            order by t.startDate desc, t.code desc
            """)
    List<TravelOrder> findInWindow(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /**
     * The overlap check: active travel orders of the given people with at least one day inside [start, end].
     * Each row is { TravelOrder, Personnel }. excludeId is the travel order being saved (-1 for a new one).
     */
    @Query("""
            select t, p from TravelOrder t join t.travelers p
            where p.id in :personIds and t.id <> :excludeId and t.status = ph.fped.portal.travel.TravelStatus.ACTIVE
              and t.startDate <= :end and t.endDate >= :start
            order by p.name, t.startDate, t.code
            """)
    List<Object[]> findOverlaps(@Param("personIds") Collection<Long> personIds, @Param("start") LocalDate start,
                                @Param("end") LocalDate end, @Param("excludeId") long excludeId);

    @Query("select t.code from TravelOrder t where t.code like concat(:prefix, '%')")
    List<String> findCodesStartingWith(@Param("prefix") String prefix);

    @Query("select distinct extract(year from t.startDate) from TravelOrder t")
    List<Integer> findYears();

    @Query("""
            select count(distinct p.id) from TravelOrder t join t.travelers p
            where t.status = ph.fped.portal.travel.TravelStatus.ACTIVE and t.startDate <= :to and t.endDate >= :from
            """)
    long countPeopleTravelling(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select count(t) from TravelOrder t
            where t.status = ph.fped.portal.travel.TravelStatus.ACTIVE and t.startDate >= :from and t.startDate <= :to
            """)
    long countStartingBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select count(t) from TravelOrder t
            where t.status = ph.fped.portal.travel.TravelStatus.ACTIVE and t.endDate >= :from
              and (t.toNo is null or t.toNo = '')
            """)
    long countWithoutToNo(@Param("from") LocalDate from);
}
