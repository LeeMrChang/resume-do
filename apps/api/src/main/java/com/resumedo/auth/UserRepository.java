package com.resumedo.auth;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
    private static final String COLUMNS = "id, email, password_hash, display_name, theme_preference";
    private static final RowMapper<UserAccount> MAPPER = (rs, rowNum) -> new UserAccount(
            rs.getLong("id"),
            rs.getString("email"),
            rs.getString("password_hash"),
            rs.getString("display_name"),
            rs.getString("theme_preference"));

    private final JdbcTemplate jdbc;

    public UserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<UserAccount> findByEmail(String email) {
        List<UserAccount> users = jdbc.query(
                "SELECT " + COLUMNS + " FROM users WHERE email = ?",
                MAPPER,
                email);
        return users.stream().findFirst();
    }

    public Optional<UserAccount> findById(long id) {
        List<UserAccount> users = jdbc.query(
                "SELECT " + COLUMNS + " FROM users WHERE id = ?",
                MAPPER,
                id);
        return users.stream().findFirst();
    }

    public void updateThemePreference(long id, String themePreference) {
        jdbc.update("UPDATE users SET theme_preference = ? WHERE id = ?", themePreference, id);
    }

    public boolean existsByEmail(String email) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE email = ?", Integer.class, email);
        return count != null && count > 0;
    }

    public long insert(String email, String passwordHash, String displayName) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO users (email, password_hash, display_name, created_at) VALUES (?, ?, ?, NOW(3))",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, email);
            statement.setString(2, passwordHash);
            statement.setString(3, displayName);
            return statement;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("Failed to create user");
        }
        return key.longValue();
    }
}
