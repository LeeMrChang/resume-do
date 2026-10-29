package com.resumedo.export;

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
public class ExportRepository {
    private static final String COLUMNS = "id, public_id, owner_id, resume_id, revision, status, filename, "
            + "error_code, error_message, file_key, file_bytes, expires_at, created_at, finished_at";

    private static final RowMapper<ExportJobRow> MAPPER = (rs, rowNum) -> new ExportJobRow(
            rs.getLong("id"),
            rs.getString("public_id"),
            rs.getLong("owner_id"),
            rs.getLong("resume_id"),
            rs.getLong("revision"),
            rs.getInt("status"),
            rs.getString("filename"),
            rs.getString("error_code"),
            rs.getString("error_message"),
            rs.getString("file_key"),
            (Long) rs.getObject("file_bytes"),
            instant(rs, "expires_at"),
            instant(rs, "created_at"),
            instant(rs, "finished_at"));

    private final JdbcTemplate jdbc;

    public ExportRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<ExportJobRow> find(long ownerId, String publicId) {
        List<ExportJobRow> rows = jdbc.query(
                "SELECT " + COLUMNS + " FROM export_jobs WHERE public_id = ? AND owner_id = ?",
                MAPPER,
                publicId,
                ownerId);
        return rows.stream().findFirst();
    }

    public Optional<ExportJobRow> findByIdempotency(long ownerId, String idempotencyKey) {
        List<ExportJobRow> rows = jdbc.query(
                "SELECT " + COLUMNS + " FROM export_jobs WHERE owner_id = ? AND idempotency_key = ?",
                MAPPER,
                ownerId,
                idempotencyKey);
        return rows.stream().findFirst();
    }

    public void insert(
            String publicId,
            long ownerId,
            long resumeId,
            long revision,
            String snapshotJson,
            String snapshotSha256,
            String templateId,
            int templateVersion,
            String rendererVersion,
            String filename,
            String idempotencyKey) {
        jdbc.update(
                "INSERT INTO export_jobs (public_id, owner_id, resume_id, revision, snapshot, snapshot_sha256, "
                        + "template_id, template_version, renderer_version, filename, idempotency_key, status, "
                        + "attempts, next_attempt_at, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NOW(3), NOW(3))",
                publicId,
                ownerId,
                resumeId,
                revision,
                snapshotJson,
                snapshotSha256,
                templateId,
                templateVersion,
                rendererVersion,
                filename,
                idempotencyKey);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }
}
