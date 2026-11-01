package com.resumedo.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.resumedo.auth.AuthDtos.VerificationCodeResponse;
import com.resumedo.auth.VerificationCodeRepository.Code;
import com.resumedo.common.ApiException;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

class VerificationServiceTest {
    private final VerificationCodeRepository codes = mock(VerificationCodeRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final CaptchaService captcha = mock(CaptchaService.class);
    private final VerificationCodeSender sender = mock(VerificationCodeSender.class);
    private final VerificationProperties properties = new VerificationProperties();
    private final VerificationService service =
            new VerificationService(codes, users, passwordEncoder, captcha, sender, properties);

    @Test
    void rejectsInvalidTargetsBeforeAnyDelivery() {
        assertThatThrownBy(() -> service.send("email", "not-an-email", "ticket", "1.1.1.1"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("邮箱");
        verify(captcha, never()).consumeTicket(anyString(), anyString());
    }

    @Test
    void rejectsAlreadyRegisteredAccounts() {
        when(users.existsByAccount("taken@example.com")).thenReturn(true);

        assertThatThrownBy(() -> service.send("email", "taken@example.com", "ticket", "1.1.1.1"))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> assertThat(((ApiException) throwable).code()).isEqualTo("ACCOUNT_EXISTS"));
        verify(captcha, never()).consumeTicket(anyString(), anyString());
    }

    @Test
    void storesHashedCodeAndDeliversIt() {
        when(users.existsByAccount("alice@example.com")).thenReturn(false);
        when(codes.lastCreatedAt("email", "alice@example.com", "register")).thenReturn(Optional.empty());
        when(codes.countForTargetSince(eq("email"), eq("alice@example.com"), eq("register"), any())).thenReturn(0);
        when(codes.countForIpSince(eq("1.1.1.1"), any())).thenReturn(0);
        when(passwordEncoder.encode(anyString())).thenReturn("hashed");
        when(codes.insert(eq("email"), eq("alice@example.com"), eq("register"), eq("hashed"), any(), eq("1.1.1.1")))
                .thenReturn(7L);

        VerificationCodeResponse response = service.send("email", " Alice@Example.com ", "ticket", "1.1.1.1");

        verify(captcha).consumeTicket("ticket", "1.1.1.1");
        verify(sender).send(eq("email"), eq("alice@example.com"), argThat(code -> code.matches("\\d{6}")));
        assertThat(response.retryAfterSeconds()).isEqualTo(60);
        assertThat(response.devCode()).isNull();
    }

    @Test
    void exposesTheCodeOnlyWhenTheDeveloperFlagIsOn() {
        properties.setExposeCode(true);
        when(users.existsByAccount("alice@example.com")).thenReturn(false);
        when(codes.lastCreatedAt("email", "alice@example.com", "register")).thenReturn(Optional.empty());
        when(codes.countForTargetSince(eq("email"), eq("alice@example.com"), eq("register"), any())).thenReturn(0);
        when(codes.countForIpSince(eq("1.1.1.1"), any())).thenReturn(0);
        when(passwordEncoder.encode(anyString())).thenReturn("hashed");

        VerificationCodeResponse response = service.send("email", "alice@example.com", "ticket", "1.1.1.1");

        assertThat(response.devCode()).matches("\\d{6}");
        verify(sender, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    void sendsRealMailWhenTheDeveloperFlagIsOnButTheChannelIsConfigured() {
        properties.setExposeCode(true);
        when(users.existsByAccount("alice@example.com")).thenReturn(false);
        when(codes.lastCreatedAt("email", "alice@example.com", "register")).thenReturn(Optional.empty());
        when(codes.countForTargetSince(eq("email"), eq("alice@example.com"), eq("register"), any())).thenReturn(0);
        when(codes.countForIpSince(eq("1.1.1.1"), any())).thenReturn(0);
        when(passwordEncoder.encode(anyString())).thenReturn("hashed");
        when(sender.isAvailable("email")).thenReturn(true);

        VerificationCodeResponse response = service.send("email", "alice@example.com", "ticket", "1.1.1.1");

        assertThat(response.devCode()).isNull();
        verify(sender).send(eq("email"), eq("alice@example.com"), argThat(code -> code.matches("\\d{6}")));
    }

    @Test
    void enforcesTheResendCooldown() {
        when(users.existsByAccount("alice@example.com")).thenReturn(false);
        when(codes.lastCreatedAt("email", "alice@example.com", "register")).thenReturn(Optional.of(Instant.now()));

        assertThatThrownBy(() -> service.send("email", "alice@example.com", "ticket", "1.1.1.1"))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> {
                    ApiException error = (ApiException) throwable;
                    assertThat(error.status()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                    assertThat(error.code()).isEqualTo("CODE_COOLDOWN");
                });
        verify(sender, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    void disablesStoredCodeWhenDeliveryFails() {
        when(users.existsByAccount("alice@example.com")).thenReturn(false);
        when(codes.lastCreatedAt("email", "alice@example.com", "register")).thenReturn(Optional.empty());
        when(codes.countForTargetSince(eq("email"), eq("alice@example.com"), eq("register"), any())).thenReturn(0);
        when(codes.countForIpSince(eq("1.1.1.1"), any())).thenReturn(0);
        when(passwordEncoder.encode(anyString())).thenReturn("hashed");
        when(codes.insert(any(), any(), any(), any(), any(), any())).thenReturn(9L);
        org.mockito.Mockito.doThrow(ApiException.serviceUnavailable("CODE_DELIVERY_UNAVAILABLE", "未开通"))
                .when(sender).send(anyString(), anyString(), anyString());

        assertThatThrownBy(() -> service.send("email", "alice@example.com", "ticket", "1.1.1.1"))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> assertThat(((ApiException) throwable).code()).isEqualTo("CODE_DELIVERY_UNAVAILABLE"));
        verify(codes).markConsumed(9L);
    }

    @Test
    void rejectsWrongCodesAndCountsAttempts() {
        Instant now = Instant.now();
        when(codes.findLatestActive("email", "alice@example.com", "register"))
                .thenReturn(Optional.of(new Code(1L, "hash", 0, now.plusSeconds(300), now)));
        when(passwordEncoder.matches("111111", "hash")).thenReturn(false);

        assertThatThrownBy(() -> service.consume("email", "alice@example.com", "111111"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("验证码不正确");
        verify(codes).incrementAttempts(1L);
        verify(codes, never()).markConsumed(1L);
    }

    @Test
    void expiredCodesCannotBeUsed() {
        Instant now = Instant.now();
        when(codes.findLatestActive("email", "alice@example.com", "register"))
                .thenReturn(Optional.of(new Code(2L, "hash", 0, now.minusSeconds(1), now.minusSeconds(601))));

        assertThatThrownBy(() -> service.consume("email", "alice@example.com", "123456"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("过期");
    }

    @Test
    void validCodesAreConsumedExactlyOnce() {
        Instant now = Instant.now();
        when(codes.findLatestActive("phone", "+8613800138000", "register"))
                .thenReturn(Optional.of(new Code(3L, "hash", 0, now.plusSeconds(300), now)));
        when(passwordEncoder.matches("123456", "hash")).thenReturn(true);
        when(codes.markConsumed(3L)).thenReturn(true);

        service.consume("phone", "138 0013 8000", "123456");

        verify(codes).markConsumed(3L);
    }
}
