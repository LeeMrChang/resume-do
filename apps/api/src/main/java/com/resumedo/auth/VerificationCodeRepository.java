package com.resumedo.auth;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class VerificationCodeRepository {
    private static final RowMapper<Code> MAPPER = (rs, rowNum) -> new Code(
            rs.getLong("id"),
            rs.getString("code_hash"),
            rs.getInt("attempts"),
            rs.getTimestamp("expires_at").toInstant(),
            rs.getTimestamp("created_at").toInstant());

    private final JdbcTemplate jdbc;

    public VerificationCodeRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Code> findLatestActive(String channel, String target, String purpose) {
        List<Code> rows = jdbc.query(
                "SELECT id, code_hash, attempts, expires_at, created_at FROM verification_codes"
                        + " WHERE channel = ? AND target = ? AND purpose = ? AND consumed_at IS NULL"
                        + " ORDER BY id DESC LIMIT 1",
                MAPPER,
                channel,
                target,
                purpose);
        return rows.stream().findFirst();
    }

    public Optional<Instant> lastCreatedAt(String channel, String target, String purpose) {
        List<Instant> rows = jdbc.query(
                "SELECT created_at FROM verification_codes"
                        + " WHERE channel = ? AND target = ? AND purpose = ?"
                        + " ORDER BY id DESC LIMIT 1",
                (rs, rowNum) -> rs.getTimestamp("created_at").toInstant(),
                channel,
                target,
                purpose);
        return rows.stream().findFirst();
    }

    public long insert(
            String channel,
            String target,
            String purpose,
            String codeHash,
            Instant expiresAt,
            String requestIp) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO verification_codes"
                            + " (channel, target, purpose, code_hash, expires_at, request_ip, created_at)"
                            + " VALUES (?, ?, ?, ?, ?, ?, NOW(3))",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, channel);
            statement.setString(2, target);
            statement.setString(3, purpose);
            statement.setString(4, codeHash);
            statement.setTimestamp(5, Timestamp.from(expiresAt));
            statement.setString(6, requestIp);
            return statement;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("Failed to store verification code");
        }
        return key.longValue();
    }

    public int incrementAttempts(long id) {
        return jdbc.update("UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?", id);
    }

    public boolean markConsumed(long id) {
        return jdbc.update(
                "UPDATE verification_codes SET consumed_at = NOW(3) WHERE id = ? AND consumed_at IS NULL",
                id) == 1;
    }

    public int countForTargetSince(String channel, String target, String purpose, Instant since) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM verification_codes WHERE channel = ? AND target = ? AND purpose = ? AND created_at >= ?",
                Integer.class,
                channel,
                target,
                purpose,
                Timestamp.from(since));
        return count == null ? 0 : count;
    }

    public int countForIpSince(String ip, Instant since) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM verification_codes WHERE request_ip = ? AND created_at >= ?",
                Integer.class,
                ip,
                Timestamp.from(since));
        return count == null ? 0 : count;
    }

    public record Code(long id, String codeHash, int attempts, Instant expiresAt, Instant createdAt) {
    }
}
