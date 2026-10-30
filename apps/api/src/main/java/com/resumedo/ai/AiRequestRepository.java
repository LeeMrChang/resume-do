package com.resumedo.ai;

import com.resumedo.common.ApiException;
import java.util.Map;
import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Short transactions only; the network call must never hold the user's database row lock. */
@Repository
public class AiRequestRepository {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;

    public AiRequestRepository(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.transactions = new TransactionTemplate(manager);
    }

    /** Returns a completed cached result, or null if this caller reserved a new model call. */
    public String reserve(long owner, String id, String hash, AiProperties limits) {
        return transactions.execute(tx -> {
            var users = jdbc.queryForList("SELECT id FROM users WHERE id=? FOR UPDATE", Long.class, owner);
            if (users.isEmpty()) throw ApiException.unauthorized("请先登录");
            jdbc.update("DELETE FROM ai_rewrite_requests WHERE owner_id=? AND request_id=? AND expires_at<=UTC_TIMESTAMP(3)", owner, id);
            var existing = jdbc.queryForList("SELECT * FROM ai_rewrite_requests WHERE owner_id=? AND request_id=?", owner, id);
            if (!existing.isEmpty()) {
                Map<String, Object> row = existing.getFirst();
                if (!hash.equals(row.get("request_hash")))
                    throw AiErrors.error(HttpStatus.CONFLICT, "AI_REQUEST_CONFLICT", "同一 requestId 不能用于不同内容，请生成新的请求 ID");
                if ("succeeded".equals(row.get("state"))) return (String) row.get("rewritten_text");
                if ("failed".equals(row.get("state"))) {
                    throw AiErrors.error(HttpStatus.valueOf(((Number) row.get("error_status")).intValue()),
                            (String) row.get("error_code"), (String) row.get("error_message"));
                }
                // A crash/timeout has an uncertain billing outcome: never automatically submit it again.
                throw AiErrors.error(HttpStatus.CONFLICT, "AI_REQUEST_PENDING", "此请求正在处理或结果尚未确认，请勿重复提交；稍后可用同一 requestId 查询结果");
            }
            int staleSeconds = limits.getTimeoutMs() / 1000 + 15;
            Long pending = jdbc.queryForObject("SELECT COUNT(*) FROM ai_rewrite_requests WHERE owner_id=? AND state='pending' "
                    + "AND created_at>DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? SECOND)", Long.class, owner, staleSeconds);
            if (pending != null && pending > 0)
                throw AiErrors.error(HttpStatus.TOO_MANY_REQUESTS, "AI_BUSY", "已有 AI 请求正在处理，请稍后再试");
            Long recent = jdbc.queryForObject("SELECT COUNT(*) FROM ai_rewrite_requests WHERE owner_id=? "
                    + "AND created_at>DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE)", Long.class, owner);
            if (recent != null && recent >= limits.getPerMinuteLimit())
                throw AiErrors.error(HttpStatus.TOO_MANY_REQUESTS, "AI_RATE_LIMITED", "操作过于频繁，请一分钟后再试");
            LocalDate day = jdbc.queryForObject("SELECT UTC_DATE()", LocalDate.class);
            jdbc.update("INSERT IGNORE INTO ai_daily_usage(owner_id,usage_date,attempts) VALUES (?,?,0)", owner, day);
            Integer used = jdbc.queryForObject("SELECT attempts FROM ai_daily_usage WHERE owner_id=? AND usage_date=?", Integer.class, owner, day);
            if (used != null && used >= limits.getDailyLimit())
                throw AiErrors.error(HttpStatus.TOO_MANY_REQUESTS, "AI_QUOTA_EXCEEDED", "今日 AI 使用次数已达上限，请明日再试");
            jdbc.update("UPDATE ai_daily_usage SET attempts=attempts+1 WHERE owner_id=? AND usage_date=?", owner, day);
            jdbc.update("INSERT INTO ai_rewrite_requests(owner_id,request_id,request_hash,state,created_at,updated_at,expires_at) "
                    + "VALUES (?,?,?,'pending',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 24 HOUR))", owner, id, hash);
            return null;
        });
    }

    public void succeed(long owner, String id, String text) {
        if (jdbc.update("UPDATE ai_rewrite_requests SET state='succeeded',rewritten_text=?,updated_at=UTC_TIMESTAMP(3) "
                + "WHERE owner_id=? AND request_id=? AND state='pending'", text, owner, id) != 1)
            throw new IllegalStateException("AI request result could not be recorded");
    }

    public void fail(long owner, String id, ApiException error) {
        jdbc.update("UPDATE ai_rewrite_requests SET state='failed',error_status=?,error_code=?,error_message=?,updated_at=UTC_TIMESTAMP(3) "
                + "WHERE owner_id=? AND request_id=? AND state='pending'", error.status().value(), error.code(), error.getMessage(), owner, id);
    }

    @Scheduled(fixedDelay = 60000, initialDelay = 60000)
    public void cleanup() {
        jdbc.update("DELETE FROM ai_rewrite_requests WHERE expires_at<=UTC_TIMESTAMP(3) LIMIT 500");
        jdbc.update("DELETE FROM ai_daily_usage WHERE usage_date<DATE_SUB(UTC_DATE(),INTERVAL 7 DAY) LIMIT 500");
    }
}
