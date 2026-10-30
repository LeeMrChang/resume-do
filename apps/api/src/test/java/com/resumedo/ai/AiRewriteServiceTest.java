package com.resumedo.ai;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.resumedo.common.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class AiRewriteServiceTest {
    private final DeepSeekClient client = mock(DeepSeekClient.class);
    private final AiRequestRepository repository = mock(AiRequestRepository.class);
    private final AiProperties properties = new AiProperties();
    private final AiRewriteService service = new AiRewriteService(client, repository, properties, new ObjectMapper());
    private static final String ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

    private AiDtos.RewriteRequest request(String action, String text) {
        return new AiDtos.RewriteRequest(ID, action, text, "work", "Java 工程师", true);
    }

    @Test void cacheHitDoesNotCallModelOrPersistAgain() {
        when(repository.reserve(eq(9L), eq(ID), anyString(), eq(properties))).thenReturn("负责订单开发");
        var result = service.rewrite(9, request("polish", "做了订单开发"));
        assertThat(result.rewrittenText()).isEqualTo("负责订单开发");
        verify(client, never()).rewrite(anyString(), anyString());
        verify(repository, never()).succeed(anyLong(), anyString(), anyString());
    }

    @Test void distinguishesTasksAndKeepsUserTextInUserData() {
        when(client.rewrite(anyString(), anyString())).thenReturn("负责订单开发");
        var result = service.rewrite(9, request("condense", "在项目中负责订单开发"));
        assertThat(result.originalText()).isEqualTo("在项目中负责订单开发");
        verify(client).rewrite(contains("任务：精炼"), contains("\"text\":\"在项目中负责订单开发\""));
        verify(repository).succeed(9L, ID, "负责订单开发");
    }

    @Test void flagsNewNumbersAndDoesNotClaimSemanticValidation() {
        when(client.rewrite(anyString(), anyString())).thenReturn("负责订单开发，提升50%");
        var result = service.rewrite(9, request("polish", "负责订单开发"));
        assertThat(result.warnings()).anyMatch(text -> text.contains("未包含的数字"));
        assertThat(result.warnings()).anyMatch(text -> text.contains("事实偏差"));
    }

    @Test void warnsIfCondensingDidNotShortenTheText() {
        when(client.rewrite(anyString(), anyString())).thenReturn("负责订单开发");
        assertThat(service.rewrite(9, request("condense", "负责订单开发")).warnings())
                .anyMatch(text -> text.contains("未缩短"));
    }

    @Test void invalidOutputIsRecordedAsFailureAndNeverSuccess() {
        when(client.rewrite(anyString(), anyString())).thenReturn("<script>bad()</script>");
        assertThatThrownBy(() -> service.rewrite(9, request("polish", "负责订单开发"))).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.code()).isEqualTo("AI_INVALID_RESULT"));
        verify(repository).fail(eq(9L), eq(ID), any(ApiException.class));
        verify(repository, never()).succeed(anyLong(), anyString(), anyString());
    }

    @Test void providerFailureIsNotRetried() {
        when(client.rewrite(anyString(), anyString())).thenThrow(AiErrors.error(HttpStatus.GATEWAY_TIMEOUT, "AI_TIMEOUT", "超时"));
        assertThatThrownBy(() -> service.rewrite(9, request("polish", "负责订单开发"))).isInstanceOf(ApiException.class);
        verify(client, times(1)).rewrite(anyString(), anyString());
        verify(repository).fail(eq(9L), eq(ID), any(ApiException.class));
    }

    @Test void rejectsMissingConsentAndHtmlWithoutReservingQuota() {
        var denied = new AiDtos.RewriteRequest(ID, "polish", "正文", "work", null, false);
        assertThatThrownBy(() -> service.rewrite(9, denied)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.rewrite(9, request("polish", "<p>正文</p>"))).isInstanceOf(ApiException.class);
        verifyNoInteractions(repository);
        verify(client, never()).rewrite(anyString(), anyString());
    }
}
