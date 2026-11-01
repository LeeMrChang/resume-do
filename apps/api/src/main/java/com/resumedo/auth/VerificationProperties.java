package com.resumedo.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.verification")
public class VerificationProperties {
    private int codeTtlSeconds = 600;
    private int cooldownSeconds = 60;
    private int dailyLimitPerTarget = 10;
    private int hourlyLimitPerIp = 30;
    private boolean exposeCode = false;
    private final Email email = new Email();
    private final Sms sms = new Sms();

    public int getCodeTtlSeconds() {
        return codeTtlSeconds;
    }

    public void setCodeTtlSeconds(int codeTtlSeconds) {
        this.codeTtlSeconds = codeTtlSeconds;
    }

    public int getCooldownSeconds() {
        return cooldownSeconds;
    }

    public void setCooldownSeconds(int cooldownSeconds) {
        this.cooldownSeconds = cooldownSeconds;
    }

    public int getDailyLimitPerTarget() {
        return dailyLimitPerTarget;
    }

    public void setDailyLimitPerTarget(int dailyLimitPerTarget) {
        this.dailyLimitPerTarget = dailyLimitPerTarget;
    }

    public int getHourlyLimitPerIp() {
        return hourlyLimitPerIp;
    }

    public void setHourlyLimitPerIp(int hourlyLimitPerIp) {
        this.hourlyLimitPerIp = hourlyLimitPerIp;
    }

    public boolean isExposeCode() {
        return exposeCode;
    }

    public void setExposeCode(boolean exposeCode) {
        this.exposeCode = exposeCode;
    }

    public Email getEmail() {
        return email;
    }

    public Sms getSms() {
        return sms;
    }

    public static class Email {
        private boolean enabled = false;
        private String from = "";
        private String fromName = "Resume Do";

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getFrom() {
            return from;
        }

        public void setFrom(String from) {
            this.from = from;
        }

        public String getFromName() {
            return fromName;
        }

        public void setFromName(String fromName) {
            this.fromName = fromName;
        }
    }

    public static class Sms {
        private boolean enabled = false;
        private String secretId = "";
        private String secretKey = "";
        private String sdkAppId = "";
        private String signName = "";
        private String templateId = "";
        private String region = "ap-guangzhou";
        private String endpoint = "https://sms.tencentcloudapi.com";
        private int validityMinutes = 10;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getSecretId() {
            return secretId;
        }

        public void setSecretId(String secretId) {
            this.secretId = secretId;
        }

        public String getSecretKey() {
            return secretKey;
        }

        public void setSecretKey(String secretKey) {
            this.secretKey = secretKey;
        }

        public String getSdkAppId() {
            return sdkAppId;
        }

        public void setSdkAppId(String sdkAppId) {
            this.sdkAppId = sdkAppId;
        }

        public String getSignName() {
            return signName;
        }

        public void setSignName(String signName) {
            this.signName = signName;
        }

        public String getTemplateId() {
            return templateId;
        }

        public void setTemplateId(String templateId) {
            this.templateId = templateId;
        }

        public String getRegion() {
            return region;
        }

        public void setRegion(String region) {
            this.region = region;
        }

        public String getEndpoint() {
            return endpoint;
        }

        public void setEndpoint(String endpoint) {
            this.endpoint = endpoint;
        }

        public int getValidityMinutes() {
            return validityMinutes;
        }

        public void setValidityMinutes(int validityMinutes) {
            this.validityMinutes = validityMinutes;
        }
    }
}
