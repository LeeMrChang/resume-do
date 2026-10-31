package com.resumedo.importing;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.resumedo.common.ApiException;
import com.resumedo.resume.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

class ImportServiceTest {
    @TempDir Path storage;
    final ImportRepository jobs = mock(ImportRepository.class);
    final ResumeService resumes = mock(ResumeService.class);
    final ObjectMapper json = new ObjectMapper();
    final EditableImportService editable = mock(EditableImportService.class);
    ImportService service;
    ImportRepository.Job job(String id, long owner, String status, String resumeId) {
        return new ImportRepository.Job(id, owner, "resume.docx", "a".repeat(32) + ".docx", status, "原文",
            new ImportMapper(json).draft("姓名：测试", "resume.docx").toString(), 3, true, null, null, resumeId,
            Instant.now().plusSeconds(3600), Instant.now());
    }
    @BeforeEach void setup() { service = new ImportService(jobs, new ImportParser(), new ImportMapper(json), new ResumeValidator(), resumes, json, storage.toString(), editable, new ImportPhotoExtractor()); }
    @AfterEach void close() { service.close(); }
    @Test void noResumeIsCreatedBySavingOrCancellingAnImport() {
        var job = job("one", 1, "ready", null);
        when(jobs.find(1, "one", false)).thenReturn(Optional.of(job));
        when(jobs.find(1, "one", true)).thenReturn(Optional.of(job));
        when(jobs.save(eq(1L), eq("one"), eq(3L), anyString())).thenReturn(1);
        service.save(1, "one", new ImportService.SaveRequest(3, json.valueToTree(new ImportMapper(json).draft("未确认文字", "x.pdf"))));
        service.cancel(1, "one");
        verifyNoInteractions(resumes);
    }
    @Test void confirmAlwaysCreatesNewAndRepeatedConfirmationReturnsTheSameResume() {
        var ready = job("one", 1, "ready", null);
        var confirmed = job("one", 1, "confirmed", "new-resume");
        var response = new ResumeDtos.ResumeResponse("new-resume", "resume", 0, json.createObjectNode(), json.createObjectNode(), Instant.now(), Instant.now());
        when(jobs.find(1, "one", true)).thenReturn(Optional.of(ready), Optional.of(confirmed));
        when(editable.confirm(eq(1L), any(), any())).thenReturn(response);
        when(resumes.get(1, "new-resume")).thenReturn(response);
        assertThat(service.confirm(1, "one", new ImportService.ConfirmRequest(3)).id()).isEqualTo("new-resume");
        assertThat(service.confirm(1, "one", new ImportService.ConfirmRequest(3)).id()).isEqualTo("new-resume");
        verify(editable, times(1)).confirm(eq(1L), any(), any());
        verify(jobs).confirmed("one", "new-resume");
        verify(resumes, never()).update(anyLong(), anyString(), any());
    }
    @Test void differentImportsCreateDistinctResumesInsteadOfMerging() {
        when(jobs.find(1, "one", true)).thenReturn(Optional.of(job("one", 1, "ready", null)));
        when(jobs.find(1, "two", true)).thenReturn(Optional.of(job("two", 1, "ready", null)));
        when(editable.confirm(eq(1L), any(), any())).thenReturn(
            new ResumeDtos.ResumeResponse("a", "resume", 0, json.createObjectNode(), json.createObjectNode(), Instant.now(), Instant.now()),
            new ResumeDtos.ResumeResponse("b", "resume", 0, json.createObjectNode(), json.createObjectNode(), Instant.now(), Instant.now()));
        assertThat(service.confirm(1, "one", new ImportService.ConfirmRequest(3)).id()).isEqualTo("a");
        assertThat(service.confirm(1, "two", new ImportService.ConfirmRequest(3)).id()).isEqualTo("b");
        verify(editable, times(2)).confirm(eq(1L), any(), any());
    }
    @Test void crossOwnerAndStaleDraftCannotConfirmOrCreateAResume() {
        when(jobs.find(2, "one", true)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.confirm(2, "one", new ImportService.ConfirmRequest(3))).isInstanceOf(ApiException.class);
        when(jobs.find(1, "one", true)).thenReturn(Optional.of(job("one", 1, "ready", null)));
        assertThatThrownBy(() -> service.confirm(1, "one", new ImportService.ConfirmRequest(2))).hasMessageContaining("最新");
        verifyNoInteractions(resumes);
    }
    @Test void rejectsEmptyOversizeAndUnsafeFileKeys() {
        assertThatThrownBy(() -> service.upload(1, new MockMultipartFile("file", "x.pdf", "application/pdf", new byte[0]))).hasMessageContaining("为空");
        var oversized = new MockMultipartFile("file", "x.pdf", "application/pdf", new byte[]{1}) {
            @Override public long getSize() { return ImportParser.MAX_BYTES + 1; }
        };
        assertThatThrownBy(() -> service.upload(1, oversized)).hasMessageContaining("20MB");
        assertThatThrownBy(() -> service.safeFile("../outside.pdf")).isInstanceOf(ApiException.class);
        verifyNoInteractions(resumes);
    }
    @Test void draftsAreSanitizedBeforeReloadEvenBeforeFinalConfirmation() throws Exception {
        when(jobs.find(1, "one", false)).thenReturn(Optional.of(job("one", 1, "ready", null)));
        when(jobs.save(eq(1L), eq("one"), eq(3L), anyString())).thenReturn(1);
        var draft = new ImportMapper(json).draft("自我评价\n待编辑", "x.pdf");
        com.fasterxml.jackson.databind.JsonNode evaluation = null;
        for (var entry : draft.path("document").path("sections")) {
            if ("evaluation".equals(entry.path("id").asText())) evaluation = entry;
        }
        ((com.fasterxml.jackson.databind.node.ObjectNode) evaluation.path("items").get(0))
            .put("body", "<p onclick='x()'>正文</p><img src=x onerror='alert(1)'><script>bad()</script>");
        service.save(1, "one", new ImportService.SaveRequest(3, draft));
        var argument = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(jobs).save(eq(1L), eq("one"), eq(3L), argument.capture());
        assertThat(argument.getValue()).contains("正文").doesNotContain("onclick", "onerror", "<script", "<img");
        verifyNoInteractions(resumes);
    }
    @Test void expiryBlocksOriginalAndDraftAccess() {
        var active = job("one", 1, "ready", null);
        var expired = new ImportRepository.Job(active.id(), active.owner(), active.filename(), active.fileKey(), active.status(),
            active.source(), active.draft(), active.version(), active.edited(), null, null, null, Instant.now().minusSeconds(1), Instant.now());
        when(jobs.find(1, "one", false)).thenReturn(Optional.of(expired));
        assertThatThrownBy(() -> service.get(1, "one")).hasMessageContaining("过期");
        assertThatThrownBy(() -> service.original(1, "one")).hasMessageContaining("过期");
        verifyNoInteractions(resumes);
    }
    @Test void originalIsDeletedOnlyAfterTheConfirmTransactionCommits() throws Exception {
        String id = "a".repeat(32), key = id + ".pdf";
        Files.createDirectories(storage.resolve("imports"));
        Path file = storage.resolve("imports").resolve(key); Files.writeString(file, "original");
        var original = job(id, 1, "ready", null);
        var withFile = new ImportRepository.Job(id, 1, "x.pdf", key, "ready", original.source(), original.draft(), 3, true, null, null, null, original.expiresAt(), original.updatedAt());
        when(jobs.find(1, id, true)).thenReturn(Optional.of(withFile));
        when(editable.confirm(eq(1L), any(), any())).thenReturn(new ResumeDtos.ResumeResponse("new", "x", 0, json.createObjectNode(), json.createObjectNode(), Instant.now(), Instant.now()));
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        try {
            service.confirm(1, id, new ImportService.ConfirmRequest(3));
            assertThat(file).exists();
            for (var callback : org.springframework.transaction.support.TransactionSynchronizationManager.getSynchronizations()) callback.afterCommit();
            assertThat(file).doesNotExist();
            verify(jobs).fileRemoved(id);
        } finally { org.springframework.transaction.support.TransactionSynchronizationManager.clearSynchronization(); }
    }
    @Test void cleanupOnlyRemovesOldUnreferencedManagedFiles() throws Exception {
        Files.createDirectories(storage.resolve("imports"));
        var old = storage.resolve("imports").resolve("a".repeat(32) + ".pdf");
        var recent = storage.resolve("imports").resolve("b".repeat(32) + ".pdf");
        var retained = storage.resolve("imports").resolve("c".repeat(32) + ".docx");
        for (var file : List.of(old, recent, retained)) Files.writeString(file, "original");
        var timestamp = java.nio.file.attribute.FileTime.from(Instant.now().minusSeconds(90000));
        Files.setLastModifiedTime(old, timestamp); Files.setLastModifiedTime(retained, timestamp);
        when(jobs.cleanupCandidates()).thenReturn(List.of());
        when(jobs.hasFile(retained.getFileName().toString())).thenReturn(true);
        service.cleanup();
        assertThat(old).doesNotExist(); assertThat(recent).exists(); assertThat(retained).exists();
        verifyNoInteractions(resumes);
    }
    @Test void tooManyUnconfirmedDraftsRejectsUploadBeforeStoringFile() throws Exception {
        when(jobs.activeCount(1)).thenReturn(20);
        assertThatThrownBy(() -> service.upload(1, new MockMultipartFile("file", "x.pdf", "application/pdf", new byte[]{1})))
            .hasMessageContaining("20 份");
        verify(jobs, never()).insert(anyString(), anyLong(), anyString(), anyString(), anyString());
        assertThat(storage.resolve("imports")).doesNotExist();
    }
}
