ALTER TABLE resumes
  ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'structured',
  ADD COLUMN source_key VARCHAR(255) NULL,
  ADD COLUMN source_filename VARCHAR(160) NULL,
  ADD COLUMN source_mime VARCHAR(64) NULL,
  ADD COLUMN source_bytes BIGINT NULL,
  ADD COLUMN source_sha256 CHAR(64) NULL,
  ADD COLUMN source_pages INT NULL,
  ADD KEY idx_resumes_owner_kind (owner_id, kind, deleted_at);
