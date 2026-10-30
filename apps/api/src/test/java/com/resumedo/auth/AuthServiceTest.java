package com.resumedo.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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
    private final AuthService service = new AuthService(users, passwordEncoder, authenticationManager);

    @Test
    void registerNormalizesEmailAndDerivesDisplayName() {
        when(users.existsByEmail("alice@example.com")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("hash-1");
        when(users.insert(eq("alice@example.com"), eq("hash-1"), anyString())).thenReturn(42L);
        when(users.findById(42L)).thenReturn(Optional.of(
                new UserAccount(42, "alice@example.com", "hash-1", "alice", "dark")));

        UserAccount account = service.register("  Alice@Example.com ", "password123", "   ");

        ArgumentCaptor<String> name = ArgumentCaptor.forClass(String.class);
        verify(users).insert(eq("alice@example.com"), eq("hash-1"), name.capture());
        assertThat(name.getValue()).isEqualTo("alice");
        assertThat(account.email()).isEqualTo("alice@example.com");
    }

    @Test
    void registerRejectsDuplicateEmail() {
        when(users.existsByEmail("bob@example.com")).thenReturn(true);

        assertThatThrownBy(() -> service.register("bob@example.com", "password123", "Bob"))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> {
                    ApiException error = (ApiException) throwable;
                    assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(error.code()).isEqualTo("EMAIL_EXISTS");
                });

        verify(users, never()).insert(anyString(), anyString(), anyString());
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
        when(users.findByEmail("dave@example.com"))
                .thenReturn(Optional.of(new UserAccount(9, "dave@example.com", "hash", "Dave", "dark")));

        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpSession session = mock(HttpSession.class);
        when(request.getSession(false)).thenReturn(null);
        when(request.getSession(true)).thenReturn(session);

        UserAccount account = service.login("dave@example.com", "password123", request);

        verify(session).setAttribute(
                eq(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY), any());
        assertThat(account.id()).isEqualTo(9);
    }

    @Test
    void currentThrowsUnauthorizedForUnknownEmail() {
        when(users.findByEmail("ghost@example.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.current("ghost@example.com"))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> assertThat(((ApiException) throwable).status())
                        .isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @Test
    void updateThemePreferencePersistsAndReturnsUpdatedAccount() {
        when(users.findByEmail("eve@example.com"))
                .thenReturn(Optional.of(new UserAccount(11, "eve@example.com", "hash", "Eve", "dark")));
        when(users.findById(11L))
                .thenReturn(Optional.of(new UserAccount(11, "eve@example.com", "hash", "Eve", "light")));

        UserAccount updated = service.updateThemePreference(" Eve@Example.com ", "light");

        verify(users).updateThemePreference(11, "light");
        assertThat(updated.themePreference()).isEqualTo("light");
    }
}
