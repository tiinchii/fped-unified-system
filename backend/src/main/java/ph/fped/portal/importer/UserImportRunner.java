package ph.fped.portal.importer;

import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** java -jar fped-unified-system.jar --import-users=/path/to/Users.csv */
@Component
public class UserImportRunner implements ApplicationRunner {

    public static final String OPTION = "import-users";
    private static final Logger log = LoggerFactory.getLogger(UserImportRunner.class);

    private final UserCsvImporter importer;

    public UserImportRunner(UserCsvImporter importer) {
        this.importer = importer;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!args.containsOption(OPTION)) return;
        Path file = Path.of(args.getOptionValues(OPTION).get(0));
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            UserCsvImporter.Result result = importer.importUsers(reader);
            log.info("Users imported from {}: {}", file, result.imported());
            if (!result.skipped().isEmpty()) log.info("Already there, left untouched: {}", result.skipped());
            result.problems().forEach(p -> log.warn("Not imported. {}", p));
        }
    }
}
