package com.resumedo.importing;

import com.resumedo.auth.AuthService;
import com.resumedo.resume.ResumeDtos;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/imports")
public class ImportController {
    private final ImportService service;
    private final AuthService auth;
    public ImportController(ImportService service, AuthService auth, EditableImportService editable) { this.service = service; this.auth = auth; this.editable=editable; }
    private long owner(Authentication user) { return auth.current(user.getName()).id(); }
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ImportService.Response upload(@RequestParam("file") MultipartFile file, Authentication user) { return service.upload(owner(user), file); }
    private final EditableImportService editable;
    @PostMapping(value="/direct", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ResumeDtos.ResumeResponse direct(@RequestParam("file") MultipartFile file, Authentication user) {
        return editable.create(owner(user),file);
    }
    @PostMapping(value="/direct/{id}", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResumeDtos.ResumeResponse overwrite(@PathVariable String id, @RequestParam("file") MultipartFile file, Authentication user) {
        return editable.overwrite(owner(user),id,file);
    }
    @PostMapping("/from-original/{id}")
    public ResumeDtos.ResumeResponse openLegacyEditor(@PathVariable String id, Authentication user) {
        return editable.openLegacyEditor(owner(user),id);
    }
    @GetMapping public List<ImportService.Response> list(Authentication user) { return service.list(owner(user)); }
    @GetMapping("/{id}") public ImportService.Response get(@PathVariable String id, Authentication user) { return service.get(owner(user), id); }
    @PatchMapping("/{id}") public ImportService.Response save(@PathVariable String id, @RequestBody ImportService.SaveRequest request, Authentication user) { return service.save(owner(user), id, request); }
    @PostMapping("/{id}/confirm") public ResumeDtos.ResumeResponse confirm(@PathVariable String id, @RequestBody ImportService.ConfirmRequest request, Authentication user) { return service.confirm(owner(user), id, request); }
    @PostMapping("/{id}/retry") public ImportService.Response retry(@PathVariable String id, Authentication user) { return service.retry(owner(user), id); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable String id, Authentication user) { service.cancel(owner(user), id); }
    @GetMapping("/{id}/file") public ResponseEntity<Resource> file(@PathVariable String id, Authentication user) {
        var job = service.original(owner(user), id);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM).cacheControl(CacheControl.noStore())
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(job.filename(), StandardCharsets.UTF_8).build().toString())
            .header("X-Content-Type-Options", "nosniff").body(new FileSystemResource(service.safeFile(job.fileKey())));
    }
}
