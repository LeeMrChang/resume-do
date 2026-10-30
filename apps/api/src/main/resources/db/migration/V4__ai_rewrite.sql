-- Separate from resumes: AI suggestions never update resume content.
-- Source paragraphs / keys are not persisted. Successful suggestions expire after 24 hours.
CREATE TABLE ai_rewrite_requests (
  owner_id BIGINT NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state VARCHAR(16) NOT NULL,
  rewritten_text TEXT NULL,
  error_status INT NULL,
  error_code VARCHAR(64) NULL,
  error_message VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (owner_id, request_id),
  KEY idx_ai_owner_created (owner_id, created_at),
  KEY idx_ai_expiry (expires_at),
  CONSTRAINT fk_ai_request_owner FOREIGN KEY (owner_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ai_daily_usage (
  owner_id BIGINT NOT NULL,
  usage_date DATE NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, usage_date),
  CONSTRAINT fk_ai_usage_owner FOREIGN KEY (owner_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
