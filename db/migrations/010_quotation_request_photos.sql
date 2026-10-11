CREATE TABLE IF NOT EXISTS quotation_request_photos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_id BIGINT UNSIGNED NOT NULL,
    storage_key CHAR(36) NOT NULL UNIQUE,
    file_extension ENUM('jpg', 'png') NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INT UNSIGNED NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_quotation_request_photos_request
        FOREIGN KEY (request_id) REFERENCES quotation_requests(id) ON DELETE CASCADE,
    KEY idx_quotation_request_photos_request (request_id, uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
