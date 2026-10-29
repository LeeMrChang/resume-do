package com.resumedo.common;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiError> handleApi(ApiException exception) {
        return ResponseEntity.status(exception.status())
                .body(new ApiError(exception.code(), exception.getMessage(), exception.details()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception) {
        Map<String, Object> fields = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors()
                .forEach(error -> fields.putIfAbsent(error.getField(), error.getDefaultMessage()));
        String message = fields.values().stream().findFirst().map(Object::toString).orElse("请求参数不正确");
        return ResponseEntity.badRequest()
                .body(new ApiError("VALIDATION_FAILED", message, Map.of("fields", fields)));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleUnreadable(HttpMessageNotReadableException exception) {
        return ResponseEntity.badRequest()
                .body(new ApiError("INVALID_JSON", "请求内容不是有效的 JSON", Map.of()));
    }

    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<ApiError> handleDuplicate(DuplicateKeyException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ApiError("DUPLICATE", "数据已存在", Map.of()));
    }

    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiError> handleUploadTooLarge(Exception exception, jakarta.servlet.http.HttpServletRequest request) {
        HttpStatus status = ("/api/resumes/originals".equals(request.getRequestURI()) || "/api/imports/direct".equals(request.getRequestURI()))
                ? HttpStatus.BAD_REQUEST : HttpStatus.PAYLOAD_TOO_LARGE;
        return ResponseEntity.status(status)
                .body(new ApiError("FILE_TOO_LARGE", "文件不能超过 20MB", Map.of()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception exception) {
        log.error("Unhandled API error", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError("INTERNAL_ERROR", "服务器处理失败，请稍后重试", Map.of()));
    }
}
