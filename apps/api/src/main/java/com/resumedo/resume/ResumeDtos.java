package com.resumedo.resume;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public final class ResumeDtos {
    private ResumeDtos() {
    }

    public record CreateRequest(
            @Size(max = 100) String title,
            @NotNull JsonNode document,
            @NotNull JsonNode appearance) {
    }

    public record UpdateRequest(
            @NotNull Long baseRevision,
            @NotBlank @Size(max = 64) String clientMutationId,
            @Size(max = 100) String title,
            JsonNode document,
            JsonNode appearance) {
    }

    public record Source(String filename, String mime, Long bytes, Integer pages) {}

    public record ResumeResponse(
            String id,
            String title,
            long revision,
            JsonNode document,
            JsonNode appearance,
            Instant createdAt,
            Instant updatedAt, String kind, Source source) {
        public ResumeResponse(String id, String title, long revision, JsonNode document, JsonNode appearance, Instant createdAt, Instant updatedAt) {
            this(id,title,revision,document,appearance,createdAt,updatedAt,"structured",null);
        }
    }

    public record ResumeSummary(
            String id,
            String title,
            long revision,
            String templateId,
            Instant updatedAt, String kind, Source source) {
    }
}
