SET @account_status_column_exists = (
    SELECT COUNT(*)
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'users'
       AND column_name = 'account_status'
);
SET @account_status_ddl = IF(
    @account_status_column_exists = 0,
    'ALTER TABLE users ADD COLUMN account_status ENUM(''active'', ''suspended'') NOT NULL DEFAULT ''active'' AFTER role',
    'SELECT 1'
);
PREPARE account_status_statement FROM @account_status_ddl;
EXECUTE account_status_statement;
DEALLOCATE PREPARE account_status_statement;
