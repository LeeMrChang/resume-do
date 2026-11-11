package com.resumedo.templates;

import com.resumedo.auth.AuthService;
import com.resumedo.common.ApiException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/template-favorites")
public class TemplateFavoritesController {
    private final TemplateFavoritesService service;
    private final AuthService auth;
    public TemplateFavoritesController(TemplateFavoritesService service,AuthService auth) { this.service=service; this.auth=auth; }
    @GetMapping public List<String> list(Authentication user) { return service.list(owner(user)); }
    @PutMapping("/{templateId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void add(@PathVariable String templateId,Authentication user) { service.add(owner(user),templateId); }
    @DeleteMapping("/{templateId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@PathVariable String templateId,Authentication user) { service.remove(owner(user),templateId); }
    private long owner(Authentication user) {
        if(user==null) throw ApiException.unauthorized("请先登录");
        return auth.current(user.getName()).id();
    }
}
