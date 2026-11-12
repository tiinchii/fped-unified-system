package ph.fped.portal.travel;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PersonnelRepository extends JpaRepository<Personnel, Long> {

    @Query("select p from Personnel p left join fetch p.office order by p.name")
    List<Personnel> findAllWithOffice();

    Optional<Personnel> findByNameKey(String nameKey);

    @Query("select p.code from Personnel p")
    List<String> findAllCodes();
}
