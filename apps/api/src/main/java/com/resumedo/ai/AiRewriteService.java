package com.resumedo.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.resumedo.common.ApiException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class AiRewriteService {
    private static final Logger log = LoggerFactory.getLogger(AiRewriteService.class);
    private static final Pattern HTML = Pattern.compile("<\\s*/?\\s*[a-zA-Z][^>]*>");
    private static final Pattern CONTROL = Pattern.compile("[\\p{Cc}&&[^\\r\\n\\t]]");
    private static final Pattern NUMBER = Pattern.compile("\\d+(?:[.,]\\d+)*(?:[%万亿kKwW])?");
    private final DeepSeekClient client;
    private final AiRequestRepository requests;
    private final AiProperties properties;
    private final ObjectMapper json;
    private final Semaphore capacity = new Semaphore(4);
    private final String commonPrompt;
    private final String polishPrompt;
    private final String condensePrompt;
    private final String promptHash;

    public AiRewriteService(DeepSeekClient client, AiRequestRepository requests, AiProperties properties, ObjectMapper json) {
        this.client = client;
        this.requests = requests;
        this.properties = properties;
        this.json = json;
        commonPrompt = prompt("common");
        polishPrompt = prompt("polish");
        condensePrompt = prompt("condense");
        promptHash = hash(commonPrompt + polishPrompt + condensePrompt);
    }

    public AiDtos.RewriteResponse rewrite(long owner, AiDtos.RewriteRequest input) {
        client.requireConfigured();
        if (!Boolean.TRUE.equals(input.privacyConsent()))
            throw AiErrors.error(HttpStatus.BAD_REQUEST, "AI_CONSENT_REQUIRED", "请先同意将所选正文发送给 DeepSeek");
        if (HTML.matcher(input.text()).find() || CONTROL.matcher(input.text()).find())
            throw ApiException.badRequest("正文仅接受纯文本，请先去除 HTML 格式或控制字符");
        String id = input.requestId().toLowerCase(Locale.ROOT);
        String fingerprint = fingerprint(input);
        if (!capacity.tryAcquire())
            throw AiErrors.error(HttpStatus.TOO_MANY_REQUESTS, "AI_BUSY", "AI 请求较多，请稍后再试");
        boolean reserved = false;
        long start = System.nanoTime();
        try {
            String cached = requests.reserve(owner, id, fingerprint, properties);
            if (cached != null) return response(id, input, cached);
            reserved = true;
            var data = json.createObjectNode();
            data.put("text", input.text());
            data.put("section", input.section() == null ? "" : input.section());
            data.put("targetRole", input.targetRole() == null ? "" : input.targetRole());
            String instruction = "polish".equals(input.action()) ? polishPrompt : condensePrompt;
            String rewritten = client.rewrite(commonPrompt + "\n" + instruction, data.toString());
            validateResult(input.text(), rewritten);
            rewritten = rewritten.strip();
            requests.succeed(owner, id, rewritten);
            log.info("ai_rewrite requestId={} action={} model={} status=success durationMs={}",
                    id, input.action(), properties.getModel(), (System.nanoTime() - start) / 1_000_000);
            return response(id, input, rewritten);
        } catch (ApiException error) {
            if (reserved) recordFailure(owner, id, error);
            throw error;
        } catch (RuntimeException error) {
            // Exception messages/stacks from HTTP clients/parsers may contain credentials or content.
            log.warn("ai_rewrite requestId={} status=failed errorType={}", id, error.getClass().getSimpleName());
            ApiException safe = AiErrors.error(HttpStatus.SERVICE_UNAVAILABLE, "AI_UNAVAILABLE", "AI 处理失败，请稍后重试");
            if (reserved) recordFailure(owner, id, safe);
            throw safe;
        } finally {
            capacity.release();
        }
    }

    private void recordFailure(long owner, String id, ApiException error) {
        log.warn("ai_rewrite requestId={} status=failed code={}", id, error.code());
        try { requests.fail(owner, id, error); }
        catch (RuntimeException ignored) {
            // Leave an uncertain request pending rather than risk a duplicate paid call.
            log.warn("ai_rewrite requestId={} status=result_not_recorded", id);
        }
    }

    static void validateResult(String source, String result) {
        if (result == null || result.isBlank() || result.length() > Math.min(12000, source.length() * 3 + 200)
                || HTML.matcher(result).find() || CONTROL.matcher(result).find())
            throw AiErrors.invalidResult();
    }

    private AiDtos.RewriteResponse response(String id, AiDtos.RewriteRequest input, String rewritten) {
        List<String> warnings = new ArrayList<>();
        warnings.add("AI 建议可能存在事实偏差，请核对公司、时间、技术名称和成果后再采用");
        if (!numbers(input.text()).containsAll(numbers(rewritten)))
            warnings.add("结果出现原文未包含的数字，请重点核对，勿直接采用");
        if ("condense".equals(input.action()) && rewritten.codePointCount(0, rewritten.length()) >= input.text().codePointCount(0, input.text().length()))
            warnings.add("本次结果未缩短，原文可能已经较为精简，可保留原文或重新尝试");
        return new AiDtos.RewriteResponse(id, input.action(), input.text(), rewritten, List.copyOf(warnings));
    }

    private Set<String> numbers(String text) {
        Set<String> values = new HashSet<>();
        NUMBER.matcher(text).results().forEach(match -> values.add(match.group()));
        return values;
    }

    private String fingerprint(AiDtos.RewriteRequest input) {
        try {
            return hash(json.writeValueAsString(List.of(promptHash, properties.getModel(), input.action(), input.text(),
                    input.section() == null ? "" : input.section(), input.targetRole() == null ? "" : input.targetRole())));
        } catch (JsonProcessingException error) { throw new IllegalStateException("Cannot fingerprint AI request"); }
    }

    private static String hash(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException("SHA-256 missing"); }
    }

    private String prompt(String name) {
        try (var stream = new ClassPathResource("prompts/ai-rewrite-" + name + ".txt").getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException error) { throw new IllegalStateException("AI prompt resource missing: " + name); }
    }
}
