package com.resumedo.auth;

public record UserAccount(long id, String email, String passwordHash, String displayName, String themePreference) {
}
