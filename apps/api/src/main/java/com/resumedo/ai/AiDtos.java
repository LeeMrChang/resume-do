package com.resumedo.ai;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class AiDtos {
    private AiDtos() { }

    public record RewriteRequest(
            @NotBlank(message = "requestId 不能为空")
            @Pattern(regexp = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", message = "requestId 必须是 UUID") String requestId,
            @NotBlank(message = "请选择润色或精炼")
            @Pattern(regexp = "polish|condense", message = "action 仅支持 polish 或 condense") String action,
            @NotBlank(message = "请先选择需要处理的正文")
            @Size(max = 6000, message = "正文不能超过 6000 字符") String text,
            @Pattern(regexp = "[a-z][a-z0-9_-]{0,31}", message = "section 格式不正确") String section,
            @Size(max = 100, message = "目标岗位不能超过 100 字符") String targetRole,
            @NotNull(message = "请先同意将所选正文发送给 DeepSeek")
            @AssertTrue(message = "请先同意将所选正文发送给 DeepSeek") Boolean privacyConsent) {
        // A record's generated toString would otherwise disclose the entire resume paragraph.
        @Override public String toString() { return "RewriteRequest[content redacted]"; }
    }

    public record RewriteResponse(String requestId, String action, String originalText,
            String rewrittenText, List<String> warnings) {
        @Override public String toString() { return "RewriteResponse[content redacted]"; }
    }
}
