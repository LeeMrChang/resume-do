package com.resumedo.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
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

    public record UserResponse(long id, String email, String displayName) {
        public static UserResponse from(UserAccount account) {
            return new UserResponse(account.id(), account.email(), account.displayName());
        }
    }
}
