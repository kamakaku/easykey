# 🔐 EasyKey - Zero-Knowledge Password Manager

Ein moderner Password Manager mit QR-Code Login und verschlüsseltem Vault.

## 🚀 Quick Start

### Voraussetzungen

- **Go 1.22+** (für Backend)
- **Node.js 18+** und **pnpm** (für Frontend)

### Schnellstart (SQLite - Empfohlen für Entwicklung)

```bash
# In einem Terminal:
./start-dev.sh
```

Das war's! Die Anwendung läuft jetzt auf:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:8080

### Stoppen

```bash
./stop-dev.sh
```

## 📚 Dokumentation

- **[Backend Setup](services/auth-api/README.md)** - Detaillierte Backend-Dokumentation
- **[Setup Status](services/auth-api/SETUP_STATUS.md)** - Aktueller Status und nächste Schritte
- **[.env Beispiel](services/auth-api/.env.example)** - Konfigurationstemplate

## 🏗️ Projektstruktur

```
easykey/
├── apps/
│   ├── web/              # Next.js Frontend
│   │   ├── app/
│   │   │   ├── components/    # UI-Komponenten
│   │   │   ├── dashboard/     # Dashboard-Seite
│   │   │   ├── vault/         # Vault-Manager
│   │   │   ├── generator/     # Passwort-Generator
│   │   │   └── qr/            # QR-Login
│   │   └── lib/               # Crypto & Utils
│   └── extension/        # Browser-Extension (geplant)
│
├── services/
│   └── auth-api/         # Go Backend API
│       ├── main.go       # Server-Code
│       ├── schema.sql    # MySQL-Schema
│       ├── .env          # MySQL-Konfiguration
│       └── .env.example  # Konfig-Template
│
├── start-dev.sh          # Start-Script
└── stop-dev.sh           # Stop-Script
```

## ✨ Features

### Backend (Go + SQLite/MySQL)
- ✅ QR-Code basierte Authentifizierung mit WebSocket
- ✅ Zero-Knowledge Vault (Server sieht niemals Plaintext)
- ✅ Session Management mit JWT
- ✅ SQLite für Entwicklung, MySQL für Production
- ✅ Optimistic Locking für Vault-Updates
- ✅ Rate Limiting
- ✅ Automatisches Schema-Setup

### Frontend (Next.js 14 + TypeScript)
- ✅ Modernes, professionelles UI (Indigo/Slate Design)
- ✅ Vault-Manager mit CRUD-Operationen
- ✅ Passwort-Generator mit Stärke-Anzeige
- ✅ QR-Login mit WebSocket
- ✅ Client-seitige Verschlüsselung (XChaCha20-Poly1305)
- ✅ Passwort-basierte Schlüsselableitung (Argon2id)
- ✅ Responsive Design mit Tailwind CSS v4

## 🔐 Sicherheit

### Zero-Knowledge Architektur
- **Client-seitige Verschlüsselung**: Alle Passwörter werden im Browser verschlüsselt
- **Server-Side Blindness**: Der Server sieht nur verschlüsselte Blobs
- **Argon2id**: Sichere Passwort-basierte Schlüsselableitung
- **XChaCha20-Poly1305**: Authentifizierte Verschlüsselung (AEAD)

## 🗄️ Datenbank

### Entwicklung (Standard)
**SQLite** - Automatisch, keine Konfiguration nötig!

```bash
# Einfach starten:
cd services/auth-api
go run main.go
# → Erstellt automatisch easykey.db
```

### Production (All-Inkl MySQL)

**Aktueller Status:**
- ✅ Backend ist MySQL-ready
- ✅ Konfiguration in `.env` gesetzt
- ⚠️ IP-Adresse muss im All-Inkl KAS freigegeben werden

**Nächste Schritte:**
Siehe [Setup Status](services/auth-api/SETUP_STATUS.md) für detaillierte Anweisungen.

## 🚢 Deployment

### Backend auf All-Inkl

```bash
cd services/auth-api
GOOS=linux GOARCH=amd64 go build -o auth-api main.go
# Upload via FTP/SFTP und auf Server starten
```

### Frontend

```bash
cd apps/web
pnpm build
# Upload .next/ Ordner
```

## 📋 Was wurde gemacht

### Backend
- ✅ MySQL-Support hinzugefügt (zusätzlich zu SQLite)
- ✅ Automatisches .env-Loading mit godotenv
- ✅ MySQL-Schema erstellt
- ✅ All-Inkl Konfiguration eingerichtet
- ✅ Ausführliche Dokumentation geschrieben

### Frontend
- ✅ Komplettes UI-Redesign (modern & professionell)
- ✅ Design System mit CSS Variables
- ✅ Wiederverwendbare UI-Komponenten
- ✅ Vault-Manager mit CRUD-Funktionen
- ✅ Passwort-Generator mit Stärke-Anzeige
- ✅ QR-Login UI
- ✅ Dashboard mit Statistiken
- ✅ Tailwind CSS v4 Migration

## 📝 Nächste Schritte

1. **IP-Adresse freigeben** im All-Inkl KAS für MySQL-Zugriff
2. **Frontend & Backend testen** mit `./start-dev.sh`
3. **JWT Secret ändern** für Production
4. **Production Deployment** wenn bereit

## 🏁 Status

**✅ Bereit für lokale Entwicklung!**

Alles funktioniert mit SQLite. Für MySQL-Verbindung zu All-Inkl muss nur noch die IP-Adresse im KAS freigegeben werden.

---

Weitere Details: [Setup Status](services/auth-api/SETUP_STATUS.md)
