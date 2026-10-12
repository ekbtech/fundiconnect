SET @review_visibility_exists = (
    SELECT COUNT(*)
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'reviews'
       AND column_name = 'is_visible'
);
SET @review_visibility_ddl = IF(
    @review_visibility_exists = 0,
    'ALTER TABLE reviews ADD COLUMN is_visible BOOLEAN NOT NULL DEFAULT TRUE',
    'SELECT 1'
);
PREPARE review_visibility_statement FROM @review_visibility_ddl;
EXECUTE review_visibility_statement;
DEALLOCATE PREPARE review_visibility_statement;

SET @review_moderation_reason_exists = (
    SELECT COUNT(*)
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'reviews'
       AND column_name = 'moderation_reason'
);
SET @review_moderation_reason_ddl = IF(
    @review_moderation_reason_exists = 0,
    'ALTER TABLE reviews ADD COLUMN moderation_reason VARCHAR(1000) NULL',
    'SELECT 1'
);
PREPARE review_moderation_reason_statement FROM @review_moderation_reason_ddl;
EXECUTE review_moderation_reason_statement;
DEALLOCATE PREPARE review_moderation_reason_statement;

SET @review_moderated_by_exists = (
    SELECT COUNT(*)
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'reviews'
       AND column_name = 'moderated_by'
);
SET @review_moderated_by_ddl = IF(
    @review_moderated_by_exists = 0,
    'ALTER TABLE reviews ADD COLUMN moderated_by BIGINT UNSIGNED NULL',
    'SELECT 1'
);
PREPARE review_moderated_by_statement FROM @review_moderated_by_ddl;
EXECUTE review_moderated_by_statement;
DEALLOCATE PREPARE review_moderated_by_statement;

SET @review_moderated_at_exists = (
    SELECT COUNT(*)
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'reviews'
       AND column_name = 'moderated_at'
);
SET @review_moderated_at_ddl = IF(
    @review_moderated_at_exists = 0,
    'ALTER TABLE reviews ADD COLUMN moderated_at TIMESTAMP NULL',
    'SELECT 1'
);
PREPARE review_moderated_at_statement FROM @review_moderated_at_ddl;
EXECUTE review_moderated_at_statement;
DEALLOCATE PREPARE review_moderated_at_statement;

SET @review_moderator_constraint_exists = (
    SELECT COUNT(*)
      FROM information_schema.table_constraints
     WHERE constraint_schema = DATABASE()
       AND table_name = 'reviews'
       AND constraint_name = 'fk_reviews_moderated_by'
       AND constraint_type = 'FOREIGN KEY'
);
SET @review_moderator_constraint_ddl = IF(
    @review_moderator_constraint_exists = 0,
    'ALTER TABLE reviews ADD CONSTRAINT fk_reviews_moderated_by FOREIGN KEY (moderated_by) REFERENCES users(id)',
    'SELECT 1'
);
PREPARE review_moderator_constraint_statement FROM @review_moderator_constraint_ddl;
EXECUTE review_moderator_constraint_statement;
DEALLOCATE PREPARE review_moderator_constraint_statement;

SET @review_public_index_exists = (
    SELECT COUNT(*)
      FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'reviews'
       AND index_name = 'idx_reviews_public_provider'
);
SET @review_public_index_ddl = IF(
    @review_public_index_exists = 0,
    'CREATE INDEX idx_reviews_public_provider ON reviews(provider_id, is_visible, created_at)',
    'SELECT 1'
);
PREPARE review_public_index_statement FROM @review_public_index_ddl;
EXECUTE review_public_index_statement;
DEALLOCATE PREPARE review_public_index_statement;
