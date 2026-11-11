package ph.fped.portal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import ph.fped.portal.audit.AuditRepository;
import ph.fped.portal.auth.LegacyPasswordHasher;
import ph.fped.portal.user.Role;
import ph.fped.portal.user.User;
import ph.fped.portal.user.UserRepository;

/** Login, roles and the Admin screens, through the real HTTP layer and the real Flyway tables. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ApiFlowTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired AuditRepository audit;
    @Autowired PasswordEncoder encoder;

    @BeforeEach
    void users() {
        audit.deleteAll();
        users.deleteAll();
        users.save(user("admin", Role.ADMIN, "admin-pass-1"));
        users.save(user("encoder", Role.ENCODER, "encoder-pass-1"));
        users.save(user("viewer", Role.VIEWER, "viewer-pass-1"));
    }

    private User user(String username, Role role, String password) {
        User u = new User(username, username + " name", role);
        u.setBcryptPassword(encoder.encode(password));
        return u;
    }

    private MockHttpSession login(String username, String password) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getRequest().getSession(false);
    }

    private static String loginBody(String username, String password) {
        return "{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}";
    }

    @Test
    void nothingWithoutLogin() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Please log in."));
        mvc.perform(get("/api/links")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/users")).andExpect(status().isUnauthorized());
    }

    @Test
    void loginGivesASessionAndLogoutEndsIt() throws Exception {
        MockHttpSession session = login("Admin ", "admin-pass-1"); // username is trimmed and not case-sensitive
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("admin")).andExpect(jsonPath("$.role").value("ADMIN"));
        assertThat(users.findByUsername("admin").orElseThrow().getLastLoginAt()).isNotNull();

        mvc.perform(post("/api/auth/logout").session(session).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
    }

    @Test
    void changingRequestsNeedTheCsrfToken() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginBody("admin", "admin-pass-1")))
                .andExpect(status().isForbidden());
    }

    @Test
    void wrongPasswordIsRefusedAndTheUsernameLocksAfterFiveTries() throws Exception {
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(loginBody("encoder", "nope")))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.message").value("Wrong username or password."));
        }
        // locked now: even the right password is refused
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(loginBody("encoder", "encoder-pass-1")))
                .andExpect(status().isTooManyRequests());
        assertThat(users.findByUsername("encoder").orElseThrow().getLockedUntil()).isNotNull();
        // an unknown username gets the same answer as a wrong password
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(loginBody("nobody", "x")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Wrong username or password."));
    }

    @Test
    void importedUserLogsInWithTheOldPasswordWhichIsThenStoredWithBcrypt() throws Exception {
        User old = new User("lumang.user", "Lumang User", Role.ENCODER);
        old.setLegacyPassword("salt-abc", LegacyPasswordHasher.hash("dating-password", "salt-abc"));
        users.save(old);

        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(loginBody("lumang.user", "mali")))
                .andExpect(status().isUnauthorized());
        login("lumang.user", "dating-password");

        User after = users.findByUsername("lumang.user").orElseThrow();
        assertThat(after.hasLegacyPassword()).isFalse();
        assertThat(encoder.matches("dating-password", after.getPasswordHash())).isTrue();
        login("lumang.user", "dating-password"); // and still works afterwards
    }

    @Test
    void onlyAdminReachesTheAdminScreens() throws Exception {
        mvc.perform(get("/api/admin/users").session(login("encoder", "encoder-pass-1"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/audit").session(login("viewer", "viewer-pass-1"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/users").session(login("admin", "admin-pass-1"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
    }

    @Test
    void adminAddsAUserWhoCanThenLogIn() throws Exception {
        MockHttpSession admin = login("admin", "admin-pass-1");
        mvc.perform(post("/api/admin/users").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"bago\",\"fullName\":\"Bagong User\",\"role\":\"VIEWER\",\"password\":\"bago-pass-1\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.role").value("VIEWER"));
        login("bago", "bago-pass-1");

        mvc.perform(post("/api/admin/users").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"bago\",\"fullName\":\"Ulit\",\"role\":\"VIEWER\",\"password\":\"bago-pass-1\"}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/admin/users").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"x\",\"fullName\":\"Maikli\",\"role\":\"VIEWER\",\"password\":\"short\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deactivatedUserIsLoggedOutAtOnce() throws Exception {
        MockHttpSession admin = login("admin", "admin-pass-1");
        MockHttpSession viewer = login("viewer", "viewer-pass-1");
        long id = users.findByUsername("viewer").orElseThrow().getId();

        mvc.perform(put("/api/admin/users/" + id).session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"viewer name\",\"role\":\"VIEWER\",\"active\":false}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").session(viewer)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(loginBody("viewer", "viewer-pass-1")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void roleChangeAppliesToAnOpenLogin() throws Exception {
        MockHttpSession admin = login("admin", "admin-pass-1");
        MockHttpSession encoder = login("encoder", "encoder-pass-1");
        long id = users.findByUsername("encoder").orElseThrow().getId();

        mvc.perform(put("/api/admin/users/" + id).session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"encoder name\",\"role\":\"ADMIN\",\"active\":true}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/admin/users").session(encoder)).andExpect(status().isOk());
    }

    @Test
    void adminCannotRemoveOwnAdminAccess() throws Exception {
        MockHttpSession admin = login("admin", "admin-pass-1");
        long id = users.findByUsername("admin").orElseThrow().getId();
        mvc.perform(put("/api/admin/users/" + id).session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"admin name\",\"role\":\"VIEWER\",\"active\":true}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void changePasswordNeedsTheCurrentOne() throws Exception {
        MockHttpSession viewer = login("viewer", "viewer-pass-1");
        mvc.perform(post("/api/auth/change-password").session(viewer).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"mali\",\"newPassword\":\"bagong-pass-1\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/change-password").session(viewer).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"viewer-pass-1\",\"newPassword\":\"bagong-pass-1\"}"))
                .andExpect(status().isNoContent());
        login("viewer", "bagong-pass-1");
    }

    @Test
    void menuLinksFollowTheRoleAndAdminCanEditThem() throws Exception {
        MockHttpSession admin = login("admin", "admin-pass-1");
        MockHttpSession viewer = login("viewer", "viewer-pass-1");
        mvc.perform(get("/api/links").session(viewer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].code").value("find"));

        String created = mvc.perform(post("/api/admin/links").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"ppmp\",\"name\":\"PPMP\",\"description\":\"\",\"url\":\"https://example.org/ppmp\","
                                + "\"roles\":[\"ADMIN\"],\"color\":\"#2e6aa5\",\"sortOrder\":3,\"active\":true}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertThat(created).contains("\"code\":\"ppmp\"");

        mvc.perform(get("/api/links").session(viewer)).andExpect(jsonPath("$.length()").value(2)); // Admin-only link stays hidden
        mvc.perform(get("/api/links").session(admin)).andExpect(jsonPath("$.length()").value(3));

        mvc.perform(post("/api/admin/links").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"bad\",\"name\":\"Bad\",\"url\":\"javascript:alert(1)\","
                                + "\"roles\":[\"ADMIN\"],\"color\":\"#2e6aa5\",\"sortOrder\":4,\"active\":true}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/admin/links").session(viewer).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"v\",\"name\":\"V\",\"roles\":[\"VIEWER\"],\"color\":\"#2e6aa5\",\"sortOrder\":4,\"active\":true}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void changesAreWrittenToTheAuditLog() throws Exception {
        MockHttpSession admin = login("admin", "admin-pass-1");
        mvc.perform(post("/api/admin/users").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"bago\",\"fullName\":\"Bagong User\",\"role\":\"VIEWER\",\"password\":\"bago-pass-1\"}"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/admin/audit").param("q", "add_user").session(admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].username").value("admin"))
                .andExpect(jsonPath("$.items[0].recordId").value("bago"));
    }
}
