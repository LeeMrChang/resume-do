package com.resumedo.auth;

import com.resumedo.auth.AuthDtos.CaptchaAnswerRequest;
import com.resumedo.auth.AuthDtos.CaptchaResponse;
import com.resumedo.auth.AuthDtos.CaptchaTicketResponse;
import com.resumedo.auth.AuthDtos.LoginRequest;
import com.resumedo.auth.AuthDtos.RegisterRequest;
import com.resumedo.auth.AuthDtos.ThemePreferenceRequest;
import com.resumedo.auth.AuthDtos.UserResponse;
import com.resumedo.auth.AuthDtos.VerificationCodeRequest;
import com.resumedo.auth.AuthDtos.VerificationCodeResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;
    private final CaptchaService captchaService;
    private final VerificationService verificationService;

    public AuthController(
            AuthService authService,
            CaptchaService captchaService,
            VerificationService verificationService) {
        this.authService = authService;
        this.captchaService = captchaService;
        this.verificationService = verificationService;
    }

    @GetMapping("/captcha")
    public CaptchaResponse captcha(HttpServletRequest request) {
        return captchaService.create(request.getRemoteAddr());
    }

    @PostMapping("/captcha/{captchaId}/verify")
    public CaptchaTicketResponse verifyCaptcha(
            @PathVariable String captchaId,
            @Valid @RequestBody CaptchaAnswerRequest body,
            HttpServletRequest request) {
        return captchaService.verify(captchaId, body.points(), request.getRemoteAddr());
    }

    @PostMapping("/verification-codes")
    public VerificationCodeResponse sendVerificationCode(
            @Valid @RequestBody VerificationCodeRequest body,
            HttpServletRequest request) {
        return verificationService.send(
                body.channel(), body.target(), body.captchaTicket(), request.getRemoteAddr());
    }

    @PostMapping("/register")
    public UserResponse register(@Valid @RequestBody RegisterRequest body, HttpServletRequest request) {
        UserAccount account = authService.register(
                body.channel(), body.target(), body.code(), body.password(), body.displayName());
        authService.login(account.loginName(), body.password(), request);
        return UserResponse.from(account);
    }

    @PostMapping("/login")
    public UserResponse login(@Valid @RequestBody LoginRequest body, HttpServletRequest request) {
        return UserResponse.from(authService.login(body.account(), body.password(), request));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        authService.logout(request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public UserResponse me(Authentication authentication) {
        return UserResponse.from(authService.current(authentication.getName()));
    }

    @PatchMapping("/me")
    public UserResponse updateTheme(
            @Valid @RequestBody ThemePreferenceRequest body, Authentication authentication) {
        return UserResponse.from(
                authService.updateThemePreference(authentication.getName(), body.themePreference()));
    }
}
