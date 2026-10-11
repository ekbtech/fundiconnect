SET @completion_summary_column_exists = (
    SELECT COUNT(*)
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'bookings'
       AND column_name = 'completion_summary'
);
SET @completion_summary_ddl = IF(
    @completion_summary_column_exists = 0,
    'ALTER TABLE bookings ADD COLUMN completion_summary TEXT NULL AFTER status',
    'SELECT 1'
);
PREPARE completion_summary_statement FROM @completion_summary_ddl;
EXECUTE completion_summary_statement;
DEALLOCATE PREPARE completion_summary_statement;

SET @completed_at_column_exists = (
    SELECT COUNT(*)
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'bookings'
       AND column_name = 'completed_at'
);
SET @completed_at_ddl = IF(
    @completed_at_column_exists = 0,
    'ALTER TABLE bookings ADD COLUMN completed_at DATETIME NULL AFTER completion_summary',
    'SELECT 1'
);
PREPARE completed_at_statement FROM @completed_at_ddl;
EXECUTE completed_at_statement;
DEALLOCATE PREPARE completed_at_statement;

SET @completion_confirmed_at_column_exists = (
    SELECT COUNT(*)
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'bookings'
       AND column_name = 'completion_confirmed_at'
);
SET @completion_confirmed_at_ddl = IF(
    @completion_confirmed_at_column_exists = 0,
    'ALTER TABLE bookings ADD COLUMN completion_confirmed_at DATETIME NULL AFTER completed_at',
    'SELECT 1'
);
PREPARE completion_confirmed_at_statement FROM @completion_confirmed_at_ddl;
EXECUTE completion_confirmed_at_statement;
DEALLOCATE PREPARE completion_confirmed_at_statement;
