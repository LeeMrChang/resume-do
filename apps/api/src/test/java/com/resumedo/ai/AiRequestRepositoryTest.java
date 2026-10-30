package com.resumedo.ai;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.resumedo.common.ApiException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

/** Verifies reservation decisions without connecting to the user's database. */
class AiRequestRepositoryTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final AiProperties limits = new AiProperties();
    private final AiRequestRepository repository = new AiRequestRepository(jdbc, manager);

    @BeforeEach void setup() {
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(jdbc.queryForList(anyString(), eq(Long.class), eq(9L))).thenReturn(List.of(9L));
    }

    @Test void cachedSuccessDoesNotConsumeQuota() {
        when(jdbc.queryForList(contains("SELECT *"), eq(9L), eq("id")))
                .thenReturn(List.of(Map.of("request_hash", "hash", "state", "succeeded", "rewritten_text", "建议")));
        assertThat(repository.reserve(9, "id", "hash", limits)).isEqualTo("建议");
        verify(jdbc, never()).update(contains("ai_daily_usage"), any(Object[].class));
        verify(manager).commit(any());
    }

    @Test void changedPayloadAndPendingRequestsNeverReserveAnotherCall() {
        when(jdbc.queryForList(contains("SELECT *"), eq(9L), eq("id")))
                .thenReturn(List.of(Map.of("request_hash", "hash", "state", "pending")));
        assertThatThrownBy(() -> repository.reserve(9, "id", "different", limits)).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.code()).isEqualTo("AI_REQUEST_CONFLICT"));
        assertThatThrownBy(() -> repository.reserve(9, "id", "hash", limits)).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.code()).isEqualTo("AI_REQUEST_PENDING"));
    }

    @Test void sameFailedRequestReturnsStoredFailure() {
        when(jdbc.queryForList(contains("SELECT *"), eq(9L), eq("id")))
                .thenReturn(List.of(Map.of("request_hash", "hash", "state", "failed", "error_status", 504,
                        "error_code", "AI_TIMEOUT", "error_message", "超时")));
        assertThatThrownBy(() -> repository.reserve(9, "id", "hash", limits)).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.code()).isEqualTo("AI_TIMEOUT"));
    }

    @Test void dailyQuotaBlocksInsertion() {
        LocalDate day = LocalDate.of(2026, 10, 30);
        when(jdbc.queryForObject("SELECT UTC_DATE()", LocalDate.class)).thenReturn(day);
        when(jdbc.queryForObject(contains("SELECT attempts"), eq(Integer.class), eq(9L), eq(day)))
                .thenReturn(limits.getDailyLimit());
        assertThatThrownBy(() -> repository.reserve(9, "id", "hash", limits)).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.code()).isEqualTo("AI_QUOTA_EXCEEDED"));
        verify(jdbc, never()).update(contains("INSERT INTO ai_rewrite_requests"), any(Object[].class));
        verify(manager).rollback(any());
    }

    @Test void ownerWithoutAccountCannotReserve() {
        when(jdbc.queryForList(anyString(), eq(Long.class), eq(10L))).thenReturn(List.of());
        assertThatThrownBy(() -> repository.reserve(10, "id", "hash", limits)).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.status().value()).isEqualTo(401));
    }
}
