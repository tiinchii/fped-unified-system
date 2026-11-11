package ph.fped.portal.links;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;
import ph.fped.portal.user.Role;

/** Another system shown in the portal menu (FIND, FAST, anything added later). Opens in a new tab. */
@Entity
@Table(name = "portal_links")
public class PortalLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(length = 255)
    private String description;

    /** Null until an Admin sets the address in Settings. */
    @Column(length = 500)
    private String url;

    /** Roles that see the link, comma-separated: "ADMIN,ENCODER,VIEWER". */
    @Column(nullable = false, length = 60)
    private String roles;

    @Column(nullable = false, length = 7)
    private String color;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(nullable = false)
    private boolean active = true;

    protected PortalLink() {}

    public PortalLink(String code) {
        this.code = code;
    }

    public Set<Role> roleSet() {
        if (roles == null || roles.isBlank()) return EnumSet.noneOf(Role.class);
        return Arrays.stream(roles.split(",")).map(Role::parse)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(Role.class)));
    }

    public void setRoleSet(Set<Role> set) {
        this.roles = EnumSet.copyOf(set).stream().map(Role::name).collect(Collectors.joining(","));
    }

    public Long getId() { return id; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
