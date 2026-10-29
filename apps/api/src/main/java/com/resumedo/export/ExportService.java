package com.resumedo.export;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.resumedo.common.ApiException;
import com.resumedo.common.Ids;
import com.resumedo.export.ExportDtos.CreateExportRequest;
import com.resumedo.export.ExportDtos.ExportResponse;
import com.resumedo.resume.ResumeRepository;
import com.resumedo.resume.ResumeRow;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExportService {
    private final ExportRepository exports;
    private final ResumeRepository resumes;
    private final ObjectMapper objectMapper;
    private final String storageDir;
    private final int templateVersion;
    private final String rendererVersion;

    public ExportService(
            ExportRepository exports,
            ResumeRepository resumes,
            ObjectMapper objectMapper,
            @Value("${app.storage-dir}") String storageDir,
            @Value("${app.template-version:2}") int templateVersion,
            @Value("${app.renderer-version:2}") String rendererVersion) {
        this.exports = exports;
        this.resumes = resumes;
        this.objectMapper = objectMapper;
        this.storageDir = storageDir;
        this.templateVersion = templateVersion;
        this.rendererVersion = rendererVersion;
    }

    @Transactional
    public ExportResponse create(long ownerId, String resumePublicId, CreateExportRequest request) {
        ResumeRow resume = resumes.find(ownerId, resumePublicId)
                .orElseThrow(() -> ApiException.notFound("简历不存在"));
        if (request.revision() != resume.revision()) {
            throw ApiException.conflict(
                    "REVISION_CONFLICT",
                    "简历已更新，请保存后再导出",
                    Map.of("currentRevision", resume.revision()));
        }

        ExportJobRow existing = exports.findByIdempotency(ownerId, request.idempotencyKey()).orElse(null);
        if (existing != null) {
            return toResponse(existing);
        }

        String filename = filename(request.filename(), resume);
        String snapshot;
        try {
            JsonNode document = objectMapper.readTree(resume.documentJson());
            JsonNode appearance = objectMapper.readTree(resume.appearanceJson());
            ObjectNode node = objectMapper.createObjectNode();
            node.put("schemaVersion", resume.schemaVersion());
            node.set("document", document);
            node.set("appearance", appearance);
            node.put("templateId", resume.templateId());
            node.put("templateVersion", templateVersion);
            node.put("rendererVersion", rendererVersion);
            node.put("filename", filename);
            snapshot = objectMapper.writeValueAsString(node);
        } catch (IOException exception) {
            throw new IllegalStateException("Stored resume JSON is invalid", exception);
        }

        String publicId = Ids.newPublicId();
        try {
            exports.insert(
                    publicId,
                    ownerId,
                    resume.id(),
                    resume.revision(),
                    snapshot,
                    sha256(snapshot),
                    resume.templateId(),
                    templateVersion,
                    rendererVersion,
                    filename,
                    request.idempotencyKey());
        } catch (DuplicateKeyException duplicate) {
            return exports.findByIdempotency(ownerId, request.idempotencyKey())
                    .map(this::toResponse)
                    .orElseThrow(() -> duplicate);
        }

        return exports.find(ownerId, publicId)
                .map(this::toResponse)
                .orElseThrow(() -> new IllegalStateException("Export job vanished after insert"));
    }

    public ExportResponse get(long ownerId, String publicId) {
        return exports.find(ownerId, publicId)
                .map(this::toResponse)
                .orElseThrow(() -> ApiException.notFound("导出任务不存在"));
    }

    public Download download(long ownerId, String publicId) {
        ExportJobRow job = exports.find(ownerId, publicId)
                .orElseThrow(() -> ApiException.notFound("导出任务不存在"));
        if (job.status() != 2) {
            throw ApiException.conflict("EXPORT_NOT_READY", "文件尚未生成完成", Map.of("status", job.status()));
        }
        if (job.expiresAt() != null && !job.expiresAt().isAfter(Instant.now())) {
            throw ApiException.gone("FILE_EXPIRED", "下载链接已过期，请重新导出");
        }
        if (job.fileKey() == null) {
            throw ApiException.gone("FILE_MISSING", "导出文件不存在，请重新导出");
        }
        Path root = Paths.get(storageDir).toAbsolutePath().normalize();
        Path file = root.resolve(job.fileKey()).normalize();
        if (!file.startsWith(root) || !Files.isRegularFile(file)) {
            throw ApiException.gone("FILE_MISSING", "导出文件不存在，请重新导出");
        }
        return new Download(file, job.filename());
    }

    private ExportResponse toResponse(ExportJobRow job) {
        boolean expired = job.status() == 2
                && job.expiresAt() != null
                && !job.expiresAt().isAfter(Instant.now());
        String status = switch (job.status()) {
            case 0 -> "queued";
            case 1 -> "rendering";
            case 2 -> expired ? "expired" : "ready";
            default -> "failed";
        };
        String downloadUrl = "ready".equals(status) ? "/api/exports/" + job.publicId() + "/file" : null;
        String errorCode = expired ? "FILE_EXPIRED" : job.errorCode();
        String errorMessage = expired ? "下载链接已过期，请重新导出" : job.errorMessage();
        return new ExportResponse(
                job.publicId(),
                status,
                job.filename(),
                downloadUrl,
                errorCode,
                errorMessage,
                job.expiresAt(),
                job.createdAt());
    }

    private String filename(String requested, ResumeRow resume) {
        String value = requested == null ? "" : requested.trim();
        if (value.isEmpty()) {
            try {
                JsonNode document = objectMapper.readTree(resume.documentJson());
                String name = document.path("basic").path("name").asText("").trim();
                String role = document.path("intent").path("role").asText("").trim();
                value = (name.isEmpty() ? "我的" : name) + "_" + (role.isEmpty() ? "简历" : role);
            } catch (IOException exception) {
                value = "我的_简历";
            }
        }
        value = value.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (value.isEmpty()) value = "我的_简历";
        if (!value.toLowerCase().endsWith(".pdf")) value += ".pdf";
        if (value.length() > 150) {
            value = value.substring(0, 146) + ".pdf";
        }
        return value;
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    public record Download(Path path, String filename) {
    }
}
