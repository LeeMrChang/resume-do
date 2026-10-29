package com.resumedo.auth;

import com.resumedo.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;

    public AuthService(
            UserRepository users,
            PasswordEncoder passwordEncoder,
            AuthenticationManager authenticationManager) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
    }

    @Transactional
    public UserAccount register(String rawEmail, String password, String displayName) {
        String email = normalizeEmail(rawEmail);
        if (users.existsByEmail(email)) {
            throw ApiException.conflict("EMAIL_EXISTS", "该邮箱已注册", java.util.Map.of());
        }
        String name = displayName == null ? "" : displayName.trim();
        if (name.isEmpty()) {
            name = email.substring(0, email.indexOf('@'));
        }
        long id = users.insert(email, passwordEncoder.encode(password), name);
        return users.findById(id).orElseThrow(() -> new IllegalStateException("User vanished after insert"));
    }

    public UserAccount login(String rawEmail, String password, HttpServletRequest request) {
        String email = normalizeEmail(rawEmail);
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, password));
        } catch (AuthenticationException exception) {
            throw ApiException.unauthorized("邮箱或密码不正确");
        }

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);

        HttpSession existing = request.getSession(false);
        if (existing != null) {
            request.changeSessionId();
        }
        HttpSession session = request.getSession(true);
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);

        return users.findByEmail(email)
                .orElseThrow(() -> ApiException.unauthorized("账号不存在"));
    }

    public UserAccount current(String email) {
        return users.findByEmail(normalizeEmail(email))
                .orElseThrow(() -> ApiException.unauthorized("请先登录"));
    }

    public void logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
    }

    private static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }
}
