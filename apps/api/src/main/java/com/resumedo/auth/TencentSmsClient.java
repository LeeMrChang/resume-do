package com.resumedo.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public class TencentSmsClient {
    private static final String SERVICE = "sms";
    private static final String ACTION = "SendSms";
    private static final String VERSION = "2021-01-11";
    private static final String CONTENT_TYPE = "application/json; charset=utf-8";

    private final VerificationProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public TencentSmsClient(VerificationProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public void send(String phone, String code) {
        VerificationProperties.Sms sms = properties.getSms();
        String payload = payload(sms, phone, code);
        URI uri = URI.create(sms.getEndpoint());
        long timestamp = Instant.now().getEpochSecond();
        HttpRequest request = HttpRequest.newBuilder(uri)
                .header("Content-Type", CONTENT_TYPE)
                .header("X-TC-Action", ACTION)
                .header("X-TC-Version", VERSION)
                .header("X-TC-Timestamp", Long.toString(timestamp))
                .header("X-TC-Region", sms.getRegion())
                .header("Authorization", authorization(
                        sms.getSecretId(), sms.getSecretKey(), uri.getHost(), payload, timestamp))
                .timeout(Duration.ofSeconds(8))
                .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("SMS request interrupted", exception);
        } catch (IOException exception) {
            throw new IllegalStateException("SMS request failed", exception);
        }

        JsonNode body;
        try {
            body = objectMapper.readTree(response.body()).path("Response");
        } catch (IOException exception) {
            throw new IllegalStateException("SMS response unreadable", exception);
        }
        if (body.has("Error")) {
            throw new IllegalStateException("SMS rejected: " + body.path("Error").path("Code").asText()
                    + " " + body.path("Error").path("Message").asText());
        }
        String status = body.path("SendStatusSet").path(0).path("Code").asText();
        if (!"Ok".equals(status)) {
            throw new IllegalStateException("SMS status " + status);
        }
    }

    private String payload(VerificationProperties.Sms sms, String phone, String code) {
        ObjectNode body = objectMapper.createObjectNode();
        ArrayNode phones = body.putArray("PhoneNumberSet");
        phones.add(phone);
        body.put("SmsSdkAppId", sms.getSdkAppId());
        body.put("SignName", sms.getSignName());
        body.put("TemplateId", sms.getTemplateId());
        ArrayNode parameters = body.putArray("TemplateParamSet");
        parameters.add(code);
        parameters.add(Integer.toString(sms.getValidityMinutes()));
        try {
            return objectMapper.writeValueAsString(body);
        } catch (IOException exception) {
            throw new IllegalStateException("SMS payload failed", exception);
        }
    }

    static String authorization(String secretId, String secretKey, String host, String payload, long timestamp) {
        String date = DateTimeFormatter.ofPattern("yyyy-MM-dd")
                .withZone(ZoneOffset.UTC)
                .format(Instant.ofEpochSecond(timestamp));
        String canonicalRequest = "POST\n/\n\ncontent-type:" + CONTENT_TYPE
                + "\nhost:" + host
                + "\n\ncontent-type;host\n" + sha256Hex(payload);
        String scope = date + "/" + SERVICE + "/tc3_request";
        String stringToSign = "TC3-HMAC-SHA256\n" + timestamp + "\n" + scope + "\n" + sha256Hex(canonicalRequest);
        byte[] secretDate = hmacSha256(("TC3" + secretKey).getBytes(StandardCharsets.UTF_8), date);
        byte[] secretService = hmacSha256(secretDate, SERVICE);
        byte[] secretSigning = hmacSha256(secretService, "tc3_request");
        String signature = HexFormat.of().formatHex(hmacSha256(secretSigning, stringToSign));
        return "TC3-HMAC-SHA256 Credential=" + secretId + "/" + scope
                + ", SignedHeaders=content-type;host, Signature=" + signature;
    }

    static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    private static byte[] hmacSha256(byte[] key, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("HmacSHA256 unavailable", exception);
        }
    }
}
