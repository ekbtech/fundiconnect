SET @accepted_quotation_column_exists = (
    SELECT COUNT(*)
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'bookings'
       AND column_name = 'accepted_quotation_id'
);
SET @accepted_quotation_ddl = IF(
    @accepted_quotation_column_exists = 0,
    'ALTER TABLE bookings ADD COLUMN accepted_quotation_id BIGINT UNSIGNED NULL UNIQUE, ADD CONSTRAINT fk_bookings_accepted_quotation FOREIGN KEY (accepted_quotation_id) REFERENCES quotations(id)',
    'SELECT 1'
);
PREPARE accepted_quotation_statement FROM @accepted_quotation_ddl;
EXECUTE accepted_quotation_statement;
DEALLOCATE PREPARE accepted_quotation_statement;
