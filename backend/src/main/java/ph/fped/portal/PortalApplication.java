package ph.fped.portal;

import java.util.Arrays;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import ph.fped.portal.importer.UserImportRunner;

@SpringBootApplication
@ConfigurationPropertiesScan
public class PortalApplication {

    public static void main(String[] args) {
        SpringApplication app = new SpringApplication(PortalApplication.class);
        // "--import-users=Users.csv" is a one-off command: do the import and stop, without starting the web server
        if (Arrays.stream(args).anyMatch(a -> a.startsWith("--" + UserImportRunner.OPTION + "="))) {
            app.setWebApplicationType(WebApplicationType.NONE);
        }
        app.run(args);
    }
}
