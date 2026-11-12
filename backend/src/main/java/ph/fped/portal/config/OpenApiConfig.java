package ph.fped.portal.config;

import io.swagger.v3.oas.models.media.Schema;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The React app's TypeScript types are generated from the API description (npm run gen:api).
 * Answers of the API always carry every field, so their fields are marked "required" (otherwise each one
 * would be "maybe missing" in TypeScript). Fields that can be empty are marked @Schema(nullable = true).
 * Request bodies keep their own rules (@NotBlank, @NotNull).
 * A nullable field that is itself an object is rewritten as "that object or null", the form the generator understands.
 */
@Configuration
public class OpenApiConfig {

    @Bean
    OpenApiCustomizer responseFieldsAreAlwaysPresent() {
        return api -> {
            if (api.getComponents() == null || api.getComponents().getSchemas() == null) return;
            api.getComponents().getSchemas().values().forEach(schema -> {
                if (schema.getProperties() != null) objectsOrNull(schema);
                if (schema.getProperties() != null && schema.getRequired() == null) {
                    schema.setRequired(schema.getProperties().keySet().stream().sorted().toList());
                }
            });
        };
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private static void objectsOrNull(Schema schema) {
        Map<String, Schema> properties = schema.getProperties();
        properties.replaceAll((name, p) -> p.get$ref() == null || p.getTypes() == null || !p.getTypes().contains("null") ? p
                : new Schema<>().anyOf(List.of(new Schema<>().$ref(p.get$ref()), new Schema<>().types(Set.of("null")))));
    }
}
