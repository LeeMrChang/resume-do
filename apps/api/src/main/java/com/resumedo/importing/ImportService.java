package com.resumedo.importing;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.resumedo.common.*;
import com.resumedo.resume.*;
import jakarta.annotation.PreDestroy;
import java.io.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.*;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ImportService {
    public record Response(String id, String filename, String status, String sourceText, JsonNode draft,
        long version, String errorCode, String message, String resumeId, Instant expiresAt) {}
    public record SaveRequest(long version, JsonNode draft) {}
    public record ConfirmRequest(long version) {}
    private final ImportRepository jobs;
    private final ImportParser parser;
    private final ImportMapper mapper;
    private final ResumeValidator validator;
    private final ResumeService resumes;
    private final ObjectMapper json;
    private final Path directory;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(4), r -> {
        var t = new Thread(r, "resume-import-parser"); t.setDaemon(true); return t;
    });
    private final ScheduledExecutorService timeouts = Executors.newSingleThreadScheduledExecutor(r -> {
        var t = new Thread(r, "resume-import-timeouts"); t.setDaemon(true); return t;
    });

    public ImportService(ImportRepository jobs, ImportParser parser, ImportMapper mapper, ResumeValidator validator,
        ResumeService resumes, ObjectMapper json, @Value("${app.storage-dir}") String storageDir) {
        this.jobs = jobs; this.parser = parser; this.mapper = mapper; this.validator = validator; this.resumes = resumes; this.json = json;
        this.directory = Paths.get(storageDir).toAbsolutePath().normalize().resolve("imports");
    }

    public Response upload(long owner, MultipartFile file) {
        if (file.isEmpty()) throw ImportParser.error("EMPTY_FILE", "文件为空，请重新选择");
        if (file.getSize() > ImportParser.MAX_BYTES) throw ImportParser.error("FILE_TOO_LARGE", "文件不能超过 20MB");
        String filename = Objects.toString(file.getOriginalFilename(), "resume").replace('\\', '/');
        filename = filename.substring(filename.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "");
        if (filename.isBlank() || filename.length() > 255) throw ApiException.badRequest("文件名为空或超过 255 字符，请重命名");
        String extension = parser.extension(filename);
        if (jobs.activeCount(owner) >= 20) throw new ApiException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,
            "IMPORT_LIMIT", "最多保留 20 份未确认导入，请先放弃不需要的草稿", Map.of());
        String id = Ids.newPublicId(), key = id + "." + extension;
        Path target = safeFile(key);
        try {
            Files.createDirectories(directory);
            try (var in = file.getInputStream(); var out = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW)) {
                byte[] buffer = new byte[8192]; long total = 0; int read;
                while ((read = in.read(buffer)) != -1) {
                    total += read;
                    if (total > ImportParser.MAX_BYTES) throw ImportParser.error("FILE_TOO_LARGE", "文件不能超过 20MB");
                    out.write(buffer, 0, read);
                }
            }
            jobs.insert(id, owner, filename, key, mapper.draft("", filename).toString());
        } catch (RuntimeException | IOException e) {
            try { Files.deleteIfExists(target); } catch (IOException ignored) {}
            if (e instanceof RuntimeException re) throw re;
            throw new IllegalStateException("Cannot store import file", e);
        }
        submit(id, 0, target, extension, filename);
        return get(owner, id);
    }

    public List<Response> list(long owner) { return jobs.list(owner).stream().map(this::response).toList(); }
    public Response get(long owner, String id) { return response(require(owner, id, false)); }
    public ImportRepository.Job original(long owner, String id) {
        var job = require(owner, id, false);
        if (job.fileKey() == null || List.of("confirmed", "cancelled").contains(job.status())) throw ApiException.gone("FILE_REMOVED", "原文件已清理");
        return job;
    }
    public Path safeFile(String key) {
        if (key == null || !key.matches("[a-f0-9]{32}\\.(pdf|docx)")) throw ApiException.notFound("原文件不存在");
        Path target = directory.resolve(key);
        if (Files.isSymbolicLink(directory) || Files.isSymbolicLink(target)) throw ApiException.notFound("原文件不可用");
        return target;
    }
    public Response save(long owner, String id, SaveRequest request) {
        require(owner, id, false);
        JsonNode draft = request.draft() == null ? null : request.draft().deepCopy();
        if (draft == null || !draft.isObject() || draft.toString().length() > 1_000_000) throw ApiException.badRequest("导入草稿格式不正确或过大");
        // Drafts may contain unfinished dates/fields; final validation happens at confirmation.
        if (!draft.path("document").isObject() || !draft.path("appearance").isObject()) throw ApiException.badRequest("导入草稿缺少内容或版式");
        sanitizeDraft(draft);
        if (jobs.save(owner, id, request.version(), draft.toString()) != 1) throw ApiException.conflict("IMPORT_CONFLICT", "草稿已更新或正在解析，请重新加载后操作", Map.of());
        return get(owner, id);
    }

    private void sanitizeDraft(JsonNode draft) {
        if (!draft.path("title").isTextual() || !draft.path("document").path("basic").isObject()
                || !draft.path("document").path("intent").isObject()
                || !draft.path("document").path("sections").isArray()) throw ApiException.badRequest("草稿结构不完整");
        var document = draft.path("document");
        for (String field : List.of("name", "gender", "city", "phone", "email", "experienceYears", "photo"))
            if (!document.path("basic").path(field).isTextual()) throw ApiException.badRequest("基本信息必须是文本");
        for (String field : List.of("role", "city", "salary", "arrival"))
            if (!document.path("intent").path(field).isTextual()) throw ApiException.badRequest("求职意向必须是文本");
        if (document.path("sections").size() > 30) throw ApiException.badRequest("模块不能超过 30 个");
        for (var section : document.path("sections")) {
            if (!section.isObject() || !section.path("id").isTextual() || !section.path("title").isTextual()
                || !section.path("visible").isBoolean() || !List.of("records", "rich").contains(section.path("type").asText())
                || !section.path("items").isArray() || section.path("items").size() > 30)
                throw ApiException.badRequest("模块结构不正确");
            for (var item : section.path("items")) {
                if (!item.isObject() || !item.path("ongoing").isBoolean()) throw ApiException.badRequest("经历结构不正确");
                for (String field : List.of("id", "title", "role", "startMonth", "endMonth", "body"))
                    if (!item.path(field).isTextual()) throw ApiException.badRequest("经历字段必须是文本");
                ((ObjectNode) item).put("body", ResumeValidator.sanitizeBody(item.path("body").asText()));
            }
        }
    }

    @Transactional
    public ResumeDtos.ResumeResponse confirm(long owner, String id, ConfirmRequest request) {
        var job = require(owner, id, true);
        if (job.status().equals("confirmed")) return resumes.get(owner, job.resumeId());
        if (!List.of("ready", "failed").contains(job.status())) throw ApiException.badRequest("任务正在解析或已放弃，不能确认");
        if (request.version() != job.version()) throw ApiException.conflict("IMPORT_CONFLICT", "请先保存最新校对内容再确认", Map.of());
        JsonNode draft = read(job.draft());
        validator.validate(draft.path("document"), draft.path("appearance"));
        var resume = resumes.create(owner, new ResumeDtos.CreateRequest(draft.path("title").asText(job.filename()), draft.path("document"), draft.path("appearance")));
        jobs.confirmed(id, resume.id());
        afterCommit(() -> removeOriginal(job));
        return resume;
    }

    @Transactional
    public void cancel(long owner, String id) {
        var job = require(owner, id, true);
        if (job.status().equals("confirmed")) throw ApiException.badRequest("已确认的任务不能放弃；正式简历不会被删除");
        jobs.cancelled(id);
        afterCommit(() -> removeOriginal(job));
    }
    public Response retry(long owner, String id) {
        var job = original(owner, id);
        if (jobs.retry(owner, id, job.version()) != 1) throw ApiException.conflict("IMPORT_CONFLICT", "任务状态已变化，请重新加载", Map.of());
        submit(id, job.version() + 1, safeFile(job.fileKey()), parser.extension(job.filename()), job.filename());
        return get(owner, id);
    }
    private void submit(String id, long version, Path target, String extension, String filename) {
        try {
            Future<?> task = executor.submit(() -> {
                try {
                    var parsed = parser.parse(target, extension);
                    jobs.result(id, version, parsed.text(), mapper.draft(parsed.text(), filename).toString(), parsed.warning());
                } catch (ApiException e) { jobs.fail(id, version, e.code(), e.getMessage()); }
                catch (Exception e) { jobs.fail(id, version, "PARSE_FAILED", "解析失败，原文件已保留，可重试或手动整理"); }
            });
            timeouts.schedule(() -> {
                if (!task.isDone()) {
                    try { jobs.fail(id, version, "PARSE_TIMEOUT", "解析超时，原文件已保留，可重试或手动整理"); }
                    finally { task.cancel(true); }
                }
            }, 30, TimeUnit.SECONDS);
        } catch (RejectedExecutionException e) { jobs.fail(id, version, "IMPORT_BUSY", "解析服务繁忙，原文件已保留，请稍后重试"); }
    }
    private ImportRepository.Job require(long owner, String id, boolean lock) {
        var job = jobs.find(owner, id, lock).orElseThrow(() -> ApiException.notFound("导入任务不存在"));
        if (!job.expiresAt().isAfter(Instant.now()) || job.status().equals("expired")) throw ApiException.gone("IMPORT_EXPIRED", "导入任务已过期，请重新上传");
        return job;
    }
    private JsonNode read(String value) {
        try { return value == null ? null : json.readTree(value); }
        catch (IOException e) { throw new IllegalStateException("Invalid stored import JSON", e); }
    }
    private Response response(ImportRepository.Job job) {
        return new Response(job.id(), job.filename(), job.status(), job.source(), read(job.draft()), job.version(), job.code(), job.message(), job.resumeId(), job.expiresAt());
    }
    private void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { action.run(); }
        }); else action.run();
    }
    private void removeOriginal(ImportRepository.Job job) {
        if (job.fileKey() == null) return;
        try { Files.deleteIfExists(safeFile(job.fileKey())); jobs.fileRemoved(job.id()); }
        catch (Exception e) { org.slf4j.LoggerFactory.getLogger(getClass()).warn("Import file cleanup failed for {}", job.id()); }
    }
    @EventListener(ApplicationReadyEvent.class)
    public void recover() { jobs.recover(); cleanup(); }
    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    public void cleanup() {
        jobs.recover();
        for (var job : jobs.cleanupCandidates()) {
            if (!job.expiresAt().isAfter(Instant.now())) jobs.expire(job.id());
            removeOriginal(job); jobs.purge(job.id());
        }
        // Recover files left behind by a crash between writing the file and inserting its row.
        if (!Files.isDirectory(directory) || Files.isSymbolicLink(directory)) return;
        try (var files = Files.newDirectoryStream(directory)) {
            int removed = 0;
            for (var file : files) {
                if (removed >= 100) break;
                String key = file.getFileName().toString();
                if (!key.matches("[a-f0-9]{32}\\.(pdf|docx)") || Files.isSymbolicLink(file) || !Files.isRegularFile(file)) continue;
                if (Files.getLastModifiedTime(file).toInstant().isBefore(Instant.now().minusSeconds(86400)) && !jobs.hasFile(key)) {
                    Files.deleteIfExists(safeFile(key)); removed++;
                }
            }
        } catch (IOException e) { org.slf4j.LoggerFactory.getLogger(getClass()).warn("Import orphan cleanup failed"); }
    }
    @PreDestroy public void close() { executor.shutdownNow(); timeouts.shutdownNow(); }
}
