package com.resumedo.templates;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TemplateFavoritesRepository {
    private final JdbcTemplate jdbc;
    public TemplateFavoritesRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }

    public List<String> list(long owner) {
        return jdbc.queryForList("SELECT template_id FROM template_favorites WHERE owner_id=? ORDER BY created_at DESC,template_id",String.class,owner);
    }
    public void add(long owner,String templateId) {
        jdbc.update("INSERT INTO template_favorites (owner_id,template_id) VALUES (?,?) ON DUPLICATE KEY UPDATE template_id=?",owner,templateId,templateId);
    }
    public void remove(long owner,String templateId) {
        jdbc.update("DELETE FROM template_favorites WHERE owner_id=? AND template_id=?",owner,templateId);
    }
}
