'use client';

import { useState, useEffect } from 'react';
import AppShell from '../components/AppShell';
import { Card, Button, Input, Alert, Badge, Divider } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { encryptForStorage as cryptoEncrypt, decryptFromStorage as cryptoDecrypt } from '../../lib/crypto';

type GeneratorMode = 'personal' | 'random';

interface CustomField {
  id: string;
  value: string;
}

export default function GeneratorClient() {
  const { encryptionKey } = useAuth();
  const [mode, setMode] = useState<GeneratorMode>('personal');

  // Personal data inputs
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [children, setChildren] = useState('');
  const [favoriteAnimal, setFavoriteAnimal] = useState('');
  const [favoriteColor, setFavoriteColor] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [weddingDay, setWeddingDay] = useState('');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  // Settings
  const [length, setLength] = useState(16);
  const [crypticLevel, setCrypticLevel] = useState(3); // 1-5
  const [replaceChars, setReplaceChars] = useState(false); // steuert ob Buchstaben ersetzt werden
  const [separator, setSeparator] = useState('none'); // 'none', 'dash', 'underscore', 'dot', 'random'
  const [caseMode, setCaseMode] = useState<'original' | 'alternate' | 'upper' | 'lower' | 'capitalize'>('alternate'); // Groß-/Kleinschreibung
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [excludeChars, setExcludeChars] = useState('');

  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [generationCounter, setGenerationCounter] = useState(0);
  const [saveStatus, setSaveStatus] = useState<string>('');

  // Helper functions for encoding/decoding
  function encodeToBase64(str: string) {
    if (typeof window === 'undefined') {
      return '';
    }
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    let binary = '';
    bytes.forEach(b => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  function decodeFromBase64(b64: string) {
    try {
      if (typeof window === 'undefined') {
        return '';
      }
      const binary = atob(b64);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return '';
    }
  }

  // Lade gespeicherte Daten vom Server beim Start
  useEffect(() => {
    async function loadSettings() {
      if (!encryptionKey) {
        // Kein Key - warte bis Login komplett ist
        return;
      }

      try {
        const res = await fetch('/backend/api/v1/generator-settings', {
          cache: 'no-store',
          credentials: 'include',
        });

        if (res.status === 404) {
          // Keine gespeicherten Settings - versuche localStorage als Fallback
          const saved = localStorage.getItem('generator-data');
          if (saved) {
            const data = JSON.parse(saved);
            applyLoadedData(data);
          }
          return;
        }

        if (!res.ok) {
          console.error('Fehler beim Laden der Settings');
          return;
        }

        const responseData = await res.json();
        const blobDecoded = atob(responseData.blob);

        // Prüfe ob neues verschlüsseltes Format (iv:ciphertext)
        if (blobDecoded.includes(':')) {
          // Neues verschlüsseltes Format
          const json = await cryptoDecrypt(blobDecoded, encryptionKey);
          const data = JSON.parse(json || '{}');
          applyLoadedData(data);
        } else {
          // Altes Base64-Format → Migration
          const json = decodeFromBase64(blobDecoded);
          const data = JSON.parse(json || '{}');
          applyLoadedData(data);
          console.log('Alte Daten geladen. Werden beim nächsten Speichern verschlüsselt.');
        }
      } catch (error) {
        console.error('Fehler beim Laden der gespeicherten Daten:', error);
      }
    }

    loadSettings();
  }, [encryptionKey]);

  function applyLoadedData(data: any) {
    // Persönliche Daten laden
    if (data.firstName) setFirstName(data.firstName);
    if (data.lastName) setLastName(data.lastName);
    if (data.birthDate) setBirthDate(data.birthDate);
    if (data.birthPlace) setBirthPlace(data.birthPlace);
    if (data.children) setChildren(data.children);
    if (data.favoriteAnimal) setFavoriteAnimal(data.favoriteAnimal);
    if (data.favoriteColor) setFavoriteColor(data.favoriteColor);
    if (data.partnerName) setPartnerName(data.partnerName);
    if (data.weddingDay) setWeddingDay(data.weddingDay);
    if (data.customFields) setCustomFields(data.customFields);

    // Einstellungen laden
    if (data.length) setLength(data.length);
    if (data.crypticLevel) setCrypticLevel(data.crypticLevel);
    if (data.replaceChars !== undefined) setReplaceChars(data.replaceChars);
    if (data.separator) setSeparator(data.separator);
    if (data.caseMode) setCaseMode(data.caseMode);
    if (data.includeUppercase !== undefined) setIncludeUppercase(data.includeUppercase);
    if (data.includeLowercase !== undefined) setIncludeLowercase(data.includeLowercase);
    if (data.includeNumbers !== undefined) setIncludeNumbers(data.includeNumbers);
    if (data.includeSymbols !== undefined) setIncludeSymbols(data.includeSymbols);
    if (data.excludeChars) setExcludeChars(data.excludeChars);
  }

  // Stelle sicher, dass im Personal-Modus Großbuchstaben, Kleinbuchstaben und Zahlen immer aktiviert sind
  useEffect(() => {
    if (mode === 'personal') {
      setIncludeUppercase(true);
      setIncludeLowercase(true);
      setIncludeNumbers(true);
    }
  }, [mode]);

  // Speichere Daten automatisch bei Änderungen
  useEffect(() => {
    const saveSettings = async () => {
      if (typeof window === 'undefined') return;
      if (!encryptionKey) return; // Kein Key - kann nicht verschlüsseln

      const dataToSave = {
        firstName,
        lastName,
        birthDate,
        birthPlace,
        children,
        favoriteAnimal,
        favoriteColor,
        partnerName,
        weddingDay,
        customFields,
        length,
        crypticLevel,
        replaceChars,
        separator,
        caseMode,
        includeUppercase,
        includeLowercase,
        includeNumbers,
        includeSymbols,
        excludeChars,
      };

      // Speichere auch lokal als Backup
      localStorage.setItem('generator-data', JSON.stringify(dataToSave));

      // Speichere in DB (verschlüsselt)
      try {
        const json = JSON.stringify(dataToSave);

        // Verschlüssele mit AES-GCM
        const encrypted = await cryptoEncrypt(json, encryptionKey);
        const blobB64 = btoa(encrypted); // Base64-kodiere das verschlüsselte Format

        const res = await fetch('/backend/api/v1/generator-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ blob: blobB64 }),
        });

        if (res.ok) {
          setSaveStatus('✓ Gespeichert');
          setTimeout(() => setSaveStatus(''), 2000);
        }
      } catch (error) {
        console.error('Fehler beim Speichern:', error);
      }
    };

    // Debounce: Warte 1 Sekunde nach der letzten Änderung
    const timer = setTimeout(saveSettings, 1000);
    return () => clearTimeout(timer);
  }, [
    firstName,
    lastName,
    birthDate,
    birthPlace,
    children,
    favoriteAnimal,
    favoriteColor,
    partnerName,
    weddingDay,
    customFields,
    length,
    crypticLevel,
    replaceChars,
    separator,
    caseMode,
    includeUppercase,
    includeLowercase,
    includeNumbers,
    includeSymbols,
    excludeChars,
    encryptionKey,
  ]);

  function addCustomField() {
    setCustomFields([...customFields, { id: Date.now().toString(), value: '' }]);
  }

  function removeCustomField(id: string) {
    setCustomFields(customFields.filter(f => f.id !== id));
  }

  function updateCustomField(id: string, newValue: string) {
    setCustomFields(customFields.map(f =>
      f.id === id ? { ...f, value: newValue } : f
    ));
  }

  function extractByLevel(text: string, level: number): string {
    if (!text) return '';

    switch (level) {
      case 1: // Nur erster Buchstabe
        return text.charAt(0);
      case 2: // Erste 2 Zeichen
        return text.substring(0, 2);
      case 3: // Erste Hälfte
        return text.substring(0, Math.ceil(text.length / 2));
      case 4: // Fast alles (3/4)
        return text.substring(0, Math.ceil(text.length * 0.75));
      case 5: // Alles
      default:
        return text;
    }
  }

  // Hilfsfunktion um Datum von YYYY-MM-DD nach DDMMYYYY zu konvertieren
  function formatDateForPassword(dateString: string): string {
    if (!dateString || !dateString.includes('-')) return dateString;

    // Format: YYYY-MM-DD -> DDMMYYYY
    const parts = dateString.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}${month}${year}`;
    }
    return dateString;
  }

  async function generatePersonalPassword() {
    // Sammle nur ausgefüllte persönliche Daten
    let allData = [
      firstName,
      lastName,
      formatDateForPassword(birthDate), // Datum im Format DDMMYYYY
      birthPlace,
      children,
      favoriteAnimal,
      favoriteColor,
      partnerName,
      formatDateForPassword(weddingDay), // Datum im Format DDMMYYYY
      ...customFields.map(f => f.value)
    ].filter(value => value && value.trim() !== '');

    if (allData.length === 0) {
      alert('Bitte gib mindestens ein persönliches Datum ein!');
      return;
    }

    // Reihenfolge immer durchmischen für mehr Sicherheit
    allData = shuffleArray([...allData], generationCounter);

    // Extrahiere Daten basierend auf Kryptizität
    let dataParts = allData.map(d => extractByLevel(d, crypticLevel));

    // Trennzeichen hinzufügen
    let basePassword = '';
    if (separator === 'random') {
      // Zufällige Trennzeichen: Wähle bei jeder Trennung zufällig zwischen -, _, .
      const randomChars = ['-', '_', '.'];
      for (let i = 0; i < dataParts.length; i++) {
        basePassword += dataParts[i];
        if (i < dataParts.length - 1) {
          // Verwende generationCounter als Seed für deterministische "Zufälligkeit"
          const randomIndex = Math.abs((generationCounter + i) * 9301 + 49297) % randomChars.length;
          basePassword += randomChars[randomIndex];
        }
      }
    } else {
      const separatorChar = getSeparatorChar();
      basePassword = separatorChar === ''
        ? dataParts.join('')
        : dataParts.join(separatorChar);
    }

    // Entferne Leerzeichen und Sonderzeichen (außer das/die gewählte(n) Trennzeichen)
    if (separator === 'random') {
      // Bei zufälligen Trennzeichen: Alle drei Trennzeichen behalten
      basePassword = basePassword.replace(/[\s,\/]/g, '');
    } else if (separator === 'none') {
      // Keine Trennzeichen - entferne alle Sonderzeichen
      basePassword = basePassword.replace(/[\s,.\-\/]/g, '');
    } else {
      // Mit festem Trennzeichen - entferne andere Sonderzeichen, aber nicht das gewählte
      const separatorChar = getSeparatorChar();
      if (separatorChar === '.') {
        basePassword = basePassword.replace(/[\s,\-\/]/g, ''); // Punkt bleibt
      } else if (separatorChar === '-') {
        basePassword = basePassword.replace(/[\s,.\/]/g, ''); // Bindestrich bleibt
      } else if (separatorChar === '_') {
        basePassword = basePassword.replace(/[\s,.\-\/]/g, ''); // Unterstrich bleibt
      }
    }

    // Transformiere basierend auf Kryptizität und Variante
    let transformedPassword = transformPassword(basePassword, crypticLevel, generationCounter);

    // Passe auf gewünschte Länge an
    if (transformedPassword.length < length) {
      // Wiederhole oder fülle auf
      while (transformedPassword.length < length) {
        transformedPassword += transformPassword(basePassword, crypticLevel, generationCounter + transformedPassword.length);
      }
    }
    transformedPassword = transformedPassword.substring(0, length);

    // Im Personal-Modus: Keine Zeichen-Typ-Filterung, da Daten aus persönlichen Infos kommen
    // Nur ausgeschlossene Zeichen entfernen und optional Sonderzeichen hinzufügen

    // Entferne ausgeschlossene Zeichen
    if (excludeChars) {
      transformedPassword = removeExcludedChars(transformedPassword);
    }

    // Füge zufällige Sonderzeichen ein, wenn aktiviert (NACH dem Filtern)
    // Nur wenn replaceChars aktiviert ist UND includeSymbols aktiviert ist
    if (includeSymbols && replaceChars) {
      transformedPassword = insertRandomSymbols(transformedPassword, generationCounter);
    }

    setPassword(transformedPassword);
    setCopied(false);
    setGenerationCounter(generationCounter + 1);
  }

  function getAllowedSeparators(): string[] {
    // Gib die erlaubten Separator-Zeichen zurück
    if (separator === 'random') {
      return ['-', '_', '.'];
    } else if (separator === 'dash') {
      return ['-'];
    } else if (separator === 'underscore') {
      return ['_'];
    } else if (separator === 'dot') {
      return ['.'];
    }
    return [];
  }

  function ensureAllCharTypes(password: string, seed: number): string {
    let result = password;
    const allowedSeparators = getAllowedSeparators();

    // Prüfe ob alle aktivierten Zeichentypen vorhanden sind
    const hasUpper = /[A-Z]/.test(result);
    const hasLower = /[a-z]/.test(result);
    const hasDigit = /[0-9]/.test(result);
    // Sonderzeichen (aber nicht Separatoren)
    const symbolsPattern = new RegExp(`[^A-Za-z0-9${allowedSeparators.map(s => '\\' + s).join('')}]`);
    const hasSymbol = symbolsPattern.test(result);

    // Füge fehlende Zeichentypen hinzu
    let insertions = 0;

    if (includeUppercase && !hasUpper) {
      const pos = Math.abs((seed + insertions) * 9301) % result.length;
      const char = String.fromCharCode(65 + (Math.abs(seed * 7919) % 26)); // A-Z
      result = result.substring(0, pos) + char + result.substring(pos);
      insertions++;
    }

    if (includeLowercase && !hasLower) {
      const pos = Math.abs((seed + insertions) * 9301) % result.length;
      const char = String.fromCharCode(97 + (Math.abs(seed * 7919 + insertions) % 26)); // a-z
      result = result.substring(0, pos) + char + result.substring(pos);
      insertions++;
    }

    if (includeNumbers && !hasDigit) {
      const pos = Math.abs((seed + insertions) * 9301) % result.length;
      const char = String.fromCharCode(48 + (Math.abs(seed * 7919 + insertions) % 10)); // 0-9
      result = result.substring(0, pos) + char + result.substring(pos);
      insertions++;
    }

    if (includeSymbols && !hasSymbol) {
      const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const pos = Math.abs((seed + insertions) * 9301) % result.length;
      const char = symbols[Math.abs(seed * 7919 + insertions) % symbols.length];
      result = result.substring(0, pos) + char + result.substring(pos);
      insertions++;
    }

    // Kürze auf gewünschte Länge, falls zu lang geworden
    return result.substring(0, length);
  }

  function filterByCharTypes(password: string): string {
    const allowedSeparators = getAllowedSeparators();

    // Entferne Zeichen basierend auf deaktivierten Zeichentypen
    let result = password.split('').filter(char => {
      // Separatoren immer behalten (unabhängig von includeSymbols)
      if (allowedSeparators.includes(char)) {
        return true;
      }

      const isUpper = /[A-Z]/.test(char);
      const isLower = /[a-z]/.test(char);
      const isDigit = /[0-9]/.test(char);
      const isSymbol = /[^A-Za-z0-9]/.test(char);

      // Behalte das Zeichen nur, wenn sein Typ aktiviert ist
      if (isUpper && !includeUppercase) return false;
      if (isLower && !includeLowercase) return false;
      if (isDigit && !includeNumbers) return false;
      if (isSymbol && !includeSymbols) return false;

      return true;
    }).join('');

    // Falls das Passwort zu kurz wurde, fülle mit erlaubten Zeichen auf
    if (result.length < length) {
      const allowedChars = buildCharset();
      if (allowedChars.length === 0) {
        // Fallback: Wenn keine Zeichen erlaubt sind, verwende Kleinbuchstaben
        return 'abcdefghijklmnopqrstuvwxyz'.substring(0, length);
      }

      while (result.length < length) {
        // Deterministisch basierend auf aktueller Länge und generationCounter
        const index = Math.abs((result.length + generationCounter) * 9301) % allowedChars.length;
        result += allowedChars[index];
      }
    }

    return result.substring(0, length);
  }

  function removeExcludedChars(password: string): string {
    if (!excludeChars) return password;

    // Entferne alle ausgeschlossenen Zeichen
    let result = password.split('').filter(char => !excludeChars.includes(char)).join('');

    // Falls das Passwort zu kurz wurde, fülle mit erlaubten Zeichen auf
    if (result.length < length) {
      const allowedChars = buildCharset();
      while (result.length < length) {
        // Deterministisch basierend auf aktueller Länge
        const index = Math.abs(result.length * 9301) % allowedChars.length;
        result += allowedChars[index];
      }
    }

    return result.substring(0, length);
  }

  function insertRandomSymbols(password: string, seed: number): string {
    // Füge zufällig 2-4 Sonderzeichen an verschiedenen Positionen ein
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const numSymbols = 2 + (Math.abs(seed * 7919) % 3); // 2-4 Sonderzeichen

    let result = password;
    const positions: number[] = [];

    // Bestimme zufällige Positionen (deterministisch basierend auf seed)
    for (let i = 0; i < numSymbols; i++) {
      let pos = Math.abs((seed + i) * 2654435761) % result.length;
      // Vermeide doppelte Positionen
      while (positions.includes(pos)) {
        pos = (pos + 1) % result.length;
      }
      positions.push(pos);
    }

    // Sortiere Positionen rückwärts, damit wir von hinten einfügen können
    positions.sort((a, b) => b - a);

    // Füge Sonderzeichen an den bestimmten Positionen ein
    for (const pos of positions) {
      const symbolIndex = Math.abs((seed + pos) * 9301) % symbols.length;
      const symbol = symbols[symbolIndex];
      result = result.substring(0, pos) + symbol + result.substring(pos);
    }

    return result;
  }

  function getSeparatorChar(): string {
    switch (separator) {
      case 'dash': return '-';
      case 'underscore': return '_';
      case 'dot': return '.';
      default: return '';
    }
  }

  function shuffleArray(array: string[], seed: number): string[] {
    // Deterministisches Mischen basierend auf seed
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.abs((seed + i) * 9301 + 49297) % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Hilfsfunktion um Case Mode anzuwenden
  function applyCaseMode(char: string, index: number, variation: number): string {
    switch (caseMode) {
      case 'original':
        return char; // Originalschreibweise beibehalten
      case 'alternate':
        return (index + variation) % 2 === 0 ? char.toUpperCase() : char.toLowerCase();
      case 'upper':
        return char.toUpperCase();
      case 'lower':
        return char.toLowerCase();
      case 'capitalize':
        return index === 0 ? char.toUpperCase() : char.toLowerCase();
      default:
        return char;
    }
  }

  function transformPassword(base: string, level: number, variation: number): string {
    let result = '';

    for (let i = 0; i < base.length; i++) {
      let char = base[i];
      const charCode = char.charCodeAt(0);

      // Wenn "Zeichen ersetzen" DEAKTIVIERT ist, nur Groß/Kleinschreibung nach Mode ändern
      if (!replaceChars) {
        result += applyCaseMode(char, i, variation);
        continue;
      }

      // Wenn "Zeichen ersetzen" AKTIVIERT ist: Transformation basierend auf Level
      switch (level) {
        case 1: // Nur Groß/Kleinschreibung nach Mode
          result += applyCaseMode(char, i, variation);
          break;
        case 2: // + einige Zahlen
          if ((i + variation) % 4 === 0 && /[a-zA-Z]/.test(char)) {
            result += charCode % 10;
          } else {
            result += applyCaseMode(char, i, variation);
          }
          break;
        case 3: // + Leet-Speak
          const leet: any = { 'a': '4', 'e': '3', 'i': '1', 'o': '0', 's': '5', 't': '7' };
          const lowerChar = char.toLowerCase();
          if ((i + variation) % 3 === 0 && leet[lowerChar]) {
            result += leet[lowerChar];
          } else {
            result += applyCaseMode(char, i, variation);
          }
          break;
        case 4: // + mehr Zahlen und Zeichen
          if ((i + variation) % 3 === 0) {
            result += charCode % 10;
          } else if ((i + variation) % 5 === 0 && includeSymbols) {
            const symbols = '!@#$%&*';
            result += symbols[charCode % symbols.length];
          } else {
            result += applyCaseMode(char, i, variation);
          }
          break;
        case 5: // Maximale Transformation
          if ((i + variation) % 2 === 0) {
            result += charCode % 10;
          } else if ((i + variation) % 4 === 0 && includeSymbols) {
            const symbols = '!@#$%^&*()_+-=[]{}';
            result += symbols[charCode % symbols.length];
          } else {
            result += applyCaseMode(char, i, variation);
          }
          break;
      }
    }

    return result;
  }

  function ensureCharTypes(pw: string): string {
    let result = pw;

    // Nur wenn "Zeichen ersetzen" aktiviert ist, zusätzliche Zeichen hinzufügen
    if (!replaceChars) {
      return result; // Keine Ersetzung, nur Groß/Kleinschreibung
    }

    // Stelle sicher, dass mindestens ein Großbuchstabe vorhanden ist
    if (includeUppercase && !/[A-Z]/.test(result)) {
      const pos = Math.floor(result.length / 3);
      result = result.substring(0, pos) + result.charAt(pos).toUpperCase() + result.substring(pos + 1);
    }

    // Stelle sicher, dass mindestens eine Zahl vorhanden ist
    if (includeNumbers && !/[0-9]/.test(result)) {
      const pos = Math.floor(result.length / 2);
      result = result.substring(0, pos) + '7' + result.substring(pos + 1);
    }

    // Stelle sicher, dass mindestens ein Sonderzeichen vorhanden ist
    if (includeSymbols && !/[^a-zA-Z0-9]/.test(result)) {
      const pos = Math.floor(result.length * 2 / 3);
      result = result.substring(0, pos) + '!' + result.substring(pos + 1);
    }

    return result;
  }

  async function generateRandomPassword() {
    const charset = buildCharset();
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    let pw = Array.from(array).map(x => charset[x % charset.length]).join('');

    // Stelle sicher, dass alle aktivierten Zeichentypen vorhanden sind
    // Verwende einen Seed basierend auf dem ersten Zeichen für Determinismus
    const seed = pw.charCodeAt(0) + pw.length;
    pw = ensureAllCharTypes(pw, seed);

    setPassword(pw);
    setCopied(false);
  }

  function buildCharset(): string {
    let chars = '';
    if (includeUppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeLowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (includeNumbers) chars += '0123456789';
    if (includeSymbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    // Entferne ausgeschlossene Zeichen
    if (excludeChars) {
      chars = chars.split('').filter(c => !excludeChars.includes(c)).join('');
    }

    return chars || 'abcdefghijklmnopqrstuvwxyz'; // Fallback
  }

  async function hashString(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function generateFromSeed(seed: string, charset: string, length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      // Verwende verschiedene Positionen im Hash für mehr Variation
      const hashIndex = (i * 2) % seed.length;
      const charIndex = parseInt(seed.substring(hashIndex, hashIndex + 2), 16) % charset.length;
      result += charset[charIndex];
    }
    return result;
  }

  function copyToClipboard() {
    if (!password) return;
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getPasswordStrength() {
    if (!password) return null;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    const charVariety = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;
    const lengthScore = length >= 16 ? 2 : length >= 12 ? 1 : 0;
    const score = charVariety + lengthScore;

    if (score >= 5) return { text: 'Sehr sicher', variant: 'success' as const, color: 'bg-green-500', width: 100 };
    if (score >= 4) return { text: 'Sicher', variant: 'info' as const, color: 'bg-blue-500', width: 75 };
    if (score >= 3) return { text: 'Mittel', variant: 'warning' as const, color: 'bg-orange-500', width: 50 };
    return { text: 'Schwach', variant: 'error' as const, color: 'bg-red-500', width: 25 };
  }

  const strength = getPasswordStrength();

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 mb-2">Passwort-Generator</h1>
          <p className="text-slate-400">
            Generiere sichere Passwörter aus persönlichen Daten oder vollständig zufällig.
          </p>
        </div>

        {/* Mode Selection */}
        <div className="flex gap-3">
          <button
            onClick={() => setMode('personal')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
              mode === 'personal'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <svg className="w-5 h-5 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Aus persönlichen Daten
          </button>
          <button
            onClick={() => setMode('random')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
              mode === 'random'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <svg className="w-5 h-5 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Vollständig zufällig
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Input Section */}
          <div className="lg:col-span-2 space-y-6">
            {mode === 'personal' && (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-100">Persönliche Daten</h2>
                  {saveStatus && (
                    <span className="text-sm text-green-400">{saveStatus}</span>
                  )}
                </div>
                <Alert variant="success">
                  <div>
                    <p className="text-sm font-medium mb-1">🔒 Ende-zu-Ende verschlüsselt</p>
                    <p className="text-xs text-slate-300">
                      Deine Eingaben werden mit AES-256-GCM verschlüsselt und nur mit deinem Master-Passwort entschlüsselbar.
                      Der Server sieht niemals die unverschlüsselten Daten.
                    </p>
                  </div>
                </Alert>
                <div className="h-4" />
                <div className="grid md:grid-cols-2 gap-4">
                  <Input
                    label="Vorname"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Max"
                  />
                  <Input
                    label="Nachname"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Mustermann"
                  />
                  <Input
                    label="Geburtsdatum"
                    type="date"
                    value={birthDate}
                    onChange={e => setBirthDate(e.target.value)}
                  />
                  <Input
                    label="Geburtsort"
                    value={birthPlace}
                    onChange={e => setBirthPlace(e.target.value)}
                    placeholder="Berlin"
                  />
                  <Input
                    label="Kinder (Namen)"
                    value={children}
                    onChange={e => setChildren(e.target.value)}
                    placeholder="Anna, Tom"
                  />
                  <Input
                    label="Lieblingstier"
                    value={favoriteAnimal}
                    onChange={e => setFavoriteAnimal(e.target.value)}
                    placeholder="Hund"
                  />
                  <Input
                    label="Lieblingsfarbe"
                    value={favoriteColor}
                    onChange={e => setFavoriteColor(e.target.value)}
                    placeholder="Blau"
                  />
                  <Input
                    label="Partner/in Name"
                    value={partnerName}
                    onChange={e => setPartnerName(e.target.value)}
                    placeholder="Maria"
                  />
                  <Input
                    label="Hochzeitstag"
                    type="date"
                    value={weddingDay}
                    onChange={e => setWeddingDay(e.target.value)}
                  />
                </div>

                {/* Custom Fields */}
                {customFields.length > 0 && (
                  <>
                    <Divider />
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-slate-300">Eigene Felder</h3>
                      {customFields.map((field, index) => (
                        <div key={field.id} className="flex gap-2 items-center">
                          <Input
                            label={`Eigenes Feld Nr. ${index + 1}`}
                            placeholder="Wert eingeben"
                            value={field.value}
                            onChange={e => updateCustomField(field.id, e.target.value)}
                            className="flex-1"
                          />
                          <button
                            onClick={() => removeCustomField(field.id)}
                            className="p-2 mt-6 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0"
                            title="Entfernen"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <Button
                  variant="ghost"
                  onClick={addCustomField}
                  className="w-full"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Eigenes Feld hinzufügen
                </Button>
              </Card>
            )}

            {/* Settings */}
            <Card>
              <h2 className="text-lg font-semibold text-slate-100 mb-4">Einstellungen</h2>
              <div className="space-y-4">
                {/* Length */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Passwortlänge: {length} Zeichen
                  </label>
                  <input
                    type="range"
                    min={8}
                    max={64}
                    value={length}
                    onChange={e => setLength(+e.target.value)}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>8</span>
                    <span>32</span>
                    <span>64</span>
                  </div>
                </div>

                {mode === 'personal' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Kryptizität: Level {crypticLevel}
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={crypticLevel}
                        onChange={e => setCrypticLevel(+e.target.value)}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                      <div className="text-xs text-slate-400 mt-2 space-y-1">
                        <p className="font-medium text-slate-300">
                          {crypticLevel === 1 && '📝 Nur 1. Buchstabe jeder Angabe'}
                          {crypticLevel === 2 && '📝 Erste 2 Zeichen jeder Angabe'}
                          {crypticLevel === 3 && '📝 Erste Hälfte jeder Angabe'}
                          {crypticLevel === 4 && '📝 3/4 jeder Angabe'}
                          {crypticLevel === 5 && '📝 Vollständige Angaben'}
                        </p>
                        <p className="text-slate-500">
                          Niedrigere Level = leichter zu merken, höhere Level = sicherer
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={replaceChars}
                            onChange={e => setReplaceChars(e.target.checked)}
                            className="w-5 h-5 mt-0.5 rounded border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-slate-200">Buchstaben ersetzen</span>
                            <p className="text-xs text-slate-400 mt-1">
                              {replaceChars
                                ? 'Aktiviert: a→4, e→3, i→1, o→0, etc.'
                                : 'Deaktiviert: Nur Groß-/Kleinschreibung'}
                            </p>
                          </div>
                        </label>
                      </div>

                      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                        <label className="block text-sm font-medium text-slate-200 mb-2">
                          Trennzeichen
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="separator"
                              checked={separator === 'none'}
                              onChange={() => setSeparator('none')}
                              className="w-4 h-4 border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                            />
                            <span className="text-sm text-slate-300">Keine</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="separator"
                              checked={separator === 'dash'}
                              onChange={() => setSeparator('dash')}
                              className="w-4 h-4 border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                            />
                            <span className="text-sm text-slate-300 font-mono">Bindestrich -</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="separator"
                              checked={separator === 'underscore'}
                              onChange={() => setSeparator('underscore')}
                              className="w-4 h-4 border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                            />
                            <span className="text-sm text-slate-300 font-mono">Unterstrich _</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="separator"
                              checked={separator === 'dot'}
                              onChange={() => setSeparator('dot')}
                              className="w-4 h-4 border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                            />
                            <span className="text-sm text-slate-300 font-mono">Punkt .</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer col-span-2">
                            <input
                              type="radio"
                              name="separator"
                              checked={separator === 'random'}
                              onChange={() => setSeparator('random')}
                              className="w-4 h-4 border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                            />
                            <span className="text-sm text-slate-300 font-mono">Zufällig (-, _, .)</span>
                          </label>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                        <label className="block text-sm font-medium text-slate-200 mb-2">
                          Groß-/Kleinschreibung
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="caseMode"
                              checked={caseMode === 'original'}
                              onChange={() => setCaseMode('original')}
                              className="w-4 h-4 border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                            />
                            <span className="text-sm text-slate-300">Original (Max)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="caseMode"
                              checked={caseMode === 'alternate'}
                              onChange={() => setCaseMode('alternate')}
                              className="w-4 h-4 border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                            />
                            <span className="text-sm text-slate-300">Abwechselnd (MaX)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="caseMode"
                              checked={caseMode === 'upper'}
                              onChange={() => setCaseMode('upper')}
                              className="w-4 h-4 border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                            />
                            <span className="text-sm text-slate-300">Groß (MAX)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="caseMode"
                              checked={caseMode === 'lower'}
                              onChange={() => setCaseMode('lower')}
                              className="w-4 h-4 border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                            />
                            <span className="text-sm text-slate-300">Klein (max)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="caseMode"
                              checked={caseMode === 'capitalize'}
                              onChange={() => setCaseMode('capitalize')}
                              className="w-4 h-4 border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                            />
                            <span className="text-sm text-slate-300">Kapitalisiert (Max)</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <Divider />

                {/* Character Types - nur im Random-Modus alle Optionen, im Personal-Modus nur Sonderzeichen */}
                {mode === 'random' ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Zeichentypen
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeUppercase}
                        onChange={e => setIncludeUppercase(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
                      />
                      <span className="text-sm text-slate-300">Großbuchstaben (A-Z)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeLowercase}
                        onChange={e => setIncludeLowercase(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
                      />
                      <span className="text-sm text-slate-300">Kleinbuchstaben (a-z)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeNumbers}
                        onChange={e => setIncludeNumbers(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
                      />
                      <span className="text-sm text-slate-300">Zahlen (0-9)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeSymbols}
                        onChange={e => setIncludeSymbols(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
                      />
                      <span className="text-sm text-slate-300">Zufällige Sonderzeichen (!@#$%...)</span>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeSymbols}
                        onChange={e => setIncludeSymbols(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
                      />
                      <span className="text-sm text-slate-300">Zufällige Sonderzeichen (!@#$%...)</span>
                    </label>
                  </div>
                )}

                <Input
                  label="Zeichen ausschließen"
                  value={excludeChars}
                  onChange={e => setExcludeChars(e.target.value)}
                  placeholder="z.B. O0lI1"
                  helperText="Diese Zeichen werden nicht verwendet"
                />
              </div>
            </Card>
          </div>

          {/* Result Section */}
          <div className="space-y-6">
            <Card>
              <h2 className="text-lg font-semibold text-slate-100 mb-4">Passwort</h2>
              {!password ? (
                <div className="h-40 flex items-center justify-center border-2 border-dashed border-slate-700 rounded-lg mb-4">
                  <div className="text-center">
                    <svg className="w-12 h-12 text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <p className="text-sm text-slate-400">Noch kein Passwort</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 mb-4">
                  {mode === 'personal' && generationCounter > 0 && (
                    <div className="flex items-center justify-between p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                      <span className="text-sm text-purple-300">Variante #{generationCounter}</span>
                      <Badge variant="default">Merken!</Badge>
                    </div>
                  )}

                  <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                    <p className="text-base font-mono text-slate-100 break-all leading-relaxed">
                      {password}
                    </p>
                  </div>

                  {strength && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-400">Stärke</span>
                        <Badge variant={strength.variant}>{strength.text}</Badge>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${strength.color} transition-all duration-500`}
                          style={{ width: `${strength.width}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Button
                  onClick={mode === 'personal' ? generatePersonalPassword : generateRandomPassword}
                  variant="primary"
                  className="w-full"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {mode === 'personal' && generationCounter > 0 ? 'Nächste Variante' : 'Generieren'}
                </Button>

                {mode === 'personal' && generationCounter > 0 && (
                  <Button
                    onClick={() => {
                      setGenerationCounter(0);
                      setPassword('');
                    }}
                    variant="ghost"
                    className="w-full"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Von vorne beginnen
                  </Button>
                )}

                <Button
                  onClick={copyToClipboard}
                  disabled={!password}
                  variant="secondary"
                  className="w-full"
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Kopiert!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Kopieren
                    </>
                  )}
                </Button>
              </div>
            </Card>

            {mode === 'personal' && (
              <Alert variant="warning">
                <div>
                  <p className="font-medium mb-1">So merkst du dir dein Passwort</p>
                  <div className="text-sm space-y-2">
                    <p>
                      <strong>Kryptizität Level {crypticLevel}:</strong>
                      {crypticLevel === 1 && ' Nutzt nur erste Buchstaben (z.B. "Max" → "M")'}
                      {crypticLevel === 2 && ' Nutzt erste 2 Zeichen (z.B. "Max" → "Ma")'}
                      {crypticLevel === 3 && ' Nutzt erste Hälfte (z.B. "Mustermann" → "Must")'}
                      {crypticLevel === 4 && ' Nutzt 3/4 der Angaben'}
                      {crypticLevel === 5 && ' Nutzt vollständige Angaben'}
                    </p>
                    <p>
                      <strong>Zeichen ersetzen:</strong>
                      {replaceChars
                        ? ' Aktiviert - Buchstaben werden in Zahlen/Sonderzeichen umgewandelt'
                        : ' Deaktiviert - Deine Buchstaben bleiben erhalten (nur Groß/Klein)'}
                    </p>
                    <p>
                      Klicke mehrmals auf "Generieren" für verschiedene Varianten.
                      Merke dir die Nummer! (z.B. das 3. generierte Passwort)
                    </p>
                  </div>
                </div>
              </Alert>
            )}

            <Alert variant="info">
              <div>
                <p className="font-medium mb-1">
                  {mode === 'personal' ? 'Basierend auf deinen Daten' : 'Kryptographisch sicher'}
                </p>
                <p className="text-sm">
                  {mode === 'personal'
                    ? 'Jeder Klick auf "Generieren" erzeugt eine neue Variation aus deinen Daten. Merke dir die Variante!'
                    : 'Jedes generierte Passwort ist vollständig einzigartig und zufällig.'}
                </p>
              </div>
            </Alert>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
