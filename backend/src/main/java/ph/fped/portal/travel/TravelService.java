package ph.fped.portal.travel;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ph.fped.portal.audit.AuditService;
import ph.fped.portal.common.ApiException;
import ph.fped.portal.travel.TravelDtos.Conflict;
import ph.fped.portal.travel.TravelDtos.OfficeView;
import ph.fped.portal.travel.TravelDtos.OrderView;
import ph.fped.portal.travel.TravelDtos.PersonView;
import ph.fped.portal.travel.TravelDtos.Reschedule;
import ph.fped.portal.travel.TravelDtos.SaveOffice;
import ph.fped.portal.travel.TravelDtos.SaveOrder;
import ph.fped.portal.travel.TravelDtos.SavePerson;
import ph.fped.portal.travel.TravelDtos.SaveResult;
import ph.fped.portal.travel.TravelDtos.Summary;
import ph.fped.portal.travel.TravelDtos.TravelData;
import ph.fped.portal.travel.TravelDtos.Window;

/**
 * Travel orders, personnel and offices. The rules are those of the old Travel Order System (Apps Script), so the
 * overlap check gives the same answer on the same data.
 */
@Service
public class TravelService {

    /** "Today" for travel dates is the date in the Philippines, wherever the server is. */
    public static final ZoneId MANILA = ZoneId.of("Asia/Manila");
    static final String EDIT_FORM_REASON = "changed in edit form";
    private static final int MAX_REMARKS = 2000;

    private final TravelOrderRepository orders;
    private final PersonnelRepository personnel;
    private final OfficeRepository offices;
    private final AuditService audit;
    private final EntityManager em;

    public TravelService(TravelOrderRepository orders, PersonnelRepository personnel, OfficeRepository offices,
                         AuditService audit, EntityManager em) {
        this.orders = orders;
        this.personnel = personnel;
        this.offices = offices;
        this.audit = audit;
        this.em = em;
    }

    public static LocalDate today() {
        return LocalDate.now(MANILA);
    }

    /* ======================== reading ======================== */

    @Transactional(readOnly = true)
    public TravelData data(Integer requestedYear) {
        LocalDate today = today();
        int year = requestedYear == null ? today.getYear() : requestedYear;
        if (year < 2000 || year > 2100) throw ApiException.badRequest("Invalid year.");
        Window window = new Window(LocalDate.of(year - 1, 12, 1), LocalDate.of(year + 1, 1, 31));

        Set<Integer> years = new TreeSet<>(Comparator.reverseOrder());
        years.addAll(orders.findYears());
        years.add(today.getYear());
        years.add(today.getYear() + 1); // next year's travel can be encoded early
        years.add(year);

        return new TravelData(
                orders.findInWindow(window.from(), window.to()).stream().map(OrderView::of).toList(),
                personnel.findAllWithOffice().stream().map(PersonView::of).toList(),
                offices.findAllByOrderByNameAsc().stream().map(OfficeView::of).toList(),
                today, year, window, List.copyOf(years));
    }

    @Transactional(readOnly = true)
    public Summary summary() {
        LocalDate today = today();
        return new Summary(today, orders.countPeopleTravelling(today, today),
                orders.countStartingBetween(today.plusDays(1), today.plusDays(7)), orders.countWithoutToNo(today));
    }

    /* ======================== travel orders ======================== */

    /**
     * Creates (id null) or updates a travel order. Nothing is saved when a traveler already has travel on those
     * dates and no overlap reason was given: the answer then lists the conflicts.
     */
    @Transactional
    public SaveResult saveOrder(String actor, Long id, SaveOrder req) {
        LocalDate start = req.startDate(), end = req.endDate();
        if (end.isBefore(start)) throw ApiException.badRequest("End date is earlier than start date.");
        lock();

        Office office = offices.findById(req.officeId()).orElseThrow(() -> ApiException.badRequest("Unknown office."));
        Set<Long> personIds = new LinkedHashSet<>(req.travelerIds());
        List<Personnel> people = personnel.findAllById(personIds);
        if (people.size() != personIds.size()) throw ApiException.badRequest("Unknown person in the travelers.");

        TravelOrder order = id == null ? null : find(id);
        if (order != null && order.getStatus() == TravelStatus.CANCELLED) {
            throw ApiException.badRequest(order.getCode() + " is cancelled. Restore it first before editing.");
        }
        List<Conflict> conflicts = overlaps(personIds, start, end, id);
        String reason = trim(req.overlapReason());
        if (!conflicts.isEmpty() && reason.isEmpty()) return new SaveResult(null, conflicts);

        Instant now = Instant.now();
        LocalDate filed = req.dateFiled() != null ? req.dateFiled() : today();
        String destination = req.destination().trim();
        boolean isNew = order == null;
        if (isNew) {
            order = new TravelOrder(nextOrderCode(filed.getYear()), actor, now);
            order.setStartDate(start);
            order.setEndDate(end);
            order.setDestination(destination);
        } else if (!order.getStartDate().equals(start) || !order.getEndDate().equals(end)
                || !order.getDestination().equals(destination)) {
            // changing the dates or the place in the edit form is also kept in the history
            order.change(start, end, destination, EDIT_FORM_REASON, actor, now);
        }
        order.setDateFiled(filed);
        order.setOffice(office);
        order.setPurpose(req.purpose().trim());
        order.setDtsNo(blankToNull(req.dtsNo()));
        order.setToNo(blankToNull(req.toNo()));
        order.setRemarks(blankToNull(req.remarks()));
        order.setOverlapReason(conflicts.isEmpty() ? null : reason);
        order.getTravelers().retainAll(people);
        order.getTravelers().addAll(people);
        order.touch(actor, now);
        orders.saveAndFlush(order);

        String names = people.stream().map(Personnel::getName).sorted().collect(Collectors.joining(", "));
        audit.log(actor, isNew ? "CREATE_TO" : "UPDATE_TO", order.getCode(),
                start + " to " + end + "; " + names + (conflicts.isEmpty() ? "" : "; OVERLAP ALLOWED: " + reason));
        return new SaveResult(OrderView.of(order), List.of());
    }

    /** A cancelled travel order is kept but no longer counts in the overlap check. */
    @Transactional
    public OrderView cancel(String actor, long id, String reason) {
        lock();
        TravelOrder order = find(id);
        if (order.getStatus() == TravelStatus.CANCELLED) throw ApiException.badRequest(order.getCode() + " is already cancelled.");
        String note = statusNote("CANCELLED", actor, trim(reason));
        order.setStatus(TravelStatus.CANCELLED);
        addRemark(order, note);
        order.touch(actor, Instant.now());
        audit.log(actor, "CANCEL_TO", order.getCode(), note);
        return OrderView.of(order);
    }

    /**
     * Makes a cancelled travel order active again. Like saving, it is refused when the travelers already have
     * other travel on those dates, unless a reason is given.
     */
    @Transactional
    public SaveResult restore(String actor, long id, String reasonText) {
        lock();
        TravelOrder order = find(id);
        if (order.getStatus() == TravelStatus.ACTIVE) throw ApiException.badRequest(order.getCode() + " is not cancelled.");
        List<Conflict> conflicts = overlaps(personIds(order), order.getStartDate(), order.getEndDate(), id);
        String reason = trim(reasonText);
        if (!conflicts.isEmpty() && reason.isEmpty()) return new SaveResult(null, conflicts);

        String note = statusNote("RESTORED", actor, reason);
        order.setStatus(TravelStatus.ACTIVE);
        addRemark(order, note);
        if (!conflicts.isEmpty()) order.setOverlapReason(reason);
        order.touch(actor, Instant.now());
        audit.log(actor, "RESTORE_TO", order.getCode(), note);
        return new SaveResult(OrderView.of(order), List.of());
    }

    /**
     * Moves a travel order to new dates and/or a new place. The TO ID stays the same and the old dates and place
     * are kept in the history. Refused when the travelers have other travel on the new dates, unless an overlap
     * reason is given.
     */
    @Transactional
    public SaveResult reschedule(String actor, long id, Reschedule req) {
        LocalDate start = req.startDate(), end = req.endDate();
        if (end.isBefore(start)) throw ApiException.badRequest("End date is earlier than start date.");
        lock();

        TravelOrder order = find(id);
        if (order.getStatus() == TravelStatus.CANCELLED) {
            throw ApiException.badRequest(order.getCode() + " is cancelled. Restore it first before changing it.");
        }
        String destination = trim(req.destination()).isEmpty() ? order.getDestination() : req.destination().trim();
        boolean datesChanged = !order.getStartDate().equals(start) || !order.getEndDate().equals(end);
        if (!datesChanged && destination.equals(order.getDestination())) {
            throw ApiException.badRequest("The new dates and place are the same as the current ones.");
        }
        // same dates = same overlaps as before, so the check is only needed for new dates
        List<Conflict> conflicts = datesChanged ? overlaps(personIds(order), start, end, id) : List.of();
        String overlapReason = trim(req.overlapReason());
        if (!conflicts.isEmpty() && overlapReason.isEmpty()) return new SaveResult(null, conflicts);

        Instant now = Instant.now();
        TravelOrderChange change = order.change(start, end, destination, req.reason().trim(), actor, now);
        if (datesChanged) order.setOverlapReason(conflicts.isEmpty() ? null : overlapReason);
        order.touch(actor, now);
        orders.saveAndFlush(order); // the new history row gets its id here
        audit.log(actor, "RESCHEDULE_TO", order.getCode(),
                change.describe() + (conflicts.isEmpty() ? "" : "; OVERLAP ALLOWED: " + overlapReason));
        return new SaveResult(OrderView.of(order), List.of());
    }

    /** Active travels of the given people with at least one day inside [start, end], other than travel order excludeId. */
    private List<Conflict> overlaps(Set<Long> personIds, LocalDate start, LocalDate end, Long excludeId) {
        if (personIds.isEmpty()) return List.of();
        return orders.findOverlaps(personIds, start, end, excludeId == null ? -1 : excludeId).stream().map(row -> {
            TravelOrder t = (TravelOrder) row[0];
            Personnel p = (Personnel) row[1];
            return new Conflict(p.getId(), p.getName(), t.getId(), t.getCode(), t.getStartDate(), t.getEndDate(),
                    t.getDestination(), t.getOffice().getName());
        }).toList();
    }

    /** TO-2027-00001, TO-2027-00002, … for the year of the filing date. Caller must hold the lock. */
    private String nextOrderCode(int year) {
        String prefix = "TO-" + year + "-";
        return prefix + String.format("%05d", nextNumber(orders.findCodesStartingWith(prefix), prefix));
    }

    private TravelOrder find(long id) {
        return orders.findById(id).orElseThrow(() -> ApiException.notFound("Travel order not found."));
    }

    private static Set<Long> personIds(TravelOrder order) {
        return order.getTravelers().stream().map(Personnel::getId).collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private static String statusNote(String word, String actor, String reason) {
        return word + " " + today() + " by " + actor + (reason.isEmpty() ? "" : ": " + reason);
    }

    private static void addRemark(TravelOrder order, String note) {
        order.addRemark(note);
        if (order.getRemarks().length() > MAX_REMARKS) {
            throw ApiException.badRequest("The remarks of " + order.getCode() + " are full. Use a shorter reason.");
        }
    }

    /* ======================== personnel ======================== */

    @Transactional
    public PersonView savePerson(String actor, Long id, SavePerson req) {
        String name = PersonNames.clean(req.name());
        String key = PersonNames.key(name);
        if (key.isEmpty()) throw ApiException.badRequest("Please enter a valid name.");
        lock();

        // "ABIGAIL M. JAVIER" and "ABIGAIL M JAVIER," are the same person
        personnel.findByNameKey(key).filter(p -> !p.getId().equals(id)).ifPresent(p -> {
            throw ApiException.conflict(p.getName() + " already exists (" + p.getCode() + ").");
        });
        Office office = req.officeId() == null ? null
                : offices.findById(req.officeId()).orElseThrow(() -> ApiException.badRequest("Unknown office."));

        Personnel person;
        if (id == null) {
            person = new Personnel("P" + String.format("%04d", nextNumber(personnel.findAllCodes(), "P")));
        } else {
            person = personnel.findById(id).orElseThrow(() -> ApiException.notFound("Person not found."));
        }
        person.setName(name);
        person.setOffice(office);
        person.setPosition(blankToNull(req.position()));
        person.setEmployment(req.employment());
        person.setActive(id == null || !Boolean.FALSE.equals(req.active()));
        personnel.save(person);

        audit.log(actor, id == null ? "ADD_PERSON" : "UPDATE_PERSON", person.getCode(),
                String.join(" | ", name, office == null ? "" : office.getName(), Objects.toString(person.getPosition(), ""),
                        person.isActive() ? "active" : "inactive", Objects.toString(person.getEmployment(), "")));
        return PersonView.of(person);
    }

    /* ======================== offices (Admin) ======================== */

    @Transactional
    public OfficeView saveOffice(String actor, Long id, SaveOffice req) {
        String name = req.name().replaceAll("\\s+", " ").trim().toUpperCase(Locale.ROOT);
        lock();
        offices.findByNameIgnoreCase(name).filter(o -> !o.getId().equals(id)).ifPresent(o -> {
            throw ApiException.conflict("Office " + o.getName() + " already exists.");
        });
        Office office;
        if (id == null) {
            office = new Office(name);
        } else {
            office = offices.findById(id).orElseThrow(() -> ApiException.notFound("Office not found."));
            office.setName(name);
            office.setActive(!Boolean.FALSE.equals(req.active()));
        }
        offices.save(office);
        audit.log(actor, id == null ? "ADD_OFFICE" : "UPDATE_OFFICE", name, office.isActive() ? "active" : "hidden");
        return OfficeView.of(office);
    }

    /* ======================== helpers ======================== */

    /**
     * Waits until nobody else is saving, and holds the lock until this save is finished. Without it, two people
     * saving at the same moment could both pass the overlap check or get the same TO number.
     */
    private void lock() {
        em.createNativeQuery("select name from app_locks where name = 'travel' for update").getResultList();
    }

    /** One more than the highest number in use among the codes that start with the prefix. */
    private static int nextNumber(List<String> codes, String prefix) {
        int max = 0;
        for (String code : codes) {
            if (!code.startsWith(prefix)) continue;
            try {
                max = Math.max(max, Integer.parseInt(code.substring(prefix.length())));
            } catch (NumberFormatException e) {
                // not one of ours (e.g. typed by hand in the old sheet): ignore
            }
        }
        return max + 1;
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
