package ph.fped.portal.user;

import java.util.Locale;

/**
 * ADMIN: everything + users and settings. ENCODER: encode and edit records, Gmail and Calendar.
 * VIEWER: read only.
 */
public enum Role {
    ADMIN,
    ENCODER,
    VIEWER;

    /** "Admin", "encoder" (as written in the old Google Sheet) -> ADMIN, ENCODER. */
    public static Role parse(String text) {
        return valueOf(text.trim().toUpperCase(Locale.ROOT));
    }

    public String authority() {
        return "ROLE_" + name();
    }
}
