ALTER TABLE users
  ADD COLUMN theme_preference VARCHAR(16) NOT NULL DEFAULT 'dark' AFTER display_name;
