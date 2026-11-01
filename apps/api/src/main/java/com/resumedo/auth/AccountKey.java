package com.resumedo.auth;

import com.resumedo.common.ApiException;
import java.util.Locale;
import java.util.regex.Pattern;

/** Email and mainland mobile numbers share the account key space, so both are normalized before use. */
public final class AccountKey {
    public static final String CHANNEL_EMAIL = "email";
    public static final String CHANNEL_PHONE = "phone";

    private static final Pattern EMAIL = Pattern.compile(
            "^[A-Za-z0-9._%+'-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$");
    private static final Pattern PHONE = Pattern.compile("^\\+861[3-9]\\d{9}$");

    private AccountKey() {
    }

    public static String normalizeChannel(String channel) {
        String value = channel == null ? "" : channel.trim().toLowerCase(Locale.ROOT);
        if (CHANNEL_EMAIL.equals(value) || CHANNEL_PHONE.equals(value)) {
            return value;
        }
        throw ApiException.badRequest("注册方式不正确");
    }

    public static String normalize(String channel, String raw) {
        String value = raw == null ? "" : raw.trim();
        if (CHANNEL_PHONE.equals(channel)) {
            return normalizePhone(value);
        }
        return value.toLowerCase(Locale.ROOT);
    }

    public static void requireValid(String channel, String normalized) {
        if (CHANNEL_PHONE.equals(channel)) {
            if (!PHONE.matcher(normalized).matches()) {
                throw ApiException.badRequest("请输入有效的手机号码");
            }
            return;
        }
        if (normalized.length() > 190 || !EMAIL.matcher(normalized).matches()) {
            throw ApiException.badRequest("请输入有效的邮箱地址");
        }
    }

    public static String mask(String channel, String target) {
        if (CHANNEL_PHONE.equals(channel) && target.length() > 7) {
            return target.substring(0, 4) + "****" + target.substring(target.length() - 4);
        }
        int at = target.indexOf('@');
        if (at <= 1) {
            return "***";
        }
        return target.charAt(0) + "***" + target.substring(at);
    }

    private static String normalizePhone(String value) {
        StringBuilder digits = new StringBuilder();
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            if (Character.isDigit(current)) {
                digits.append(current);
            }
        }
        String plain = digits.toString();
        if (plain.length() == 13 && plain.startsWith("86")) {
            plain = plain.substring(2);
        }
        return "+86" + plain;
    }
}
