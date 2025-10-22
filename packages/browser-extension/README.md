# @easykey/browser-extension

Browser-Erweiterung für EasyKey mit automatischer Login-Erkennung und Credential-Management.

## Features

### 🎯 Automatische Login-Erkennung
Die Extension erkennt automatisch, wenn du dich auf einer Website anmeldest:
- **Intelligente Fehler-Erkennung**: Speichert nur bei erfolgreichen Logins
- **Dual-Notification-System**: Browser-Notification + On-Page-Benachrichtigung
- **Direkt-Speicherung**: Kann aus der Notification heraus speichern

### 🔐 Sicherheit
- Client-seitige Verschlüsselung (AES-GCM 256-bit)
- PBKDF2 Key-Derivation (100.000 Iterationen)
- Zero-Knowledge Architektur
- Session-basierte Key-Speicherung

### ⚡ Autofill
- Automatisches Ausfüllen von Login-Formularen
- Intelligente Origin-Matching
- Manuelles Ausfüllen über Popup

## Installation

Siehe [INSTALLATION.md](./INSTALLATION.md) für detaillierte Installations-Anweisungen.

### Quick Start

1. **Build:**
   ```bash
   cd packages/browser-extension
   pnpm build
   ```

2. **In Browser laden:**
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Aktiviere "Entwicklermodus"
   - Klicke "Entpackte Erweiterung laden"
   - Wähle `packages/browser-extension/dist/`

## Development

```bash
pnpm install
pnpm --filter @easykey/browser-extension dev
```

Der Watch-Build legt die gebündelten Assets in `dist/`. Diese können in Chrome/Edge über `chrome://extensions` → „Entpackte Erweiterung laden" eingebunden werden.

## Neue Features (v0.2.0)

### Browser-Notifications
- Erscheint als System-Notification
- **Action-Buttons**: "Speichern" oder "Ignorieren"
- Funktioniert auch wenn Browser im Hintergrund ist
- `requireInteraction: true` - bleibt sichtbar bis du reagierst

### Inline-Notifications
- Erscheint direkt auf der Webseite (oben rechts)
- Modernes Design mit Slide-in Animation
- **Action-Buttons**: "Popup öffnen" oder "Später"
- Auto-Dismiss nach 10 Sekunden

### Login-Erfolgs-Erkennung
- Wartet 1,5s nach Form-Submit
- Prüft auf Error-Messages (deutsch & englisch)
- Speichert nur bei erfolgreichen Logins

## Dokumentation

- **[FEATURES.md](./FEATURES.md)** - Detaillierte Feature-Dokumentation
- **[INSTALLATION.md](./INSTALLATION.md)** - Installations-Anleitung
- **[API-Dokumentation](../../docs/browser-extension-api.md)** - API-Referenz

## Verwendung

### 1. Login-Erkennung
Die Extension erkennt automatisch Logins und zeigt zwei Notifications:

**Browser-Notification (System):**
```
┌─────────────────────────────────────┐
│ 🔐 EasyKey - Anmeldedaten speichern?│
│ Möchtest du die Anmeldedaten für    │
│ github.com speichern?               │
│                                     │
│ [Speichern]  [Ignorieren]          │
└─────────────────────────────────────┘
```

**Inline-Notification (On-Page):**
```
┌─────────────────────────────────────┐
│ 🔐 EasyKey - Anmeldedaten erkannt   │
│ Möchtest du diese Anmeldedaten      │
│ speichern?                          │
│                                     │
│ [Popup öffnen]  [Später]           │
└─────────────────────────────────────┘
```

### 2. Direkt-Speicherung
Klicke auf "Speichern" in der Browser-Notification:
- **Entsperrt** → Speichert direkt in den Vault
- **Locked** → Zeigt "Entsperren erforderlich"-Nachricht

### 3. Popup-Management
Öffne das Extension-Popup für:
- Vault entsperren
- Gespeicherte Credentials anzeigen
- Suggestions verwalten
- Autofill & Copy-Funktionen

## Build

```bash
pnpm --filter @easykey/browser-extension build
```

Der Build-Kommando:
- Kompiliert TypeScript mit `tsup`
- Kopiert `manifest.json` → `dist/`
- Kopiert `popup.html` → `dist/`
- Kopiert Icons → `dist/icons/`

## Technischer Stack

- **TypeScript** - Type-safe code
- **tsup** - Fast TypeScript bundler
- **Chrome Extension Manifest V3**
- **Web Crypto API** - Verschlüsselung
- **Chrome Storage API** - Session-Speicherung
- **Chrome Notifications API** - Browser-Notifications

## Permissions

```json
{
  "permissions": [
    "storage",        // Session & Local Storage
    "activeTab",      // Current Tab Access
    "scripting",      // Content Script Injection
    "notifications"   // Browser-Notifications
  ],
  "host_permissions": [
    "https://*/",     // All HTTPS sites
    "http://*/"       // All HTTP sites (dev)
  ]
}
```

## Architecture

```
src/
├── background.ts         # Service Worker
│   ├── Vault-Management
│   ├── Notification-Handler
│   └── Credential-Suggestions
│
├── content.ts           # Content Script
│   ├── Form-Submit-Detection
│   ├── Login-Success-Check
│   ├── Inline-Notifications
│   └── Autofill
│
├── crypto.ts            # Verschlüsselung
│   ├── PBKDF2
│   ├── AES-GCM
│   └── Key Import/Export
│
├── popup/
│   ├── index.html       # Popup UI
│   └── index.ts         # Popup Logic
│
└── manifest.json        # Extension Manifest
```

## Testing

### Test Login-Erkennung

1. Gehe zu einer Login-Seite (z.B. github.com/login)
2. Gib **falsche** Credentials ein
   → Sollte **keine** Notification zeigen
3. Gib **richtige** Credentials ein
   → Sollte **beide** Notifications zeigen

### Test Browser-Notification

1. Klicke "Speichern"
   - Entsperrt → Zeigt "Gespeichert"-Nachricht
   - Locked → Zeigt "Entsperren erforderlich"
2. Klicke "Ignorieren"
   → Entfernt Suggestion

### Test Inline-Notification

1. Klicke "Popup öffnen"
   → Öffnet Extension-Popup
2. Klicke "Später"
   → Schließt Notification
3. Warte 10s
   → Auto-Dismiss

## Troubleshooting

### Extension lädt nicht
```bash
# Rebuild
cd packages/browser-extension
pnpm build

# Reload in chrome://extensions
```

### Notifications erscheinen nicht
1. Prüfe Manifest: `"notifications"` in permissions
2. Prüfe Browser-Einstellungen: Notifications erlaubt
3. Prüfe Console auf Errors

### Login-Erkennung funktioniert nicht
1. Warte 1,5s nach Submit
2. Prüfe auf Error-Messages (könnte Login blockieren)
3. Prüfe Console: `[EasyKey]` Logs

## Bekannte Limitierungen

- **1,5s Delay**: Kann bei sehr schnellen Redirects zu spät sein
- **Error-Erkennung**: Nicht 100% zuverlässig bei ungewöhnlichen Error-Designs
- **AJAX-Logins**: SPAs mit AJAX-basierten Logins werden möglicherweise nicht erkannt
- **Popup öffnen**: Funktioniert nur mit User-Interaction

## Roadmap

- [ ] WebSocket-basierte Login-Erkennung für SPAs
- [ ] ML-basierte Error-Erkennung
- [ ] Konfigurierbarer Delay
- [ ] Whitelist/Blacklist für Websites
- [ ] Custom Notification-Positionen
- [ ] Dark/Light Theme für Inline-Notifications
