package com.resumedo.importing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.resumedo.original.OriginalResumeService;
import com.resumedo.resume.*;
import com.resumedo.common.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class EditableImportService {
    private final ResumeRepository repository;
    private final ResumeValidator validator;
    private final ResumeService resumes;
    private final java.util.concurrent.Semaphore capacity=new java.util.concurrent.Semaphore(2);
    private final ImportParser parser;
    private final ImportMapper mapper;
    private final ImportPhotoExtractor photos;
    private final ImportStyleDetector styles;
    private final OriginalResumeService originals;
    public EditableImportService(ImportParser parser, ImportMapper mapper, ImportPhotoExtractor photos, ImportStyleDetector styles, OriginalResumeService originals, ResumeRepository repository, ResumeValidator validator, ResumeService resumes) {
        this.repository=repository; this.validator=validator; this.resumes=resumes; this.parser=parser; this.mapper=mapper; this.photos=photos; this.styles=styles; this.originals=originals;
    }
    public ResumeDtos.ResumeResponse create(long owner, MultipartFile file) {
        return store(owner, null, file);
    }
    public ResumeDtos.ResumeResponse overwrite(long owner, String resumeId, MultipartFile file) {
        return store(owner, resumeId, file);
    }
    private ResumeDtos.ResumeResponse store(long owner, String resumeId, MultipartFile file) {
        String filename=OriginalResumeService.cleanFilename(file.getOriginalFilename());
        String extension=parser.extension(filename);
        if(!capacity.tryAcquire()) throw new com.resumedo.common.ApiException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,"IMPORT_BUSY","解析服务繁忙，请稍后重试",java.util.Map.of());
        try {
            java.util.function.Function<java.nio.file.Path, JsonNode> parse = path -> {
                var parsed=parser.parse(path,extension);
                var draft=mapper.draft(parsed.text(),filename,styles.accent(path,extension));
                ((ObjectNode)draft.path("document")).put("importWarning",parsed.warning());
                ((ObjectNode)draft.path("document").path("basic")).put("photo",photos.extract(path,extension));
                return draft;
            };
            return resumeId==null ? originals.createEditable(owner,file,parse) : originals.replaceEditable(owner,resumeId,file,parse);
        } finally { capacity.release(); }
    }
    @org.springframework.transaction.annotation.Transactional
    public ResumeDtos.ResumeResponse openLegacyEditor(long owner,String id) {
        var row=repository.findIncludingDeletedForUpdate(owner,id).filter(found -> found.deletedAt()==null)
            .orElseThrow(() -> ApiException.notFound("简历不存在"));
        if(!"original".equals(row.kind())) return resumes.get(owner,id);
        if(!capacity.tryAcquire()) throw new ApiException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,"IMPORT_BUSY","解析服务繁忙，请稍后重试",java.util.Map.of());
        try {
            var source=originals.source(owner,id,false);
            String extension=parser.extension(row.sourceFilename());
            var parsed=parser.parse(source.path(),extension);
            var draft=mapper.draft(parsed.text(),row.sourceFilename(),styles.accent(source.path(),extension));
            ((ObjectNode)draft.path("document")).put("importWarning",parsed.warning());
            ((ObjectNode)draft.path("document").path("basic")).put("photo",photos.extract(source.path(),extension));
            var content=validator.validate(draft.path("document"),draft.path("appearance"));
            repository.makeEditable(owner,id,content.document().toString(),content.appearance().toString(),content.schemaVersion(),content.templateId());
            return resumes.get(owner,id);
        } finally { capacity.release(); }
    }
    public ResumeDtos.ResumeResponse confirm(long owner, MultipartFile file, JsonNode draft) {
        return originals.createEditable(owner,file,path -> draft);
    }
}
