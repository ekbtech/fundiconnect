CREATE TABLE IF NOT EXISTS provider_availability (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    provider_id BIGINT UNSIGNED NOT NULL,
    weekday TINYINT UNSIGNED NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_provider_availability_provider
        FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE,
    CONSTRAINT chk_provider_availability_weekday CHECK (weekday BETWEEN 0 AND 6),
    CONSTRAINT chk_provider_availability_window CHECK (start_time < end_time),
    UNIQUE KEY uq_provider_availability_weekday (provider_id, weekday)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
