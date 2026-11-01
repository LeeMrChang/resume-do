package com.resumedo.auth;

public record UserAccount(
        long id,
        String email,
        String phone,
        String passwordHash,
        String displayName,
        String themePreference) {

    public String loginName() {
        return email != null ? email : phone;
    }
}
