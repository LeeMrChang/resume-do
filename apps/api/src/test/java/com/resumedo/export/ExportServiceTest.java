package com.resumedo.export;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.resumedo.TestFixtures;
import com.resumedo.common.ApiException;
import com.resumedo.export.ExportDtos.CreateExportRequest;
import com.resumedo.export.ExportDtos.ExportResponse;
import com.resumedo.resume.ResumeRepository;
import com.resumedo.resume.ResumeRow;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;

class ExportServiceTest {
    private static final long OWNER = 7L;
    private static final String RESUME_ID = "resume-pub";
    private static final Instant CREATED = Instant.parse("2026-01-01T00:00:00Z");

    private final ExportRepository exports = mock(ExportRepository.class);
    private final ResumeRepository resumes = mock(ResumeRepository.class);

    @TempDir
    Path storageDir;

    private ExportService service() {
        return new ExportService(exports, resumes, new ObjectMapper(), storageDir.toString(), 1, "1");
    }

    @Test
    void createConflictsWhenResumeRevisionChanged() {
        when(resumes.find(OWNER, RESUME_ID)).thenReturn(Optional.of(resumeRow(3)));

        assertThatThrownBy(() -> service().create(OWNER, RESUME_ID, new CreateExportRequest(2L, "idem-key-1", null)))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> {
                    ApiException error = (ApiException) throwable;
                    assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(error.code()).isEqualTo("REVISION_CONFLICT");
                });
    }

    @Test
    void createReplaysExistingJobForSameIdempotencyKey() {
        when(resumes.find(OWNER, RESUME_ID)).thenReturn(Optional.of(resumeRow(3)));
        when(exports.findByIdempotency(OWNER, "idem-key-1"))
                .thenReturn(Optional.of(job("existing-job", 0, null, null, "张三_后端工程师.pdf")));

        ExportResponse response = service().create(OWNER, RESUME_ID, new CreateExportRequest(3L, "idem-key-1", null));

        assertThat(response.id()).isEqualTo("existing-job");
        verify(exports, never()).insert(anyString(), anyLong(), anyLong(), anyLong(), anyString(), anyString(),
                anyString(), anyInt(), anyString(), anyString(), anyString());
    }

    @Test
    void createDefaultsFilenameFromDocumentNameAndRole() {
        when(resumes.find(OWNER, RESUME_ID)).thenReturn(Optional.of(resumeRow(3)));
        when(exports.findByIdempotency(OWNER, "idem-key-1")).thenReturn(Optional.empty());
        when(exports.find(eq(OWNER), anyString()))
                .thenAnswer(invocation -> Optional.of(job(invocation.getArgument(1), 0, null, null, "unused.pdf")));

        service().create(OWNER, RESUME_ID, new CreateExportRequest(3L, "idem-key-1", null));

        ArgumentCaptor<String> filename = ArgumentCaptor.forClass(String.class);
        verify(exports).insert(anyString(), eq(OWNER), eq(1L), eq(3L), anyString(), anyString(),
                eq("clean"), eq(1), eq("1"), filename.capture(), eq("idem-key-1"));
        assertThat(filename.getValue()).isEqualTo("张三_后端工程师.pdf");
    }

    @Test
    void createSanitizesFilenameCharacters() {
        when(resumes.find(OWNER, RESUME_ID)).thenReturn(Optional.of(resumeRow(3)));
        when(exports.findByIdempotency(OWNER, "idem-key-1")).thenReturn(Optional.empty());
        when(exports.find(eq(OWNER), anyString()))
                .thenAnswer(invocation -> Optional.of(job(invocation.getArgument(1), 0, null, null, "unused.pdf")));

        service().create(OWNER, RESUME_ID, new CreateExportRequest(3L, "idem-key-1", "我的/简历*.pdf"));

        ArgumentCaptor<String> filename = ArgumentCaptor.forClass(String.class);
        verify(exports).insert(anyString(), eq(OWNER), eq(1L), eq(3L), anyString(), anyString(),
                eq("clean"), eq(1), eq("1"), filename.capture(), eq("idem-key-1"));
        assertThat(filename.getValue()).isEqualTo("我的_简历_.pdf");
    }

    @Test
    void createReturnsExistingJobWhenInsertRacesDuplicateKey() {
        when(resumes.find(OWNER, RESUME_ID)).thenReturn(Optional.of(resumeRow(3)));
        when(exports.findByIdempotency(OWNER, "idem-key-1"))
                .thenReturn(Optional.empty(), Optional.of(job("dup-job", 0, null, null, "f.pdf")));
        doThrow(new DuplicateKeyException("duplicate idempotency key"))
                .when(exports).insert(anyString(), anyLong(), anyLong(), anyLong(), anyString(), anyString(),
                        anyString(), anyInt(), anyString(), anyString(), anyString());

        ExportResponse response = service().create(OWNER, RESUME_ID, new CreateExportRequest(3L, "idem-key-1", null));

        assertThat(response.id()).isEqualTo("dup-job");
    }

    @Test
    void getMapsStatusToReadyWithDownloadUrl() {
        when(exports.find(OWNER, "job-1"))
                .thenReturn(Optional.of(job("job-1", 2, null, "out/f.pdf", "f.pdf")));

        ExportResponse response = service().get(OWNER, "job-1");

        assertThat(response.status()).isEqualTo("ready");
        assertThat(response.downloadUrl()).isEqualTo("/api/exports/job-1/file");
    }

    @Test
    void getMapsQueuedStatusWithoutDownloadUrl() {
        when(exports.find(OWNER, "job-1"))
                .thenReturn(Optional.of(job("job-1", 0, null, null, "f.pdf")));

        ExportResponse response = service().get(OWNER, "job-1");

        assertThat(response.status()).isEqualTo("queued");
        assertThat(response.downloadUrl()).isNull();
    }

    @Test
    void getMapsExpiredReadyJob() {
        when(exports.find(OWNER, "job-1"))
                .thenReturn(Optional.of(job("job-1", 2, Instant.now().minusSeconds(60), "out/f.pdf", "f.pdf")));

        ExportResponse response = service().get(OWNER, "job-1");

        assertThat(response.status()).isEqualTo("expired");
        assertThat(response.errorCode()).isEqualTo("FILE_EXPIRED");
    }

    @Test
    void downloadConflictsWhenJobNotReady() {
        when(exports.find(OWNER, "job-1")).thenReturn(Optional.of(job("job-1", 1, null, null, "f.pdf")));

        assertThatThrownBy(() -> service().download(OWNER, "job-1"))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> {
                    ApiException error = (ApiException) throwable;
                    assertThat(error.status()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(error.code()).isEqualTo("EXPORT_NOT_READY");
                });
    }

    @Test
    void downloadGoneWhenLinkExpired() {
        when(exports.find(OWNER, "job-1"))
                .thenReturn(Optional.of(job("job-1", 2, Instant.now().minusSeconds(60), "out/f.pdf", "f.pdf")));

        assertThatThrownBy(() -> service().download(OWNER, "job-1"))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> assertThat(((ApiException) throwable).code()).isEqualTo("FILE_EXPIRED"));
    }

    @Test
    void downloadGoneWhenFileKeyMissing() {
        when(exports.find(OWNER, "job-1"))
                .thenReturn(Optional.of(job("job-1", 2, Instant.now().plusSeconds(600), null, "f.pdf")));

        assertThatThrownBy(() -> service().download(OWNER, "job-1"))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> assertThat(((ApiException) throwable).code()).isEqualTo("FILE_MISSING"));
    }

    @Test
    void downloadGoneWhenFileRemovedFromDisk() {
        when(exports.find(OWNER, "job-1"))
                .thenReturn(Optional.of(job("job-1", 2, Instant.now().plusSeconds(600), "out/deleted.pdf", "f.pdf")));

        assertThatThrownBy(() -> service().download(OWNER, "job-1"))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> assertThat(((ApiException) throwable).code()).isEqualTo("FILE_MISSING"));
    }

    @Test
    void downloadRejectsPathTraversal() {
        when(exports.find(OWNER, "job-1"))
                .thenReturn(Optional.of(job("job-1", 2, Instant.now().plusSeconds(600), "../escape.pdf", "f.pdf")));

        assertThatThrownBy(() -> service().download(OWNER, "job-1"))
                .isInstanceOf(ApiException.class)
                .satisfies(throwable -> assertThat(((ApiException) throwable).code()).isEqualTo("FILE_MISSING"));
    }

    @Test
    void downloadReturnsExistingFile() throws IOException {
        Path file = storageDir.resolve("out/ok.pdf");
        Files.createDirectories(file.getParent());
        Files.write(file, new byte[] { 0x25, 0x50, 0x44, 0x46 });
        when(exports.find(OWNER, "job-1"))
                .thenReturn(Optional.of(job("job-1", 2, Instant.now().plusSeconds(600), "out/ok.pdf", "我的简历.pdf")));

        ExportService.Download download = service().download(OWNER, "job-1");

        assertThat(download.path()).isEqualTo(file);
        assertThat(download.filename()).isEqualTo("我的简历.pdf");
    }

    private static ResumeRow resumeRow(long revision) {
        return new ResumeRow(
                1,
                RESUME_ID,
                OWNER,
                "我的简历",
                TestFixtures.validDocumentJson(),
                TestFixtures.validAppearanceJson(),
                1,
                "clean",
                1,
                revision,
                null,
                CREATED,
                CREATED);
    }

    private static ExportJobRow job(
            String publicId, int status, Instant expiresAt, String fileKey, String filename) {
        return new ExportJobRow(
                2,
                publicId,
                OWNER,
                1,
                3,
                status,
                filename,
                null,
                null,
                fileKey,
                null,
                expiresAt,
                CREATED,
                null);
    }
}
