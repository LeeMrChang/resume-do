ALTER TABLE users MODIFY COLUMN email VARCHAR(190) NULL;
ALTER TABLE users ADD COLUMN phone VARCHAR(32) NULL AFTER email;
ALTER TABLE users ADD UNIQUE KEY uk_users_phone (phone);

CREATE TABLE verification_codes (
  id BIGINT NOT NULL AUTO_INCREMENT,
  channel VARCHAR(16) NOT NULL,
  target VARCHAR(190) NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  code_hash VARCHAR(100) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed_at DATETIME(3) NULL,
  expires_at DATETIME(3) NOT NULL,
  request_ip VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_verification_target (channel, target, purpose, created_at),
  KEY idx_verification_ip (request_ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
