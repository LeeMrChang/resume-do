package com.resumedo.auth;

import com.resumedo.common.ApiException;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class VerificationCodeSender {
    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final VerificationProperties properties;
    private final TencentSmsClient smsClient;

    public VerificationCodeSender(
            ObjectProvider<JavaMailSender> mailSenderProvider,
            VerificationProperties properties,
            TencentSmsClient smsClient) {
        this.mailSenderProvider = mailSenderProvider;
        this.properties = properties;
        this.smsClient = smsClient;
    }

    public boolean isAvailable(String channel) {
        if (AccountKey.CHANNEL_PHONE.equals(channel)) {
            VerificationProperties.Sms sms = properties.getSms();
            return sms.isEnabled()
                    && !sms.getSecretId().isBlank()
                    && !sms.getSecretKey().isBlank()
                    && !sms.getSdkAppId().isBlank()
                    && !sms.getSignName().isBlank()
                    && !sms.getTemplateId().isBlank();
        }
        VerificationProperties.Email email = properties.getEmail();
        return email.isEnabled() && !email.getFrom().isBlank() && mailSenderProvider.getIfAvailable() != null;
    }

    public void send(String channel, String target, String code) {
        if (AccountKey.CHANNEL_PHONE.equals(channel)) {
            VerificationProperties.Sms sms = properties.getSms();
            if (!sms.isEnabled()
                    || sms.getSecretId().isBlank()
                    || sms.getSecretKey().isBlank()
                    || sms.getSdkAppId().isBlank()
                    || sms.getSignName().isBlank()
                    || sms.getTemplateId().isBlank()) {
                throw ApiException.serviceUnavailable(
                        "CODE_DELIVERY_UNAVAILABLE", "短信验证码暂未开通，请改用邮箱注册");
            }
            smsClient.send(target, code);
            return;
        }

        VerificationProperties.Email email = properties.getEmail();
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (!email.isEnabled() || email.getFrom().isBlank() || mailSender == null) {
            throw ApiException.serviceUnavailable(
                    "CODE_DELIVERY_UNAVAILABLE", "邮箱验证码暂未开通，请联系管理员");
        }
        sendEmail(mailSender, email, target, code);
    }

    private void sendEmail(
            JavaMailSender mailSender,
            VerificationProperties.Email email,
            String target,
            String code) {
        String plain = "你的 Resume Do 验证码是 " + code + "，"
                + "10 分钟内有效。请勿泄露给他人；如非本人操作，请忽略本邮件。";
        String html = "<p style=\"font-size:15px;line-height:1.7;color:#243034\">你的 Resume Do 验证码是：</p>"
                + "<p style=\"font-size:28px;letter-spacing:6px;font-weight:700;color:#238b72\">" + code + "</p>"
                + "<p style=\"font-size:13px;line-height:1.7;color:#5b6b73\">"
                + "10 分钟内有效。请勿泄露给他人；如非本人操作，请忽略本邮件。</p>";
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(email.getFrom(), email.getFromName());
            helper.setTo(target);
            helper.setSubject("Resume Do 验证码");
            helper.setText(plain, html);
            mailSender.send(message);
        } catch (MessagingException | MailException | java.io.UnsupportedEncodingException exception) {
            throw new IllegalStateException("Email delivery failed", exception);
        }
    }
}
