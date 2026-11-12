package ph.fped.portal.procurement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import ph.fped.portal.audit.AuditRepository;
import ph.fped.portal.travel.OfficeRepository;
import ph.fped.portal.user.Role;
import ph.fped.portal.user.User;
import ph.fped.portal.user.UserRepository;

/** Procurement through the real HTTP layer and the real Flyway tables. The rules are those of the old system. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProcurementFlowTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired AuditRepository audit;
    @Autowired ProcurementRepository records;
    @Autowired PurchaseRequestRepository prs;
    @Autowired RoutingRepository routing;
    @Autowired BudgetRepository budgets;
    @Autowired OfficeRepository offices;
    @Autowired PasswordEncoder encoder;

    MockHttpSession enc;
    long frmd;
    long legal;

    @BeforeEach
    void setUp() throws Exception {
        routing.deleteAll();
        prs.findAll().forEach(p -> { p.replaces = null; prs.save(p); });
        prs.deleteAll();
        records.findAll().forEach(r -> { r.repeatOf = null; records.save(r); });
        records.deleteAll();
        budgets.deleteAll();
        audit.deleteAll();
        users.deleteAll();
        for (Role role : Role.values()) {
            User u = new User(role.name().toLowerCase(), role.name() + " name", role);
            u.setBcryptPassword(encoder.encode("pass-" + role.name()));
            users.save(u);
        }
        enc = login(Role.ENCODER);
        frmd = offices.findByNameIgnoreCase("FRMD").orElseThrow().getId();
        legal = offices.findByNameIgnoreCase("LEGAL").orElseThrow().getId();
    }

    private MockHttpSession login(Role role) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("username", role.name().toLowerCase(), "password", "pass-" + role.name()))))
                .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }

    private ResultActions send(MockHttpServletRequestBuilder request, MockHttpSession session, Object body) throws Exception {
        return mvc.perform(request.session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private JsonNode read(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }

    /** An event with an Activity Proposal and an ATC, received in 2027. */
    private Map<String, Object> event(String title, long office) {
        Map<String, Object> m = new HashMap<>();
        m.put("dateReceived", "2027-02-10"); m.put("officeId", office); m.put("preparedBy", "Juan Dela Cruz");
        m.put("proposalType", "ACTIVITY_PROPOSAL"); m.put("proposalStatus", "FOR_REVIEW");
        m.put("withAtc", true); m.put("atcStatus", "SIGNED_WITH_REVIEW");
        m.put("procType", "EVENT"); m.put("title", title); m.put("venue", "BFAR-CAR, Baguio City");
        m.put("startDate", "2027-03-01"); m.put("endDate", "2027-03-03"); m.put("amount", 348500);
        m.put("dtsNo", "O27010984AD"); m.put("logbookNo", "G#151");
        return m;
    }

    private JsonNode saved(Map<String, Object> body) throws Exception {
        JsonNode result = read(send(post("/api/procurement/records").param("year", "2027"), enc, body).andExpect(status().isOk()));
        assertThat(result.get("similar")).isEmpty();
        return result.get("record");
    }

    private Map<String, Object> pr(String dts, Number amount) {
        Map<String, Object> m = new HashMap<>();
        m.put("dtsNo", dts); m.put("dateReceived", "2027-02-20"); m.put("title", "Meals and venue"); m.put("amount", amount);
        m.put("prStatus", "FOR_REVIEW"); m.put("venue", "Baguio City"); m.put("startDate", "2027-03-01");
        m.put("plan", "PPMP"); m.put("facility", "GOVERNMENT");
        return m;
    }

    private JsonNode addPr(long recordId, Map<String, Object> body) throws Exception {
        return read(send(post("/api/procurement/records/" + recordId + "/prs").param("year", "2027"), enc, body).andExpect(status().isOk()));
    }

    @Test
    void recordsAndPrsAreNumberedPerYearOfTheDateReceived() throws Exception {
        JsonNode a = saved(event("Risk Management Enhancement Training", frmd));
        JsonNode b = saved(event("Hatchery Operators Summit", frmd));
        assertThat(a.get("code").asText()).isEqualTo("PROC-2027-00001");
        assertThat(b.get("code").asText()).isEqualTo("PROC-2027-00002");
        assertThat(a.get("endDate").asText()).isEqualTo("2027-03-03");
        assertThat(a.get("amount").decimalValue()).isEqualByComparingTo("348500");

        JsonNode withPr = addPr(a.get("id").asLong(), pr("PR27010132LIB", 100000)).get("record");
        assertThat(withPr.get("prs").get(0).get("code").asText()).isEqualTo("PR-2027-00001");
        assertThat(withPr.get("prs").get(0).get("endDate").asText()).isEqualTo("2027-03-01"); // no end = one day
    }

    @Test
    void theProposalFormIsChecked() throws Exception {
        Map<String, Object> noVenue = event("Summit", frmd);
        noVenue.remove("venue");
        send(post("/api/procurement/records"), enc, noVenue).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Venue of the event is required."));
        Map<String, Object> noAmount = event("Summit", frmd);
        noAmount.remove("amount");
        send(post("/api/procurement/records"), enc, noAmount).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Amount is required."));
        Map<String, Object> noDts = event("Summit", frmd);
        noDts.put("dtsNo", " ");
        send(post("/api/procurement/records"), enc, noDts).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("DTS No. is required."));
        Map<String, Object> repair = event("Aircon servicing", frmd);
        repair.put("procType", "REPAIR");
        send(post("/api/procurement/records"), enc, repair).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Enter what will be repaired."));
        Map<String, Object> hiring = event("Hiring of driver", frmd);
        hiring.put("procType", "HIRING"); hiring.remove("endDate");
        send(post("/api/procurement/records"), enc, hiring).andExpect(status().isBadRequest());
        assertThat(records.count()).isZero();

        // PR only (no proposal, no ATC): no amount needed; equipment keeps its item lines, and has no venue or dates
        Map<String, Object> equipment = event("Laptops for the unit", frmd);
        equipment.put("procType", "EQUIPMENT"); equipment.put("proposalType", "NONE"); equipment.put("withAtc", false);
        equipment.remove("amount"); equipment.put("details", " 2 units  laptop \n\n1 unit printer");
        JsonNode r = saved(equipment);
        assertThat(r.get("details").asText()).isEqualTo("2 units laptop\n1 unit printer");
        assertThat(r.get("venue").asText()).isEmpty();
        assertThat(r.get("startDate").isNull()).isTrue();
        assertThat(r.get("amount").isNull()).isTrue();
        assertThat(r.get("proposalStatus").isNull()).isTrue();
    }

    @Test
    void aLookAlikeOfTheSameOfficeMustBeAnswered() throws Exception {
        JsonNode first = saved(event("BFAR Risk Management Enhancement Training", frmd));

        // another office: saved, the look-alike is only for information
        saved(event("Risk Management Enhancement Training (Batch 2)", legal));

        Map<String, Object> again = event("Risk Management Enhancement Training 2027 Batch 3", frmd);
        JsonNode asked = read(send(post("/api/procurement/records"), enc, again).andExpect(status().isOk()));
        assertThat(asked.get("record").isNull()).isTrue();
        assertThat(asked.get("similar").size()).isEqualTo(2);
        assertThat(asked.get("similar").get(0).get("code").asText()).isEqualTo(first.get("code").asText()); // same office first
        assertThat(asked.get("similar").get(0).get("score").asInt()).isEqualTo(100);
        assertThat(records.count()).isEqualTo(2);

        again.put("repeatType", "REPEAT"); again.put("repeatOfId", first.get("id").asLong()); again.put("repeatNote", "3rd batch");
        JsonNode repeat = saved(again);
        assertThat(repeat.get("repeatType").asText()).isEqualTo("REPEAT");
        assertThat(repeat.get("repeatOfId").asLong()).isEqualTo(first.get("id").asLong());

        // "not the same": saved without a link
        Map<String, Object> different = event("Risk Management Enhancement Training for hatcheries", frmd);
        different.put("repeatType", "DIFFERENT"); different.put("repeatOfId", first.get("id").asLong());
        assertThat(saved(different).get("repeatOfId").isNull()).isTrue();

        // editing a record does not match itself, but it still matches the others
        JsonNode edit = read(send(put("/api/procurement/records/" + repeat.get("id").asLong()), enc, event("Risk Management Enhancement Training 2027 Batch 3", frmd)));
        assertThat(edit.get("record").isNull()).isTrue();
        assertThat(edit.get("similar").findValuesAsText("code")).doesNotContain(repeat.get("code").asText());
    }

    @Test
    void aLookAlikeIsAlsoFoundByThePrTitle() throws Exception {
        JsonNode rec = saved(event("Stakeholders consultation", frmd));
        Map<String, Object> p = pr("PR1", 5000);
        p.put("title", "Kyocera photocopier toner cartridges");
        addPr(rec.get("id").asLong(), p);
        JsonNode asked = read(send(post("/api/procurement/records"), enc, event("Toner cartridges for Kyocera photocopier", frmd)));
        assertThat(asked.get("record").isNull()).isTrue();
        assertThat(asked.get("similar").get(0).get("matched").asText()).isEqualTo("Kyocera photocopier toner cartridges");
    }

    @Test
    void prAmountsAreDeductedFromTheBudgetOfTheOfficeAndYear() throws Exception {
        long rec = saved(event("Hatchery Operators Summit", frmd)).get("id").asLong();
        send(put("/api/procurement/budgets"), enc, Map.of("year", 2027, "officeId", frmd, "amount", 500000)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].office").value("FRMD")).andExpect(jsonPath("$[0].budget").value(500000)).andExpect(jsonPath("$[0].used").value(0));

        JsonNode one = addPr(rec, pr("PR-A", 120000.50));
        assertThat(one.get("budgets").get(0).get("used").decimalValue()).isEqualByComparingTo("120000.50");
        JsonNode two = addPr(rec, pr("PR-B", 400000)); // over the budget: still saved
        assertThat(two.get("budgets").get(0).get("used").decimalValue()).isEqualByComparingTo("520000.50");
        assertThat(two.get("budgets").get(0).get("prs").asInt()).isEqualTo(2);
        long prB = two.get("record").get("prs").get(1).get("id").asLong();

        // a PR received in another year counts in that year
        Map<String, Object> next = pr("PR-C", 999);
        next.put("dateReceived", "2028-01-05");
        JsonNode three = addPr(rec, next);
        assertThat(three.get("record").get("prs").get(2).get("code").asText()).isEqualTo("PR-2028-00001");
        assertThat(three.get("budgets").get(0).get("used").decimalValue()).isEqualByComparingTo("520000.50");

        Map<String, Object> cancel = Map.of("date", "2027-03-05", "time", "15:51", "requestedBy", "Dir. Santos", "reason", "Moved to next quarter");
        JsonNode cancelled = read(send(post("/api/procurement/prs/" + prB + "/cancel").param("year", "2027"), enc, cancel).andExpect(status().isOk()));
        assertThat(cancelled.get("budgets").get(0).get("used").decimalValue()).isEqualByComparingTo("120000.50");
        JsonNode c = cancelled.get("record").get("prs").get(1);
        assertThat(c.get("status").asText()).isEqualTo("CANCELLED");
        assertThat(c.get("cancel").get("at").asText()).isEqualTo("2027-03-05T07:51:00Z"); // 3:51 PM in the Philippines
        assertThat(c.get("cancel").get("requestedBy").asText()).isEqualTo("Dir. Santos");
        assertThat(c.get("remarks").asText()).isEqualTo("CANCELLED 2027-03-05 15:51 (asked by Dir. Santos; encoded by encoder): Moved to next quarter");

        // cancelling the whole record gives everything back; restoring it counts the active PRs again
        JsonNode recCancelled = read(send(post("/api/procurement/records/" + rec + "/cancel").param("year", "2027"), enc, cancel));
        assertThat(recCancelled.get("budgets").get(0).get("used").decimalValue()).isEqualByComparingTo("0");
        send(post("/api/procurement/prs/" + prB + "/restore"), enc, Map.of("reason", "")).andExpect(status().isBadRequest()); // record first
        send(put("/api/procurement/records/" + rec), enc, event("Hatchery Operators Summit", frmd)).andExpect(status().isBadRequest());
        send(post("/api/procurement/records/" + rec + "/prs"), enc, pr("PR-D", 1)).andExpect(status().isBadRequest());
        JsonNode restored = read(send(post("/api/procurement/records/" + rec + "/restore").param("year", "2027"), enc, Map.of("reason", "Pushing through")));
        assertThat(restored.get("budgets").get(0).get("used").decimalValue()).isEqualByComparingTo("120000.50");
        assertThat(restored.get("record").get("cancel").isNull()).isTrue();
        assertThat(restored.get("record").get("remarks").asText()).contains("CANCELLED").contains(" | RESTORED").endsWith("by encoder: Pushing through");

        // removing the budget keeps the use
        send(put("/api/procurement/budgets"), enc, Map.of("year", 2027, "officeId", frmd)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].budget").isEmpty()).andExpect(jsonPath("$[0].prs").value(1));
    }

    @Test
    void aNewPrCanReplaceACancelledOneOnly() throws Exception {
        long rec = saved(event("Hatchery Operators Summit", frmd)).get("id").asLong();
        long old = addPr(rec, pr("PR-OLD", 1000)).get("record").get("prs").get(0).get("id").asLong();
        Map<String, Object> replacement = pr("PR-NEW", 1200);
        replacement.put("replacesId", old);
        send(post("/api/procurement/records/" + rec + "/prs"), enc, replacement).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("PR-2027-00001 is not cancelled. Cancel it first, then link the new PR to it."));
        send(post("/api/procurement/prs/" + old + "/cancel"), enc, Map.of("date", "2027-03-05", "requestedBy", "Chief", "reason", "New dates")).andExpect(status().isOk());
        JsonNode r = addPr(rec, replacement).get("record");
        assertThat(r.get("prs").get(1).get("replacesId").asLong()).isEqualTo(old);
        send(put("/api/procurement/records/" + rec + "/prs/" + old), enc, pr("PR-OLD", 1)).andExpect(status().isBadRequest()); // cancelled: no edit
    }

    @Test
    void attachmentsAreKeptOnlyWhereTheyApply() throws Exception {
        long rec = saved(event("Hatchery Operators Summit", frmd)).get("id").asLong();
        Map<String, Object> p = pr("PR-A", 1000);
        p.put("plan", "SPPMP"); p.put("justification", "Not in the PPMP"); p.put("facility", "NON_GOVERNMENT"); p.put("facilityJustification", "No government venue is free");
        JsonNode a = addPr(rec, p).get("record").get("prs").get(0);
        assertThat(a.get("justification").asText()).isEqualTo("Not in the PPMP");
        assertThat(a.get("facilityJustification").asText()).isEqualTo("No government venue is free");

        p.put("plan", "PPMP"); p.put("facility", "GOVERNMENT");
        JsonNode b = read(send(put("/api/procurement/records/" + rec + "/prs/" + a.get("id").asLong()), enc, p)).get("record").get("prs").get(0);
        assertThat(b.get("justification").asText()).isEmpty();
        assertThat(b.get("facilityJustification").asText()).isEmpty();

        // nothing attached is still saved (shown as incomplete), and counted on the home page
        p.remove("plan"); p.remove("facility");
        JsonNode c = read(send(put("/api/procurement/records/" + rec + "/prs/" + a.get("id").asLong()), enc, p).andExpect(status().isOk())).get("record").get("prs").get(0);
        assertThat(c.get("plan").isNull()).isTrue();
        assertThat(prs.findById(a.get("id").asLong()).orElseThrow().getCode()).isEqualTo("PR-2027-00001");
    }

    @Test
    void sppmpItemsComeLaterAndMarkThePrAsSppmp() throws Exception {
        long rec = saved(event("Hatchery Operators Summit", frmd)).get("id").asLong();
        Map<String, Object> p = pr("PR-A", 1000);
        p.remove("plan");
        long prId = addPr(rec, p).get("record").get("prs").get(0).get("id").asLong();

        send(put("/api/procurement/prs/" + prId + "/sppmp"), enc, Map.of("items", List.of())).andExpect(status().isBadRequest());
        send(put("/api/procurement/prs/" + prId + "/sppmp"), enc, Map.of("items", List.of(Map.of("description", "Meals")))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("SPPMP item 1: description and amount are both required."));

        JsonNode saved = read(send(put("/api/procurement/prs/" + prId + "/sppmp"), enc, Map.of("justification", "Not in the PPMP",
                "items", List.of(Map.of("description", "Meals for 40 participants", "amount", 600), Map.of("description", "", "amount", 0),
                        Map.of("description", "Venue", "amount", 400.25)))).andExpect(status().isOk())).get("record").get("prs").get(0);
        assertThat(saved.get("plan").asText()).isEqualTo("SPPMP");
        assertThat(saved.get("items")).hasSize(2);
        assertThat(saved.get("items").get(1).get("amount").decimalValue()).isEqualByComparingTo("400.25");

        // saving again replaces the lines
        JsonNode again = read(send(put("/api/procurement/prs/" + prId + "/sppmp"), enc,
                Map.of("items", List.of(Map.of("description", "Meals", "amount", 1000))))).get("record").get("prs").get(0);
        assertThat(again.get("items")).hasSize(1);
        assertThat(again.get("items").get(0).get("description").asText()).isEqualTo("Meals");
    }

    @Test
    void routingIsAddedAndRemovedByItsEncoderOrAnAdmin() throws Exception {
        long rec = saved(event("Hatchery Operators Summit", frmd)).get("id").asLong();
        long prId = addPr(rec, pr("PR-A", 1000)).get("record").get("prs").get(0).get("id").asLong();
        send(post("/api/procurement/records/" + rec + "/routing"), enc, Map.of("date", "2027-02-21", "time", "09:30", "action", "FORWARDED", "person", " ")).andExpect(status().isBadRequest());
        send(post("/api/procurement/records/" + rec + "/routing"), enc, Map.of("prId", 999999, "date", "2027-02-21", "action", "FORWARDED", "person", "X")).andExpect(status().isBadRequest());

        send(post("/api/procurement/records/" + rec + "/routing"), enc,
                Map.of("prId", prId, "date", "2027-02-22", "time", "14:00", "action", "RETURNED", "person", "Ana Cruz", "remarks", "Kulang ang PPMP")).andExpect(status().isOk());
        JsonNode r = read(send(post("/api/procurement/records/" + rec + "/routing"), enc,
                Map.of("date", "2027-02-21", "time", "09:30", "action", "FORWARDED", "person", "Atty. Reyes"))).get("record");
        assertThat(r.get("routing")).hasSize(2);
        assertThat(r.get("routing").get(0).get("person").asText()).isEqualTo("Atty. Reyes"); // by date and time, not by when it was typed
        assertThat(r.get("routing").get(0).get("prId").isNull()).isTrue();
        assertThat(r.get("routing").get(1).get("happenedAt").asText()).isEqualTo("2027-02-22T06:00:00Z");
        long entry = r.get("routing").get(0).get("id").asLong();

        // another encoder cannot remove it; an Admin can
        User other = new User("iba", "Ibang Encoder", Role.ENCODER);
        other.setBcryptPassword(encoder.encode("pass-iba-1"));
        users.save(other);
        MockHttpSession otherLogin = (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"iba\",\"password\":\"pass-iba-1\"}")).andReturn().getRequest().getSession(false);
        mvc.perform(delete("/api/procurement/routing/" + entry).session(otherLogin).with(csrf())).andExpect(status().isBadRequest());
        mvc.perform(delete("/api/procurement/routing/" + entry).session(login(Role.ADMIN)).with(csrf())).andExpect(status().isOk())
                .andExpect(jsonPath("$.record.routing.length()").value(1));
    }

    @Test
    void otherYearsComeInShortFormAndViewerOnlyReads() throws Exception {
        JsonNode a = saved(event("Hatchery Operators Summit", frmd));
        addPr(a.get("id").asLong(), pr("PR-A", 1000));
        Map<String, Object> old = event("Seaweed farmers congress", legal);
        old.put("dateReceived", "2026-06-01");
        JsonNode b = saved(old);
        assertThat(b.get("code").asText()).isEqualTo("PROC-2026-00001");

        MockHttpSession viewer = login(Role.VIEWER);
        mvc.perform(get("/api/procurement/data").param("year", "2027").session(viewer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.records.length()").value(1)).andExpect(jsonPath("$.records[0].prs[0].dtsNo").value("PR-A"))
                .andExpect(jsonPath("$.otherYears.length()").value(1)).andExpect(jsonPath("$.otherYears[0].code").value("PROC-2026-00001"))
                .andExpect(jsonPath("$.years").value(org.hamcrest.Matchers.hasItems(2026, 2027)))
                .andExpect(jsonPath("$.budgets[0].used").value(1000));
        mvc.perform(get("/api/procurement/records/" + b.get("id").asLong()).session(viewer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.venue").value("BFAR-CAR, Baguio City"));
        mvc.perform(get("/api/procurement/summary").session(viewer)).andExpect(status().isOk());

        send(post("/api/procurement/records"), viewer, event("Bago", frmd)).andExpect(status().isForbidden());
        send(put("/api/procurement/budgets"), viewer, Map.of("year", 2027, "officeId", frmd, "amount", 1)).andExpect(status().isForbidden());
        mvc.perform(delete("/api/procurement/routing/1").session(viewer).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(get("/api/procurement/data")).andExpect(status().isUnauthorized());
    }
}
