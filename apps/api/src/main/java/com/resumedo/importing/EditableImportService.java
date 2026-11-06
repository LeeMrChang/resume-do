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
    private final ImportLayoutDetector layouts;
    private final OriginalResumeService originals;
    public EditableImportService(ImportParser parser, ImportMapper mapper, ImportPhotoExtractor photos, ImportStyleDetector styles, ImportLayoutDetector layouts, OriginalResumeService originals, ResumeRepository repository, ResumeValidator validator, ResumeService resumes) {
        this.repository=repository; this.validator=validator; this.resumes=resumes; this.parser=parser; this.mapper=mapper; this.photos=photos; this.styles=styles; this.layouts=layouts; this.originals=originals;
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
                var document=(ObjectNode)draft.path("document");
                document.put("importWarning",parsed.warning());
                applyPhoto((ObjectNode)document.path("basic"),photos.extract(path,extension));
                applyLayout(draft,path,extension);
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
            var document=(ObjectNode)draft.path("document");
            document.put("importWarning",parsed.warning());
            applyPhoto((ObjectNode)document.path("basic"),photos.extract(source.path(),extension));
            applyLayout(draft,source.path(),extension);
            var content=validator.validate(draft.path("document"),draft.path("appearance"));
            repository.makeEditable(owner,id,content.document().toString(),content.appearance().toString(),content.schemaVersion(),content.templateId());
            return resumes.get(owner,id);
        } finally { capacity.release(); }
    }
    public ResumeDtos.ResumeResponse confirm(long owner, MultipartFile file, JsonNode draft) {
        return originals.createEditable(owner,file,path -> draft);
    }
    // The template draws a name-initial monogram whenever the photo slot is on,
    // so an import without a photo must switch the slot off instead of faking an avatar.
    static void applyPhoto(ObjectNode basic,String photo) {
        String value=photo==null?"":photo;
        basic.put("photo",value);
        basic.put("showPhoto",!value.isEmpty());
    }
    private void applyLayout(ObjectNode draft,java.nio.file.Path path,String extension) {
        var document=(ObjectNode)draft.path("document");
        var titles=new java.util.HashSet<String>();
        document.path("sections").forEach(section -> titles.add(section.path("title").asText().replaceAll("[\\s\\u3000]+","")));
        applyLayout(draft,layouts.analyze(path,extension,document.path("basic").path("name").asText(),titles));
    }
    static void applyLayout(ObjectNode draft,ImportLayoutDetector.Layout layout) {
        if(layout==null) return;
        float scale=layout.scale()>0?layout.scale():1f;
        ObjectNode document=(ObjectNode)draft.path("document");
        ObjectNode style=document.path("importStyle") instanceof ObjectNode existing?existing:document.putObject("importStyle");
        if(layout.align()!=null) style.put("headerAlign",layout.align());
        putColor(style,"nameColor",layout.nameColor());
        putColor(style,"intentColor",layout.intentColor());
        putColor(style,"metaColor",layout.metaColor());
        putColor(style,"sectionTitleColor",layout.sectionTitleColor());
        putColor(style,"titleRule",layout.titleRule());
        putColor(style,"headerRule",layout.headerRule());
        if(layout.leftRule()!=null && layout.leftRule().matches("#[0-9a-fA-F]{6}")) {
            style.put("leftRule",layout.leftRule());
            style.put("leftRuleStyle",layout.leftDashed()?"dashed":"solid");
        }
        if(layout.recordHead()!=null) style.put("recordHead",layout.recordHead());
        if(layout.nameSize()>0) style.put("nameSize",Math.min(48,Math.max(12,scaledPt(layout.nameSize(),scale))));
        if(layout.intentSize()>0) style.put("intentSize",scaledPt(layout.intentSize(),scale));
        if(layout.metaSize()>0) style.put("metaSize",scaledPt(layout.metaSize(),scale));
        if(layout.titleSize()>0) style.put("titleSize",layout.titleSize());
        if(layout.bulletGap()>0) style.put("bulletGap",scaled(layout.bulletGap(),scale));
        if(layout.bulletMark()>0) style.put("bulletMark",scaled(layout.bulletMark(),scale));
        if(layout.bulletIndent()>0) style.put("bulletIndent",scaled(layout.bulletIndent(),scale));
        if(layout.recordIndent()>0) style.put("recordIndent",scaled(layout.recordIndent(),scale));
        if(layout.bodyIndent()>0) style.put("bodyIndent",scaled(layout.bodyIndent(),scale));
        if(layout.bodyTextIndent()>0) style.put("bodyTextIndent",scaled(layout.bodyTextIndent(),scale));
        if(layout.paragraphGap()>0) {
            style.put("paragraphGap",scaled(layout.paragraphGap(),scale));
            // Synthetic blank paragraphs would duplicate the detected spacing.
            dropBlankParagraphs(document);
        }
        if(layout.headerIndent()>0) style.put("headerIndent",scaled(layout.headerIndent(),scale));
        putColor(style,"recordMark",layout.recordMark());
        if(layout.pageBackground()!=null && !"#ffffff".equals(layout.pageBackground())) style.put("pageBackground",layout.pageBackground());
        var appearance=draft.path("appearance") instanceof ObjectNode node?node:draft.putObject("appearance");
        // A monochrome source has no accent to detect, but it must still keep its own layout
        // instead of being re-skinned with a catalogue template.
        if(!"imported".equals(appearance.path("templateId").asText())) {
            appearance.put("templateId","imported");
            appearance.put("themeColor",layout.nameColor()!=null?layout.nameColor():"#333333");
        }
        if(layout.sectionTint()!=null) {
            appearance.put("sectionTitleTint",true);
            appearance.put("sectionTitleTintColor",layout.sectionTint());
        }
        if(layout.bodySize()>0) {
            appearance.put("fontSize",Math.min(20,Math.max(12,Math.round(layout.bodySize()*4f/3f*scale))));
            // The rounded UI value cannot hold a 3% page scale, so the rendered size keeps its decimals.
            if(scale!=1f) style.put("fontSizePx",Math.round(layout.bodySize()*4f/3f*scale*100f)/100f);
        }
        if(layout.lineHeight()>0) appearance.put("lineHeight",Math.min(2.2f,Math.max(1.05f,layout.lineHeight())));
        if(layout.pageMargin()!=null) appearance.put("pageMargin",scaled(layout.pageMargin(),scale));
    }
    private static int scaled(int value,float scale) {
        return Math.max(0,Math.round(value*scale));
    }
    private static void dropBlankParagraphs(ObjectNode document) {
        document.path("sections").forEach(section -> section.path("items").forEach(item -> {
            if(!(item instanceof ObjectNode node)) return;
            var body=node.path("body").asText();
            var cleaned=body.replace("<p>\u200b</p>","");
            if(!cleaned.equals(body)) node.put("body",cleaned);
        }));
    }
    private static float scaledPt(float value,float scale) {
        return Math.max(0,Math.round(value*scale*10f)/10f);
    }
    private static void putColor(ObjectNode style,String key,String value) {
        if(value!=null && value.matches("#[0-9a-fA-F]{6}")) style.put(key,value);
    }
}
