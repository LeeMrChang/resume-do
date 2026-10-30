package com.resumedo.ai;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

/** Server-only settings. Never expose this object (in particular the API key) in responses or logs. */
@Component
@Validated
@ConfigurationProperties(prefix = "app.ai")
public class AiProperties {
    private boolean enabled;
    private String apiKey = "";
    @NotBlank private String baseUrl = "https://api.deepseek.com";
    @NotBlank private String model = "deepseek-flash";
    @Min(1000) @Max(120000) private int timeoutMs = 30000;
    @Min(1) @Max(1000) private int dailyLimit = 20;
    @Min(1) @Max(60) private int perMinuteLimit = 5;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public int getTimeoutMs() { return timeoutMs; }
    public void setTimeoutMs(int timeoutMs) { this.timeoutMs = timeoutMs; }
    public int getDailyLimit() { return dailyLimit; }
    public void setDailyLimit(int dailyLimit) { this.dailyLimit = dailyLimit; }
    public int getPerMinuteLimit() { return perMinuteLimit; }
    public void setPerMinuteLimit(int perMinuteLimit) { this.perMinuteLimit = perMinuteLimit; }
}
