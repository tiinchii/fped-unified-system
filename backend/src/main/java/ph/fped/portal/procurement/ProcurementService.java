package ph.fped.portal.procurement;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ph.fped.portal.audit.AuditService;
import ph.fped.portal.auth.PortalPrincipal;
import ph.fped.portal.common.ApiException;
import ph.fped.portal.common.AppLock;
import ph.fped.portal.common.Codes;
import ph.fped.portal.procurement.Enums.DocStatus;
import ph.fped.portal.procurement.Enums.Facility;
import ph.fped.portal.procurement.Enums.Plan;
import ph.fped.portal.procurement.Enums.ProcType;
import ph.fped.portal.procurement.Enums.ProposalType;
import ph.fped.portal.procurement.Enums.RecordStatus;
import ph.fped.portal.procurement.Enums.RepeatType;
import ph.fped.portal.procurement.ProcurementDtos.AddRouting;
import ph.fped.portal.procurement.ProcurementDtos.BudgetLine;
import ph.fped.portal.procurement.ProcurementDtos.CancelRequest;
import ph.fped.portal.procurement.ProcurementDtos.LiteRecord;
import ph.fped.portal.procurement.ProcurementDtos.ProcurementData;
import ph.fped.portal.procurement.ProcurementDtos.ProposalResult;
import ph.fped.portal.procurement.ProcurementDtos.RecordResult;
import ph.fped.portal.procurement.ProcurementDtos.RecordView;
import ph.fped.portal.procurement.ProcurementDtos.SaveBudget;
import ph.fped.portal.procurement.ProcurementDtos.SaveItem;
import ph.fped.portal.procurement.ProcurementDtos.SavePr;
import ph.fped.portal.procurement.ProcurementDtos.SaveRecord;
import ph.fped.portal.procurement.ProcurementDtos.SaveSppmp;
import ph.fped.portal.procurement.ProcurementDtos.Similar;
import ph.fped.portal.procurement.ProcurementDtos.ProcurementSummary;
import ph.fped.portal.travel.Office;
import ph.fped.portal.travel.OfficeRepository;
import ph.fped.portal.travel.TravelDtos.OfficeView;
import ph.fped.portal.travel.TravelService;
import ph.fped.portal.user.Role;

/**
 * Procurement records in 4 steps: proposal, Purchase Requests, SPPMP items, routing; plus the budget per office
 * and the repeat check. The rules are those of the old Procurement System (Apps Script).
 */
@Service
public class ProcurementService {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(TravelService.MANILA);
    private static final int MAX_REMARKS = 2000;
    private static final int MAX_SIMILAR = 20;

    private final ProcurementRepository records;
    private final PurchaseRequestRepository prs;
    private final RoutingRepository routing;
    private final BudgetRepository budgets;
    private final OfficeRepository offices;
    private final AuditService audit;
    private final AppLock appLock;

    public ProcurementService(ProcurementRepository records, PurchaseRequestRepository prs, RoutingRepository routing,
                              BudgetRepository budgets, OfficeRepository offices, AuditService audit, AppLock appLock) {
        this.records = records;
        this.prs = prs;
        this.routing = routing;
        this.budgets = budgets;
        this.offices = offices;
        this.audit = audit;
        this.appLock = appLock;
    }

    /* ======================== reading ======================== */

    /**
     * Full details are sent only for the selected year. The repeat check (and finding a record by DTS) also needs
     * the other years, so those are sent in a short form.
     */
    @Transactional(readOnly = true)
    public ProcurementData data(Integer requestedYear) {
        LocalDate today = TravelService.today();
        int year = year(requestedYear);
        List<Procurement> all = records.findAllWithOffice();

        Set<Integer> years = new TreeSet<>(Comparator.reverseOrder());
        years.addAll(records.findYears());
        years.add(today.getYear());
        years.add(today.getYear() + 1); // next year too, so its budgets can be entered early
        years.add(year);

        return new ProcurementData(
                all.stream().filter(r -> r.year() == year).map(RecordView::of).toList(),
                all.stream().filter(r -> r.year() != year).map(LiteRecord::of).toList(),
                budgetLines(year),
                offices.findAllByOrderByNameAsc().stream().map(OfficeView::of).toList(),
                today, year, List.copyOf(years));
    }

    @Transactional(readOnly = true)
    public RecordView record(long id) {
        return RecordView.of(findRecord(id));
    }

    @Transactional(readOnly = true)
    public ProcurementSummary summary() {
        int year = TravelService.today().getYear();
        List<Procurement> active = records.findOfYear(LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31), "PROC-" + year + "-")
                .stream().filter(r -> !r.isCancelled()).toList();
        long forReview = active.stream().filter(ProcurementService::hasReview).count();
        long incomplete = active.stream().flatMap(r -> r.prs.stream()).filter(PurchaseRequest::isIncomplete).count();
        long withoutPr = active.stream().filter(r -> r.prs.stream().allMatch(PurchaseRequest::isCancelled)).count();
        return new ProcurementSummary(forReview, incomplete, withoutPr);
    }

    private static boolean hasReview(Procurement r) {
        return (r.proposalType != ProposalType.NONE && r.proposalStatus == DocStatus.FOR_REVIEW)
                || (r.withAtc && r.atcStatus == DocStatus.FOR_REVIEW)
                || r.prs.stream().anyMatch(p -> !p.isCancelled() && p.prStatus == DocStatus.FOR_REVIEW);
    }

    /* ======================== step 1: the procurement / proposal ======================== */

    /**
     * Creates (id null) or updates a record. Nothing is saved when the title looks like an earlier record of the
     * same office and it was not said yet whether this is a repeat: the answer then lists the look-alikes.
     */
    @Transactional
    public ProposalResult saveRecord(String actor, Long id, SaveRecord req, Integer shownYear) {
        String title = clean(req.title());
        LocalDate received = req.dateReceived() != null ? req.dateReceived() : TravelService.today();
        ProcType type = req.procType();
        boolean hasProposal = req.proposalType() != ProposalType.NONE;
        BigDecimal amount = req.amount() == null ? BigDecimal.ZERO : req.amount();
        if (hasProposal && req.proposalStatus() == null) {
            throw ApiException.badRequest("Choose the status of the " + (req.proposalType() == ProposalType.PROJECT_PROPOSAL ? "Project Proposal" : "Activity Proposal") + ".");
        }
        if (req.withAtc() && req.atcStatus() == null) throw ApiException.badRequest("Choose the status of the Authority to Conduct.");
        if ((hasProposal || req.withAtc()) && amount.signum() <= 0) throw ApiException.badRequest("Amount is required.");

        // only events have a venue and date; hiring has the duration of the contract
        boolean isEvent = type == ProcType.EVENT, isHiring = type == ProcType.HIRING;
        LocalDate start = isEvent || isHiring ? req.startDate() : null;
        LocalDate end = !(isEvent || isHiring) ? null : req.endDate() != null ? req.endDate() : isEvent ? start : null;
        if (isEvent && start == null) throw ApiException.badRequest("Date of the event is required.");
        if (isEvent && clean(req.venue()) == null) throw ApiException.badRequest("Venue of the event is required.");
        if (isHiring && (start == null || end == null)) throw ApiException.badRequest("Duration of the contract (start and end) is required.");
        if (start != null && end != null && end.isBefore(start)) throw ApiException.badRequest("The end date is earlier than the start.");
        // what equipment / what is repaired, one item per line
        String details = !type.hasDetails() || req.details() == null ? null
                : trim(Arrays.stream(req.details().split("\n")).map(ProcurementService::clean).filter(l -> l != null).collect(Collectors.joining("\n")));
        if (type.detailsRequired() && details == null) {
            throw ApiException.badRequest(type == ProcType.REPAIR ? "Enter what will be repaired." : "Enter what equipment.");
        }

        appLock.hold(AppLock.PROCUREMENT);
        Procurement rec = id == null ? null : findRecord(id);
        if (rec != null && rec.isCancelled()) throw ApiException.badRequest(rec.code + " is cancelled. Restore it first before editing.");
        // required, except on records that came from the 2026 file (many of them have none)
        if (rec == null || rec.source == null) {
            if (clean(req.preparedBy()) == null) throw ApiException.badRequest("Prepared by is required.");
            if (clean(req.dtsNo()) == null) throw ApiException.badRequest("DTS No. is required.");
            if (clean(req.logbookNo()) == null) throw ApiException.badRequest("Logbook No. (G#) is required.");
        }
        Office office = offices.findById(req.officeId()).orElseThrow(() -> ApiException.badRequest("Unknown office."));

        // only a look-alike of the same office has to be answered (other offices are shown for information);
        // once the encoder has answered, the check is not needed
        RepeatType repeatType = req.repeatType();
        if (repeatType == null) {
            List<Similar> similar = findSimilar(title, id, office.getId());
            if (similar.stream().anyMatch(s -> s.officeId() == office.getId())) return new ProposalResult(null, similar, budgetLines(year(shownYear)));
        }
        Procurement repeatOf = null;
        if (repeatType != null && repeatType != RepeatType.DIFFERENT && req.repeatOfId() != null) {
            if (req.repeatOfId().equals(id)) throw ApiException.badRequest("A record cannot be a repeat of itself.");
            repeatOf = records.findById(req.repeatOfId()).orElseThrow(() -> ApiException.badRequest("The record this repeats was not found."));
        }

        Instant now = Instant.now();
        boolean isNew = rec == null;
        if (isNew) {
            String prefix = "PROC-" + received.getYear() + "-";
            rec = new Procurement(Codes.next(records.findCodesStartingWith(prefix), prefix, 5), actor, now);
        }
        rec.dateReceived = received;
        rec.office = office;
        rec.preparedBy = clean(req.preparedBy());
        rec.proposalType = req.proposalType();
        rec.withAtc = req.withAtc();
        rec.procType = type;
        rec.title = title;
        rec.details = details;
        rec.venue = isEvent ? clean(req.venue()) : null;
        rec.startDate = start;
        rec.endDate = end;
        rec.amount = amount.signum() > 0 ? amount : null;
        rec.proposalStatus = hasProposal ? req.proposalStatus() : null;
        rec.atcStatus = req.withAtc() ? req.atcStatus() : null;
        rec.dtsNo = clean(req.dtsNo());
        rec.logbookNo = clean(req.logbookNo());
        rec.repeatType = repeatType;
        rec.repeatOf = repeatOf;
        rec.repeatNote = repeatType == null ? null : clean(req.repeatNote());
        rec.remarks = clean(req.remarks()); // the edit form sends the remarks back whole, cancel/restore notes included
        rec.touch(actor, now);
        records.saveAndFlush(rec);

        audit.log(actor, isNew ? "CREATE_RECORD" : "UPDATE_RECORD", rec.code,
                title + "; " + type + "; " + req.proposalType() + (req.withAtc() ? " + ATC" : "")
                        + (repeatType == null ? "" : "; " + repeatType + (repeatOf == null ? "" : " of " + repeatOf.code)));
        return new ProposalResult(RecordView.of(rec), List.of(), budgetLines(year(shownYear)));
    }

    /** Records whose title or PR titles look like this title; the same office first. */
    private List<Similar> findSimilar(String title, Long excludeId, long officeId) {
        List<String> mine = TitleSimilarity.tokens(title);
        if (mine.isEmpty()) return List.of();
        List<Procurement> all = records.findAllWithOffice();
        Map<Long, List<String>> prTitles = new HashMap<>();
        for (Object[] row : prs.findAllTitles()) prTitles.computeIfAbsent((Long) row[0], k -> new ArrayList<>()).add((String) row[1]);

        Map<Long, List<String>> texts = new LinkedHashMap<>();
        for (Procurement r : all) {
            List<String> list = new ArrayList<>(List.of(r.title));
            prTitles.getOrDefault(r.id, List.of()).stream().filter(t -> !t.equals(r.title)).forEach(list::add);
            texts.put(r.id, list);
        }
        TitleSimilarity.Weights weights = TitleSimilarity.weights(texts.values().stream()
                .map(list -> list.stream().flatMap(t -> TitleSimilarity.tokens(t).stream()).toList()).toList());

        List<Similar> out = new ArrayList<>();
        for (Procurement r : all) {
            if (r.id.equals(excludeId)) continue;
            double best = 0;
            String matched = "";
            for (String text : texts.get(r.id)) {
                double s = TitleSimilarity.similarity(mine, TitleSimilarity.tokens(text), weights);
                if (s > best) { best = s; matched = text; }
            }
            if (best > 0) {
                out.add(new Similar(r.id, r.code, (int) Math.round(best * 100), matched, r.title, r.office.getId(),
                        r.office.getName(), r.dateReceived, r.status));
            }
        }
        out.sort(Comparator.comparing((Similar s) -> s.officeId() != officeId)
                .thenComparing(Similar::score, Comparator.reverseOrder())
                .thenComparing(Similar::dateReceived, Comparator.nullsLast(Comparator.reverseOrder())));
        return out.size() > MAX_SIMILAR ? List.copyOf(out.subList(0, MAX_SIMILAR)) : out;
    }

    /* ======================== steps 2 + 3: Purchase Request and its SPPMP ======================== */

    /**
     * Creates (prId null) or updates a PR of a record. Missing attachments do not stop the save: the PR then
     * shows as "Incomplete – return to office". Going over the budget does not stop it either.
     */
    @Transactional
    public RecordResult savePr(String actor, long recordId, Long prId, SavePr req, Integer shownYear) {
        appLock.hold(AppLock.PROCUREMENT);
        Procurement rec = findRecord(recordId);
        if (rec.isCancelled()) throw ApiException.badRequest(rec.code + " is cancelled. Restore it first.");
        boolean isEvent = rec.procType == ProcType.EVENT;
        LocalDate start = isEvent ? req.startDate() : null;
        LocalDate end = !isEvent ? null : req.endDate() != null ? req.endDate() : start;
        if (isEvent && (start == null || clean(req.venue()) == null)) throw ApiException.badRequest("Venue and date of the event are required.");
        if (start != null && end.isBefore(start)) throw ApiException.badRequest("The end date is earlier than the start.");
        Facility facility = isEvent ? req.facility() : null;

        PurchaseRequest pr = prId == null ? null : findPr(prId);
        if (pr != null) {
            if (pr.isCancelled()) throw ApiException.badRequest(pr.code + " is cancelled. Restore it first before editing.");
            if (!pr.procurement.id.equals(rec.id)) throw ApiException.badRequest(pr.code + " belongs to another record.");
        }
        PurchaseRequest replaces = null;
        if (req.replacesId() != null) {
            if (req.replacesId().equals(prId)) throw ApiException.badRequest("A PR cannot replace itself.");
            replaces = prs.findById(req.replacesId()).orElseThrow(() -> ApiException.badRequest("The PR this replaces was not found."));
            if (!replaces.isCancelled()) {
                throw ApiException.badRequest(replaces.code + " is not cancelled. Cancel it first, then link the new PR to it.");
            }
        }

        Instant now = Instant.now();
        boolean isNew = pr == null;
        if (isNew) {
            String prefix = "PR-" + req.dateReceived().getYear() + "-";
            pr = new PurchaseRequest(Codes.next(prs.findCodesStartingWith(prefix), prefix, 5), rec, actor, now);
            rec.prs.add(pr);
        }
        pr.dtsNo = clean(req.dtsNo());
        pr.dateReceived = req.dateReceived();
        pr.prDate = req.prDate();
        pr.requisitioner = clean(req.requisitioner());
        pr.title = clean(req.title());
        pr.venue = isEvent ? clean(req.venue()) : null;
        pr.startDate = start;
        pr.endDate = end;
        pr.amount = req.amount();
        pr.plan = req.plan();
        pr.justification = req.plan() == Plan.SPPMP ? trim(req.justification()) : null;
        pr.facility = facility;
        pr.facilityJustification = facility == Facility.NON_GOVERNMENT ? trim(req.facilityJustification()) : null;
        pr.prStatus = req.prStatus();
        pr.replaces = replaces;
        pr.remarks = clean(req.remarks());
        pr.touch(actor, now);
        prs.saveAndFlush(pr);

        audit.log(actor, isNew ? "CREATE_PR" : "UPDATE_PR", pr.code, rec.code + "; DTS " + (pr.dtsNo == null ? "—" : pr.dtsNo) + "; "
                + pr.amount.toPlainString() + "; " + (pr.plan == null ? "no PPMP/SPPMP" : pr.plan)
                + (replaces == null ? "" : "; replaces " + replaces.code));
        return result(rec, shownYear);
    }

    /**
     * Step 3: the SPPMP of a PR. Encoded later than the PR: the papers go back to the office first and the SPPMP
     * is entered when they return. Marks the PR as SPPMP unless it already has a PPMP.
     */
    @Transactional
    public RecordResult saveSppmp(String actor, long prId, SaveSppmp req, Integer shownYear) {
        List<SaveItem> items = req.items().stream()
                .filter(i -> i != null && (clean(i.description()) != null || (i.amount() != null && i.amount().signum() != 0))).toList();
        if (items.isEmpty()) throw ApiException.badRequest("Add at least one SPPMP item.");
        for (int i = 0; i < items.size(); i++) {
            SaveItem it = items.get(i);
            if (clean(it.description()) == null || it.amount() == null || it.amount().signum() <= 0) {
                throw ApiException.badRequest("SPPMP item " + (i + 1) + ": description and amount are both required.");
            }
        }
        appLock.hold(AppLock.PROCUREMENT);
        PurchaseRequest pr = findPr(prId);
        Procurement rec = pr.procurement;
        if (pr.isCancelled()) throw ApiException.badRequest(pr.code + " is cancelled. Restore it first.");
        if (rec.isCancelled()) throw ApiException.badRequest("Record " + rec.code + " is cancelled. Restore it first.");

        if (pr.plan != Plan.PPMP) pr.plan = Plan.SPPMP; // a PR with a PPMP keeps it
        pr.justification = trim(req.justification());
        pr.items.clear();
        prs.flush(); // the old lines are removed before the new ones go in
        BigDecimal total = BigDecimal.ZERO;
        for (int i = 0; i < items.size(); i++) {
            pr.items.add(new SppmpItem(pr, i + 1, clean(items.get(i).description()), items.get(i).amount()));
            total = total.add(items.get(i).amount());
        }
        pr.touch(actor, Instant.now());
        prs.saveAndFlush(pr);
        audit.log(actor, "SAVE_SPPMP", pr.code, rec.code + "; " + items.size() + " item/s; " + total.toPlainString());
        return result(rec, shownYear);
    }

    /* ======================== cancel / restore ======================== */

    /** A cancelled record is kept. Its PRs are no longer counted in the budget. */
    @Transactional
    public RecordResult cancelRecord(String actor, long id, CancelRequest req, Integer shownYear) {
        appLock.hold(AppLock.PROCUREMENT);
        Procurement rec = findRecord(id);
        if (rec.isCancelled()) throw ApiException.badRequest(rec.code + " is already cancelled.");
        Instant at = at(req.date(), req.time());
        String note = cancelNote(at, req, actor);
        rec.status = RecordStatus.CANCELLED;
        rec.cancelledAt = at;
        rec.cancelRequestedBy = clean(req.requestedBy());
        rec.cancelReason = clean(req.reason());
        rec.cancelledBy = actor;
        rec.remarks = addNote(rec.remarks, note, rec.code);
        rec.touch(actor, Instant.now());
        audit.log(actor, "CANCEL_RECORD", rec.code, note);
        return result(rec, shownYear);
    }

    @Transactional
    public RecordResult restoreRecord(String actor, long id, String reason, Integer shownYear) {
        appLock.hold(AppLock.PROCUREMENT);
        Procurement rec = findRecord(id);
        if (!rec.isCancelled()) throw ApiException.badRequest(rec.code + " is already active.");
        String note = restoreNote(actor, reason);
        rec.status = RecordStatus.ACTIVE;
        rec.cancelledAt = null;
        rec.cancelRequestedBy = null;
        rec.cancelReason = null;
        rec.cancelledBy = null;
        rec.remarks = addNote(rec.remarks, note, rec.code);
        rec.touch(actor, Instant.now());
        audit.log(actor, "RESTORE_RECORD", rec.code, note);
        return result(rec, shownYear);
    }

    /** A cancelled PR is kept; its amount goes back to the budget. A new PR can point to the one it replaces. */
    @Transactional
    public RecordResult cancelPr(String actor, long prId, CancelRequest req, Integer shownYear) {
        appLock.hold(AppLock.PROCUREMENT);
        PurchaseRequest pr = findPr(prId);
        if (pr.isCancelled()) throw ApiException.badRequest(pr.code + " is already cancelled.");
        Instant at = at(req.date(), req.time());
        String note = cancelNote(at, req, actor);
        pr.status = RecordStatus.CANCELLED;
        pr.cancelledAt = at;
        pr.cancelRequestedBy = clean(req.requestedBy());
        pr.cancelReason = clean(req.reason());
        pr.cancelledBy = actor;
        pr.remarks = addNote(pr.remarks, note, pr.code);
        pr.touch(actor, Instant.now());
        audit.log(actor, "CANCEL_PR", pr.code, note);
        return result(pr.procurement, shownYear);
    }

    @Transactional
    public RecordResult restorePr(String actor, long prId, String reason, Integer shownYear) {
        appLock.hold(AppLock.PROCUREMENT);
        PurchaseRequest pr = findPr(prId);
        if (!pr.isCancelled()) throw ApiException.badRequest(pr.code + " is already active.");
        if (pr.procurement.isCancelled()) {
            throw ApiException.badRequest("Record " + pr.procurement.code + " is cancelled. Restore the record first.");
        }
        String note = restoreNote(actor, reason);
        pr.status = RecordStatus.ACTIVE;
        pr.cancelledAt = null;
        pr.cancelRequestedBy = null;
        pr.cancelReason = null;
        pr.cancelledBy = null;
        pr.remarks = addNote(pr.remarks, note, pr.code);
        pr.touch(actor, Instant.now());
        audit.log(actor, "RESTORE_PR", pr.code, note);
        return result(pr.procurement, shownYear);
    }

    private static String cancelNote(Instant at, CancelRequest req, String actor) {
        return "CANCELLED " + DATE_TIME.format(at) + " (asked by " + clean(req.requestedBy()) + "; encoded by " + actor + "): " + clean(req.reason());
    }

    private static String restoreNote(String actor, String reason) {
        String r = clean(reason);
        return "RESTORED " + DATE_TIME.format(Instant.now()) + " by " + actor + (r == null ? "" : ": " + r);
    }

    private static String addNote(String remarks, String note, String code) {
        String all = remarks == null || remarks.isBlank() ? note : remarks + " | " + note;
        if (all.length() > MAX_REMARKS) throw ApiException.badRequest("The remarks of " + code + " are full. Use a shorter reason.");
        return all;
    }

    /* ======================== step 4: routing ======================== */

    @Transactional
    public RecordResult addRouting(String actor, long recordId, AddRouting req, Integer shownYear) {
        appLock.hold(AppLock.PROCUREMENT);
        Procurement rec = findRecord(recordId);
        PurchaseRequest pr = null;
        if (req.prId() != null) {
            pr = prs.findById(req.prId()).filter(p -> p.procurement.id.equals(rec.id))
                    .orElseThrow(() -> ApiException.badRequest("That PR is not part of " + rec.code + "."));
        }
        Instant when = at(req.date(), req.time());
        RoutingEntry entry = new RoutingEntry(rec, pr, when, req.action(), clean(req.person()), clean(req.remarks()), actor);
        rec.routing.add(entry);
        records.saveAndFlush(rec);
        audit.log(actor, "ADD_ROUTING", rec.code, (pr == null ? "proposal" : pr.code) + ": " + req.action() + " – " + entry.person + " (" + DATE_TIME.format(when) + ")");
        return result(rec, shownYear);
    }

    /** Removes a routing entry encoded by mistake (Admin, or the encoder who added it). */
    @Transactional
    public RecordResult deleteRouting(PortalPrincipal me, long entryId, Integer shownYear) {
        appLock.hold(AppLock.PROCUREMENT);
        RoutingEntry entry = routing.findById(entryId).orElseThrow(() -> ApiException.notFound("Routing entry not found."));
        if (me.role() != Role.ADMIN && !entry.encodedBy.equals(me.username())) {
            throw ApiException.badRequest("Only the person who added this entry (or an Admin) can remove it.");
        }
        Procurement rec = entry.procurement;
        rec.routing.remove(entry);
        records.saveAndFlush(rec);
        audit.log(me.username(), "DELETE_ROUTING", rec.code, (entry.purchaseRequest == null ? "proposal" : entry.purchaseRequest.code)
                + ": " + entry.action + " – " + entry.person + " (" + DATE_TIME.format(entry.happenedAt) + ")");
        return result(rec, shownYear);
    }

    /* ======================== budget ======================== */

    /** Sets (or, with no amount, removes) the budget of an office for a year. */
    @Transactional
    public List<BudgetLine> saveBudget(String actor, SaveBudget req) {
        int year = year(req.year());
        appLock.hold(AppLock.PROCUREMENT);
        Office office = offices.findById(req.officeId()).orElseThrow(() -> ApiException.badRequest("Unknown office."));
        Budget budget = budgets.find(year, office.getId()).orElse(null);
        if (req.amount() == null) {
            if (budget != null) budgets.delete(budget);
        } else {
            if (budget == null) budget = new Budget(year, office);
            budget.amount = req.amount();
            budget.updatedBy = actor;
            budget.updatedAt = Instant.now();
            budgets.save(budget);
        }
        budgets.flush();
        audit.log(actor, "SET_BUDGET", office.getName() + " " + year, req.amount() == null ? "removed" : req.amount().toPlainString());
        return budgetLines(year);
    }

    /**
     * Budget, used amount and number of PRs per office for a year. Used = PRs received that year that are not
     * cancelled and whose record is not cancelled. Offices with neither a budget nor a PR are left out.
     */
    private List<BudgetLine> budgetLines(int year) {
        Map<Long, Office> officeById = new HashMap<>();
        Map<Long, BigDecimal> budget = new HashMap<>(), used = new HashMap<>();
        Map<Long, Integer> count = new HashMap<>();
        for (Budget b : budgets.findOfYear(year)) {
            officeById.put(b.office.getId(), b.office);
            budget.put(b.office.getId(), b.amount);
        }
        for (PurchaseRequest pr : prs.findCounted()) {
            if (pr.year() != year) continue;
            Office o = pr.procurement.office;
            officeById.put(o.getId(), o);
            used.merge(o.getId(), pr.amount, BigDecimal::add);
            count.merge(o.getId(), 1, Integer::sum);
        }
        return officeById.values().stream().sorted(Comparator.comparing(Office::getName))
                .map(o -> new BudgetLine(o.getId(), o.getName(), budget.get(o.getId()), used.getOrDefault(o.getId(), BigDecimal.ZERO),
                        count.getOrDefault(o.getId(), 0)))
                .toList();
    }

    /* ======================== helpers ======================== */

    private RecordResult result(Procurement rec, Integer shownYear) {
        records.flush();
        return new RecordResult(RecordView.of(rec), budgetLines(year(shownYear)));
    }

    private Procurement findRecord(long id) {
        return records.findById(id).orElseThrow(() -> ApiException.notFound("Record not found."));
    }

    private PurchaseRequest findPr(long id) {
        return prs.findById(id).orElseThrow(() -> ApiException.notFound("PR not found."));
    }

    private static int year(Integer requested) {
        int year = requested == null ? TravelService.today().getYear() : requested;
        if (year < 2000 || year > 2100) throw ApiException.badRequest("Invalid year.");
        return year;
    }

    /** Date + time as written on the clock in the Philippines. No time = midnight. */
    private static Instant at(LocalDate date, LocalTime time) {
        return LocalDateTime.of(date, time == null ? LocalTime.MIDNIGHT : time).atZone(TravelService.MANILA).toInstant();
    }

    /** Single spaces, no spaces at the ends; null when nothing is left. */
    private static String clean(String s) {
        return s == null || s.isBlank() ? null : s.replaceAll("\\s+", " ").trim();
    }

    /** Keeps line breaks (long justifications); null when blank. */
    private static String trim(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
