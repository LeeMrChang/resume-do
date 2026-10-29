package com.resumedo.resume;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.resumedo.common.ApiException;
import com.resumedo.common.Ids;
import com.resumedo.resume.ResumeDtos.CreateRequest;
import com.resumedo.resume.ResumeDtos.ResumeResponse;
import com.resumedo.resume.ResumeDtos.ResumeSummary;
import com.resumedo.resume.ResumeDtos.UpdateRequest;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ResumeService {
    private static final int TEMPLATE_VERSION = 2;

    private final ResumeRepository repository;
    private final ResumeValidator validator;
    private final ObjectMapper objectMapper;

    public ResumeService(
            ResumeRepository repository,
            ResumeValidator validator,
            ObjectMapper objectMapper) {
        this.repository = repository;
        this.validator = validator;
        this.objectMapper = objectMapper;
    }

    public List<ResumeSummary> list(long ownerId) {
        return repository.list(ownerId).stream()
                .map(row -> new ResumeSummary(
                        row.publicId(),
                        row.title(),
                        row.revision(),
                        row.templateId(),
                        row.updatedAt(), row.kind(), row.source()))
                .toList();
    }

    public ResumeResponse get(long ownerId, String publicId) {
        return toResponse(repository.find(ownerId, publicId)
                .orElseThrow(() -> ApiException.notFound("简历不存在")));
    }

    @Transactional
    public ResumeResponse create(long ownerId, CreateRequest request) {
        String title = normalizeTitle(request.title());
        ResumeValidator.Validated validated = validator.validate(request.document(), request.appearance());
        repository.requireCapacity(ownerId);
        String publicId = Ids.newPublicId();
        repository.insert(
                publicId,
                ownerId,
                title,
                validated.document().toString(),
                validated.appearance().toString(),
                validated.schemaVersion(),
                validated.templateId(),
                TEMPLATE_VERSION);
        return get(ownerId, publicId);
    }

    @Transactional
    public ResumeResponse update(long ownerId, String publicId, UpdateRequest request) {
        ResumeRow current = repository.find(ownerId, publicId)
                .orElseThrow(() -> ApiException.notFound("简历不存在"));

        if ("original".equals(current.kind())) throw ApiException.conflict(
            "ORIGINAL_RESUME_READ_ONLY", "原件简历不支持编辑", Map.of());
        if (request.clientMutationId().equals(current.lastMutationId())) {
            return toResponse(current);
        }
        if (request.baseRevision() == null || request.baseRevision() != current.revision()) {
            throw conflict(current);
        }
        if (request.title() == null && request.document() == null && request.appearance() == null) {
            throw ApiException.badRequest("没有需要保存的内容");
        }

        try {
            JsonNode document = request.document() != null
                    ? request.document()
                    : objectMapper.readTree(current.documentJson());
            JsonNode appearance = request.appearance() != null
                    ? request.appearance()
                    : objectMapper.readTree(current.appearanceJson());
            String title = request.title() != null ? normalizeTitle(request.title()) : current.title();

            ResumeValidator.Validated validated = validator.validate(document, appearance);
            long nextRevision = current.revision() + 1;
            int updated = repository.update(
                    current.id(),
                    ownerId,
                    current.revision(),
                    title,
                    validated.document().toString(),
                    validated.appearance().toString(),
                    validated.schemaVersion(),
                    validated.templateId(),
                    TEMPLATE_VERSION,
                    nextRevision,
                    request.clientMutationId());

            if (updated == 0) {
                ResumeRow latest = repository.find(ownerId, publicId)
                        .orElseThrow(() -> ApiException.notFound("简历不存在"));
                if (request.clientMutationId().equals(latest.lastMutationId())) {
                    return toResponse(latest);
                }
                throw conflict(latest);
            }
            return get(ownerId, publicId);
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalStateException("Stored resume JSON is invalid", exception);
        }
    }

    private ResumeResponse toResponse(ResumeRow row) {
        try {
            return new ResumeResponse(
                    row.publicId(),
                    row.title(),
                    row.revision(),
                    objectMapper.readTree(row.documentJson()),
                    objectMapper.readTree(row.appearanceJson()),
                    row.createdAt(),
                    row.updatedAt(), row.kind(), row.source());
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalStateException("Stored resume JSON is invalid", exception);
        }
    }

    private static String normalizeTitle(String title) {
        String value = title == null ? "" : title.trim();
        if (value.isEmpty()) value = "我的简历";
        if (value.length() > 100) {
            throw ApiException.badRequest("简历名称最多 100 个字符");
        }
        return value;
    }

    private static ApiException conflict(ResumeRow current) {
        return ApiException.conflict(
                "REVISION_CONFLICT",
                "简历已在其他窗口更新，请重新加载或保留本地副本",
                Map.of(
                        "currentRevision", current.revision(),
                        "updatedAt", Objects.toString(current.updatedAt(), "")));
    }
}
