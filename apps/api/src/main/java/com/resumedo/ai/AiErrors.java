package com.resumedo.ai;

import com.resumedo.common.ApiException;
import java.util.Map;
import org.springframework.http.HttpStatus;

final class AiErrors {
    private AiErrors() { }
    static ApiException error(HttpStatus status, String code, String message) {
        return new ApiException(status, code, message, Map.of());
    }
    static ApiException invalidResult() {
        return error(HttpStatus.BAD_GATEWAY, "AI_INVALID_RESULT", "AI 未返回有效改写结果，请重新尝试");
    }
}
