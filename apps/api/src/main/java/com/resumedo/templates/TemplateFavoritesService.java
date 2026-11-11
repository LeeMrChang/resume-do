package com.resumedo.templates;

import com.resumedo.common.ApiException;
import com.resumedo.resume.ResumeValidator;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class TemplateFavoritesService {
    private final TemplateFavoritesRepository repository;
    public TemplateFavoritesService(TemplateFavoritesRepository repository) { this.repository=repository; }
    public List<String> list(long owner) { return repository.list(owner); }
    public void add(long owner,String templateId) { validate(templateId); repository.add(owner,templateId); }
    public void remove(long owner,String templateId) { validate(templateId); repository.remove(owner,templateId); }
    private void validate(String templateId) {
        if(!ResumeValidator.supportsTemplate(templateId)) throw ApiException.badRequest("模板不存在，请刷新模板列表");
    }
}
