package com.resumedo.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.resumedo.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

class AuthServiceTest {
    private final UserRepository users = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final AuthenticationManager authenticationManager = mock(AuthenticationManager.class);
    private final VerificationService verification = mock(VerificationService.class);
    private final AuthService service = new AuthService(users, passwordEncoder, authenticationManager, verification);

    @Test
    void registerVerifiesTheCodeAndDerivesDisplayNameFromEmail() {
        when(users.existsByAccount("alice@example.com")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("hash-1");
        when(users.insert(eq("alice@example.com"), isNull(), eq("hash-1"), anyString())).thenReturn(42L);
        when(users.findById(42L)).thenReturn(Optional.of(
                new UserAccount(42, "alice@example.com", null, "hash-1", "alice", "dark")));

        UserAccount account = service.register(
                "email", "  Alice@Example.com ", "123456", "password123", "   ");

        verify(verification).consume("email", "alice@example.com", "123456");
        ArgumentCaptor<String> name = ArgumentCaptor.forClass(String.class);
        verify(users).insert(eq("alice@example.com"), isNull(), eq("hash-1"), name.capture());
        assertThat(name.getValue()).isEqualTo("alice");
        assertThat(account.email()).isEqualTo("alice@example.com");
    }

    @Test
    void registerNormalizesPhoneNumbersAndStoresNoEmail() {
        when(users.existsByAccount("+8613800138000")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("hash-2");
        when(users.insert(isNull(), eq("+8613800138000"), eq("hash-2"), eq("用户8000"))).thenReturn(43L);
        when(users.findById(43L)).thenReturn(Optional.of(
                new UserAccount(43, null, "+8613800138000", "hash-2", "用户8000", "dark")));

        UserAccount account = service.register("phone", "138 0013 8000", "654321", "password123", null);

        verify(verification).consume("phone", "+8613800138000", "654321");
        assertThat(account.phone()).isEqualTo("+8613800138000");
        assertThat(account.loginName()).isEqualTo("+8613800138000");
    }

    @Test
    void registerRejectsInvalidTargetsBeforeRequestingACode() {
        assertThatThrownBy(() -> service.register("email", "not-an-email", "123456", "password123", "Bob"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("邮箱");
        assertThatThrownBy(() -> service.register("phone", "12800138000", "123456", "password123", "Bob"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("手机号");
        verify(verification, never()).consume(anyString(), anyString(), anyString());
    }

    @Test
    void registerRejectsDuplicateAccounts() {
        when(users.existsByAccount("bob@example.com")).thenReturn(true);

        assertThatThrownBy(() -> service.register("email", "bob@example.com", "123456", "password123", "Bob"))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> {
                    ApiException error = (ApiException) throwable;
                    assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(error.code()).isEqualTo("ACCOUNT_EXISTS");
                });

        verify(verification, never()).consume(anyString(), anyString(), anyString());
        verify(users, never()).insert(any(), any(), anyString(), anyString());
    }

    @Test
    void loginThrowsUnauthorizedForBadCredentials() {
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenThrow(new BadCredentialsException("bad credentials"));

        assertThatThrownBy(() -> service.login("carol@example.com", "wrong-pass", mock(HttpServletRequest.class)))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> assertThat(((ApiException) throwable).status())
                        .isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @Test
    void loginStoresSecurityContextInSession() {
        Authentication authentication = mock(Authentication.class);
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenReturn(authentication);
        when(users.findByAccount("dave@example.com"))
                .thenReturn(Optional.of(new UserAccount(9, "dave@example.com", null, "hash", "Dave", "dark")));

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpSession session = mock(HttpSession.class);
        when(request.getSession(false)).thenReturn(null);
        when(request.getSession(true)).thenReturn(session);

        UserAccount account = service.login(" Dave@Example.com ", "password123", request);

        verify(session).setAttribute(
                eq(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY), any());
        assertThat(account.id()).isEqualTo(9);
    }

    @Test
    void loginAcceptsPhoneAccounts() {
        Authentication authentication = mock(Authentication.class);
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenReturn(authentication);
        when(users.findByAccount("+8613800138000"))
                .thenReturn(Optional.of(new UserAccount(12, null, "+8613800138000", "hash", "用户8000", "dark")));

        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getSession(false)).thenReturn(null);
        when(request.getSession(true)).thenReturn(mock(HttpSession.class));

        UserAccount account = service.login("138 0013 8000", "password123", request);

        assertThat(account.phone()).isEqualTo("+8613800138000");
    }

    @Test
    void currentThrowsUnauthorizedForUnknownAccount() {
        when(users.findByAccount("ghost@example.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.current("ghost@example.com"))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> assertThat(((ApiException) throwable).status())
                        .isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @Test
    void updateThemePreferencePersistsAndReturnsUpdatedAccount() {
        when(users.findByAccount("eve@example.com"))
                .thenReturn(Optional.of(new UserAccount(11, "eve@example.com", null, "hash", "Eve", "dark")));
        when(users.findById(11L))
                .thenReturn(Optional.of(new UserAccount(11, "eve@example.com", null, "hash", "Eve", "light")));

        UserAccount updated = service.updateThemePreference(" Eve@Example.com ", "light");

        verify(users).updateThemePreference(11, "light");
        assertThat(updated.themePreference()).isEqualTo("light");
    }
}
