package ph.fped.portal.common;

import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Component;

/**
 * Makes saves of one module happen one after the other. Without it, two people saving at the same moment
 * could both pass a check (overlap, duplicate) or get the same next number.
 */
@Component
public class AppLock {

    public static final String TRAVEL = "travel";
    public static final String PROCUREMENT = "procurement";

    private final EntityManager em;

    public AppLock(EntityManager em) {
        this.em = em;
    }

    /** Waits until nobody else holds this lock; it is held until the caller's transaction ends. */
    public void hold(String name) {
        em.createNativeQuery("select name from app_locks where name = :name for update").setParameter("name", name).getResultList();
    }
}
