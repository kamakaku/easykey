-- EasyKey Database Schema for MySQL/MariaDB
-- Kompatibel mit All-Inkl MySQL-Datenbanken

-- Users Tabelle
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vaults Tabelle (verschlüsselte Passwort-Daten)
CREATE TABLE IF NOT EXISTS vaults (
    user_id VARCHAR(36) PRIMARY KEY,
    `blob` MEDIUMBLOB NOT NULL,  -- bis zu 16MB encrypted data (backticks wegen reserved keyword)
    version INT NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
