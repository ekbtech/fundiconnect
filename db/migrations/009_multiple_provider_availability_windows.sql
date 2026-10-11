SET @add_availability_window_index = (
    SELECT IF(
        EXISTS(
            SELECT 1
              FROM information_schema.statistics
             WHERE table_schema = DATABASE()
               AND table_name = 'provider_availability'
               AND index_name = 'idx_provider_availability_window'
        ),
        'SELECT 1',
        'ALTER TABLE provider_availability ADD INDEX idx_provider_availability_window (provider_id, weekday, start_time, end_time)'
    )
);
PREPARE add_availability_window_index_statement FROM @add_availability_window_index;
EXECUTE add_availability_window_index_statement;
DEALLOCATE PREPARE add_availability_window_index_statement;

SET @drop_availability_unique_index = (
    SELECT IF(
        EXISTS(
            SELECT 1
              FROM information_schema.statistics
             WHERE table_schema = DATABASE()
               AND table_name = 'provider_availability'
               AND index_name = 'uq_provider_availability_weekday'
        ),
        'ALTER TABLE provider_availability DROP INDEX uq_provider_availability_weekday',
        'SELECT 1'
    )
);
PREPARE drop_availability_unique_index_statement FROM @drop_availability_unique_index;
EXECUTE drop_availability_unique_index_statement;
DEALLOCATE PREPARE drop_availability_unique_index_statement;
