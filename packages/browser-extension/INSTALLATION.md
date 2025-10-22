# EasyKey Browser Extension - Installation

## Build-Status

Die Browser-Extension wurde erfolgreich erstellt und ist bereit zur Installation.

## Verzeichnisstruktur

```
packages/browser-extension/
├── dist/                    # Build-Output (bereit zur Installation)
│   ├── manifest.json       # Extension Manifest V3
│   ├── popup.html          # Popup UI
│   ├── background.js       # Service Worker
│   ├── content.js          # Content Script
│   ├── popup.js            # Popup Logik
│   └── icons/              # Extension Icons
│       ├── icon16.svg
│       ├── icon32.svg
│       ├── icon48.svg
│       └── icon128.svg
└── src/                    # Quellcode
```

## Installation in Chrome/Edge

### Entwicklungsmodus

1. Öffne Chrome/Edge und navigiere zu:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`

2. Aktiviere den **Entwicklermodus** (Toggle oben rechts)

3. Klicke auf **"Entpackte Erweiterung laden"**

4. Wähle das Verzeichnis:
   ```
   /Users/kamakaku/_easykey/_anwendung/packages/browser-extension/dist
   ```

5. Die Extension sollte jetzt installiert sein und das EasyKey-Icon in der Toolbar anzeigen

## Features

### Background Service Worker (`background.js`)
- Vault-Verwaltung (Laden, Entschlüsseln, Speichern)
- Master-Key Verwaltung mit PBKDF2
- Credential Suggestions für neue Login-Daten
- Automatisches Ausfüllen von Formularen
- Session-basierte Key-Speicherung
- Badge-Updates für neue Vorschläge

### Content Script (`content.js`)
- Automatische Erkennung von Login-Formularen
- Extraktion von Credentials beim Submit
- Autofill-Funktionalität für gespeicherte Credentials

### Popup UI (`popup.html` + `popup.js`)
- Master-Passwort Entsperrung
- Vault-Anzeige mit allen Einträgen
- Credential Suggestions Management
- Autofill und Copy-Buttons
- Session-Key Wiederherstellung

### Verschlüsselung (`crypto.ts`)
- **PBKDF2** mit SHA-256 (100.000 Iterationen)
- **AES-GCM** (256-bit) für Verschlüsselung
- Key Import/Export
- Legacy-Blob Support

## Verwendung

### 1. Extension entsperren
- Klicke auf das EasyKey-Icon in der Toolbar
- Gib dein Master-Passwort ein
- Die Extension entsperrt sich und lädt den Vault

### 2. Autofill verwenden
- Navigiere zu einer Login-Seite
- Die Extension erkennt automatisch Login-Formulare
- Falls ein Eintrag im Vault vorhanden ist, werden die Felder automatisch ausgefüllt

### 3. Neue Credentials speichern
- Melde dich auf einer neuen Website an
- Die Extension erkennt das Submit und schlägt vor, die Credentials zu speichern
- Öffne das Popup und klicke auf "Speichern" beim entsprechenden Vorschlag

### 4. Manuelles Ausfüllen
- Öffne das Popup
- Navigiere zu "Vault"
- Klicke auf "Autofill" beim gewünschten Eintrag

## Backend-Konfiguration

Die Extension verbindet sich standardmäßig mit:
```
http://localhost:3000/backend/api/v1/
```

Dies kann in `src/popup/index.ts` angepasst werden (Zeile 207):
```typescript
const baseUrl = 'http://localhost:3000/';
```

## Build-Befehle

### Development Build (mit Watch-Mode)
```bash
cd packages/browser-extension
pnpm dev
```

### Production Build
```bash
cd packages/browser-extension
pnpm build
```

### Type-Check
```bash
cd packages/browser-extension
pnpm typecheck
```

## API-Endpunkte

Die Extension kommuniziert mit folgenden Backend-Endpunkten:

- `GET /backend/api/v1/vault` - Vault laden
- `PUT /backend/api/v1/vault` - Vault speichern

## Sicherheitshinweise

- Das Master-Passwort wird niemals gespeichert
- Der abgeleitete Key wird nur in der Session gespeichert
- Alle Vault-Daten werden client-seitig verschlüsselt
- Der Server sieht nur verschlüsselte Blobs

## Troubleshooting

### Extension lädt nicht
- Stelle sicher, dass das `dist/` Verzeichnis vollständig ist
- Prüfe die Browser-Konsole auf Fehler
- Reload die Extension: Klicke auf das Reload-Icon in `chrome://extensions`

### Autofill funktioniert nicht
- Stelle sicher, dass die Extension entsperrt ist
- Prüfe, ob die URL im Vault-Eintrag korrekt ist
- Reload die Seite

### Backend-Verbindung fehlschlägt
- Stelle sicher, dass das Backend läuft (`./start-dev.sh`)
- Prüfe die Console auf CORS-Fehler
- Verifiziere die Backend-URL in der Extension

## Nächste Schritte

1. Backend starten: `./start-dev.sh`
2. Extension installieren (siehe oben)
3. Im Browser testen
4. Bei Bedarf: Production-Build für Veröffentlichung erstellen
