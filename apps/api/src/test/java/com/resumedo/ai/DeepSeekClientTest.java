package com.resumedo.ai;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.resumedo.common.ApiException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;

class DeepSeekClientTest {
    private final ObjectMapper json = new ObjectMapper();
    private final AiProperties properties = new AiProperties();
    private final HttpClient http = mock(HttpClient.class);
    private final DeepSeekClient client = new DeepSeekClient(properties, json, http);

    private void configure() { properties.setEnabled(true); properties.setApiKey("test-only-not-a-real-key"); }

    @Test void disabledAndMissingKeyNeverCallNetwork() {
        assertThatThrownBy(client::requireConfigured).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.code()).isEqualTo("AI_DISABLED"));
        properties.setEnabled(true);
        assertThatThrownBy(client::requireConfigured).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.code()).isEqualTo("AI_NOT_CONFIGURED"));
        verifyNoInteractions(http);
    }

    @Test void refusesInsecureOrCredentialBearingEndpoints() {
        configure();
        for (String url : List.of("http://example.test", "https://user:password@example.test", "https://example.test?key=x")) {
            properties.setBaseUrl(url);
            assertThatThrownBy(client::requireConfigured).isInstanceOf(ApiException.class);
        }
        verifyNoInteractions(http);
    }

    @SuppressWarnings("unchecked")
    @Test void usesFlashJsonOutputAndDisabledThinkingWithoutRetries() throws Exception {
        configure();
        HttpResponse<byte[]> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(envelope("stop", "{\"rewrittenText\":\"负责订单开发。\"}"));
        when(http.sendAsync(any(HttpRequest.class), ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any()))
                .thenReturn(CompletableFuture.completedFuture(response));
        assertThat(client.rewrite("system rules", "user data")).isEqualTo("负责订单开发。");
        var captured = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http, times(1)).sendAsync(captured.capture(), ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any());
        HttpRequest request = captured.getValue();
        assertThat(request.uri().toString()).isEqualTo("https://api.deepseek.com/chat/completions");
        var body = HttpResponse.BodySubscribers.ofString(StandardCharsets.UTF_8);
        request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<ByteBuffer>() {
            @Override public void onSubscribe(Flow.Subscription subscription) { body.onSubscribe(subscription); }
            @Override public void onNext(ByteBuffer buffer) { body.onNext(List.of(buffer)); }
            @Override public void onError(Throwable error) { body.onError(error); }
            @Override public void onComplete() { body.onComplete(); }
        });
        var sent = json.readTree(body.getBody().toCompletableFuture().join());
        assertThat(sent.path("model").asText()).isEqualTo("deepseek-flash");
        assertThat(sent.path("thinking").path("type").asText()).isEqualTo("disabled");
        assertThat(sent.path("response_format").path("type").asText()).isEqualTo("json_object");
        assertThat(sent.path("messages").get(0).path("role").asText()).isEqualTo("system");
        assertThat(sent.has("tools")).isFalse();
    }

    @Test void mapsUpstreamErrorsWithoutExposingVendorBody() {
        for (int status : List.of(401, 402, 429, 500, 302))
            assertThatThrownBy(() -> DeepSeekClient.checkStatus(status)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> DeepSeekClient.checkStatus(402)).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.code()).isEqualTo("AI_BALANCE_INSUFFICIENT"));
    }

    @Test void rejectsTruncatedEmptyAndMalformedResponses() throws Exception {
        for (byte[] value : List.of(envelope("length", "{\"rewrittenText\":\"不完整\"}"),
                envelope("stop", ""), envelope("stop", "```json\n{}\n```"),
                envelope("stop", "{\"rewrittenText\":3}"), "null".getBytes(StandardCharsets.UTF_8))) {
            assertThatThrownBy(() -> client.parseResult(value)).isInstanceOfSatisfying(ApiException.class,
                    error -> assertThat(error.code()).isEqualTo("AI_INVALID_RESULT"));
        }
    }

    @Test void timeoutCancelsCallInsteadOfRetrying() {
        configure();
        properties.setTimeoutMs(10);
        CompletableFuture<HttpResponse<byte[]>> pending = new CompletableFuture<>();
        when(http.sendAsync(any(HttpRequest.class), ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any())).thenReturn(pending);
        assertThatThrownBy(() -> client.rewrite("rules", "data")).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.code()).isEqualTo("AI_TIMEOUT"));
        assertThat(pending.isCancelled()).isTrue();
        verify(http, times(1)).sendAsync(any(HttpRequest.class), ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any());
    }

    @Test void boundsResponseBodyEvenIfContentLengthIsAbsent() {
        var body = new DeepSeekClient.BoundedBody();
        Flow.Subscription subscription = mock(Flow.Subscription.class);
        body.onSubscribe(subscription);
        body.onNext(List.of(ByteBuffer.allocate(128 * 1024 + 1)));
        assertThat(body.getBody().toCompletableFuture().isCompletedExceptionally()).isTrue();
        verify(subscription).cancel();
    }

    private byte[] envelope(String reason, String content) throws Exception {
        var root = json.createObjectNode();
        var choice = root.putArray("choices").addObject();
        choice.put("finish_reason", reason);
        choice.putObject("message").put("content", content);
        return json.writeValueAsBytes(root);
    }
}
