package ph.fped.portal.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import ph.fped.portal.audit.AuditService;
import ph.fped.portal.importer.UserImportRunner;
import ph.fped.portal.user.Role;
import ph.fped.portal.user.User;
import ph.fped.portal.user.UserRepository;
import ph.fped.portal.user.UserService;

/**
 * A brand-new database has nobody who can log in. While the users table is empty, an Admin is created from
 * APP_BOOTSTRAP_ADMIN_PASSWORD. Once any user exists this does nothing, so the variable can be removed again.
 */
@Component
@Order(0)
public class BootstrapAdminRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BootstrapAdminRunner.class);

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final AuditService audit;
    private final AppProperties.Bootstrap settings;

    public BootstrapAdminRunner(UserRepository users, PasswordEncoder passwordEncoder, AuditService audit, AppProperties properties) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.audit = audit;
        this.settings = properties.bootstrap();
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (args.containsOption(UserImportRunner.OPTION) || users.count() > 0) return;
        String password = settings.adminPassword();
        if (password == null || password.isBlank()) {
            log.warn("There are no users yet. Import them (--{}=Users.csv) or set APP_BOOTSTRAP_ADMIN_PASSWORD and restart "
                    + "to create the first Admin.", UserImportRunner.OPTION);
            return;
        }
        if (password.length() < UserService.MIN_PASSWORD_LENGTH) {
            log.warn("APP_BOOTSTRAP_ADMIN_PASSWORD is shorter than {} characters; no Admin was created.", UserService.MIN_PASSWORD_LENGTH);
            return;
        }
        User admin = new User(settings.adminUsername(), "Administrator", Role.ADMIN);
        admin.setBcryptPassword(passwordEncoder.encode(password));
        users.save(admin);
        audit.log("(setup)", "ADD_USER", admin.getUsername(), "First Admin, created at startup");
        log.info("First Admin \"{}\" created. You can now remove APP_BOOTSTRAP_ADMIN_PASSWORD.", admin.getUsername());
    }
}
