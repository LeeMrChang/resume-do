package com.resumedo.original;

import com.fasterxml.jackson.databind.*;
import com.resumedo.common.*;
import com.resumedo.resume.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.time.*;
import java.util.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.*;
import org.springframework.web.multipart.MultipartFile;

@Service
public class OriginalResumeService {
    public static final long MAX_BYTES = 20L*1024*1024;
    public static final int TRASH_RETENTION_DAYS = 30;
    private final ResumeRepository resumes;
    private final ObjectMapper mapper;
    private final ResumeValidator validator;
    private final TransactionTemplate transactions;
    private final Path root;
    private final ResumeValidator.Validated empty;
    public OriginalResumeService(ResumeRepository resumes, ObjectMapper mapper, ResumeValidator validator,
            PlatformTransactionManager manager, @Value("${app.storage-dir}") String storage) {
        this.resumes=resumes; this.mapper=mapper; this.validator=validator; transactions=new TransactionTemplate(manager);
        root=Path.of(storage).toAbsolutePath().normalize();
        try(var in=new ClassPathResource("empty-resume.json").getInputStream()) {
            var contract=mapper.readTree(in); empty=validator.validate(contract.path("document"),contract.path("appearance"));
        } catch(IOException e) { throw new IllegalStateException("Empty resume contract missing",e); }
    }
    public ResumeDtos.ResumeResponse create(long owner, MultipartFile upload) {
        return store(owner, null, upload, null);
    }
    public ResumeDtos.ResumeResponse createEditable(long owner, MultipartFile upload,
            java.util.function.Function<Path, JsonNode> parse) {
        return store(owner, null, upload, parse);
    }
    public ResumeDtos.ResumeResponse replaceEditable(long owner, String id, MultipartFile upload,
            java.util.function.Function<Path, JsonNode> parse) {
        return store(owner, id, upload, parse);
    }
    private ResumeDtos.ResumeResponse store(long owner, String existingId, MultipartFile upload,
            java.util.function.Function<Path, JsonNode> parse) {
        if(upload.isEmpty()) throw ApiException.badRequest("文件不能为空");
        if(upload.getSize()>MAX_BYTES) throw ApiException.badRequest("文件不能超过 20MB");
        String filename=cleanFilename(upload.getOriginalFilename());
        String extension=filename.toLowerCase(Locale.ROOT).endsWith(".docx")?"docx":"pdf";
        if(!filename.toLowerCase(Locale.ROOT).matches(".*\\.(pdf"+(parse!=null?"|docx":"")+")$"))
            throw ApiException.badRequest("原样导入目前仅支持 PDF，Word 请等待可编辑导入");
        String id=existingId!=null?existingId:Ids.newPublicId(), key="resumes/"+id+"."+extension;
        Path temporary=null;
        try {
            Path directory=directory();
            Path target=safeFile(key);
            temporary=Files.createTempFile(directory,"upload-",".tmp");
            long size;
            try(var in=upload.getInputStream(); var out=Files.newOutputStream(temporary)) {
                byte[] buffer=new byte[8192]; int n; size=0;
                while((n=in.read(buffer))!=-1) {
                    size+=n; if(size>MAX_BYTES) throw ApiException.badRequest("文件不能超过 20MB");
                    out.write(buffer,0,n);
                }
            }
            if(size==0) throw ApiException.badRequest("文件不能为空");
            if(extension.equals("pdf")) try(var in=Files.newInputStream(temporary)) {
                if(!Arrays.equals(in.readNBytes(5),"%PDF-".getBytes(StandardCharsets.US_ASCII)))
                    throw ApiException.badRequest("文件内容与扩展名不符");
            }
            Integer pages=null;
            if(extension.equals("pdf")) try(var pdf=Loader.loadPDF(temporary.toFile(), () -> new ScratchFile(MemoryUsageSetting.setupMixed(8L*1024*1024,64L*1024*1024)))) {
                if(pdf.isEncrypted() || pdf.getNumberOfPages()<1) throw new IOException("Encrypted or empty");
                pages=pdf.getNumberOfPages();
            } catch(IOException | RuntimeException e) { throw ApiException.badRequest("文件受密码保护或已损坏"); }
            JsonNode draft=parse==null?null:parse.apply(temporary);
            var content=draft==null?empty:validator.validate(draft.path("document"),draft.path("appearance"));
            String hash=sha256(temporary);
            String title=filename.substring(0,filename.length()-extension.length()-1);
            if(draft!=null && !draft.path("title").asText().isBlank()) title=draft.path("title").asText().strip();
            if(title.isBlank()) title="我的简历";
            title=truncate(title,100);
            final Path staged=temporary; final long bytes=size; final String name=title; final Integer pageCount=pages;
            final String mime=extension.equals("pdf")?"application/pdf":"application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            return transactions.execute(tx -> {
                if(existingId==null) {
                    resumes.requireCapacity(owner);
                    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                        @Override public void afterCompletion(int status) {
                            // An unknown commit outcome must not delete a potentially committed source.
                            // Recovery only removes old files with no DB reference.
                            if(status==STATUS_ROLLED_BACK) removeQuietly(target);
                        }
                    });
                    if(parse==null) resumes.insertOriginal(id,owner,name,content.document().toString(),content.appearance().toString(),key,filename,bytes,hash,pageCount);
                    else resumes.insertImported(id,owner,name,content.document().toString(),content.appearance().toString(),content.schemaVersion(),content.templateId(),key,filename,mime,bytes,hash,pageCount);
                } else {
                    var current=resumes.findIncludingDeletedForUpdate(owner,existingId)
                        .filter(found -> found.deletedAt()==null)
                        .orElseThrow(() -> ApiException.notFound("简历不存在"));
                    if(!"structured".equals(current.kind())) throw ApiException.badRequest("只能覆盖可编辑简历");
                    int changed=resumes.replaceImported(owner,existingId,content.document().toString(),content.appearance().toString(),
                        content.schemaVersion(),content.templateId(),key,filename,mime,bytes,hash,pageCount);
                    if(changed!=1) throw new IllegalStateException("覆盖简历失败，请重试");
                    final String previousKey=current.sourceKey();
                    if(previousKey!=null && !previousKey.equals(key))
                        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                            @Override public void afterCommit() { removeQuietly(safeFile(previousKey)); }
                        });
                }
                try { Files.move(staged,target,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING); }
                catch(IOException e) { throw new IllegalStateException("原文件保存失败，请重试",e); }
                var row=resumes.find(owner,id).orElseThrow(() -> new IllegalStateException("Original resume missing"));
                return response(row);
            });
        } catch(ApiException e) { throw e; }
        catch(IOException e) { throw new IllegalStateException("原文件保存失败，请重试",e); }
        finally { if(temporary!=null) removeQuietly(temporary); }
    }
    private ResumeDtos.ResumeResponse response(ResumeRow row) {
        try { return new ResumeDtos.ResumeResponse(row.publicId(),row.title(),row.revision(),mapper.readTree(row.documentJson()),mapper.readTree(row.appearanceJson()),row.createdAt(),row.updatedAt(),row.kind(),row.source()); }
        catch(IOException e) { throw new IllegalStateException("Invalid resume contract",e); }
    }
    public record Source(Path path,String filename,long bytes,String mime) {
        public Source(Path path,String filename,long bytes) { this(path,filename,bytes,"application/pdf"); }
    }
    public Source source(long owner,String id,boolean download) {
        var row=resumes.find(owner,id).orElseThrow(() -> ApiException.notFound("简历不存在"));
        if(row.sourceFilename()==null) throw ApiException.notFound("简历没有原文件");
        if(row.sourceKey()==null) throw ApiException.gone("SOURCE_MISSING","原文件不存在，请重新导入");
        Path file=safeFile(row.sourceKey());
        if(!Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS)) throw ApiException.gone("SOURCE_MISSING","原文件不存在，请重新导入");
        return new Source(file,download?downloadFilename(row.title()).replaceFirst("\\.pdf$",row.sourceMime().equals("application/pdf")?".pdf":".docx"):row.sourceFilename(),row.sourceBytes(),row.sourceMime());
    }
    /** Moves a resume to the trash. The source file stays on disk so the resume can be restored. */
    public void delete(long owner,String id) {
        transactions.execute(tx -> {
            resumes.findIncludingDeletedForUpdate(owner,id).orElseThrow(() -> ApiException.notFound("简历不存在"));
            resumes.softDelete(owner,id);
            return null;
        });
    }
    /** Removes a trashed resume and its source file for good. */
    public void purge(long owner,String id) {
        transactions.execute(tx -> {
            var found=resumes.findIncludingDeletedForUpdate(owner,id)
                .orElseThrow(() -> ApiException.notFound("简历不存在"));
            if(found.deletedAt()==null)
                throw ApiException.conflict("RESUME_NOT_TRASHED","请先将简历移入回收站",Map.of());
            if(found.sourceKey()!=null) removeQuietly(safeFile(found.sourceKey()));
            resumes.hardDelete(found.id());
            return null;
        });
    }
    private boolean deleteSource(ResumeRow row) {
        try { Files.deleteIfExists(safeFile(row.sourceKey())); resumes.sourceRemoved(row.id()); return true; }
        catch(Exception e) { org.slf4j.LoggerFactory.getLogger(getClass()).warn("Original source cleanup pending for {}",row.publicId()); return false; }
    }
    private Path directory() throws IOException {
        Files.createDirectories(root);
        Path dir=root.resolve("resumes");
        if(Files.isSymbolicLink(root) || Files.isSymbolicLink(dir)) throw new IOException("Unsafe storage directory");
        Files.createDirectories(dir);
        if(!dir.toRealPath().getParent().equals(root.toRealPath())) throw new IOException("Unsafe storage directory");
        return dir;
    }
    public Path safeFile(String key) {
        if(key==null || !key.matches("resumes/[a-f0-9]{32}\\.(pdf|docx)")) throw ApiException.gone("SOURCE_MISSING","原文件路径无效，请重新导入");
        Path dir=root.resolve("resumes"), file=root.resolve(key).normalize();
        if(!file.startsWith(dir) || Files.isSymbolicLink(root) || Files.isSymbolicLink(dir) || Files.isSymbolicLink(file))
            throw ApiException.gone("SOURCE_MISSING","原文件路径无效，请重新导入");
        try { if(Files.exists(dir) && !dir.toRealPath().getParent().equals(root.toRealPath())) throw new IOException("Unsafe parent"); }
        catch(IOException e) { throw ApiException.gone("SOURCE_MISSING","原文件路径无效，请重新导入"); }
        return file;
    }
    @Scheduled(fixedDelay=60000,initialDelay=60000)
    public void cleanup() {
        for(var row:resumes.pendingSourceDeletes()) deleteSource(row);
        // Trash is kept for a limited window, then purged together with the source file.
        for(var row:resumes.trashedBefore(Instant.now().minus(Duration.ofDays(TRASH_RETENTION_DAYS)))) {
            if(row.sourceKey()!=null) removeQuietly(safeFile(row.sourceKey()));
            resumes.hardDelete(row.id());
        }
        Path dir=root.resolve("resumes");
        if(!Files.isDirectory(dir,LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(root)) return;
        try(var files=Files.list(dir)) {
            for(Path file:files.limit(500).toList()) {
                String name=file.getFileName().toString();
                if(!Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS) || Files.getLastModifiedTime(file).toInstant().isAfter(Instant.now().minus(Duration.ofHours(24)))) continue;
                if(name.matches("upload-.*\\.tmp") || (name.matches("[a-f0-9]{32}\\.(pdf|docx)") && !resumes.sourceReferenced("resumes/"+name))) Files.deleteIfExists(file);
            }
        } catch(IOException e) { org.slf4j.LoggerFactory.getLogger(getClass()).warn("Original orphan cleanup failed"); }
    }
    private static void removeQuietly(Path file) { try { Files.deleteIfExists(file); } catch(IOException e) { org.slf4j.LoggerFactory.getLogger(OriginalResumeService.class).warn("Original rollback cleanup pending"); } }
    public static String cleanFilename(String name) {
        String value=name==null?"":name.replace('\\','/');
        value=value.substring(value.lastIndexOf('/')+1).replaceAll("[\\p{Cc}:*?\"<>|]","_").strip();
        // Keep extension even when the basename is very long.
        if(value.codePointCount(0,value.length())>160) {
            int dot=value.lastIndexOf('.'); String extension=dot>=0?value.substring(dot):"";
            value=truncate(dot>=0?value.substring(0,dot):value,Math.max(1,160-extension.length()))+extension;
        }
        return value;
    }
    public static String downloadFilename(String title) {
        String name=title.replaceAll("[\\p{Cc}\\\\/:*?\"<>|]","_").strip().replaceFirst("(?i)\\.pdf$", "").strip();
        return truncate(name.isBlank()?"简历":name,150)+".pdf";
    }
    private static String truncate(String text,int max) { return text.substring(0,text.offsetByCodePoints(0,Math.min(max,text.codePointCount(0,text.length())))); }
    private static String sha256(Path file) throws IOException {
        try { var digest=MessageDigest.getInstance("SHA-256"); try(var in=Files.newInputStream(file)) { byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1) digest.update(b,0,n); } return HexFormat.of().formatHex(digest.digest()); }
        catch(NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
