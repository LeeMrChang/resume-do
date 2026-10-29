package com.resumedo.importing;

import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class ImportRepository {
    public record Job(String id, long owner, String filename, String fileKey, String status, String source,
                      String draft, long version, boolean edited, String code, String message, String resumeId,
                      Instant expiresAt, Instant updatedAt) {}
    private static final RowMapper<Job> ROW = (rs, n) -> new Job(rs.getString("public_id"), rs.getLong("owner_id"),
        rs.getString("filename"), rs.getString("file_key"), rs.getString("status"), rs.getString("source_text"),
        rs.getString("draft"), rs.getLong("version"), rs.getBoolean("edited"), rs.getString("error_code"),
        rs.getString("error_message"), rs.getString("resume_public_id"), rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("updated_at").toInstant());
    private final JdbcTemplate db;
    public ImportRepository(JdbcTemplate db) { this.db = db; }
    public Optional<Job> find(long owner, String id, boolean lock) {
        return db.query("SELECT * FROM import_jobs WHERE owner_id=? AND public_id=?" + (lock ? " FOR UPDATE" : ""), ROW, owner, id).stream().findFirst();
    }
    public List<Job> list(long owner) {
        return db.query("SELECT * FROM import_jobs WHERE owner_id=? AND expires_at>UTC_TIMESTAMP(3) AND status IN ('processing','ready','failed') ORDER BY created_at DESC LIMIT 20", ROW, owner);
    }
    public int activeCount(long owner) {
        return db.queryForObject("SELECT COUNT(*) FROM import_jobs WHERE owner_id=? AND expires_at>UTC_TIMESTAMP(3) AND status IN ('processing','ready','failed')", Integer.class, owner);
    }
    public boolean hasFile(String key) {
        return db.queryForObject("SELECT COUNT(*) FROM import_jobs WHERE file_key=?", Integer.class, key) > 0;
    }
    public void insert(String id, long owner, String filename, String key, String draft) {
        db.update("INSERT INTO import_jobs (public_id,owner_id,filename,file_key,status,draft,created_at,updated_at,expires_at) VALUES (?,?,?,?,'processing',?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 24 HOUR))", id, owner, filename, key, draft);
    }
    public int result(String id, long version, String source, String draft, String warning) {
        return db.update("UPDATE import_jobs SET status='ready',source_text=?,draft=IF(edited,draft,?),error_code=NULL,error_message=?,updated_at=UTC_TIMESTAMP(3) WHERE public_id=? AND version=? AND status='processing'", source, draft, warning, id, version);
    }
    public void fail(String id, long version, String code, String message) {
        db.update("UPDATE import_jobs SET status='failed',error_code=?,error_message=?,updated_at=UTC_TIMESTAMP(3) WHERE public_id=? AND version=? AND status='processing'", code, message, id, version);
    }
    public int save(long owner, String id, long version, String draft) {
        return db.update("UPDATE import_jobs SET draft=?,edited=TRUE,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE owner_id=? AND public_id=? AND version=? AND status IN ('ready','failed') AND expires_at>UTC_TIMESTAMP(3)", draft, owner, id, version);
    }
    public int retry(long owner, String id, long version) {
        return db.update("UPDATE import_jobs SET status='processing',version=version+1,error_code=NULL,error_message=NULL,updated_at=UTC_TIMESTAMP(3) WHERE owner_id=? AND public_id=? AND version=? AND status IN ('ready','failed') AND expires_at>UTC_TIMESTAMP(3)", owner, id, version);
    }
    public void confirmed(String id, String resumeId) {
        db.update("UPDATE import_jobs SET status='confirmed',resume_public_id=?,draft=NULL,source_text=NULL,error_code=NULL,error_message=NULL,updated_at=UTC_TIMESTAMP(3) WHERE public_id=?", resumeId, id);
    }
    public void cancelled(String id) {
        db.update("UPDATE import_jobs SET status='cancelled',draft=NULL,source_text=NULL,updated_at=UTC_TIMESTAMP(3) WHERE public_id=?", id);
    }
    public void fileRemoved(String id) { db.update("UPDATE import_jobs SET file_key=NULL WHERE public_id=?", id); }
    public List<Job> cleanupCandidates() {
        return db.query("SELECT * FROM import_jobs WHERE expires_at<=UTC_TIMESTAMP(3) OR (status IN ('cancelled','confirmed') AND file_key IS NOT NULL) ORDER BY id LIMIT 100", ROW);
    }
    public void expire(String id) { db.update("UPDATE import_jobs SET status='expired',draft=NULL,source_text=NULL,error_message=NULL WHERE public_id=? AND expires_at<=UTC_TIMESTAMP(3)", id); }
    public void purge(String id) { db.update("DELETE FROM import_jobs WHERE public_id=? AND expires_at<=UTC_TIMESTAMP(3) AND file_key IS NULL", id); }
    public void recover() {
        db.update("UPDATE import_jobs SET status='failed',error_code='PARSE_INTERRUPTED',error_message='解析未完成，可能服务已重启或超时，请重试或手动整理',updated_at=UTC_TIMESTAMP(3) WHERE status='processing' AND updated_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 SECOND)");
    }
}
