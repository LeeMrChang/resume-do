package com.resumedo.export;

import java.time.Instant;

public record ExportJobRow(
        long id,
        String publicId,
        long ownerId,
        long resumeId,
        long revision,
        int status,
        String filename,
        String errorCode,
        String errorMessage,
        String fileKey,
        Long fileBytes,
        Instant expiresAt,
        Instant createdAt,
        Instant finishedAt) {
}
