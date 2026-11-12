package ph.fped.portal.procurement;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface BudgetRepository extends JpaRepository<Budget, Long> {

    @Query("select b from Budget b join fetch b.office where b.year = :year")
    List<Budget> findOfYear(@Param("year") int year);

    @Query("select b from Budget b where b.year = :year and b.office.id = :officeId")
    Optional<Budget> find(@Param("year") int year, @Param("officeId") long officeId);
}
