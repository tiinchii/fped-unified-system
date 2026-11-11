package ph.fped.portal.importer;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.StringReader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import ph.fped.portal.audit.AuditRepository;
import ph.fped.portal.auth.AuthService;
import ph.fped.portal.auth.LegacyPasswordHasher;
import ph.fped.portal.user.Role;
import ph.fped.portal.user.User;
import ph.fped.portal.user.UserRepository;

@SpringBootTest
@ActiveProfiles("test")
class UserCsvImporterTest {

    @Autowired UserCsvImporter importer;
    @Autowired UserRepository users;
    @Autowired AuditRepository audit;
    @Autowired AuthService auth;

    @BeforeEach
    void empty() {
        audit.deleteAll();
        users.deleteAll();
    }

    @Test
    void importsTheUsersSheetAndTheOldPasswordsStillWork() throws Exception {
        String hash = LegacyPasswordHasher.hash("lumang-password", "salt-1");
        String csv = """
                Username,Full Name,Role,Active,Salt,Password Hash,Created At,Last Login
                admin,Administrator,Admin,Yes,salt-1,%s,1/5/2026 8:30:00,11/3/2026 13:05:10
                Maria.Santos,"Santos, Maria",Encoder,Yes,salt-2,abc=,,
                umalis,Dating Staff,Viewer,No,salt-3,def=,,
                walang.role,No Role,Boss,Yes,salt-4,ghi=,,
                walang.hash,No Hash,Viewer,Yes,,,,
                """.formatted(hash);

        UserCsvImporter.Result result = importer.importUsers(new StringReader(csv));

        assertThat(result.imported()).isEqualTo(3);
        assertThat(result.problems()).hasSize(2);
        User maria = users.findByUsername("maria.santos").orElseThrow();
        assertThat(maria.getFullName()).isEqualTo("Santos, Maria");
        assertThat(maria.getRole()).isEqualTo(Role.ENCODER);
        assertThat(users.findByUsername("umalis").orElseThrow().isActive()).isFalse();
        assertThat(users.findByUsername("admin").orElseThrow().getLastLoginAt()).isNotNull();

        assertThat(auth.login("admin", "lumang-password").getRole()).isEqualTo(Role.ADMIN);
    }

    @Test
    void runningItAgainLeavesExistingUsersAlone() throws Exception {
        String csv = """
                Username,Full Name,Role,Active,Salt,Password Hash,Created At,Last Login
                admin,Administrator,Admin,Yes,salt-1,abc=,,
                """;
        importer.importUsers(new StringReader(csv));
        UserCsvImporter.Result again = importer.importUsers(new StringReader(csv.replace("Administrator", "Iba Na")));

        assertThat(again.imported()).isZero();
        assertThat(again.skipped()).containsExactly("admin");
        assertThat(users.findByUsername("admin").orElseThrow().getFullName()).isEqualTo("Administrator");
    }
}
