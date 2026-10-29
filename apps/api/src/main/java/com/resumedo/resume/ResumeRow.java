package com.resumedo.resume;

import java.time.Instant;

public record ResumeRow(
        long id,
        String publicId,
        long ownerId,
        String title,
        String documentJson,
        String appearanceJson,
        int schemaVersion,
        String templateId,
        int templateVersion,
        long revision,
        String lastMutationId,
        Instant createdAt,
        Instant updatedAt) {
}
