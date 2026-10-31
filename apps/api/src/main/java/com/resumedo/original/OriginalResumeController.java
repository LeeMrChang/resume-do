package com.resumedo.original;

import com.resumedo.auth.AuthService;
import com.resumedo.resume.ResumeDtos;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/resumes")
public class OriginalResumeController {
    private final OriginalResumeService service;
    private final AuthService auth;
    public OriginalResumeController(OriginalResumeService service,AuthService auth) { this.service=service;this.auth=auth; }
    private long owner(Authentication user) { return auth.current(user.getName()).id(); }
    @PostMapping(value="/originals",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ResumeDtos.ResumeResponse create(@RequestParam("file") MultipartFile file,Authentication user) { return service.create(owner(user),file); }
    @GetMapping("/{id}/source")
    public ResponseEntity<Resource> source(@PathVariable String id,@RequestParam(defaultValue="0") int download,Authentication user) {
        var source=service.source(owner(user),id,download==1);
        String disposition=(download==1?"attachment":"inline")+"; filename*=UTF-8''"+URLEncoder.encode(source.filename(),StandardCharsets.UTF_8).replace("+","%20");
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(source.mime())).contentLength(source.bytes())
            .header(HttpHeaders.CONTENT_DISPOSITION,disposition).header("X-Content-Type-Options","nosniff")
            .cacheControl(CacheControl.noStore()).body(new FileSystemResource(source.path()));
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id,@RequestParam(defaultValue="0") int purge,Authentication user) {
        if(purge==1) service.purge(owner(user),id); else service.delete(owner(user),id);
    }
}
