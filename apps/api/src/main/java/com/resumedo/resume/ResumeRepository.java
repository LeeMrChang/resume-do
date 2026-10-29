package com.resumedo.resume;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class ResumeRepository {
    private static final RowMapper<ResumeRow> MAPPER = (rs, rowNum) -> new ResumeRow(
            rs.getLong("id"),
            rs.getString("public_id"),
            rs.getLong("owner_id"),
            rs.getString("title"),
            rs.getString("document"),
            rs.getString("appearance"),
            rs.getInt("schema_version"),
            rs.getString("template_id"),
            rs.getInt("template_version"),
            rs.getLong("revision"),
            rs.getString("last_mutation_id"),
            instant(rs, "created_at"),
            instant(rs, "updated_at"), rs.getString("kind"), rs.getString("source_key"),
            rs.getString("source_filename"), rs.getString("source_mime"),
            rs.getObject("source_bytes", Long.class), rs.getString("source_sha256"),
            rs.getObject("source_pages", Integer.class), instant(rs, "deleted_at"));

    private static final String COLUMNS = "id, public_id, owner_id, title, document, appearance, "
            + "schema_version, template_id, template_version, revision, last_mutation_id, created_at, updated_at, kind, source_key, source_filename, source_mime, source_bytes, source_sha256, source_pages, deleted_at";

    private final JdbcTemplate jdbc;

    public ResumeRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<ResumeRow> find(long ownerId, String publicId) {
        List<ResumeRow> rows = jdbc.query(
                "SELECT " + COLUMNS + " FROM resumes WHERE public_id = ? AND owner_id = ? AND deleted_at IS NULL",
                MAPPER,
                publicId,
                ownerId);
        return rows.stream().findFirst();
    }

    public List<ResumeRow> list(long ownerId) {
        return jdbc.query(
                "SELECT " + COLUMNS + " FROM resumes WHERE owner_id = ? AND deleted_at IS NULL "
                        + "ORDER BY updated_at DESC, id DESC",
                MAPPER,
                ownerId);
    }

    public void insert(
            String publicId,
            long ownerId,
            String title,
            String documentJson,
            String appearanceJson,
            int schemaVersion,
            String templateId,
            int templateVersion) {
        jdbc.update(
                "INSERT INTO resumes (public_id, owner_id, title, document, appearance, schema_version, "
                        + "template_id, template_version, revision, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(3), NOW(3))",
                publicId,
                ownerId,
                title,
                documentJson,
                appearanceJson,
                schemaVersion,
                templateId,
                templateVersion);
    }

    public int update(
            long id,
            long ownerId,
            long expectedRevision,
            String title,
            String documentJson,
            String appearanceJson,
            int schemaVersion,
            String templateId,
            int templateVersion,
            long nextRevision,
            String mutationId) {
        return jdbc.update(
                "UPDATE resumes SET title = ?, document = ?, appearance = ?, schema_version = ?, "
                        + "template_id = ?, template_version = ?, revision = ?, last_mutation_id = ?, updated_at = NOW(3) "
                        + "WHERE id = ? AND owner_id = ? AND revision = ? AND deleted_at IS NULL",
                title,
                documentJson,
                appearanceJson,
                schemaVersion,
                templateId,
                templateVersion,
                nextRevision,
                mutationId,
                id,
                ownerId,
                expectedRevision);
    }

    // All creation paths lock the existing owner row before checking the quota.
    public void lockOwner(long ownerId) {
        jdbc.queryForObject("SELECT id FROM users WHERE id = ? FOR UPDATE", Long.class, ownerId);
    }
    public long countActive(long ownerId) {
        // Locking read avoids an older REPEATABLE READ snapshot in L2 confirmation transactions.
        return jdbc.queryForList("SELECT id FROM resumes WHERE owner_id = ? AND deleted_at IS NULL FOR UPDATE", Long.class, ownerId).size();
    }
    public void requireCapacity(long ownerId) {
        lockOwner(ownerId);
        if (countActive(ownerId) >= 5) throw new com.resumedo.common.ApiException(
            org.springframework.http.HttpStatus.TOO_MANY_REQUESTS, "RESUME_LIMIT_REACHED",
            "已达简历数量上限（5 份），请先删除不需要的简历", java.util.Map.of());
    }
    public void insertOriginal(String publicId, long ownerId, String title, String document,
            String appearance, String key, String filename, long bytes, String sha, int pages) {
        jdbc.update("INSERT INTO resumes (public_id,owner_id,title,document,appearance,schema_version,template_id,template_version,revision,kind,source_key,source_filename,source_mime,source_bytes,source_sha256,source_pages) VALUES (?,?,?,?,?,1,'1045',2,0,'original',?,?,'application/pdf',?,?,?)",
            publicId,ownerId,title,document,appearance,key,filename,bytes,sha,pages);
    }
    public void makeEditable(long owner,String id,String document,String appearance,int schemaVersion,String templateId) {
        jdbc.update("UPDATE resumes SET kind='structured',document=?,appearance=?,schema_version=?,template_id=?,template_version=2,revision=revision+1,updated_at=NOW(3) WHERE owner_id=? AND public_id=? AND kind='original' AND deleted_at IS NULL",
            document,appearance,schemaVersion,templateId,owner,id);
    }
    public void insertImported(String id, long owner, String title, String document, String appearance,
            int schemaVersion, String templateId, String key, String filename, String mime,
            long bytes, String sha, Integer pages) {
        jdbc.update("INSERT INTO resumes (public_id,owner_id,title,document,appearance,schema_version,template_id,template_version,revision,kind,source_key,source_filename,source_mime,source_bytes,source_sha256,source_pages) VALUES (?,?,?,?,?,?,?,2,0,'structured',?,?,?,?,?,?)",
            id,owner,title,document,appearance,schemaVersion,templateId,key,filename,mime,bytes,sha,pages);
    }
    public Optional<ResumeRow> findIncludingDeletedForUpdate(long owner, String id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM resumes WHERE owner_id=? AND public_id=? FOR UPDATE", MAPPER,owner,id).stream().findFirst();
    }
    public void softDelete(long owner, String id) {
        jdbc.update("UPDATE resumes SET deleted_at=COALESCE(deleted_at,NOW(3)),updated_at=NOW(3) WHERE owner_id=? AND public_id=? AND deleted_at IS NULL",owner,id);
    }
    public void sourceRemoved(long id) { jdbc.update("UPDATE resumes SET source_key=NULL WHERE id=? AND deleted_at IS NOT NULL",id); }
    public List<ResumeRow> pendingSourceDeletes() {
        return jdbc.query("SELECT " + COLUMNS + " FROM resumes WHERE deleted_at IS NOT NULL AND source_key IS NOT NULL LIMIT 50",MAPPER);
    }
    public boolean sourceReferenced(String key) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM resumes WHERE source_key=?",Long.class,key)>0;
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }
}
