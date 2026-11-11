package ph.fped.portal.config;

import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The React app's TypeScript types are generated from the API description (npm run gen:api).
 * Answers of the API always carry every field, so their fields are marked "required" (otherwise each one
 * would be "maybe missing" in TypeScript). Fields that can be empty are marked @Schema(nullable = true).
 * Request bodies keep their own rules (@NotBlank, @NotNull).
 */
@Configuration
public class OpenApiConfig {

    @Bean
    OpenApiCustomizer responseFieldsAreAlwaysPresent() {
        return api -> {
            if (api.getComponents() == null || api.getComponents().getSchemas() == null) return;
            api.getComponents().getSchemas().values().forEach(schema -> {
                if (schema.getProperties() != null && schema.getRequired() == null) {
                    schema.setRequired(schema.getProperties().keySet().stream().sorted().toList());
                }
            });
        };
    }
}
