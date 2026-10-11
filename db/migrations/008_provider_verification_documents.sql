CREATE TABLE IF NOT EXISTS provider_verification_documents (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    provider_id BIGINT UNSIGNED NOT NULL,
    document_type ENUM('identity', 'qualification') NOT NULL,
    storage_key CHAR(36) NOT NULL UNIQUE,
    file_extension ENUM('pdf', 'jpg', 'png') NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    size_bytes INT UNSIGNED NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_verification_documents_provider
        FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE,
    KEY idx_verification_documents_provider (provider_id, uploaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
