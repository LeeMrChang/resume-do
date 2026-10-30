package com.resumedo.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class AuthDtos {
    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 190) String email,
            @NotBlank @Size(min = 8, max = 72) String password,
            @Size(max = 100) String displayName) {
    }

    public record LoginRequest(
            @NotBlank @Email @Size(max = 190) String email,
            @NotBlank @Size(max = 72) String password) {
    }

    public record ThemePreferenceRequest(
            @NotBlank @Pattern(regexp = "^(light|dark|system)$", message = "主题只能是 light、dark 或 system") String themePreference) {
    }

    public record UserResponse(long id, String email, String displayName, String themePreference) {
        public static UserResponse from(UserAccount account) {
            return new UserResponse(
                    account.id(), account.email(), account.displayName(), account.themePreference());
        }
    }
}
