package com.resumedo.original;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.resumedo.common.ApiException;
import com.resumedo.resume.*;
import java.nio.file.*;
import java.io.*;
import java.util.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.encryption.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;

class OriginalResumeServiceTest {
    @TempDir Path root;
    final ResumeRepository repo = mock(ResumeRepository.class);
    OriginalResumeService service;
    final Map<String,ResumeRow> rows=new HashMap<>();
    @BeforeEach void setup() {
        doCallRealMethod().when(repo).requireCapacity(anyLong());
        when(repo.find(anyLong(),anyString())).thenAnswer(a -> Optional.ofNullable(rows.get(a.getArgument(1))).filter(row -> row.ownerId()==(long)a.getArgument(0)));
        doAnswer(a -> {
            String id=a.getArgument(0);
            rows.put(id,new ResumeRow(1,id,a.getArgument(1),a.getArgument(2),a.getArgument(3),a.getArgument(4),1,"1045",2,0,null,java.time.Instant.now(),java.time.Instant.now(),"original",a.getArgument(5),a.getArgument(6),"application/pdf",a.getArgument(7),a.getArgument(8),a.getArgument(9),null));
            return null;
        }).when(repo).insertOriginal(anyString(),anyLong(),anyString(),anyString(),anyString(),anyString(),anyString(),anyLong(),anyString(),anyInt());
        var tm = new AbstractPlatformTransactionManager() {
            protected Object doGetTransaction() { return new Object(); }
            protected void doBegin(Object tx, TransactionDefinition d) {}
            protected void doCommit(DefaultTransactionStatus s) {}
            protected void doRollback(DefaultTransactionStatus s) {}
        };
        service = new OriginalResumeService(repo, new ObjectMapper(), new ResumeValidator(), tm, root.toString());
    }
    byte[] pdf(int pages, boolean encrypted) throws Exception {
        try (var doc = new PDDocument(); var out = new ByteArrayOutputStream()) {
            for (int i=0;i<pages;i++) doc.addPage(new PDPage());
            if (encrypted) doc.protect(new StandardProtectionPolicy("owner-secret", "reader-secret", new AccessPermission()));
            doc.save(out); return out.toByteArray();
        }
    }
    @Test void validScannedThreePagePdfKeepsBytesAndMetadata() throws Exception {
        byte[] bytes = pdf(3, false);
        service.create(9, new MockMultipartFile("file", "中文😀.pdf", "application/pdf", bytes));
        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(repo).insertOriginal(captor.capture(), eq(9L), eq("中文😀"), anyString(), anyString(), anyString(), eq("中文😀.pdf"), eq((long)bytes.length), anyString(), eq(3));
        assertThat(Files.readAllBytes(root.resolve("resumes/"+captor.getValue()+".pdf"))).isEqualTo(bytes);
        var row=rows.get(captor.getValue());
        assertThat(row.sourceSha256()).isEqualTo(HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)));
        assertThat(row.sourceBytes()).isEqualTo(bytes.length);
        assertThat(row.sourcePages()).isEqualTo(3);
        assertThat(row.documentJson()).doesNotContain("张三");
    }
    @Test void rejectsInvalidUploadsWithoutDatabaseOrFileResidue() throws Exception {
        for (var file : List.of(
            new MockMultipartFile("file", "x.pdf", "", new byte[0]),
            new MockMultipartFile("file", "x.pdf", "", new byte[20*1024*1024+1]),
            new MockMultipartFile("file", "x.docx", "", pdf(1,false)),
            new MockMultipartFile("file", "x.pdf", "", "not PDF".getBytes()),
            new MockMultipartFile("file", "x.pdf", "", "%PDF-broken".getBytes()),
            new MockMultipartFile("file", "x.pdf", "", pdf(1,true)))) {
            assertThatThrownBy(() -> service.create(9,file)).isInstanceOf(ApiException.class);
        }
        verifyNoInteractions(repo);
        try(var files=Files.walk(root)) { assertThat(files.filter(Files::isRegularFile).count()).isZero(); }
    }
    @Test void sixthResumeRejectedAndFileCleaned() throws Exception {
        when(repo.countActive(9)).thenReturn(5L);
        assertThatThrownBy(() -> service.create(9,new MockMultipartFile("file","x.pdf","",pdf(1,false))))
            .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("RESUME_LIMIT_REACHED"));
        verify(repo,never()).insertOriginal(anyString(),anyLong(),anyString(),anyString(),anyString(),anyString(),anyString(),anyLong(),anyString(),anyInt());
        try(var files=Files.walk(root)) { assertThat(files.filter(Files::isRegularFile).count()).isZero(); }
    }
    @Test void ownerIsolationAndMissingFile() {
        when(repo.find(77,"unknown")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.source(77,"unknown",false)).isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.status().value()).isEqualTo(404));
        assertThatThrownBy(() -> service.delete(77,"unknown")).isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.status().value()).isEqualTo(404));
    }
    @Test void repeatedUploadsAreIndependentAndOnePageIsNotHardcoded() throws Exception {
        byte[] bytes=pdf(1,false);
        service.create(9,new MockMultipartFile("file","x.pdf","",bytes));
        service.create(9,new MockMultipartFile("file","x.pdf","",bytes));
        var ids=org.mockito.ArgumentCaptor.forClass(String.class);
        verify(repo,times(2)).insertOriginal(ids.capture(),eq(9L),anyString(),anyString(),anyString(),anyString(),anyString(),eq((long)bytes.length),anyString(),eq(1));
        assertThat(ids.getAllValues()).doesNotHaveDuplicates();
        try(var files=Files.list(root.resolve("resumes"))) { assertThat(files.filter(Files::isRegularFile).count()).isEqualTo(2); }
    }
    @Test void deletedSourceIsRemovedAndRepeatedDeleteIsIdempotent() throws Exception {
        var response=service.create(9,new MockMultipartFile("file","x.pdf","",pdf(1,false)));
        var row=rows.get(response.id());
        when(repo.findIncludingDeletedForUpdate(9,response.id())).thenReturn(Optional.of(row));
        service.delete(9,response.id()); service.delete(9,response.id());
        assertThat(Files.exists(root.resolve(row.sourceKey()))).isFalse();
        verify(repo,times(2)).softDelete(9,response.id());
        verify(repo,times(2)).sourceRemoved(row.id());
    }
    @Test void missingFileIsGoneAndUnsafePathsDoNotEscapeStorage() throws Exception {
        var response=service.create(9,new MockMultipartFile("file","x.pdf","",pdf(1,false)));
        Files.delete(root.resolve(rows.get(response.id()).sourceKey()));
        assertThatThrownBy(() -> service.source(9,response.id(),false)).isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.status().value()).isEqualTo(410));
        assertThatThrownBy(() -> service.safeFile("../secret.pdf")).isInstanceOf(ApiException.class);
    }
    @Test void insertFailureCleansStagingFile() throws Exception {
        doThrow(new IllegalStateException("db down")).when(repo).insertOriginal(anyString(),anyLong(),anyString(),anyString(),anyString(),anyString(),anyString(),anyLong(),anyString(),anyInt());
        assertThatThrownBy(() -> service.create(9,new MockMultipartFile("file","x.pdf","",pdf(1,false)))).isInstanceOf(IllegalStateException.class);
        try(var files=Files.walk(root)) { assertThat(files.filter(Files::isRegularFile).count()).isZero(); }
    }

    @Test void crossUserCannotReadOrDeleteAnExistingOriginal() throws Exception {
        var created=service.create(9,new MockMultipartFile("file","x.pdf","",pdf(1,false)));
        assertThatThrownBy(() -> service.source(77,created.id(),false)).isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.status().value()).isEqualTo(404));
        assertThatThrownBy(() -> service.delete(77,created.id())).isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.status().value()).isEqualTo(404));
        assertThat(Files.exists(root.resolve(rows.get(created.id()).sourceKey()))).isTrue();
    }
    @Test void moveFailureRollsBackAndCleansTemporaryFile() throws Exception {
        doAnswer(a -> { Files.createDirectory(root.resolve(a.<String>getArgument(5))); return null; }).when(repo).insertOriginal(anyString(),anyLong(),anyString(),anyString(),anyString(),anyString(),anyString(),anyLong(),anyString(),anyInt());
        assertThatThrownBy(() -> service.create(9,new MockMultipartFile("file","x.pdf","",pdf(1,false)))).isInstanceOf(IllegalStateException.class);
        try(var files=Files.walk(root)) { assertThat(files.filter(Files::isRegularFile).count()).isZero(); }
    }
    @Test void sourceFilenameSupportsUnicodeAndDownloadTitleIsSanitized() {
        assertThat(OriginalResumeService.cleanFilename("../中文😀.pdf")).isEqualTo("中文😀.pdf");
        assertThat(OriginalResumeService.downloadFilename("中文😀/:*?\\\"<>|")).isEqualTo("中文😀_________.pdf");
    }

    @Test void interruptedUploadCleansPartialFileWithoutDatabaseWrite() throws Exception {
        var file=new MockMultipartFile("file","x.pdf","",new byte[]{1}) {
            @Override public InputStream getInputStream() { return new InputStream() {
                boolean first=true;
                @Override public int read(byte[] b,int off,int len) throws IOException {
                    if(first) { first=false; b[off]=37; return 1; }
                    throw new IOException("upload interrupted");
                }
                @Override public int read() throws IOException { throw new IOException("upload interrupted"); }
            }; }
        };
        assertThatThrownBy(() -> service.create(9,file)).isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(repo);
        try(var files=Files.walk(root)) { assertThat(files.filter(Files::isRegularFile).count()).isZero(); }
    }

    @Test void replaceKeepsResumeIdentityTitleAndSwapsSourceInPlace() throws Exception {
        String id="b".repeat(32);
        var existing=new ResumeRow(5,id,9L,"旧简历","{\"old\":true}","{}",1,"1045",2,3,null,
            java.time.Instant.now(),java.time.Instant.now(),"structured","resumes/"+id+".pdf","旧.pdf","application/pdf",10L,"0".repeat(64),1,null);
        rows.put(id,existing);
        when(repo.findIncludingDeletedForUpdate(9L,id)).thenReturn(Optional.of(existing));
        when(repo.replaceImported(anyLong(),anyString(),anyString(),anyString(),anyInt(),anyString(),anyString(),anyString(),anyString(),anyLong(),anyString(),anyInt()))
            .thenAnswer(a -> {
                rows.put(id,new ResumeRow(5,id,9L,"旧简历",a.getArgument(2),a.getArgument(3),a.getArgument(4),a.getArgument(5),2,4,null,
                    java.time.Instant.now(),java.time.Instant.now(),"structured",a.getArgument(6),a.getArgument(7),a.getArgument(8),a.getArgument(9),a.getArgument(10),a.getArgument(11),null));
                return 1;
            });
        byte[] bytes=pdf(2,false);
        var resume=service.replaceEditable(9,id,new MockMultipartFile("file","新简历.pdf","application/pdf",bytes),
            path -> new com.resumedo.importing.ImportMapper(new ObjectMapper()).draft("姓名：张三", "新简历.pdf"));
        assertThat(resume.id()).isEqualTo(id);
        assertThat(resume.title()).isEqualTo("旧简历");
        assertThat(resume.source().filename()).isEqualTo("新简历.pdf");
        assertThat(resume.source().pages()).isEqualTo(2);
        assertThat(Files.readAllBytes(root.resolve("resumes/"+id+".pdf"))).isEqualTo(bytes);
        verify(repo,never()).insertImported(anyString(),anyLong(),anyString(),anyString(),anyString(),anyInt(),anyString(),anyString(),anyString(),anyString(),anyLong(),anyString(),anyInt());
    }

    @Test void replaceRejectsOriginalResumeWithoutWritingFiles() throws Exception {
        String id="c".repeat(32);
        var original=new ResumeRow(6,id,9L,"扫描件","{}","{}",1,"1045",2,0,null,
            java.time.Instant.now(),java.time.Instant.now(),"original","resumes/"+id+".pdf","原.pdf","application/pdf",10L,"0".repeat(64),1,null);
        when(repo.findIncludingDeletedForUpdate(9L,id)).thenReturn(Optional.of(original));
        assertThatThrownBy(() -> service.replaceEditable(9,id,new MockMultipartFile("file","x.pdf","",pdf(1,false)),
            path -> new com.resumedo.importing.ImportMapper(new ObjectMapper()).draft("姓名：张三", "x.pdf")))
            .isInstanceOfSatisfying(ApiException.class,e -> assertThat(e.status().value()).isEqualTo(400));
        verify(repo,never()).replaceImported(anyLong(),anyString(),anyString(),anyString(),anyInt(),anyString(),anyString(),anyString(),anyString(),anyLong(),anyString(),anyInt());
        try(var files=Files.walk(root)) { assertThat(files.filter(Files::isRegularFile).count()).isZero(); }
    }

}
