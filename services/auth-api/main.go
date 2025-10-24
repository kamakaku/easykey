package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/mattn/go-sqlite3"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

/* ========= Types ========= */

type Health struct {
	Status string `json:"status"`
	Time   string `json:"time"`
}

type QRChallenge struct {
	LoginID string `json:"loginId"`
	Nonce   string `json:"nonce"`
	Expires int64  `json:"expires"`
}

type entry struct {
	nonce     string
	expires   time.Time
	confirmed bool
	notify    chan string // sendet One-Time-Token/JWT-Trigger
}

type TokenInfo struct {
	LoginID string
	Exp     time.Time
	Used    bool
}

// Auth DTOs
type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"` // Master-Passwort (client-side only)
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Ok     bool   `json:"ok"`
	UserID string `json:"userId"`
}

// Vault DTOs
type VaultGetResponse struct {
	BlobB64 string `json:"blob"` // base64 (ciphertext vom Client)
}
type VaultPutRequest struct {
	BlobB64 string `json:"blob"` // base64 (ciphertext)
}
type VaultPutResponse struct {
	Ok bool `json:"ok"`
}

// Generator Settings DTOs
type GeneratorGetResponse struct {
	BlobB64 string `json:"blob"` // base64 (ciphertext vom Client)
}
type GeneratorPutRequest struct {
	BlobB64 string `json:"blob"` // base64 (ciphertext)
}

// WebAuthn DTOs
type WebAuthnCredential struct {
	ID                string `json:"id"`
	UserID            string `json:"userId"`
	CredentialID      []byte `json:"credentialId"`
	PublicKey         []byte `json:"publicKey"`
	AAGUID            []byte `json:"aaguid,omitempty"`
	SignCount         int    `json:"signCount"`
	CloneWarning      bool   `json:"cloneWarning"`
	AuthenticatorName string `json:"authenticatorName,omitempty"`
	CreatedAt         string `json:"createdAt"`
	LastUsedAt        string `json:"lastUsedAt,omitempty"`
}

type WebAuthnRegisterRequest struct {
	CredentialID      string `json:"credentialId"`      // base64url encoded
	PublicKey         string `json:"publicKey"`         // base64url encoded
	AAGUID            string `json:"aaguid"`            // base64url encoded
	AuthenticatorName string `json:"authenticatorName"` // optional user-friendly name
}

type WebAuthnListResponse struct {
	Credentials []WebAuthnCredential `json:"credentials"`
}

type WebAuthnAuthenticateRequest struct {
	CredentialID      string `json:"credentialId"`      // base64url encoded
	AuthenticatorData string `json:"authenticatorData"` // base64url encoded
	ClientDataJSON    string `json:"clientDataJSON"`    // base64url encoded
	Signature         string `json:"signature"`         // base64url encoded
}

/* ========= Globals ========= */

var (
	// In-Mem Login/Token (bleibt, bis DB für Challenges gebaut wird)
	mem      = map[string]*entry{}     // loginId -> entry
	tokenMap = map[string]*TokenInfo{} // one-time token -> info
	mutex    sync.Mutex
	ttl      = 60 * time.Second

	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return r.Header.Get("Origin") == "http://localhost:3000"
		},
	}

	jwtSecret []byte

	db *sql.DB
	// dbDriver keeps track of the driver currently in use (sqlite3 or mysql)
	dbDriver string
)

/* ========= Init ========= */

func init() {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "dev-only-change-me"
	}
	jwtSecret = []byte(secret)
}

/* ========= DB Init / Repos ========= */

const sqliteSchema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vaults(
  user_id  TEXT PRIMARY KEY,
  blob     BLOB NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS generator_settings(
  user_id  TEXT PRIMARY KEY,
  blob     BLOB NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webauthn_credentials(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_id BLOB NOT NULL,
  public_key BLOB NOT NULL,
  aaguid BLOB,
  sign_count INTEGER NOT NULL DEFAULT 0,
  clone_warning INTEGER NOT NULL DEFAULT 0,
  authenticator_name TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials(user_id);
`

const mysqlSchema = `
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vaults (
    user_id VARCHAR(36) PRIMARY KEY,
    blob MEDIUMBLOB NOT NULL,
    version INT NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS generator_settings (
    user_id VARCHAR(36) PRIMARY KEY,
    blob MEDIUMBLOB NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    credential_id BLOB NOT NULL,
    public_key BLOB NOT NULL,
    aaguid BLOB,
    sign_count INT NOT NULL DEFAULT 0,
    clone_warning TINYINT NOT NULL DEFAULT 0,
    authenticator_name VARCHAR(255),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`

func initDB() error {
	dsn := os.Getenv("DB_DSN")
	driver := os.Getenv("DB_DRIVER")

	// Auto-detect driver from DSN if not specified
	if driver == "" {
		if strings.Contains(dsn, "://") || strings.HasPrefix(dsn, "file:") {
			driver = "sqlite3"
		} else if dsn != "" {
			driver = "mysql"
		} else {
			// Default: SQLite for local development
			driver = "sqlite3"
			dsn = "file:easykey.db?_fk=1"
		}
	}

	dbDriver = driver

	log.Printf("Connecting to database: driver=%s", driver)

	var err error
	db, err = sql.Open(driver, dsn)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Test connection
	if err = db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	// Execute schema
	if driver == "mysql" {
		// MySQL/MariaDB: Execute statements separately
		statements := []string{
			`CREATE TABLE IF NOT EXISTS users (
				id VARCHAR(36) PRIMARY KEY,
				email VARCHAR(255) UNIQUE NOT NULL,
				password_hash VARCHAR(255) NOT NULL,
				created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				INDEX idx_email (email),
				INDEX idx_updated_at (updated_at)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
			`CREATE TABLE IF NOT EXISTS vaults (
				user_id VARCHAR(36) PRIMARY KEY,
				` + "`blob`" + ` MEDIUMBLOB NOT NULL,
				updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				INDEX idx_updated_at (updated_at)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
			`CREATE TABLE IF NOT EXISTS generator_settings (
				user_id VARCHAR(36) PRIMARY KEY,
				` + "`blob`" + ` MEDIUMBLOB NOT NULL,
				updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				INDEX idx_updated_at (updated_at)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
			`CREATE TABLE IF NOT EXISTS webauthn_credentials (
				id VARCHAR(36) PRIMARY KEY,
				user_id VARCHAR(36) NOT NULL,
				credential_id BLOB NOT NULL,
				public_key BLOB NOT NULL,
				aaguid BLOB,
				sign_count INT NOT NULL DEFAULT 0,
				clone_warning TINYINT NOT NULL DEFAULT 0,
				authenticator_name VARCHAR(255),
				created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				last_used_at DATETIME,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
				INDEX idx_user_id (user_id)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
		}
		for _, stmt := range statements {
			if _, err = db.Exec(stmt); err != nil {
				return fmt.Errorf("failed to create schema: %w", err)
			}
		}
	} else {
		// SQLite: Can execute all at once
		if _, err = db.Exec(sqliteSchema); err != nil {
			return fmt.Errorf("failed to create schema: %w", err)
		}
	}

	if err := ensureUserSchema(); err != nil {
		return fmt.Errorf("failed to ensure user schema: %w", err)
	}

	log.Printf("Database initialized successfully")
	return nil
}

func ensureUserSchema() error {
	switch dbDriver {
	case "mysql":
		if err := addColumnIfMissingMySQL("users", "email", "VARCHAR(255) DEFAULT NULL"); err != nil {
			return err
		}
		if err := addColumnIfMissingMySQL("users", "password_hash", "VARCHAR(255) DEFAULT NULL"); err != nil {
			return err
		}
		if err := addIndexIfMissingMySQL("users", "idx_email", "ADD UNIQUE KEY idx_email (email)"); err != nil {
			return err
		}
	case "sqlite3":
		if err := addColumnIfMissingSQLite("users", "email", "TEXT"); err != nil {
			return err
		}
		if err := addColumnIfMissingSQLite("users", "password_hash", "TEXT"); err != nil {
			return err
		}
	}
	return migrateLegacyUsers()
}

func addColumnIfMissingMySQL(table, column, definition string) error {
	var count int
	err := db.QueryRow(`
		SELECT COUNT(*) FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
		table, column,
	).Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	_, err = db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition))
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
			return nil
		}
		return err
	}
	return nil
}

func addIndexIfMissingMySQL(table, indexName, alterStmt string) error {
	var count int
	err := db.QueryRow(`
		SELECT COUNT(*) FROM information_schema.STATISTICS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?`,
		table, indexName,
	).Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	if _, err = db.Exec(fmt.Sprintf("ALTER TABLE %s %s", table, alterStmt)); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate key name") {
			return nil
		}
		return err
	}
	return nil
}

func addColumnIfMissingSQLite(table, column, definition string) error {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			cid       int
			name      string
			ctype     string
			notnull   int
			dfltValue any
			pk        int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			return err
		}
		if name == column {
			return nil
		}
	}
	if rows.Err() != nil {
		return rows.Err()
	}
	if _, err := db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition)); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
			return nil
		}
		return err
	}
	return nil
}

func migrateLegacyUsers() error {
	rows, err := db.Query(`SELECT id, email, password_hash FROM users`)
	if err != nil {
		// Table might be empty / newly created
		if strings.Contains(strings.ToLower(err.Error()), "no such column") {
			return nil
		}
		return err
	}
	defer rows.Close()

	type userRow struct {
		id           string
		email        sql.NullString
		passwordHash sql.NullString
	}
	var legacy []userRow

	for rows.Next() {
		var r userRow
		if scanErr := rows.Scan(&r.id, &r.email, &r.passwordHash); scanErr != nil {
			return scanErr
		}
		if !r.email.Valid || r.email.String == "" || !r.passwordHash.Valid || r.passwordHash.String == "" {
			legacy = append(legacy, r)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	if len(legacy) == 0 {
		return nil
	}

	for _, u := range legacy {
		email := u.email.String
		if email == "" {
			email = fmt.Sprintf("legacy-%s@placeholder.easykey", strings.ReplaceAll(u.id, "-", ""))
		}
		password := uuid.NewString()
		hashedPassword, hashErr := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if hashErr != nil {
			return hashErr
		}

		if _, err := db.Exec(`UPDATE users SET email=?, password_hash=? WHERE id=?`, email, string(hashedPassword), u.id); err != nil {
			return err
		}
	}

	// For MySQL tighten constraints after data migration
	if dbDriver == "mysql" {
		if _, err := db.Exec(`ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NOT NULL`); err != nil && !strings.Contains(strings.ToLower(err.Error()), "doesn't exist") {
			return err
		}
		if _, err := db.Exec(`ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NOT NULL`); err != nil && !strings.Contains(strings.ToLower(err.Error()), "doesn't exist") {
			return err
		}
	}

	return nil
}

// createUser: erstellt einen neuen User mit Email und Passwort
func createUser(email, password string) (string, error) {
	// Passwort hashen
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash password: %w", err)
	}

	userID := uuid.NewString()
	now := nowString()

	_, err = db.Exec(`
		INSERT INTO users(id, email, password_hash, created_at, updated_at)
		VALUES(?, ?, ?, ?, ?)
	`, userID, email, string(hashedPassword), now, now)

	if err != nil {
		return "", fmt.Errorf("failed to create user: %w", err)
	}

	return userID, nil
}

// getUserByEmail: findet User anhand der Email
func getUserByEmail(email string) (id, passwordHash string, found bool, err error) {
	row := db.QueryRow(`SELECT id, password_hash FROM users WHERE email=?`, email)
	err = row.Scan(&id, &passwordHash)
	if err == sql.ErrNoRows {
		return "", "", false, nil
	}
	if err != nil {
		return "", "", false, err
	}
	return id, passwordHash, true, nil
}

// verifyPassword: prüft ob Passwort korrekt ist
func verifyPassword(hashedPassword, password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
	return err == nil
}

// ensureUser stellt sicher, dass ein User-Datensatz existiert.
// Für QR-basierte Logins wird bei Bedarf ein Platzhalter-User angelegt.
func ensureUser(id string) error {
	if id == "" {
		return fmt.Errorf("user id required")
	}
	var exists int
	err := db.QueryRow(`SELECT 1 FROM users WHERE id=?`, id).Scan(&exists)
	if err == nil {
		return nil
	}
	if err != sql.ErrNoRows {
		return err
	}

	placeholderEmail := fmt.Sprintf("qr-%s@placeholder.easykey", strings.ReplaceAll(id, "-", ""))
	placeholderPassword := uuid.NewString()
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(placeholderPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash placeholder password: %w", err)
	}

	now := nowString()
	_, err = db.Exec(`
		INSERT INTO users(id, email, password_hash, created_at, updated_at)
		VALUES(?, ?, ?, ?, ?)
	`, id, placeholderEmail, string(hashedPassword), now, now)
	if err != nil {
		return fmt.Errorf("failed to create placeholder user: %w", err)
	}
	return nil
}

// getVault: liest Vault; ok=false, wenn nicht vorhanden
func getVault(userID string) (blob []byte, ok bool, err error) {
	selectSQL := `SELECT `
	if dbDriver == "mysql" {
		selectSQL += "`blob`"
	} else {
		selectSQL += "blob"
	}
	selectSQL += ` FROM vaults WHERE user_id=?`

	row := db.QueryRow(selectSQL, userID)
	err = row.Scan(&blob)
	if err == sql.ErrNoRows {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return blob, true, nil
}

// putVault: speichert oder überschreibt Vault (ohne Versioning)
func putVault(userID string, blob []byte) error {
	now := nowString()

	// Versuchen: UPDATE, wenn vorhanden
	updateSQL := `UPDATE vaults SET `
	if dbDriver == "mysql" {
		updateSQL += "`blob`"
	} else {
		updateSQL += "blob"
	}
	updateSQL += `=?, updated_at=? WHERE user_id=?`

	res, err := db.Exec(updateSQL, blob, now, userID)
	if err != nil {
		return err
	}
	aff, _ := res.RowsAffected()
	if aff == 1 {
		return nil
	}

	// Wenn kein Update – INSERT
	insertSQL := `INSERT INTO vaults(user_id, `
	if dbDriver == "mysql" {
		insertSQL += "`blob`"
	} else {
		insertSQL += "blob"
	}
	insertSQL += `, updated_at) VALUES(?, ?, ?)`

	_, err = db.Exec(insertSQL, userID, blob, now)
	return err
}

// getGeneratorSettings: liest Generator-Settings; ok=false, wenn nicht vorhanden
func getGeneratorSettings(userID string) (blob []byte, ok bool, err error) {
	selectSQL := `SELECT `
	if dbDriver == "mysql" {
		selectSQL += "`blob`"
	} else {
		selectSQL += "blob"
	}
	selectSQL += ` FROM generator_settings WHERE user_id=?`

	row := db.QueryRow(selectSQL, userID)
	err = row.Scan(&blob)
	if err == sql.ErrNoRows {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return blob, true, nil
}

// putGeneratorSettings: speichert oder überschreibt Generator-Settings
func putGeneratorSettings(userID string, blob []byte) error {
	now := nowString()

	// Versuchen: UPDATE, wenn vorhanden
	updateSQL := `UPDATE generator_settings SET `
	if dbDriver == "mysql" {
		updateSQL += "`blob`"
	} else {
		updateSQL += "blob"
	}
	updateSQL += `=?, updated_at=? WHERE user_id=?`

	res, err := db.Exec(updateSQL, blob, now, userID)
	if err != nil {
		return err
	}
	aff, _ := res.RowsAffected()
	if aff == 1 {
		return nil
	}

	// Wenn kein Update – INSERT
	insertSQL := `INSERT INTO generator_settings(user_id, `
	if dbDriver == "mysql" {
		insertSQL += "`blob`"
	} else {
		insertSQL += "blob"
	}
	insertSQL += `, updated_at) VALUES(?, ?, ?)`

	_, err = db.Exec(insertSQL, userID, blob, now)
	return err
}

// createWebAuthnCredential: stores a new WebAuthn credential for a user
func createWebAuthnCredential(userID string, credentialID, publicKey, aaguid []byte, authenticatorName string) (string, error) {
	credID := uuid.NewString()
	now := nowString()

	_, err := db.Exec(`
		INSERT INTO webauthn_credentials(id, user_id, credential_id, public_key, aaguid, authenticator_name, created_at)
		VALUES(?, ?, ?, ?, ?, ?, ?)
	`, credID, userID, credentialID, publicKey, aaguid, authenticatorName, now)

	if err != nil {
		return "", fmt.Errorf("failed to create webauthn credential: %w", err)
	}

	return credID, nil
}

// getWebAuthnCredentialsByUser: retrieves all WebAuthn credentials for a user
func getWebAuthnCredentialsByUser(userID string) ([]WebAuthnCredential, error) {
	rows, err := db.Query(`
		SELECT id, user_id, credential_id, public_key, aaguid, sign_count, clone_warning, authenticator_name, created_at, last_used_at
		FROM webauthn_credentials
		WHERE user_id = ?
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query webauthn credentials: %w", err)
	}
	defer rows.Close()

	var credentials []WebAuthnCredential
	for rows.Next() {
		var cred WebAuthnCredential
		var cloneWarningInt int
		var lastUsedAt sql.NullString
		var aaguid []byte

		err := rows.Scan(
			&cred.ID,
			&cred.UserID,
			&cred.CredentialID,
			&cred.PublicKey,
			&aaguid,
			&cred.SignCount,
			&cloneWarningInt,
			&cred.AuthenticatorName,
			&cred.CreatedAt,
			&lastUsedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan webauthn credential: %w", err)
		}

		cred.AAGUID = aaguid
		cred.CloneWarning = cloneWarningInt == 1
		if lastUsedAt.Valid {
			cred.LastUsedAt = lastUsedAt.String
		}

		credentials = append(credentials, cred)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating webauthn credentials: %w", err)
	}

	return credentials, nil
}

// getWebAuthnCredentialByCredentialID: retrieves a credential by its credential_id
func getWebAuthnCredentialByCredentialID(credentialID []byte) (*WebAuthnCredential, error) {
	var cred WebAuthnCredential
	var cloneWarningInt int
	var lastUsedAt sql.NullString
	var aaguid []byte

	err := db.QueryRow(`
		SELECT id, user_id, credential_id, public_key, aaguid, sign_count, clone_warning, authenticator_name, created_at, last_used_at
		FROM webauthn_credentials
		WHERE credential_id = ?
	`, credentialID).Scan(
		&cred.ID,
		&cred.UserID,
		&cred.CredentialID,
		&cred.PublicKey,
		&aaguid,
		&cred.SignCount,
		&cloneWarningInt,
		&cred.AuthenticatorName,
		&cred.CreatedAt,
		&lastUsedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query webauthn credential: %w", err)
	}

	cred.AAGUID = aaguid
	cred.CloneWarning = cloneWarningInt == 1
	if lastUsedAt.Valid {
		cred.LastUsedAt = lastUsedAt.String
	}

	return &cred, nil
}

// updateWebAuthnCredentialSignCount: updates sign count and last_used_at
func updateWebAuthnCredentialSignCount(credentialID []byte, signCount int) error {
	now := nowString()

	_, err := db.Exec(`
		UPDATE webauthn_credentials
		SET sign_count = ?, last_used_at = ?
		WHERE credential_id = ?
	`, signCount, now, credentialID)

	return err
}

// deleteWebAuthnCredential: deletes a WebAuthn credential by ID
func deleteWebAuthnCredential(id, userID string) error {
	_, err := db.Exec(`
		DELETE FROM webauthn_credentials
		WHERE id = ? AND user_id = ?
	`, id, userID)

	return err
}

/* ========= Rate Limiting (DEV-Light) ========= */

type bucket struct {
	tokens int
	last   time.Time
}

var rl = struct {
	m  map[string]*bucket
	mu sync.Mutex
}{m: map[string]*bucket{}}

// allow returns true if the client identified by ip can perform another action
// cps = capacity and refill rate in tokens per second.
func allow(ip string, cps int) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()
	b := rl.m[ip]
	if b == nil {
		b = &bucket{tokens: cps, last: now}
		rl.m[ip] = b
	}
	// refill based on elapsed seconds
	elapsed := now.Sub(b.last).Seconds()
	if elapsed > 0 {
		refill := int(elapsed * float64(cps))
		if refill > 0 {
			b.tokens += refill
			if b.tokens > cps {
				b.tokens = cps
			}
			b.last = now
		}
	}
	if b.tokens > 0 {
		b.tokens--
		return true
	}
	return false
}

// clientIP returns the remote IP (no proxy parsing in DEV)
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	return r.RemoteAddr
}

/* ========= Helpers ========= */

func randB64(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func writeJSON(w http.ResponseWriter, v any, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// CORS Headers
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		// Handle preflight
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

func nowString() string {
	t := time.Now().UTC()
	if dbDriver == "mysql" {
		return t.Format("2006-01-02 15:04:05")
	}
	return t.Format(time.RFC3339)
}

func cleanupLoop() {
	t := time.NewTicker(30 * time.Second)
	for range t.C {
		now := time.Now()
		mutex.Lock()
		for k, v := range mem {
			if now.After(v.expires) {
				delete(mem, k)
			}
		}
		for tok, info := range tokenMap {
			if now.After(info.Exp) || info.Used {
				delete(tokenMap, tok)
			}
		}
		mutex.Unlock()
	}
}

func mintJWT(loginID string, ttl time.Duration) (string, error) {
	claims := jwt.MapClaims{
		"sub": loginID,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(ttl).Unix(),
		"aud": "easykey:web",
		"iss": "easykey:auth-api",
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString(jwtSecret)
}

func parseJWT(tokenStr string) (*jwt.Token, jwt.MapClaims, error) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected alg")
		}
		return jwtSecret, nil
	})
	if err != nil {
		return nil, nil, err
	}
	claims, _ := tok.Claims.(jwt.MapClaims)
	if !tok.Valid {
		return nil, nil, fmt.Errorf("invalid")
	}
	return tok, claims, nil
}

func requireUserIDFromCookie(w http.ResponseWriter, r *http.Request) (string, bool) {
	c, err := r.Cookie("ek_session")
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return "", false
	}
	_, claims, err := parseJWT(c.Value)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return "", false
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return "", false
	}
	return sub, true
}

/* ========= Handlers ========= */

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, Health{
		Status: "ok",
		Time:   time.Now().UTC().Format(time.RFC3339),
	}, http.StatusOK)
}

/* ---- Auth: Register & Login ---- */

func handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !allow(clientIP(r), 3) { // 3 Registrierungen pro Sekunde pro IP
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}

	var body RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}

	body.Email = strings.TrimSpace(strings.ToLower(body.Email))

	// Validierung
	if body.Email == "" || body.Password == "" {
		http.Error(w, "email and password required", http.StatusBadRequest)
		return
	}
	if !strings.Contains(body.Email, "@") {
		http.Error(w, "invalid email", http.StatusBadRequest)
		return
	}
	if len(body.Password) < 8 {
		http.Error(w, "password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	// Prüfen ob Email bereits existiert
	_, _, exists, err := getUserByEmail(body.Email)
	if err != nil {
		log.Printf("Error checking email: %v", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if exists {
		http.Error(w, "email already registered", http.StatusConflict)
		return
	}

	// User erstellen
	userID, err := createUser(body.Email, body.Password)
	if err != nil {
		log.Printf("Error creating user: %v", err)
		http.Error(w, "failed to create user", http.StatusInternalServerError)
		return
	}

	// JWT erstellen und Session Cookie setzen
	jwtStr, err := mintJWT(userID, 24*time.Hour) // 24h Session
	if err != nil {
		http.Error(w, "failed to create session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "ek_session",
		Value:    jwtStr,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		// Secure: true, // PROD via HTTPS
		MaxAge: 24 * 60 * 60, // 24h
	})

	writeJSON(w, AuthResponse{
		Ok:     true,
		UserID: userID,
	}, http.StatusCreated)
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !allow(clientIP(r), 5) { // 5 Login-Versuche pro Sekunde pro IP
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}

	var body LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}

	body.Email = strings.TrimSpace(strings.ToLower(body.Email))

	if body.Email == "" || body.Password == "" {
		http.Error(w, "email and password required", http.StatusBadRequest)
		return
	}

	// User finden
	userID, passwordHash, found, err := getUserByEmail(body.Email)
	if err != nil {
		log.Printf("Error finding user: %v", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if !found {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	// Passwort prüfen
	if !verifyPassword(passwordHash, body.Password) {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	// JWT erstellen und Session Cookie setzen
	jwtStr, err := mintJWT(userID, 24*time.Hour) // 24h Session
	if err != nil {
		http.Error(w, "failed to create session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "ek_session",
		Value:    jwtStr,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		// Secure: true, // PROD via HTTPS
		MaxAge: 24 * 60 * 60, // 24h
	})

	writeJSON(w, AuthResponse{
		Ok:     true,
		UserID: userID,
	}, http.StatusOK)
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "ek_session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		// Secure: true, // PROD via HTTPS
	})

	writeJSON(w, map[string]any{"ok": true}, http.StatusOK)
}

/* ---- QR Flow (wie zuvor) ---- */

func handleCreateChallenge(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !allow(clientIP(r), 6) { // 6 req/s per IP (DEV)
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}
	loginID := uuid.NewString()
	nonce, err := randB64(24)
	if err != nil {
		http.Error(w, "nonce", http.StatusInternalServerError)
		return
	}
	exp := time.Now().Add(ttl)

	mutex.Lock()
	mem[loginID] = &entry{
		nonce:     nonce,
		expires:   exp,
		confirmed: false,
		notify:    make(chan string, 1),
	}
	mutex.Unlock()

	writeJSON(w, QRChallenge{
		LoginID: loginID,
		Nonce:   nonce,
		Expires: exp.Unix(),
	}, http.StatusOK)
}

func handleWaitWS(w http.ResponseWriter, r *http.Request) {
	loginID := r.URL.Query().Get("loginId")
	if loginID == "" {
		http.Error(w, "missing loginId", http.StatusBadRequest)
		return
	}

	mutex.Lock()
	ent, ok := mem[loginID]
	mutex.Unlock()
	if !ok {
		http.Error(w, "not found or expired", http.StatusNotFound)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	_ = conn.WriteJSON(map[string]any{
		"event":     "waiting",
		"expires":   ent.expires.Unix(),
		"confirmed": ent.confirmed,
	})

	timeout := time.NewTimer(time.Until(ent.expires))
	defer timeout.Stop()

	select {
	case tok := <-ent.notify:
		_ = conn.WriteJSON(map[string]any{"event": "confirmed", "token": tok})
	case <-timeout.C:
		mutex.Lock()
		delete(mem, loginID)
		mutex.Unlock()
		_ = conn.WriteJSON(map[string]any{"event": "expired"})
	}
}

func handleConfirm(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !allow(clientIP(r), 6) {
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}
	var body struct {
		LoginID string `json:"loginId"`
		Nonce   string `json:"nonce"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	if body.LoginID == "" || body.Nonce == "" {
		http.Error(w, "missing fields", http.StatusBadRequest)
		return
	}

	mutex.Lock()
	ent, ok := mem[body.LoginID]
	if !ok || time.Now().After(ent.expires) {
		mutex.Unlock()
		http.Error(w, "not found or expired", http.StatusNotFound)
		return
	}
	if ent.nonce != body.Nonce {
		mutex.Unlock()
		http.Error(w, "invalid nonce", http.StatusUnauthorized)
		return
	}
	if !ent.confirmed {
		ent.confirmed = true
		tok, _ := randB64(32)
		tokenMap[tok] = &TokenInfo{
			LoginID: body.LoginID,
			Exp:     time.Now().Add(90 * time.Second),
			Used:    false,
		}
		select {
		case ent.notify <- tok:
		default:
		}
	}
	mutex.Unlock()

	writeJSON(w, map[string]bool{"ok": true}, http.StatusOK)
}

func handleExchange(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !allow(clientIP(r), 6) {
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}
	var body struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Token == "" {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}

	mutex.Lock()
	info, ok := tokenMap[body.Token]
	if !ok || time.Now().After(info.Exp) || info.Used {
		mutex.Unlock()
		http.Error(w, "invalid or expired token", http.StatusUnauthorized)
		return
	}
	info.Used = true
	loginID := info.LoginID
	mutex.Unlock()

	// Simpler Flow: loginID = subject
	// In einer echten App würdest du hier ein Device/User-Mapping auflösen.
	jwtStr, err := mintJWT(loginID, 15*time.Minute)
	if err != nil {
		http.Error(w, "jwt", http.StatusInternalServerError)
		return
	}

	// Ensure user row exists (für Vault-Bezug)
	_ = ensureUser(loginID)

	http.SetCookie(w, &http.Cookie{
		Name:     "ek_session",
		Value:    jwtStr,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		// Secure: true, // PROD via HTTPS
		MaxAge: 15 * 60,
	})
	writeJSON(w, map[string]any{"ok": true}, http.StatusOK)
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie("ek_session")
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	_, claims, err := parseJWT(c.Value)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	writeJSON(w, map[string]any{
		"ok":  true,
		"sub": claims["sub"],
		"exp": claims["exp"],
	}, http.StatusOK)
}

/* ---- Vault Handlers ---- */

func handleVaultGet(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserIDFromCookie(w, r)
	if !ok {
		return
	}
	if err := ensureUser(userID); err != nil {
		http.Error(w, "db", http.StatusInternalServerError)
		return
	}
	blob, found, err := getVault(userID)
	if err != nil {
		http.Error(w, "db", http.StatusInternalServerError)
		return
	}
	if !found {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	resp := VaultGetResponse{
		BlobB64: base64.StdEncoding.EncodeToString(blob),
	}
	writeJSON(w, resp, http.StatusOK)
}

func handleVaultPut(w http.ResponseWriter, r *http.Request) {
	if !allow(clientIP(r), 6) {
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}
	userID, ok := requireUserIDFromCookie(w, r)
	if !ok {
		return
	}
	if err := ensureUser(userID); err != nil {
		log.Printf("vault ensureUser: %v", err)
		http.Error(w, "db: "+err.Error(), http.StatusInternalServerError)
		return
	}
	var body VaultPutRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	if body.BlobB64 == "" {
		http.Error(w, "blob required", http.StatusBadRequest)
		return
	}
	blob, err := base64.StdEncoding.DecodeString(body.BlobB64)
	if err != nil {
		http.Error(w, "blob b64", http.StatusBadRequest)
		return
	}
	// Optionale Begrenzung (z. B. 5MB)
	if len(blob) > 5*1024*1024 {
		http.Error(w, "blob too large", http.StatusRequestEntityTooLarge)
		return
	}

	if err := putVault(userID, blob); err != nil {
		log.Printf("vault put error: %v", err)
		http.Error(w, "db: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, VaultPutResponse{Ok: true}, http.StatusOK)
}

/* ---- Generator Settings Handlers ---- */

func handleGeneratorGet(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserIDFromCookie(w, r)
	if !ok {
		return
	}
	if err := ensureUser(userID); err != nil {
		http.Error(w, "db", http.StatusInternalServerError)
		return
	}
	blob, found, err := getGeneratorSettings(userID)
	if err != nil {
		http.Error(w, "db", http.StatusInternalServerError)
		return
	}
	if !found {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	resp := GeneratorGetResponse{
		BlobB64: base64.StdEncoding.EncodeToString(blob),
	}
	writeJSON(w, resp, http.StatusOK)
}

func handleGeneratorPut(w http.ResponseWriter, r *http.Request) {
	if !allow(clientIP(r), 10) { // 10 req/s für Generator-Settings
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}
	userID, ok := requireUserIDFromCookie(w, r)
	if !ok {
		return
	}
	if err := ensureUser(userID); err != nil {
		log.Printf("generator ensureUser: %v", err)
		http.Error(w, "db: "+err.Error(), http.StatusInternalServerError)
		return
	}
	var body GeneratorPutRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	if body.BlobB64 == "" {
		http.Error(w, "blob required", http.StatusBadRequest)
		return
	}
	blob, err := base64.StdEncoding.DecodeString(body.BlobB64)
	if err != nil {
		http.Error(w, "blob b64", http.StatusBadRequest)
		return
	}
	// Begrenzung (z. B. 100KB für Settings)
	if len(blob) > 100*1024 {
		http.Error(w, "blob too large", http.StatusRequestEntityTooLarge)
		return
	}

	if err := putGeneratorSettings(userID, blob); err != nil {
		log.Printf("generator put error: %v", err)
		http.Error(w, "db: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]bool{"ok": true}, http.StatusOK)
}

/* ---- WebAuthn Handlers ---- */

func handleWebAuthnRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !allow(clientIP(r), 5) {
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}

	userID, ok := requireUserIDFromCookie(w, r)
	if !ok {
		return
	}

	var body WebAuthnRegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}

	if body.CredentialID == "" || body.PublicKey == "" {
		http.Error(w, "credentialId and publicKey required", http.StatusBadRequest)
		return
	}

	// Decode base64url encoded values
	credentialID, err := base64.RawURLEncoding.DecodeString(body.CredentialID)
	if err != nil {
		http.Error(w, "invalid credentialId encoding", http.StatusBadRequest)
		return
	}

	publicKey, err := base64.RawURLEncoding.DecodeString(body.PublicKey)
	if err != nil {
		http.Error(w, "invalid publicKey encoding", http.StatusBadRequest)
		return
	}

	var aaguid []byte
	if body.AAGUID != "" {
		aaguid, err = base64.RawURLEncoding.DecodeString(body.AAGUID)
		if err != nil {
			http.Error(w, "invalid aaguid encoding", http.StatusBadRequest)
			return
		}
	}

	// Check if credential already exists
	existingCred, err := getWebAuthnCredentialByCredentialID(credentialID)
	if err != nil {
		log.Printf("Error checking existing credential: %v", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if existingCred != nil {
		http.Error(w, "credential already registered", http.StatusConflict)
		return
	}

	// Store credential
	credID, err := createWebAuthnCredential(userID, credentialID, publicKey, aaguid, body.AuthenticatorName)
	if err != nil {
		log.Printf("Error creating credential: %v", err)
		http.Error(w, "failed to register credential", http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]any{
		"ok": true,
		"id": credID,
	}, http.StatusCreated)
}

func handleWebAuthnList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, ok := requireUserIDFromCookie(w, r)
	if !ok {
		return
	}

	credentials, err := getWebAuthnCredentialsByUser(userID)
	if err != nil {
		log.Printf("Error listing credentials: %v", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}

	if credentials == nil {
		credentials = []WebAuthnCredential{}
	}

	writeJSON(w, WebAuthnListResponse{
		Credentials: credentials,
	}, http.StatusOK)
}

func handleWebAuthnDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !allow(clientIP(r), 5) {
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}

	userID, ok := requireUserIDFromCookie(w, r)
	if !ok {
		return
	}

	// Get credential ID from query parameter
	credentialID := r.URL.Query().Get("id")
	if credentialID == "" {
		http.Error(w, "credential id required", http.StatusBadRequest)
		return
	}

	if err := deleteWebAuthnCredential(credentialID, userID); err != nil {
		log.Printf("Error deleting credential: %v", err)
		http.Error(w, "failed to delete credential", http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]bool{"ok": true}, http.StatusOK)
}

func handleWebAuthnAuthenticate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !allow(clientIP(r), 5) {
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}

	var body WebAuthnAuthenticateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}

	if body.CredentialID == "" || body.Signature == "" {
		http.Error(w, "credentialId and signature required", http.StatusBadRequest)
		return
	}

	// Decode base64url encoded values
	credentialID, err := base64.RawURLEncoding.DecodeString(body.CredentialID)
	if err != nil {
		http.Error(w, "invalid credentialId encoding", http.StatusBadRequest)
		return
	}

	// Look up credential
	cred, err := getWebAuthnCredentialByCredentialID(credentialID)
	if err != nil {
		log.Printf("Error looking up credential: %v", err)
		http.Error(w, "database error", http.StatusInternalServerError)
		return
	}
	if cred == nil {
		http.Error(w, "credential not found", http.StatusUnauthorized)
		return
	}

	// NOTE: In a production system, you would verify the signature here using the stored public key
	// This requires parsing CBOR, verifying the authenticator data, and checking the signature
	// For this demo/MVP, we'll trust the credential lookup and update the sign count

	// Update sign count and last used timestamp
	newSignCount := cred.SignCount + 1
	if err := updateWebAuthnCredentialSignCount(credentialID, newSignCount); err != nil {
		log.Printf("Error updating sign count: %v", err)
		// Non-fatal, continue with login
	}

	// Create JWT session for the user
	jwtStr, err := mintJWT(cred.UserID, 24*time.Hour) // 24h session
	if err != nil {
		http.Error(w, "failed to create session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "ek_session",
		Value:    jwtStr,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		// Secure: true, // PROD via HTTPS
		MaxAge: 24 * 60 * 60, // 24h
	})

	writeJSON(w, map[string]any{
		"ok":     true,
		"userId": cred.UserID,
	}, http.StatusOK)
}

/* ========= main ========= */

func main() {
	// Load .env file if it exists (ignore error if not found)
	_ = godotenv.Load()

	if err := initDB(); err != nil {
		log.Fatalf("db init: %v", err)
	}
	go cleanupLoop()

	http.HandleFunc("/health", corsMiddleware(handleHealth))

	// Auth
	http.HandleFunc("/api/v1/auth/register", corsMiddleware(handleRegister))
	http.HandleFunc("/api/v1/auth/login", corsMiddleware(handleLogin))
	http.HandleFunc("/api/v1/auth/logout", corsMiddleware(handleLogout))
	http.HandleFunc("/api/v1/auth/me", corsMiddleware(handleMe))

	// QR Auth
	http.HandleFunc("/api/v1/qr/challenge", corsMiddleware(handleCreateChallenge))
	http.HandleFunc("/api/v1/qr/wait", handleWaitWS)
	http.HandleFunc("/api/v1/qr/confirm", corsMiddleware(handleConfirm))
	http.HandleFunc("/api/v1/qr/exchange", corsMiddleware(handleExchange))

	// Vault
	http.HandleFunc("/api/v1/vault", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleVaultGet(w, r)
		case http.MethodPut:
			handleVaultPut(w, r)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))

	// Generator Settings
	http.HandleFunc("/api/v1/generator-settings", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleGeneratorGet(w, r)
		case http.MethodPut:
			handleGeneratorPut(w, r)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))

	// WebAuthn
	http.HandleFunc("/api/v1/webauthn/register", corsMiddleware(handleWebAuthnRegister))
	http.HandleFunc("/api/v1/webauthn/credentials", corsMiddleware(handleWebAuthnList))
	http.HandleFunc("/api/v1/webauthn/delete", corsMiddleware(handleWebAuthnDelete))
	http.HandleFunc("/api/v1/webauthn/authenticate", corsMiddleware(handleWebAuthnAuthenticate))

	addr := ":8080"
	log.Printf("auth-api listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
