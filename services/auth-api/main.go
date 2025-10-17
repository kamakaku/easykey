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
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
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

// Vault DTOs
type VaultGetResponse struct {
	Version int    `json:"version"`
	BlobB64 string `json:"blob"` // base64 (ciphertext vom Client)
}
type VaultPutRequest struct {
	Version int    `json:"version"` // erwartete Version (0 = neu)
	BlobB64 string `json:"blob"`    // base64 (ciphertext)
}
type VaultPutResponse struct {
	Ok         bool `json:"ok"`
	NewVersion int  `json:"newVersion"`
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

const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vaults(
  user_id  TEXT PRIMARY KEY,
  blob     BLOB NOT NULL,
  version  INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`

func initDB() error {
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = "file:easykey.db?_fk=1"
	}
	var err error
	db, err = sql.Open("sqlite3", dsn)
	if err != nil {
		return err
	}
	if _, err = db.Exec(schema); err != nil {
		return err
	}
	return db.Ping()
}

// ensureUser: legt User an, wenn nicht vorhanden
func ensureUser(id string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.Exec(`
		INSERT INTO users(id, created_at, updated_at)
		VALUES(?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at
	`, id, now, now)
	return err
}

// getVault: liest Vault; ok=false, wenn nicht vorhanden
func getVault(userID string) (version int, blob []byte, updated time.Time, ok bool, err error) {
	row := db.QueryRow(`SELECT version, blob, updated_at FROM vaults WHERE user_id=?`, userID)
	var updatedStr string
	err = row.Scan(&version, &blob, &updatedStr)
	if err == sql.ErrNoRows {
		return 0, nil, time.Time{}, false, nil
	}
	if err != nil {
		return 0, nil, time.Time{}, false, err
	}
	t, _ := time.Parse(time.RFC3339, updatedStr)
	return version, blob, t, true, nil
}

// putVault: optimistisches Locking via Version
// - existiert nicht  && expectVersion==0  => INSERT version=1
// - existiert       && expectVersion==cur => UPDATE version=cur+1 (WHERE version=?)
// - sonst 409
func putVault(userID string, expectVersion int, blob []byte) (newVersion int, err error, conflictCur int) {
	now := time.Now().UTC().Format(time.RFC3339)

	// Versuchen: UPDATE, wenn vorhanden
	res, err := db.Exec(`
		UPDATE vaults
		SET blob=?, version=version+1, updated_at=?
		WHERE user_id=? AND version=?`,
		blob, now, userID, expectVersion,
	)
	if err != nil {
		return 0, err, 0
	}
	aff, _ := res.RowsAffected()
	if aff == 1 {
		// neue Version abfragen
		row := db.QueryRow(`SELECT version FROM vaults WHERE user_id=?`, userID)
		var v int
		if e := row.Scan(&v); e != nil {
			return 0, e, 0
		}
		return v, nil, 0
	}

	// Wenn kein Update – prüfen, ob Datensatz existiert
	row := db.QueryRow(`SELECT version FROM vaults WHERE user_id=?`, userID)
	var cur int
	switch e := row.Scan(&cur); e {
	case sql.ErrNoRows:
		// neu anlegen nur erlaubt, wenn expectVersion==0
		if expectVersion != 0 {
			return 0, fmt.Errorf("conflict"), 0
		}
		_, err = db.Exec(`
			INSERT INTO vaults(user_id, blob, version, updated_at)
			VALUES(?, ?, 1, ?)`,
			userID, blob, now,
		)
		if err != nil {
			return 0, err, 0
		}
		return 1, nil, 0
	case nil:
		// existiert, aber Version passt nicht => Konflikt
		return 0, fmt.Errorf("conflict"), cur
	default:
		return 0, e, 0
	}
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
	ver, blob, _, found, err := getVault(userID)
	if err != nil {
		http.Error(w, "db", http.StatusInternalServerError)
		return
	}
	if !found {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	resp := VaultGetResponse{
		Version: ver,
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
		http.Error(w, "db", http.StatusInternalServerError)
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

	newV, err2, cur := putVault(userID, body.Version, blob)
	if err2 != nil {
		if err2.Error() == "conflict" {
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":          "version_conflict",
				"currentVersion": cur,
			})
			return
		}
		http.Error(w, "db", http.StatusInternalServerError)
		return
	}

	writeJSON(w, VaultPutResponse{Ok: true, NewVersion: newV}, http.StatusOK)
}

/* ========= main ========= */

func main() {
	if err := initDB(); err != nil {
		log.Fatalf("db init: %v", err)
	}
	go cleanupLoop()

	http.HandleFunc("/health", handleHealth)

	// QR Auth
	http.HandleFunc("/api/v1/qr/challenge", handleCreateChallenge)
	http.HandleFunc("/api/v1/qr/wait", handleWaitWS)
	http.HandleFunc("/api/v1/qr/confirm", handleConfirm)
	http.HandleFunc("/api/v1/qr/exchange", handleExchange)
	http.HandleFunc("/api/v1/auth/me", handleMe)

	// Vault
	http.HandleFunc("/api/v1/vault", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleVaultGet(w, r)
		case http.MethodPut:
			handleVaultPut(w, r)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})

	addr := ":8080"
	log.Printf("auth-api listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
