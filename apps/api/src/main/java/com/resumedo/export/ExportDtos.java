package com.resumedo.export;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public final class ExportDtos {
    private ExportDtos() {
    }

    public record CreateExportRequest(
            long revision,
            @NotBlank @Size(min = 8, max = 64) String idempotencyKey,
            @Size(max = 120) String filename) {
    }

    public record ExportResponse(
            String id,
            String status,
            String filename,
            String downloadUrl,
            String errorCode,
            String errorMessage,
            Instant expiresAt,
            Instant createdAt) {
    }
}
