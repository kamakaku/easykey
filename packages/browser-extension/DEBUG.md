# EasyKey Extension - Debug Guide

Die Extension wurde mit ausführlichen Debug-Logs erweitert, um Probleme beim Speichern von Passwörtern zu identifizieren.

## Problem: Neue Passwörter werden nicht gespeichert

Wenn du dich irgendwo anmeldest, aber die Credentials nicht in der Extension erscheinen, folge dieser Debug-Anleitung.

## Schritt 1: Extension neu laden

1. Öffne `chrome://extensions` (oder `edge://extensions`)
2. Finde die **EasyKey Companion** Extension
3. Klicke auf das **Reload-Icon** (↻)
4. Die Extension ist jetzt neu geladen mit Debug-Logs

## Schritt 2: Console öffnen

### Background Script Console (Wichtig!)
Die meisten Logs erscheinen hier:

1. Gehe zu `chrome://extensions`
2. Finde **EasyKey Companion**
3. Klicke auf **"Inspect views: Service Worker"** (oder **"Service Worker"**)
4. Ein DevTools-Fenster öffnet sich - das ist die **Background-Console**
5. **Lasse dieses Fenster OFFEN** während du testest

### Webseiten-Console
Für Content-Script Logs:

1. Öffne die Webseite, wo du dich anmelden willst
2. Drücke **F12** oder **Rechtsklick → Untersuchen**
3. Gehe zum **Console**-Tab

### Popup-Console
Für Popup-Logs:

1. Rechtsklick auf das EasyKey-Icon in der Toolbar
2. Wähle **"Popup untersuchen"** (oder **"Inspect Popup"**)
3. Ein DevTools-Fenster öffnet sich

## Schritt 3: Login testen

### Vorbereitung:
1. **Background-Console** ist offen (`chrome://extensions` → Service Worker)
2. **Webseiten-Console** ist offen (F12 auf der Login-Seite)

### Test durchführen:

1. Gehe zu einer Login-Seite (z.B. `github.com/login`)
2. Gib Benutzername und Passwort ein
3. Klicke **"Anmelden"**
4. **Warte 2 Sekunden** (die Extension wartet 1,5s)

## Schritt 4: Logs analysieren

### Was du sehen solltest:

#### In der Webseiten-Console:

```
[EasyKey Content] Form submit detected
[EasyKey Content] Credentials extracted: {username: "...", hasPassword: true, url: "..."}
[EasyKey Content] Waiting 1.5s to check login success...
[EasyKey Content] Checking login success...
[EasyKey Content] Error indicators found: false
[EasyKey Content] Sending suggest-save message: {...}
[EasyKey Content] Suggest-save response: {ok: true}
```

#### In der Background-Console:

```
[EasyKey Background] Received suggest-save message: {...}
[EasyKey Background] Creating suggestion: {origin: "...", hostname: "...", title: "..."}
[EasyKey Background] Adding suggestion with ID: ...
[EasyKey Background] addSuggestion called with: {...}
[EasyKey Background] Suggestion added. Total suggestions: 1
[EasyKey Background] All suggestions: [{id: "...", hostname: "..."}]
[EasyKey Background] Showing notification for suggestion: ...
```

## Häufige Probleme und Lösungen

### Problem 1: Keine Logs in der Webseiten-Console

**Symptom:** Kein `[EasyKey Content]` Log beim Submit

**Ursache:** Content-Script wurde nicht injiziert

**Lösung:**
1. Extension neu laden (`chrome://extensions` → Reload)
2. Webseite neu laden (F5)
3. Prüfe in `chrome://extensions`, ob die Extension aktiviert ist

### Problem 2: "Form submit detected" aber danach nichts

**Symptom:**
```
[EasyKey Content] Form submit detected
[EasyKey Content] Not a form element, ignoring
```

**Ursache:** Das Submit-Event kommt nicht von einem `<form>`-Element

**Lösung:** Manche Webseiten verwenden JavaScript-basierte Logins ohne echte Forms. Diese werden aktuell nicht unterstützt.

### Problem 3: "No password input found"

**Symptom:**
```
[EasyKey Content] Form submit detected
[EasyKey Content] No password input found or empty, ignoring
```

**Ursache:** Das Passwort-Feld wurde nicht erkannt oder ist leer

**Mögliche Gründe:**
- Kein `<input type="password">` im Formular
- Das Passwort-Feld wurde per JavaScript geleert vor dem Submit
- Shadow-DOM wird verwendet

**Lösung:** Aktuell nicht unterstützt. Die Extension sucht nur nach `input[type="password"]`.

### Problem 4: "Login appears to have failed"

**Symptom:**
```
[EasyKey Content] Checking login success...
[EasyKey Content] Error indicators found: true
[EasyKey Content] Error text: "Invalid username or password..."
[EasyKey Content] Login appears to have failed, not suggesting save
```

**Ursache:** Die Extension erkennt eine Error-Message und geht davon aus, dass der Login fehlgeschlagen ist

**Lösung:**
- **Falls der Login tatsächlich fehlgeschlagen ist:** Das ist korrekt! Gib die richtigen Credentials ein.
- **Falls der Login erfolgreich war:** Die Webseite hat eine permanente Error-Message, die die Extension verwirrt. Dies ist ein bekanntes Problem.

**Workaround:** Melde dich erneut an, nachdem du die Error-Message geschlossen/entfernt hast.

### Problem 5: Message kommt nicht im Background an

**Symptom in Webseiten-Console:**
```
[EasyKey Content] Sending suggest-save message: {...}
[EasyKey Content] Failed to send suggest-save: Error: ...
```

**Ursache:** Kommunikation zwischen Content-Script und Background-Script ist unterbrochen

**Lösung:**
1. Extension neu laden
2. Browser neu starten
3. Prüfe, ob andere Extensions interferieren

### Problem 6: Suggestion wird hinzugefügt, aber erscheint nicht im Popup

**Symptom in Background-Console:**
```
[EasyKey Background] Suggestion added. Total suggestions: 1
```

**Aber im Popup sind keine Suggestions sichtbar**

**Debug-Schritte:**

1. Öffne das Popup (klicke auf das Icon)
2. Öffne die Popup-Console (Rechtsklick auf Icon → "Popup untersuchen")
3. Schaue nach diesen Logs:

```
[EasyKey Popup] Loading suggestions...
[EasyKey Popup] Get-suggestions response: {ok: true, suggestions: [...]}
[EasyKey Popup] Loaded suggestions: 1 [{...}]
[EasyKey Popup] Rendering 1 suggestions
```

**Falls du siehst:**
```
[EasyKey Popup] Loaded suggestions: 0 []
```

**Ursache:** Session-Storage wurde nicht korrekt gespeichert

**Lösung:**
1. Extension neu laden
2. Prüfe Browser-Permissions für "storage"

### Problem 7: Notification erscheint nicht

**Symptom in Background-Console:**
```
[EasyKey Background] Showing notification for suggestion: ...
```

**Aber keine Browser-Notification erscheint**

**Ursache:** Browser-Notifications sind blockiert

**Lösung:**
1. Öffne Chrome-Einstellungen → Datenschutz & Sicherheit → Website-Einstellungen → Benachrichtigungen
2. Prüfe, ob Notifications erlaubt sind
3. Prüfe, ob die Extension Permissions für "notifications" hat

## Schritt 5: Manuell im Popup testen

Falls Notifications nicht funktionieren, kannst du Suggestions auch manuell im Popup sehen:

1. Melde dich irgendwo an
2. Öffne das EasyKey-Popup (klicke auf Icon)
3. Schaue im Abschnitt **"Neue Anmeldedaten"**
4. Dort sollten die erkannten Credentials erscheinen
5. Klicke **"Speichern"** (falls entsperrt)

## Zusätzliche Debug-Informationen sammeln

Falls das Problem weiterhin besteht, sammle diese Informationen:

1. **Browser & Version:**
   - Chrome/Edge/...
   - Version: (siehe `chrome://version`)

2. **Extension-Version:**
   - Siehe `chrome://extensions` → EasyKey Companion

3. **Console-Logs:**
   - Screenshot der **Background-Console** nach dem Login-Versuch
   - Screenshot der **Webseiten-Console** nach dem Login-Versuch
   - Screenshot der **Popup-Console** beim Öffnen des Popups

4. **Welche Webseite:**
   - URL der Login-Seite
   - Ist es ein Standard-Login oder SPA/React/etc.?

5. **Was passiert:**
   - Erscheint die Inline-Notification auf der Webseite?
   - Erscheint die Browser-Notification?
   - Erscheint das Badge (!) auf dem Extension-Icon?
   - Sind Suggestions im Popup sichtbar?

## Bekannte Limitierungen

Diese Arten von Logins werden **nicht** unterstützt:

1. **AJAX/Fetch-basierte Logins** ohne `<form>`-Submit
2. **Shadow-DOM Logins** (z.B. manche Web Components)
3. **Multi-Step Logins** (erst Username, dann auf neuer Seite Password)
4. **OAuth/SSO** (Google Login, etc.)
5. **Biometric Logins** (Face ID, Fingerprint)

## Quick-Fix Checkliste

Wenn nichts funktioniert, probiere der Reihe nach:

- [ ] Extension neu laden (`chrome://extensions` → Reload)
- [ ] Webseite neu laden (F5)
- [ ] Browser neu starten
- [ ] Extension de-installieren und neu installieren
- [ ] Prüfe, ob `manifest.json` die Permission "notifications" hat
- [ ] Prüfe Background-Console auf Fehler
- [ ] Teste auf einer anderen Webseite (z.B. `github.com/login`)

## Support

Falls du immer noch Probleme hast:

1. Sammle die Debug-Informationen (siehe oben)
2. Erstelle ein Issue mit allen Logs und Screenshots
3. Beschreibe genau, was du getan hast und was erwartet wurde
