package com.resumedo.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.resumedo.common.ApiException;
import org.junit.jupiter.api.Test;

class AccountKeyTest {
    @Test
    void emailIsTrimmedAndLowercased() {
        assertThat(AccountKey.normalize(AccountKey.CHANNEL_EMAIL, "  Alice@Example.COM ")).isEqualTo("alice@example.com");
        AccountKey.requireValid(AccountKey.CHANNEL_EMAIL, "alice@example.com");
    }

    @Test
    void malformedEmailsAreRejected() {
        for (String invalid : new String[] {"alice", "alice@", "@example.com", "alice@example", "a b@example.com", "alice@exa mple.com"}) {
            assertThatThrownBy(() -> AccountKey.requireValid(AccountKey.CHANNEL_EMAIL, invalid))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("邮箱");
        }
    }

    @Test
    void phoneNumbersAreNormalizedToMainlandFormat() {
        assertThat(AccountKey.normalize(AccountKey.CHANNEL_PHONE, "138 0013 8000")).isEqualTo("+8613800138000");
        assertThat(AccountKey.normalize(AccountKey.CHANNEL_PHONE, "138-0013-8000")).isEqualTo("+8613800138000");
        assertThat(AccountKey.normalize(AccountKey.CHANNEL_PHONE, "+86 13800138000")).isEqualTo("+8613800138000");
        assertThat(AccountKey.normalize(AccountKey.CHANNEL_PHONE, "8613800138000")).isEqualTo("+8613800138000");
        AccountKey.requireValid(AccountKey.CHANNEL_PHONE, "+8613800138000");
    }

    @Test
    void nonMobileNumbersAreRejected() {
        for (String invalid : new String[] {"12800138000", "1380013800", "138001380001", "010-88886666"}) {
            String normalized = AccountKey.normalize(AccountKey.CHANNEL_PHONE, invalid);
            assertThatThrownBy(() -> AccountKey.requireValid(AccountKey.CHANNEL_PHONE, normalized))
                    .isInstanceOf(ApiException.class)
                    .hasMessageContaining("手机号");
        }
    }

    @Test
    void unknownChannelsAreRejected() {
        assertThatThrownBy(() -> AccountKey.normalizeChannel("sms"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("注册方式");
    }

    @Test
    void maskingKeepsTargetsReadableButPrivate() {
        assertThat(AccountKey.mask(AccountKey.CHANNEL_PHONE, "+8613800138000")).isEqualTo("+861****8000");
        assertThat(AccountKey.mask(AccountKey.CHANNEL_EMAIL, "alice@example.com")).isEqualTo("a***@example.com");
    }
}
