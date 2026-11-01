package com.resumedo.auth;

import com.resumedo.auth.AuthDtos.VerificationCodeResponse;
import com.resumedo.auth.VerificationCodeRepository.Code;
import com.resumedo.common.ApiException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VerificationService {
    private static final Logger log = LoggerFactory.getLogger(VerificationService.class);
    private static final String PURPOSE_REGISTER = "register";
    private static final int MAX_ATTEMPTS = 5;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final VerificationCodeRepository codes;
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final CaptchaService captcha;
    private final VerificationCodeSender sender;
    private final VerificationProperties properties;

    public VerificationService(
            VerificationCodeRepository codes,
            UserRepository users,
            PasswordEncoder passwordEncoder,
            CaptchaService captcha,
            VerificationCodeSender sender,
            VerificationProperties properties) {
        this.codes = codes;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.captcha = captcha;
        this.sender = sender;
        this.properties = properties;
    }

    public VerificationCodeResponse send(String channelRaw, String targetRaw, String captchaTicket, String ip) {
        String channel = AccountKey.normalizeChannel(channelRaw);
        String target = AccountKey.normalize(channel, targetRaw);
        AccountKey.requireValid(channel, target);
        if (users.existsByAccount(target)) {
            throw ApiException.conflict(
                    "ACCOUNT_EXISTS",
                    AccountKey.CHANNEL_PHONE.equals(channel) ? "该手机号已注册，请直接登录" : "该邮箱已注册，请直接登录",
                    Map.of());
        }

        captcha.consumeTicket(captchaTicket, ip);

        Instant now = Instant.now();
        Instant cooldownUntil = codes.lastCreatedAt(channel, target, PURPOSE_REGISTER)
                .map(createdAt -> createdAt.plusSeconds(properties.getCooldownSeconds()))
                .orElse(Instant.EPOCH);
        if (now.isBefore(cooldownUntil)) {
            long remaining = Math.max(1, Duration.between(now, cooldownUntil).toSeconds());
            throw ApiException.tooManyRequests(
                    "CODE_COOLDOWN",
                    "请 " + remaining + " 秒后再获取验证码",
                    Map.of("retryAfterSeconds", remaining));
        }
        if (codes.countForTargetSince(channel, target, PURPOSE_REGISTER, now.minus(Duration.ofDays(1)))
                >= properties.getDailyLimitPerTarget()) {
            throw ApiException.tooManyRequests(
                    "CODE_DAILY_LIMIT",
                    "今日验证码获取次数已达上限，请明天再试",
                    Map.of());
        }
        if (codes.countForIpSince(ip, now.minus(Duration.ofHours(1))) >= properties.getHourlyLimitPerIp()) {
            throw ApiException.tooManyRequests(
                    "CODE_IP_LIMIT",
                    "操作过于频繁，请稍后再试",
                    Map.of());
        }

        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        long id = codes.insert(
                channel,
                target,
                PURPOSE_REGISTER,
                passwordEncoder.encode(code),
                now.plusSeconds(properties.getCodeTtlSeconds()),
                ip);

        if (properties.isExposeCode() && !sender.isAvailable(channel)) {
            // 本地开发没有 SMTP/短信通道时，把验证码写日志并随响应返回；配置好通道后照常真实发送。
            log.info("Verification code channel={} target={} code={}", channel, AccountKey.mask(channel, target), code);
            return new VerificationCodeResponse(
                    properties.getCooldownSeconds(), properties.getCodeTtlSeconds(), code);
        }

        try {
            sender.send(channel, target, code);
        } catch (RuntimeException exception) {
            codes.markConsumed(id);
            log.warn("Verification code delivery failed channel={} target={}",
                    channel, AccountKey.mask(channel, target), exception);
            if (exception instanceof ApiException apiException) {
                throw apiException;
            }
            throw ApiException.serviceUnavailable("CODE_SEND_FAILED", "验证码发送失败，请稍后重试");
        }

        return new VerificationCodeResponse(
                properties.getCooldownSeconds(), properties.getCodeTtlSeconds(), null);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, noRollbackFor = ApiException.class)
    public void consume(String channelRaw, String targetRaw, String rawCode) {
        String channel = AccountKey.normalizeChannel(channelRaw);
        String target = AccountKey.normalize(channel, targetRaw);
        Code code = codes.findLatestActive(channel, target, PURPOSE_REGISTER)
                .orElseThrow(() -> invalid("验证码已失效，请重新获取"));
        if (code.expiresAt().isBefore(Instant.now())) {
            codes.markConsumed(code.id());
            throw invalid("验证码已过期，请重新获取");
        }
        codes.incrementAttempts(code.id());
        if (code.attempts() >= MAX_ATTEMPTS) {
            codes.markConsumed(code.id());
            throw invalid("验证码尝试次数过多，请重新获取");
        }
        if (!passwordEncoder.matches(rawCode, code.codeHash())) {
            throw invalid("验证码不正确");
        }
        if (!codes.markConsumed(code.id())) {
            throw invalid("验证码已使用，请重新获取");
        }
    }

    private static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "CODE_INVALID", message, Map.of());
    }
}
