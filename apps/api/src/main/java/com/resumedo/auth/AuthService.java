package com.resumedo.auth;

import com.resumedo.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Locale;
import java.util.Map;
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
    private final VerificationService verification;

    public AuthService(
            UserRepository users,
            PasswordEncoder passwordEncoder,
            AuthenticationManager authenticationManager,
            VerificationService verification) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.verification = verification;
    }

    @Transactional
    public UserAccount register(
            String channel,
            String target,
            String code,
            String password,
            String displayName) {
        String normalizedChannel = AccountKey.normalizeChannel(channel);
        String account = AccountKey.normalize(normalizedChannel, target);
        AccountKey.requireValid(normalizedChannel, account);
        if (users.existsByAccount(account)) {
            throw ApiException.conflict(
                    "ACCOUNT_EXISTS",
                    AccountKey.CHANNEL_PHONE.equals(normalizedChannel)
                            ? "该手机号已注册，请直接登录"
                            : "该邮箱已注册，请直接登录",
                    Map.of());
        }
        verification.consume(normalizedChannel, account, code);

        boolean phoneChannel = AccountKey.CHANNEL_PHONE.equals(normalizedChannel);
        long id = users.insert(
                phoneChannel ? null : account,
                phoneChannel ? account : null,
                passwordEncoder.encode(password),
                displayName(displayName, account, phoneChannel));
        return users.findById(id).orElseThrow(() -> new IllegalStateException("User vanished after insert"));
    }

    public UserAccount login(String rawAccount, String password, HttpServletRequest request) {
        String account = normalizeAccount(rawAccount);
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(account, password));
        } catch (AuthenticationException exception) {
            throw ApiException.unauthorized("账号或密码不正确");
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

        return users.findByAccount(account)
                .orElseThrow(() -> ApiException.unauthorized("账号不存在"));
    }

    public UserAccount current(String account) {
        return users.findByAccount(normalizeAccount(account))
                .orElseThrow(() -> ApiException.unauthorized("请先登录"));
    }

    @Transactional
    public UserAccount updateThemePreference(String account, String themePreference) {
        UserAccount current = current(account);
        users.updateThemePreference(current.id(), themePreference);
        return users.findById(current.id())
                .orElseThrow(() -> ApiException.unauthorized("请先登录"));
    }

    public void logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
    }

    private static String normalizeAccount(String account) {
        String value = account == null ? "" : account.trim();
        if (value.contains("@")) {
            return value.toLowerCase(Locale.ROOT);
        }
        return AccountKey.normalize(AccountKey.CHANNEL_PHONE, value);
    }

    private static String displayName(String displayName, String account, boolean phoneChannel) {
        String name = displayName == null ? "" : displayName.trim();
        if (!name.isEmpty()) {
            return name;
        }
        if (phoneChannel) {
            return "用户" + account.substring(account.length() - 4);
        }
        int at = account.indexOf('@');
        return at > 0 ? account.substring(0, at) : account;
    }
}
