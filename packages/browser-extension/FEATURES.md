# EasyKey Browser Extension - Features

## Automatische Login-Erkennung

Die Extension erkennt jetzt automatisch, wenn du dich auf einer Website anmeldest, und fragt dich, ob du die Anmeldedaten speichern möchtest.

### Wie es funktioniert

#### 1. Form-Submit-Erkennung
- Überwacht alle Formular-Submits auf der Seite
- Erkennt automatisch Passwort- und Benutzername-Felder
- Wartet 1,5 Sekunden nach dem Submit, um Login-Erfolg zu prüfen

#### 2. Login-Erfolgs-Erkennung
Die Extension prüft intelligente, ob der Login erfolgreich war:
- **Fehler-Erkennung**: Sucht nach Error-Messages mit Begriffen wie "password", "username", "login", "fehler", "error"
- **Sprach-Support**: Unterstützt deutsche und englische Fehlermeldungen
- **DOM-Analyse**: Prüft auf HTML-Elemente mit Error-Klassen oder `role="alert"`

Wenn ein Fehler erkannt wird, werden die Credentials **nicht** gespeichert.

#### 3. Dual-Notification-System

Nach erfolgreicher Login-Erkennung erhältst du **zwei Arten** von Benachrichtigungen:

##### a) Browser-Notification (System)
![Browser Notification](https://via.placeholder.com/400x100/4F46E5/FFFFFF?text=Browser+Notification)

**Features:**
- Erscheint als System-Notification (auch wenn Browser im Hintergrund ist)
- **2 Action-Buttons:**
  - **"Speichern"**: Speichert die Credentials direkt (wenn entsperrt)
  - **"Ignorieren"**: Verwirft den Vorschlag
- **Intelligente Handling:**
  - Wenn nicht entsperrt → zeigt "Entsperren erforderlich"-Nachricht
  - Bei Erfolg → zeigt "Gespeichert"-Bestätigung
- **`requireInteraction: true`**: Bleibt sichtbar, bis du reagierst

##### b) Inline-Notification (On-Page)
![Inline Notification](https://via.placeholder.com/320x140/4F46E5/FFFFFF?text=Inline+Notification)

**Features:**
- Erscheint **direkt auf der Webseite** (oben rechts)
- Modernes Design mit Slide-in Animation
- **2 Action-Buttons:**
  - **"Popup öffnen"**: Öffnet das Extension-Popup
  - **"Später"**: Schließt die Benachrichtigung
- **Auto-Dismiss**: Verschwindet nach 10 Sekunden automatisch
- **Smooth Animations**: Slide-in und Slide-out Effekte
- **High Z-Index**: Erscheint immer über allen anderen Elementen

### Technische Details

#### Content Script (`content.ts`)

**Login-Erkennung:**
```typescript
function handleFormSubmit(event: Event) {
  // Speichert Credentials temporär
  lastSubmittedCredentials = {
    username: usernameInput?.value,
    password: passwordInput.value,
    timestamp: Date.now(),
  };

  // Wartet 1,5s und prüft dann Login-Erfolg
  setTimeout(() => {
    checkLoginSuccess(credentials);
  }, 1500);
}
```

**Fehler-Erkennung:**
```typescript
function checkLoginSuccess(credentials) {
  // Sucht nach Error-Indikatoren
  const hasErrorIndicators = document.querySelector(
    '[class*="error" i], [class*="fehler" i], [id*="error" i], [role="alert"]'
  );

  // Prüft Error-Text auf Login-relevante Begriffe
  if (errorText.includes('password') || errorText.includes('login')) {
    return; // Speichert nicht
  }

  // Sendet Suggestion an Background-Script
  void chrome.runtime.sendMessage(payload);
  showInlineNotification();
}
```

**Inline-Notification:**
```typescript
function showInlineNotification() {
  // Erstellt moderne Notification mit:
  - Fixed Position (oben rechts)
  - Gradient Background (#4F46E5 → #6366F1)
  - Box Shadow für Depth
  - Slide-in/out Animations
  - 2 Action-Buttons
  - Auto-Dismiss nach 10s
}
```

#### Background Script (`background.ts`)

**Notification Creation:**
```typescript
async function showSaveNotification(suggestion) {
  await chrome.notifications.create(`easykey-save-${suggestion.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.svg',
    title: 'EasyKey - Anmeldedaten speichern?',
    message: `Möchtest du die Anmeldedaten für ${suggestion.hostname} speichern?`,
    buttons: [
      { title: 'Speichern' },
      { title: 'Ignorieren' }
    ],
    priority: 2,
    requireInteraction: true
  });
}
```

**Button Click Handler:**
```typescript
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // "Speichern" geklickt
    if (!masterKey) {
      // Zeigt "Entsperren erforderlich"-Nachricht
      return;
    }

    // Speichert in Vault
    await saveVaultData(vault);

    // Zeigt Erfolgs-Nachricht
    chrome.notifications.create('easykey-saved-success', {
      title: 'EasyKey - Gespeichert',
      message: 'Anmeldedaten wurden gespeichert.'
    });
  } else {
    // "Ignorieren" geklickt
    removeSuggestion(suggestionId);
  }
});
```

### Manifest Permissions

Die Extension benötigt jetzt die zusätzliche Permission:

```json
{
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "notifications"  // NEU!
  ]
}
```

### User Flow

```
1. User füllt Login-Formular aus
   ↓
2. User klickt "Anmelden"
   ↓
3. Extension wartet 1,5s
   ↓
4. Prüft auf Error-Messages
   ↓
   ├─ Fehler gefunden? → STOP (keine Notification)
   └─ Kein Fehler? → Weiter
      ↓
5. Zeigt BEIDE Notifications:
   ├─ Browser-Notification (System)
   └─ Inline-Notification (On-Page)
      ↓
6. User hat 3 Optionen:
   ├─ "Speichern" (Browser-Notification)
   │   └─ Entsperrt? → Speichert direkt
   │       Locked? → Zeigt "Entsperren"-Nachricht
   ├─ "Popup öffnen" (Inline-Notification)
   │   └─ Öffnet Extension-Popup
   └─ "Ignorieren"/"Später"
       └─ Verwirft Suggestion
```

### Vorteile

1. **Dual-Channel Notification**: User kann Notification auch sehen, wenn sie die Webseite verlassen
2. **Direkt-Speicherung**: Kann direkt aus der Browser-Notification speichern (wenn entsperrt)
3. **Fehler-Vermeidung**: Speichert keine falschen Credentials bei fehlgeschlagenen Logins
4. **User-Friendly**: Moderne, animierte On-Page Notification
5. **Flexible Handling**: Mehrere Optionen zum Reagieren

### Testing

**Teste die Login-Erkennung:**

1. Gehe zu einer Login-Seite (z.B. github.com/login)
2. Gib **falsche** Credentials ein → Sollte **keine** Notification zeigen
3. Gib **richtige** Credentials ein → Sollte **beide** Notifications zeigen:
   - System-Notification mit "Speichern"/"Ignorieren"
   - On-Page Notification (oben rechts) mit "Popup öffnen"/"Später"

**Teste die Notification-Actions:**

1. **Browser-Notification "Speichern":**
   - Entsperrt → Speichert direkt, zeigt Erfolgs-Nachricht
   - Locked → Zeigt "Entsperren erforderlich"

2. **Inline-Notification "Popup öffnen":**
   - Öffnet Extension-Popup
   - Schließt Inline-Notification

3. **Ignorieren/Später:**
   - Entfernt Suggestion
   - Schließt Notification

### Bekannte Limitierungen

1. **1,5s Delay**: Kann bei sehr schnellen Redirects zu spät sein
2. **Error-Erkennung**: Nicht 100% zuverlässig bei ungewöhnlichen Error-Designs
3. **AJAX-Logins**: Single-Page-Apps mit AJAX-basierten Logins werden möglicherweise nicht erkannt
4. **Popup öffnen**: `chrome.action.openPopup()` funktioniert nur mit User-Interaction

### Zukünftige Verbesserungen

- [ ] WebSocket-basierte Login-Erkennung für SPA
- [ ] ML-basierte Error-Erkennung
- [ ] Konfigurierbarer Delay
- [ ] Whitelist/Blacklist für Websites
- [ ] Custom Notification-Positionen
