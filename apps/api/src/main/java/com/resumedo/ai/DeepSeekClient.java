package com.resumedo.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** One bounded, non-streaming call; no retries, tools, web search, redirects or cross-provider fallback. */
@Component
public class DeepSeekClient {
    private final AiProperties properties;
    private final ObjectMapper json;
    private final HttpClient http;

    @Autowired
    public DeepSeekClient(AiProperties properties, ObjectMapper json) {
        this(properties, json, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build());
    }

    DeepSeekClient(AiProperties properties, ObjectMapper json, HttpClient http) {
        this.properties = properties;
        this.json = json;
        this.http = http;
    }

    public void requireConfigured() {
        if (!properties.isEnabled())
            throw AiErrors.error(HttpStatus.SERVICE_UNAVAILABLE, "AI_DISABLED", "AI 功能尚未启用");
        if (properties.getApiKey() == null || properties.getApiKey().isBlank())
            throw AiErrors.error(HttpStatus.SERVICE_UNAVAILABLE, "AI_NOT_CONFIGURED", "AI 服务尚未配置密钥，请联系管理员");
        try {
            URI uri = URI.create(properties.getBaseUrl());
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null)
                throw new IllegalArgumentException();
            if (properties.getApiKey().contains("\n") || properties.getApiKey().contains("\r"))
                throw new IllegalArgumentException();
        } catch (IllegalArgumentException error) {
            throw AiErrors.error(HttpStatus.SERVICE_UNAVAILABLE, "AI_NOT_CONFIGURED", "AI 服务配置不正确，请联系管理员");
        }
    }

    public String rewrite(String system, String user) {
        requireConfigured();
        var body = json.createObjectNode();
        body.put("model", properties.getModel());
        body.put("stream", false);
        body.put("max_tokens", 8192);
        body.putObject("thinking").put("type", "disabled");
        body.putObject("response_format").put("type", "json_object");
        var messages = body.putArray("messages");
        messages.addObject().put("role", "system").put("content", system);
        messages.addObject().put("role", "user").put("content", user);
        String endpoint = properties.getBaseUrl().replaceAll("/+$", "") + "/chat/completions";
        HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(Duration.ofMillis(properties.getTimeoutMs()))
                .header("Authorization", "Bearer " + properties.getApiKey().strip())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8)).build();
        // get(timeout) covers the entire response body, including a server that sends headers then stalls.
        CompletableFuture<HttpResponse<byte[]>> call = http.sendAsync(request, info -> new BoundedBody());
        try {
            HttpResponse<byte[]> response = call.get(properties.getTimeoutMs(), TimeUnit.MILLISECONDS);
            checkStatus(response.statusCode());
            return parseResult(response.body());
        } catch (TimeoutException error) {
            call.cancel(true);
            throw AiErrors.error(HttpStatus.GATEWAY_TIMEOUT, "AI_TIMEOUT", "AI 处理超时，请稍后重试");
        } catch (InterruptedException error) {
            call.cancel(true);
            Thread.currentThread().interrupt();
            throw AiErrors.error(HttpStatus.SERVICE_UNAVAILABLE, "AI_UNAVAILABLE", "AI 请求已中断，请稍后重试");
        } catch (ExecutionException error) {
            if (error.getCause() instanceof java.net.http.HttpTimeoutException)
                throw AiErrors.error(HttpStatus.GATEWAY_TIMEOUT, "AI_TIMEOUT", "AI 处理超时，请稍后重试");
            throw AiErrors.error(HttpStatus.BAD_GATEWAY, "AI_UNAVAILABLE", "无法连接 AI 服务，请稍后重试");
        }
    }

    static void checkStatus(int status) {
        if (status >= 200 && status < 300) return;
        throw switch (status) {
            case 401, 403 -> AiErrors.error(HttpStatus.SERVICE_UNAVAILABLE, "AI_AUTH_FAILED", "AI 服务凭据不可用，请联系管理员");
            case 402 -> AiErrors.error(HttpStatus.SERVICE_UNAVAILABLE, "AI_BALANCE_INSUFFICIENT", "AI 服务余额不足，请联系管理员");
            case 429 -> AiErrors.error(HttpStatus.TOO_MANY_REQUESTS, "AI_PROVIDER_RATE_LIMITED", "AI 服务繁忙，请稍后重试");
            default -> AiErrors.error(HttpStatus.BAD_GATEWAY, "AI_UNAVAILABLE", "AI 服务暂不可用，请稍后重试");
        };
    }

    String parseResult(byte[] bytes) {
        try {
            JsonNode envelope = json.readTree(bytes);
            if (envelope == null || !envelope.isObject()) throw AiErrors.invalidResult();
            JsonNode choice = envelope.path("choices").path(0);
            if (!"stop".equals(choice.path("finish_reason").asText())) throw AiErrors.invalidResult();
            JsonNode content = choice.path("message").path("content");
            if (!content.isTextual()) throw AiErrors.invalidResult();
            JsonNode result = json.readTree(content.asText());
            if (result == null || !result.isObject() || result.size() != 1 || !result.path("rewrittenText").isTextual()) throw AiErrors.invalidResult();
            return result.path("rewrittenText").asText();
        } catch (IOException | IllegalArgumentException error) {
            // Never attach vendor text or parser exceptions: they can contain private content.
            throw AiErrors.invalidResult();
        }
    }

    /** Hard memory bound, independent of an upstream Content-Length header. */
    static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
        private static final int MAX_BYTES = 128 * 1024;
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        @Override public CompletionStage<byte[]> getBody() { return result; }
        @Override public void onSubscribe(Flow.Subscription value) { subscription = value; value.request(1); }
        @Override public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) {
                if (buffer.remaining() > MAX_BYTES - bytes.size()) {
                    subscription.cancel();
                    result.completeExceptionally(new IOException("AI response exceeds size limit"));
                    return;
                }
                byte[] data = new byte[buffer.remaining()];
                buffer.get(data);
                bytes.writeBytes(data);
            }
            subscription.request(1);
        }
        @Override public void onError(Throwable error) { result.completeExceptionally(error); }
        @Override public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
