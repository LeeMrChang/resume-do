package com.resumedo.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class AuthDtos {
    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Size(max = 16) String channel,
            @NotBlank @Size(max = 190) String target,
            @NotBlank @Pattern(regexp = "\\d{6}", message = "请输入 6 位数字验证码") String code,
            @NotBlank @Size(min = 8, max = 72) String password,
            @Size(max = 100) String displayName) {
    }

    public record LoginRequest(
            @NotBlank @Size(max = 190) String account,
            @NotBlank @Size(max = 72) String password) {
    }

    public record VerificationCodeRequest(
            @NotBlank @Size(max = 16) String channel,
            @NotBlank @Size(max = 190) String target,
            @NotBlank @Size(max = 64) String captchaTicket) {
    }

    public record VerificationCodeResponse(int retryAfterSeconds, int expiresInSeconds, String devCode) {
    }

    public record CaptchaResponse(String captchaId, String question, String image, int expiresInSeconds) {
    }

    public record CaptchaClick(double x, double y) {
    }

    public record CaptchaAnswerRequest(@NotNull @Size(min = 1, max = 8) @Valid List<CaptchaClick> points) {
    }

    public record CaptchaTicketResponse(String ticket, int expiresInSeconds) {
    }

    public record ThemePreferenceRequest(
            @NotBlank @Pattern(regexp = "^(light|dark|system)$", message = "主题只能是 light、dark 或 system") String themePreference) {
    }

    public record UserResponse(long id, String email, String phone, String displayName, String themePreference) {
        public static UserResponse from(UserAccount account) {
            return new UserResponse(
                    account.id(),
                    account.email(),
                    account.phone(),
                    account.displayName(),
                    account.themePreference());
        }
    }
}
