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
            instant(rs, "updated_at"));

    private static final String COLUMNS = "id, public_id, owner_id, title, document, appearance, "
            + "schema_version, template_id, template_version, revision, last_mutation_id, created_at, updated_at";

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

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }
}
