CREATE TABLE IF NOT EXISTS booking_schedule_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id BIGINT UNSIGNED NOT NULL,
    previous_requested_at DATETIME NOT NULL,
    requested_at DATETIME NOT NULL,
    changed_by BIGINT UNSIGNED NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_schedule_history_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_booking_schedule_history_user
        FOREIGN KEY (changed_by) REFERENCES users(id),
    KEY idx_booking_schedule_history_booking (booking_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
