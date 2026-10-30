package com.resumedo.ai;

import com.resumedo.auth.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
public class AiController {
    private final AiRewriteService service;
    private final AuthService auth;

    public AiController(AiRewriteService service, AuthService auth) {
        this.service = service;
        this.auth = auth;
    }

    @PostMapping("/rewrite")
    public ResponseEntity<AiDtos.RewriteResponse> rewrite(
            @Valid @RequestBody AiDtos.RewriteRequest request, Authentication user) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.rewrite(auth.current(user.getName()).id(), request));
    }
}
