package ph.fped.portal.travel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import ph.fped.portal.user.Role;
import ph.fped.portal.user.User;
import ph.fped.portal.user.UserRepository;

/** Travel orders through the real HTTP layer and the real Flyway tables. The rules are those of the old system. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TravelOrderFlowTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired AuditRepository audit;
    @Autowired TravelOrderRepository orders;
    @Autowired PersonnelRepository personnel;
    @Autowired OfficeRepository offices;
    @Autowired PasswordEncoder encoder;

    MockHttpSession encoderLogin;
    long office;
    long ana;
    long ben;

    @BeforeEach
    void setUp() throws Exception {
        orders.deleteAll();
        personnel.deleteAll();
        audit.deleteAll();
        users.deleteAll();
        for (Role role : Role.values()) {
            User u = new User(role.name().toLowerCase(), role.name() + " name", role);
            u.setBcryptPassword(encoder.encode("pass-" + role.name()));
            users.save(u);
        }
        encoderLogin = login(Role.ENCODER);
        office = offices.findByNameIgnoreCase("FRMD").orElseThrow().getId();
        ana = person("Ana B. Cruz");
        ben = person("Ben D. Reyes");
    }

    private MockHttpSession login(Role role) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("username", role.name().toLowerCase(), "password", "pass-" + role.name()))))
                .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }

    private ResultActions send(MockHttpServletRequestBuilder request, MockHttpSession session, Object body) throws Exception {
        return mvc.perform(request.session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    private JsonNode read(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private long person(String name) throws Exception {
        return read(send(post("/api/travel/personnel"), encoderLogin, Map.of("name", name, "officeId", office, "employment", "PERMANENT"))
                .andExpect(status().isOk())).get("id").asLong();
    }

    private Map<String, Object> order(String start, String end, Object... travelers) {
        return new java.util.HashMap<>(Map.of("startDate", start, "endDate", end, "dateFiled", start, "officeId", office,
                "destination", "Cebu City", "purpose", "Monitoring", "travelerIds", java.util.List.of(travelers)));
    }

    /** Saves a travel order that must go through, and gives what was saved. */
    private JsonNode saved(Map<String, Object> body) throws Exception {
        JsonNode result = read(send(post("/api/travel/orders"), encoderLogin, body).andExpect(status().isOk()));
        assertThat(result.get("conflicts")).isEmpty();
        return result.get("order");
    }

    @Test
    void numberingStartsAgainEveryYearOfTheFilingDate() throws Exception {
        assertThat(saved(order("2027-03-01", "2027-03-03", ana)).get("code").asText()).isEqualTo("TO-2027-00001");
        assertThat(saved(order("2027-04-01", "2027-04-03", ana)).get("code").asText()).isEqualTo("TO-2027-00002");
        assertThat(saved(order("2028-01-05", "2028-01-06", ana)).get("code").asText()).isEqualTo("TO-2028-00001");
    }

    @Test
    void datesAreStoredAsTyped() throws Exception {
        JsonNode o = saved(order("2027-03-01", "2027-03-03", ana, ben));
        assertThat(o.get("startDate").asText()).isEqualTo("2027-03-01");
        assertThat(o.get("endDate").asText()).isEqualTo("2027-03-03");
        assertThat(o.get("travelerIds")).hasSize(2);
        // and read back from the database, not from what was just sent
        mvc.perform(get("/api/travel/data").param("year", "2027").session(encoderLogin)).andExpect(status().isOk())
                .andExpect(jsonPath("$.orders[0].startDate").value("2027-03-01"))
                .andExpect(jsonPath("$.orders[0].endDate").value("2027-03-03"))
                .andExpect(jsonPath("$.orders[0].dateFiled").value("2027-03-01"))
                .andExpect(jsonPath("$.orders[0].office").value("FRMD"));
    }

    @Test
    void overlapIsRefusedUnlessAReasonIsGiven() throws Exception {
        JsonNode first = saved(order("2027-03-01", "2027-03-03", ana));

        // the last day of one travel is the first day of the other: that is an overlap
        Map<String, Object> second = order("2027-03-03", "2027-03-05", ana, ben);
        JsonNode refused = read(send(post("/api/travel/orders"), encoderLogin, second).andExpect(status().isOk()));
        assertThat(refused.get("order").isNull()).isTrue();
        assertThat(refused.get("conflicts")).hasSize(1);
        assertThat(refused.get("conflicts").get(0).get("personName").asText()).isEqualTo("ANA B. CRUZ");
        assertThat(refused.get("conflicts").get(0).get("orderCode").asText()).isEqualTo(first.get("code").asText());
        assertThat(orders.count()).isEqualTo(1);

        second.put("overlapReason", "Same activity");
        JsonNode allowed = saved(second);
        assertThat(allowed.get("overlapReason").asText()).isEqualTo("Same activity");
        mvc.perform(get("/api/admin/audit").param("q", "create_to").session(login(Role.ADMIN)))
                .andExpect(jsonPath("$.items[0].details").value(org.hamcrest.Matchers.containsString("OVERLAP ALLOWED: Same activity")));

        // the day after is free, and so is another person on the same dates
        saved(order("2027-03-06", "2027-03-07", ana));
        assertThat(saved(order("2027-03-10", "2027-03-11", ben)).get("overlapReason").asText()).isEmpty();
    }

    @Test
    void editingATravelOrderDoesNotOverlapWithItself() throws Exception {
        JsonNode o = saved(order("2027-03-01", "2027-03-03", ana));
        Map<String, Object> edit = order("2027-03-02", "2027-03-04", ana);
        edit.put("destination", "Bohol");
        JsonNode result = read(send(put("/api/travel/orders/" + o.get("id").asLong()), encoderLogin, edit).andExpect(status().isOk()));
        assertThat(result.get("conflicts")).isEmpty();
        // changing the dates or the place in the edit form is kept in the history
        JsonNode change = result.get("order").get("changes").get(0);
        assertThat(change.get("oldStartDate").asText()).isEqualTo("2027-03-01");
        assertThat(change.get("newEndDate").asText()).isEqualTo("2027-03-04");
        assertThat(change.get("oldDestination").asText()).isEqualTo("Cebu City");
        assertThat(change.get("newDestination").asText()).isEqualTo("Bohol");
        assertThat(result.get("order").get("code").asText()).isEqualTo(o.get("code").asText());

        // saving again without touching dates or place adds nothing to the history
        JsonNode again = read(send(put("/api/travel/orders/" + o.get("id").asLong()), encoderLogin, edit));
        assertThat(again.get("order").get("changes")).hasSize(1);
    }

    @Test
    void cancelledTravelDoesNotCountAndRestoreChecksAgain() throws Exception {
        long first = saved(order("2027-03-01", "2027-03-03", ana)).get("id").asLong();
        send(post("/api/travel/orders/" + first + "/cancel"), encoderLogin, Map.of("reason", "Activity moved"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.remarks").value(org.hamcrest.Matchers.matchesPattern("CANCELLED \\d{4}-\\d{2}-\\d{2} by encoder: Activity moved")));

        // a cancelled travel order cannot be edited or moved
        send(put("/api/travel/orders/" + first), encoderLogin, order("2027-03-01", "2027-03-03", ana)).andExpect(status().isBadRequest());
        send(post("/api/travel/orders/" + first + "/reschedule"), encoderLogin,
                Map.of("startDate", "2027-05-01", "endDate", "2027-05-02", "reason", "x")).andExpect(status().isBadRequest());

        saved(order("2027-03-02", "2027-03-02", ana)); // free now

        JsonNode refused = read(send(post("/api/travel/orders/" + first + "/restore"), encoderLogin, Map.of("reason", "")).andExpect(status().isOk()));
        assertThat(refused.get("order").isNull()).isTrue();
        assertThat(refused.get("conflicts")).hasSize(1);

        JsonNode restored = read(send(post("/api/travel/orders/" + first + "/restore"), encoderLogin, Map.of("reason", "Approved by the Chief")));
        assertThat(restored.get("order").get("status").asText()).isEqualTo("ACTIVE");
        assertThat(restored.get("order").get("overlapReason").asText()).isEqualTo("Approved by the Chief");
        assertThat(restored.get("order").get("remarks").asText()).contains("CANCELLED").contains(" | RESTORED");
    }

    @Test
    void rescheduleKeepsTheIdAndTheOldDatesAndPlace() throws Exception {
        JsonNode o = saved(order("2027-03-01", "2027-03-03", ana));
        long id = o.get("id").asLong();
        saved(order("2027-03-10", "2027-03-12", ana));

        // moving onto the other travel is refused without an overlap reason
        JsonNode refused = read(send(post("/api/travel/orders/" + id + "/reschedule"), encoderLogin,
                Map.of("startDate", "2027-03-12", "endDate", "2027-03-14", "reason", "Venue moved")).andExpect(status().isOk()));
        assertThat(refused.get("order").isNull()).isTrue();
        assertThat(refused.get("conflicts")).hasSize(1);

        JsonNode moved = read(send(post("/api/travel/orders/" + id + "/reschedule"), encoderLogin,
                Map.of("startDate", "2027-03-20", "endDate", "2027-03-22", "destination", "Bohol", "reason", "Venue moved"))).get("order");
        assertThat(moved.get("code").asText()).isEqualTo(o.get("code").asText());
        assertThat(moved.get("startDate").asText()).isEqualTo("2027-03-20");
        assertThat(moved.get("destination").asText()).isEqualTo("Bohol");
        assertThat(moved.get("changes")).hasSize(1);
        assertThat(moved.get("changes").get(0).get("reason").asText()).isEqualTo("Venue moved");
        assertThat(moved.get("changes").get(0).get("changedBy").asText()).isEqualTo("encoder");

        // only the place: same dates, so no overlap check; blank place = keep it
        JsonNode place = read(send(post("/api/travel/orders/" + id + "/reschedule"), encoderLogin,
                Map.of("startDate", "2027-03-20", "endDate", "2027-03-22", "destination", "Dumaguete", "reason", "Venue moved again"))).get("order");
        assertThat(place.get("changes")).hasSize(2);
        send(post("/api/travel/orders/" + id + "/reschedule"), encoderLogin,
                Map.of("startDate", "2027-03-20", "endDate", "2027-03-22", "destination", "", "reason", "nothing")).andExpect(status().isBadRequest());
        send(post("/api/travel/orders/" + id + "/reschedule"), encoderLogin,
                Map.of("startDate", "2027-03-20", "endDate", "2027-03-22", "destination", "Cebu", "reason", " ")).andExpect(status().isBadRequest());
    }

    @Test
    void theFormIsChecked() throws Exception {
        send(post("/api/travel/orders"), encoderLogin, order("2027-03-05", "2027-03-01", ana)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("End date is earlier than start date."));
        send(post("/api/travel/orders"), encoderLogin, order("2027-03-01", "2027-03-02")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Add at least one traveler."));
        send(post("/api/travel/orders"), encoderLogin, order("2027-03-01", "2027-03-02", 999999)).andExpect(status().isBadRequest());
        Map<String, Object> noPurpose = order("2027-03-01", "2027-03-02", ana);
        noPurpose.put("purpose", " ");
        send(post("/api/travel/orders"), encoderLogin, noPurpose).andExpect(status().isBadRequest());
        assertThat(orders.count()).isZero();
    }

    @Test
    void theSamePersonCannotBeAddedTwice() throws Exception {
        send(post("/api/travel/personnel"), encoderLogin, Map.of("name", "ana b cruz,")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("ANA B. CRUZ already exists (P0001)."));
        send(post("/api/travel/personnel"), encoderLogin, Map.of("name", "A.")).andExpect(status().isBadRequest());
        // renaming to someone else's name is refused too; saving a person under their own name is fine
        send(put("/api/travel/personnel/" + ben), encoderLogin, Map.of("name", "Ana B. Cruz")).andExpect(status().isConflict());
        send(put("/api/travel/personnel/" + ben), encoderLogin, Map.of("name", "Ben D. Reyes", "employment", "COS", "active", false))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("P0002"))
                .andExpect(jsonPath("$.employment").value("COS")).andExpect(jsonPath("$.active").value(false));
        assertThat(person("Carla E. Santos")).isNotEqualTo(ben);
        assertThat(personnel.findByNameKey("CARLA E SANTOS").orElseThrow().getCode()).isEqualTo("P0003");
    }

    @Test
    void viewerReadsButCannotChange() throws Exception {
        saved(order("2027-03-01", "2027-03-03", ana));
        MockHttpSession viewer = login(Role.VIEWER);
        mvc.perform(get("/api/travel/data").param("year", "2027").session(viewer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.orders.length()").value(1)).andExpect(jsonPath("$.people.length()").value(2))
                .andExpect(jsonPath("$.offices.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(41))).andExpect(jsonPath("$.year").value(2027))
                .andExpect(jsonPath("$.window.from").value("2026-12-01")).andExpect(jsonPath("$.window.to").value("2028-01-31"));
        mvc.perform(get("/api/travel/summary").session(viewer)).andExpect(status().isOk());
        send(post("/api/travel/orders"), viewer, order("2027-06-01", "2027-06-02", ana)).andExpect(status().isForbidden());
        send(post("/api/travel/personnel"), viewer, Map.of("name", "Bagong Tao")).andExpect(status().isForbidden());
        send(post("/api/admin/offices"), encoderLogin, Map.of("name", "BAGO")).andExpect(status().isForbidden());
        mvc.perform(get("/api/travel/data")).andExpect(status().isUnauthorized());
    }

    @Test
    void theYearShowsDecemberBeforeAndJanuaryAfter() throws Exception {
        saved(order("2026-12-28", "2026-12-30", ana));
        saved(order("2026-11-10", "2026-11-12", ana));
        saved(order("2028-01-15", "2028-01-16", ana));
        saved(order("2028-02-15", "2028-02-16", ana));
        mvc.perform(get("/api/travel/data").param("year", "2027").session(encoderLogin))
                .andExpect(jsonPath("$.orders.length()").value(2))
                .andExpect(jsonPath("$.years").value(org.hamcrest.Matchers.hasItems(2026, 2027, 2028)));
    }

    @Test
    void adminManagesOffices() throws Exception {
        MockHttpSession admin = login(Role.ADMIN);
        long id = read(send(post("/api/admin/offices"), admin, Map.of("name", " planning  div ")).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("PLANNING DIV"))).get("id").asLong();
        send(post("/api/admin/offices"), admin, Map.of("name", "frmd")).andExpect(status().isConflict());
        send(put("/api/admin/offices/" + id), admin, Map.of("name", "PLANNING", "active", false)).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("PLANNING")).andExpect(jsonPath("$.active").value(false));
    }
}
