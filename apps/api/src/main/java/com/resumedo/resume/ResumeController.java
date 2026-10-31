package com.resumedo.resume;

import com.resumedo.auth.AuthService;
import com.resumedo.resume.ResumeDtos.CreateRequest;
import com.resumedo.resume.ResumeDtos.ResumeResponse;
import com.resumedo.resume.ResumeDtos.ResumeSummary;
import com.resumedo.resume.ResumeDtos.UpdateRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/resumes")
public class ResumeController {
    private final ResumeService resumeService;
    private final AuthService authService;

    public ResumeController(ResumeService resumeService, AuthService authService) {
        this.resumeService = resumeService;
        this.authService = authService;
    }

    @GetMapping
    public List<ResumeSummary> list(
            @RequestParam(defaultValue = "0") int deleted,
            Authentication authentication) {
        return resumeService.list(ownerId(authentication), deleted == 1);
    }

    @PostMapping("/{publicId}/restore")
    public ResumeResponse restore(@PathVariable String publicId, Authentication authentication) {
        return resumeService.restore(ownerId(authentication), publicId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ResumeResponse create(
            @Valid @RequestBody CreateRequest request,
            Authentication authentication) {
        return resumeService.create(ownerId(authentication), request);
    }

    @GetMapping("/{publicId}")
    public ResumeResponse get(@PathVariable String publicId, Authentication authentication) {
        return resumeService.get(ownerId(authentication), publicId);
    }

    @PatchMapping("/{publicId}")
    public ResumeResponse update(
            @PathVariable String publicId,
            @Valid @RequestBody UpdateRequest request,
            Authentication authentication) {
        return resumeService.update(ownerId(authentication), publicId, request);
    }

    private long ownerId(Authentication authentication) {
        return authService.current(authentication.getName()).id();
    }
}
