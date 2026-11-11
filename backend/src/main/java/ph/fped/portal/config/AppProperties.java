package ph.fped.portal.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Settings under "app." in application.yml. */
@ConfigurationProperties(prefix = "app")
public record AppProperties(Login login, Bootstrap bootstrap) {

    /** After maxFailedAttempts wrong passwords the username is locked for lockDuration. */
    public record Login(@DefaultValue("5") int maxFailedAttempts, @DefaultValue("15m") Duration lockDuration) {}

    /**
     * First admin, created only while the users table is empty. The password comes from the environment
     * (APP_BOOTSTRAP_ADMIN_PASSWORD) and is never stored in the repository.
     */
    public record Bootstrap(@DefaultValue("admin") String adminUsername, String adminPassword) {}
}
