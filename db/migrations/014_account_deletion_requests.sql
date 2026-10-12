CREATE TABLE IF NOT EXISTS account_deletion_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    review_reason VARCHAR(1000) NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    CONSTRAINT fk_account_deletion_requests_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_account_deletion_requests_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id),
    KEY idx_account_deletion_requests_user (user_id, id),
    KEY idx_account_deletion_requests_status (status, requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
