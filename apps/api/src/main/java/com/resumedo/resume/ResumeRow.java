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
        Instant updatedAt,
        String kind, String sourceKey, String sourceFilename, String sourceMime,
        Long sourceBytes, String sourceSha256, Integer sourcePages, Instant deletedAt) {
    public ResumeRow(long id, String publicId, long ownerId, String title, String documentJson,
            String appearanceJson, int schemaVersion, String templateId, int templateVersion,
            long revision, String lastMutationId, Instant createdAt, Instant updatedAt) {
        this(id, publicId, ownerId, title, documentJson, appearanceJson, schemaVersion, templateId,
             templateVersion, revision, lastMutationId, createdAt, updatedAt,
             "structured", null, null, null, null, null, null, null);
    }
    public ResumeDtos.Source source() {
        return sourceFilename != null ? new ResumeDtos.Source(sourceFilename, sourceMime, sourceBytes, sourcePages) : null;
    }
}
