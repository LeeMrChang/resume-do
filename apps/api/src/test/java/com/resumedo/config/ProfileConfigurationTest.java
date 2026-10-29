package com.resumedo.config;

import static org.assertj.core.api.Assertions.*;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

class ProfileConfigurationTest {
    private GenericApplicationContext config(Map<String, Object> properties) {
        var context = new GenericApplicationContext();
        var sources = context.getEnvironment().getPropertySources();
        // Never read a developer's real database credentials in these config checks.
        sources.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        sources.remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        sources.addFirst(new MapPropertySource("test", new HashMap<>(properties)));
        new ConfigDataApplicationContextInitializer().initialize(context);
        return context;
    }

    @Test void localLoadsDefaultsAndSharedSettings() {
        try (var context = config(Map.of("spring.profiles.active", "local"))) {
            var env = context.getEnvironment();
            assertThat(env.getProperty("spring.datasource.password")).isEqualTo("change_me");
            assertThat(env.getProperty("spring.datasource.url")).contains("127.0.0.1:3306/resume_do?");
            assertThat(env.getProperty("app.storage-dir")).isEqualTo("../../data");
            assertThat(env.getProperty("spring.servlet.multipart.max-file-size")).isEqualTo("20MB");
            assertThat(env.getProperty("app.template-version")).isEqualTo("2");
        }
    }

    @Test void defaultUsesProdAndRequiresInjectedPassword() {
        try (var context = config(Map.of())) {
            var env = context.getEnvironment();
            assertThat(env.getDefaultProfiles()).containsExactly("prod");
            assertThat(env.getProperty("app.storage-dir")).isEqualTo("/data");
            assertThatThrownBy(() -> env.getProperty("spring.datasource.password"))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test void explicitProdUsesInjectedSettings() {
        try (var context = config(Map.of("spring.profiles.active", "prod",
                "RESUME_DO_DB_PASSWORD", "synthetic-test-only",
                "RESUME_DO_DB_HOST", "test-db", "RESUME_DO_STORAGE_DIR", "/test-data"))) {
            var env = context.getEnvironment();
            assertThat(env.getProperty("spring.datasource.password")).isEqualTo("synthetic-test-only");
            assertThat(env.getProperty("spring.datasource.url")).contains("test-db:3306/resume_do?");
            assertThat(env.getProperty("app.storage-dir")).isEqualTo("/test-data");
        }
    }
}
