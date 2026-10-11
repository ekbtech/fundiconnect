SET @booking_expired_status_exists = (
    SELECT COUNT(*)
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'bookings'
       AND column_name = 'status'
       AND column_type LIKE '%expired%'
);
SET @booking_expired_status_ddl = IF(
    @booking_expired_status_exists = 0,
    'ALTER TABLE bookings MODIFY COLUMN status ENUM(''requested'', ''quoted'', ''confirmed'', ''accepted'', ''in_progress'', ''completed'', ''closed'', ''rejected'', ''cancelled'', ''disputed'', ''expired'') NOT NULL DEFAULT ''requested''',
    'SELECT 1'
);
PREPARE booking_expired_status_statement FROM @booking_expired_status_ddl;
EXECUTE booking_expired_status_statement;
DEALLOCATE PREPARE booking_expired_status_statement;

SET @booking_expiry_index_exists = (
    SELECT COUNT(*)
      FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'bookings'
       AND index_name = 'idx_bookings_expiry'
);
SET @booking_expiry_index_ddl = IF(
    @booking_expiry_index_exists = 0,
    'CREATE INDEX idx_bookings_expiry ON bookings(status, created_at)',
    'SELECT 1'
);
PREPARE booking_expiry_index_statement FROM @booking_expiry_index_ddl;
EXECUTE booking_expiry_index_statement;
DEALLOCATE PREPARE booking_expiry_index_statement;
