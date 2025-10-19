# EasyKey Auth API

Zero-Knowledge Password Manager Backend mit QR-Login und verschlüsseltem Vault.

## Features

- 🔐 QR-Code basierte Authentifizierung mit WebSocket
- 🔒 Zero-Knowledge Vault (client-seitige Verschlüsselung)
- 📱 Session Management mit JWT
- 🗄️ Unterstützt SQLite (lokal) und MySQL/MariaDB (Production)
- ⚡ Rate Limiting
- 🔄 Optimistic Locking für Vault-Updates

## Lokale Entwicklung

### Voraussetzungen

- Go 1.22+
- SQLite (automatisch)

### Installation

```bash
cd services/auth-api

# Dependencies installieren
go mod download

# Starten
go run main.go
```

Der Server läuft dann auf `http://localhost:8080`.

## Production Deployment mit All-Inkl

### 1. MySQL-Datenbank bei All-Inkl erstellen

1. Logge dich in dein All-Inkl KAS (Kunden-Administrations-System) ein
2. Gehe zu **MySQL-Datenbanken**
3. Erstelle eine neue Datenbank:
   - Datenbankname: z.B. `easykey_db`
   - Benutzername: z.B. `easykey_user`
   - Passwort: Sicheres Passwort generieren
4. Notiere dir die Zugangsdaten:
   - **Host**: z.B. `mysqlXXX.kasserver.com`
   - **Port**: `3306` (Standard)
   - **Datenbank**: `easykey_db`
   - **Benutzer**: `easykey_user`
   - **Passwort**: dein generiertes Passwort

### 2. Umgebungsvariablen konfigurieren

Erstelle eine `.env` Datei (oder setze die Variablen in deinem Hosting-Setup):

```bash
# MySQL-Konfiguration
DB_DRIVER=mysql
DB_DSN=easykey_user:dein_passwort@tcp(mysqlXXX.kasserver.com:3306)/easykey_db?charset=utf8mb4&parseTime=True&loc=Local

# JWT Secret (ändere dieses!)
JWT_SECRET=ein-sehr-sicherer-zufälliger-string-mindestens-32-zeichen-lang
```

**Wichtig:** Ersetze die Platzhalter mit deinen echten All-Inkl Zugangsdaten!

### 3. Schema erstellen

Das Schema wird automatisch beim ersten Start erstellt. Du kannst es auch manuell ausführen:

```bash
# Mit mysql CLI
mysql -h mysqlXXX.kasserver.com -u easykey_user -p easykey_db < schema.sql
```

### 4. Backend kompilieren und deployen

```bash
# Für Linux-Server kompilieren (falls du auf Mac/Windows entwickelst)
GOOS=linux GOARCH=amd64 go build -o auth-api main.go

# Auf Server hochladen (per FTP/SFTP)
# Dann auf dem Server:
chmod +x auth-api
./auth-api
```

### 5. Als Systemd Service einrichten (optional)

Erstelle `/etc/systemd/system/easykey-auth.service`:

```ini
[Unit]
Description=EasyKey Auth API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/pfad/zu/auth-api
EnvironmentFile=/pfad/zu/.env
ExecStart=/pfad/zu/auth-api
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Dann:

```bash
sudo systemctl daemon-reload
sudo systemctl enable easykey-auth
sudo systemctl start easykey-auth
sudo systemctl status easykey-auth
```

## Datenbank-Schema

### `users` Tabelle

| Feld       | Typ          | Beschreibung             |
|------------|--------------|--------------------------|
| id         | VARCHAR(36)  | User ID (UUID)          |
| created_at | DATETIME     | Erstellungszeitpunkt    |
| updated_at | DATETIME     | Letzte Änderung         |

### `vaults` Tabelle

| Feld       | Typ          | Beschreibung                          |
|------------|--------------|---------------------------------------|
| user_id    | VARCHAR(36)  | Foreign Key zu users(id)             |
| blob       | MEDIUMBLOB   | Verschlüsselte Vault-Daten (bis 16MB)|
| version    | INT          | Version für Optimistic Locking       |
| updated_at | DATETIME     | Letzte Änderung                      |

## API Endpoints

### Health Check

```
GET /health
```

Gibt Server-Status zurück.

### QR Authentication

```
POST /api/v1/qr/challenge
GET  /api/v1/qr/wait?loginId=xxx (WebSocket)
POST /api/v1/qr/confirm
POST /api/v1/qr/exchange
```

### Session

```
GET /api/v1/auth/me
```

Gibt aktuelle Session-Info zurück (benötigt Cookie).

### Vault

```
GET /api/v1/vault
PUT /api/v1/vault
```

Laden und Speichern des verschlüsselten Vaults (benötigt Cookie).

## Sicherheitshinweise

⚠️ **Wichtig für Production:**

1. **JWT_SECRET**: Verwende einen starken, zufälligen String (mindestens 32 Zeichen)
2. **HTTPS**: Setze `Secure: true` für Cookies (Zeile 525 in main.go aktivieren)
3. **Firewall**: Beschränke Datenbankzugriff auf deinen Server
4. **Backups**: Richte automatische MySQL-Backups ein
5. **Rate Limiting**: Passe die Limits in Production an
6. **Monitoring**: Überwache Logs und Datenbankverbindungen

## Troubleshooting

### Access Denied Fehler (Error 1045)

```
Error 1045 (28000): Access denied for user 'xxx'@'your.ip.address' (using password: YES)
```

**Problem:** All-Inkl erlaubt standardmäßig nur bestimmte IP-Adressen für externe MySQL-Verbindungen.

**Lösung:**
1. Logge dich in dein All-Inkl KAS ein
2. Gehe zu **MySQL-Datenbanken**
3. Wähle deine Datenbank aus
4. Unter **Externe Verbindungen** oder **IP-Freigabe**:
   - Füge deine aktuelle IP-Adresse hinzu (wird im Fehler angezeigt)
   - ODER aktiviere "Zugriff von überall" (weniger sicher)
5. Speichern und erneut versuchen

**Alternative für lokale Entwicklung:**
- Nutze SQLite für lokale Entwicklung (keine `.env` Datei = automatisch SQLite)
- MySQL nur für Production auf dem All-Inkl Server verwenden (mit `localhost` als Host)

### Verbindungsfehler zur MySQL-Datenbank

```
failed to ping database: dial tcp: i/o timeout
```

**Lösung:**
- Überprüfe die Firewall-Einstellungen bei All-Inkl
- Stelle sicher, dass deine Server-IP freigegeben ist
- Prüfe Host und Port in der DB_DSN

### "Table doesn't exist" Fehler

**Lösung:**
```bash
# Schema manuell ausführen
mysql -h mysqlXXX.kasserver.com -u easykey_user -p easykey_db < schema.sql
```

### Permission Denied

**Lösung:**
- Überprüfe Datenbankbenutzer-Rechte im All-Inkl KAS
- Der Benutzer benötigt: SELECT, INSERT, UPDATE, DELETE, CREATE

## Support

Bei Fragen oder Problemen:
- Überprüfe die Logs: `journalctl -u easykey-auth -f`
- All-Inkl Support: https://kas.all-inkl.com/
