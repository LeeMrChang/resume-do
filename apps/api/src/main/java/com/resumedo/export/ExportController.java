package com.resumedo.export;

import com.resumedo.auth.AuthService;
import com.resumedo.export.ExportDtos.CreateExportRequest;
import com.resumedo.export.ExportDtos.ExportResponse;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ExportController {
    private final ExportService exportService;
    private final AuthService authService;

    public ExportController(ExportService exportService, AuthService authService) {
        this.exportService = exportService;
        this.authService = authService;
    }

    @PostMapping("/resumes/{publicId}/exports")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ExportResponse create(
            @PathVariable String publicId,
            @Valid @RequestBody CreateExportRequest request,
            Authentication authentication) {
        return exportService.create(ownerId(authentication), publicId, request);
    }

    @GetMapping("/exports/{publicId}")
    public ExportResponse get(@PathVariable String publicId, Authentication authentication) {
        return exportService.get(ownerId(authentication), publicId);
    }

    @GetMapping("/exports/{publicId}/file")
    public ResponseEntity<Resource> file(@PathVariable String publicId, Authentication authentication) {
        ExportService.Download download = exportService.download(ownerId(authentication), publicId);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(download.filename(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(MediaType.APPLICATION_PDF)
                .cacheControl(CacheControl.noStore())
                .body(new FileSystemResource(download.path()));
    }

    private long ownerId(Authentication authentication) {
        return authService.current(authentication.getName()).id();
    }
}
