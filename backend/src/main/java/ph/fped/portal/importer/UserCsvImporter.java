package ph.fped.portal.importer;

import java.io.IOException;
import java.io.Reader;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ph.fped.portal.audit.AuditService;
import ph.fped.portal.user.Role;
import ph.fped.portal.user.User;
import ph.fped.portal.user.UserRepository;

/**
 * Copies the logins of the old Travel Order System: its "Users" sheet, downloaded as CSV
 * (File > Download > Comma-separated values). Columns:
 * Username, Full Name, Role, Active, Salt, Password Hash, Created At, Last Login.
 *
 * The passwords come along as they are (salt + hash), so nobody needs a new password.
 * Usernames that already exist here are left untouched, so the import can be run again.
 */
@Service
public class UserCsvImporter {

    private static final ZoneId MANILA = ZoneId.of("Asia/Manila");
    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
            DateTimeFormatter.ofPattern("M/d/yyyy H:mm:ss"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd H:mm:ss"),
            DateTimeFormatter.ofPattern("yyyy-MM-dd H:mm"));

    private final UserRepository users;
    private final AuditService audit;

    public UserCsvImporter(UserRepository users, AuditService audit) {
        this.users = users;
        this.audit = audit;
    }

    public record Result(int imported, List<String> skipped, List<String> problems) {}

    @Transactional
    public Result importUsers(Reader csv) throws IOException {
        int imported = 0;
        List<String> skipped = new ArrayList<>();
        List<String> problems = new ArrayList<>();
        CSVFormat format = CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true)
                .setIgnoreHeaderCase(true).setTrim(true).setIgnoreEmptyLines(true).get();
        try (CSVParser parser = format.parse(csv)) {
            for (CSVRecord row : parser) {
                String username = row.get("Username").toLowerCase(Locale.ROOT);
                if (username.isEmpty()) continue;
                String where = "Row " + row.getRecordNumber() + " (" + username + "): ";
                if (users.existsByUsername(username)) {
                    skipped.add(username);
                    continue;
                }
                Role role;
                try {
                    role = Role.parse(row.get("Role"));
                } catch (IllegalArgumentException e) {
                    problems.add(where + "unknown role \"" + row.get("Role") + "\"");
                    continue;
                }
                String salt = row.get("Salt"), hash = row.get("Password Hash");
                if (salt.isEmpty() || hash.isEmpty()) {
                    problems.add(where + "no salt / password hash");
                    continue;
                }
                String fullName = row.get("Full Name");
                User user = new User(username, fullName.isEmpty() ? username : fullName, role);
                user.setActive(isYes(row.get("Active")));
                user.setLegacyPassword(salt, hash);
                Instant created = parseDate(row.get("Created At"));
                if (created != null) user.setCreatedAt(created);
                user.setLastLoginAt(parseDate(row.get("Last Login")));
                users.save(user);
                imported++;
            }
        }
        audit.log("(import)", "IMPORT_USERS", null,
                imported + " imported, " + skipped.size() + " already there, " + problems.size() + " problem(s)");
        return new Result(imported, skipped, problems);
    }

    private static boolean isYes(String v) {
        return v.equalsIgnoreCase("yes") || v.equalsIgnoreCase("true");
    }

    /** Dates as Google Sheets writes them in a CSV; an unreadable date is simply left empty. */
    private static Instant parseDate(String text) {
        if (text == null || text.isBlank()) return null;
        for (DateTimeFormatter f : DATE_FORMATS) {
            try {
                return LocalDateTime.parse(text.trim(), f).atZone(MANILA).toInstant();
            } catch (DateTimeParseException e) {
                // try the next format
            }
        }
        return null;
    }
}
