'use client';

import { useState, useEffect, useMemo } from 'react';
import AppShell from '../components/AppShell';
import { Card, Button, Input, Alert, Badge, Divider } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { encryptForStorage as cryptoEncrypt, decryptFromStorage as cryptoDecrypt } from '../../lib/crypto';

type GeneratorMode = 'personal' | 'random';

interface CustomField {
  id: string;
  value: string;
}

type VaultItemSummary = {
  id: number;
  title: string;
  username?: string;
  url?: string;
  notes?: string;
  category?: string;
  categoryLabel?: string;
  categoryColor?: string;
  expiresAt?: string;
  rotationIntervalDays?: number;
  createdAt?: string;
  updatedAt?: string;
};

// Verfügbare Kategorien mit Farben (gleich wie im Vault)
const CATEGORIES = [
  { id: 'login', label: 'Login', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { id: 'email', label: 'E-Mail', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  { id: 'bank', label: 'Bank', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  { id: 'card', label: 'Kreditkarte', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  { id: 'social', label: 'Social Media', color: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
  { id: 'work', label: 'Arbeit', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  { id: 'other', label: 'Sonstige', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
] as const;

const CATEGORY_COLOR_POOL = [
  'bg-rose-500/10 text-rose-400 border-rose-500/20',
  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'bg-violet-500/10 text-violet-400 border-violet-500/20',
  'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatDateDisplay(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function dateInputToIso(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function calculateDueDate(item: Pick<VaultItemSummary, 'expiresAt' | 'rotationIntervalDays' | 'updatedAt' | 'createdAt'>) {
  if (item.expiresAt) {
    const expires = new Date(item.expiresAt);
    if (!Number.isNaN(expires.getTime())) {
      return expires;
    }
  }

  if (item.rotationIntervalDays && item.rotationIntervalDays > 0) {
    const reference = item.updatedAt || item.createdAt;
    if (reference) {
      const base = new Date(reference);
      if (!Number.isNaN(base.getTime())) {
        return new Date(base.getTime() + item.rotationIntervalDays * MS_PER_DAY);
      }
    }
  }

  return null;
}

function formatDayDifferenceLabel(diffDays: number) {
  const abs = Math.abs(diffDays);
  const plural = abs === 1 ? '' : 'en';

  if (diffDays < 0) {
    return `Abgelaufen seit ${abs} Tag${plural}`;
  }
  if (diffDays === 0) {
    return 'Läuft heute ab';
  }
  return `Noch ${diffDays} Tag${diffDays === 1 ? '' : 'e'} gültig`;
}

function getRotationStatus(item: VaultItemSummary) {
  const dueDate = calculateDueDate(item);
  if (!dueDate) return null;

  const diffMs = dueDate.getTime() - Date.now();
  const diffDays = Math.floor(diffMs / MS_PER_DAY);

  if (diffDays < 0) {
    return {
      variant: 'error' as const,
      text: formatDayDifferenceLabel(diffDays),
      dueDate,
      daysRemaining: diffDays,
    };
  }

  if (diffDays === 0) {
    return {
      variant: 'warning' as const,
      text: formatDayDifferenceLabel(diffDays),
      dueDate,
      daysRemaining: diffDays,
    };
  }

  if (diffDays <= 3) {
    return {
      variant: 'warning' as const,
      text: formatDayDifferenceLabel(diffDays),
      dueDate,
      daysRemaining: diffDays,
    };
  }

  return {
    variant: diffDays >= 7 ? ('success' as const) : ('info' as const),
    text: formatDayDifferenceLabel(diffDays),
    dueDate,
    daysRemaining: diffDays,
  };
}

function isRecentlyUpdated(item: VaultItemSummary) {
  if (!item.updatedAt) return false;
  const updated = new Date(item.updatedAt);
  if (Number.isNaN(updated.getTime())) return false;
  return Date.now() - updated.getTime() < MS_PER_DAY;
}

function formatRelativeDaysFromNow(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffDays = Math.floor((Date.now() - date.getTime()) / MS_PER_DAY);
  if (diffDays <= 0) return 'heute';
  if (diffDays === 1) return 'vor 1 Tag';
  return `vor ${diffDays} Tagen`;
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
  const [generationStyle, setGenerationStyle] = useState<'characters' | 'blocks'>('characters');
  const [numBlocks, setNumBlocks] = useState(4); // Anzahl der Blöcke im Blockmodus
  const [crypticLevel, setCrypticLevel] = useState(3); // 1-5
  const [replaceChars, setReplaceChars] = useState(false); // steuert ob Buchstaben ersetzt werden
  const [separator, setSeparator] = useState('none'); // 'none', 'dash', 'underscore', 'dot', 'random'
  const [caseMode, setCaseMode] = useState<'original' | 'alternate' | 'upper' | 'lower' | 'capitalize'>('alternate'); // Groß-/Kleinschreibung
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [excludeChars, setExcludeChars] = useState('');
  const [settingsMode, setSettingsMode] = useState<'automatic' | 'manual'>('automatic');

  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [generationCounter, setGenerationCounter] = useState(0);
  const [saveStatus, setSaveStatus] = useState<string>('');
  
  // Zustand für Vault-Import
  const [showVaultImportModal, setShowVaultImportModal] = useState(false);
  const [vaultImportTitle, setVaultImportTitle] = useState('');
  const [vaultImportUsername, setVaultImportUsername] = useState('');
  const [vaultImportUrl, setVaultImportUrl] = useState('');
  const [vaultImportNotes, setVaultImportNotes] = useState('');
  const [vaultImportCategory, setVaultImportCategory] = useState('login');
  const [vaultImportCategoryLabel, setVaultImportCategoryLabel] = useState('Login');
  const [vaultImportExpiresAt, setVaultImportExpiresAt] = useState('');
  const [vaultImportRotationInterval, setVaultImportRotationInterval] = useState('');
  const [vaultImportStatus, setVaultImportStatus] = useState<{message: string, type: 'success' | 'error' | 'info' | 'warning'} | null>(null);
  const [showGeneratedPassword, setShowGeneratedPassword] = useState(false);
  const [availableVaultItems, setAvailableVaultItems] = useState<VaultItemSummary[]>([]);
  const [isLoadingVaultItems, setIsLoadingVaultItems] = useState(false);
  const [vaultItemsError, setVaultItemsError] = useState<string | null>(null);
  const [selectedVaultItemId, setSelectedVaultItemId] = useState<number | null>(null);
  const [vaultImportDefaultTitle, setVaultImportDefaultTitle] = useState('');
  const [isVaultImportFormActive, setIsVaultImportFormActive] = useState(false);
  const [vaultCustomCategories, setVaultCustomCategories] = useState<{id: string; label: string; color: string}[]>([]);
  const [autoComputedExpiry, setAutoComputedExpiry] = useState<string | null>(null);
  const [expiryManuallyEdited, setExpiryManuallyEdited] = useState(false);

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

  function isoToDateInput(value?: string) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
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

  function getRandomInt(max: number) {
    if (max <= 0) return 0;
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      return array[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function shuffleArrayRandom<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = getRandomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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
    if (data.generationStyle) setGenerationStyle(data.generationStyle);
    if (data.numBlocks) setNumBlocks(data.numBlocks);
    if (data.crypticLevel) setCrypticLevel(data.crypticLevel);
    if (data.replaceChars !== undefined) setReplaceChars(data.replaceChars);
    if (data.separator) setSeparator(data.separator);
    if (data.caseMode) setCaseMode(data.caseMode);
    if (data.includeUppercase !== undefined) setIncludeUppercase(data.includeUppercase);
    if (data.includeLowercase !== undefined) setIncludeLowercase(data.includeLowercase);
    if (data.includeNumbers !== undefined) setIncludeNumbers(data.includeNumbers);
    if (data.includeSymbols !== undefined) setIncludeSymbols(data.includeSymbols);
    if (data.excludeChars) setExcludeChars(data.excludeChars);
    if (data.settingsMode === 'automatic' || data.settingsMode === 'manual') {
      setSettingsMode(data.settingsMode);
    }
  }

  function normalizeRotationInterval(value: string) {
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return undefined;
    }
    return Math.round(parsed);
  }

  function computeNextExpiration(explicitDate?: string, intervalDays?: number, referenceIso?: string) {
    if (explicitDate) {
      const explicit = new Date(explicitDate);
      if (!Number.isNaN(explicit.getTime())) {
        return explicit.toISOString();
      }
    }
    if (!intervalDays) {
      return undefined;
    }
    const reference = referenceIso ? new Date(referenceIso) : new Date();
    if (Number.isNaN(reference.getTime())) {
      return undefined;
    }
    const next = new Date(reference.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    return next.toISOString();
  }

  function populateVaultFormFromItem(item: VaultItemSummary | null, fallbackTitle = '') {
    setIsVaultImportFormActive(true);
    if (item) {
      setSelectedVaultItemId(item.id);
      setVaultImportTitle(item.title);
      setVaultImportUsername(item.username || '');
      setVaultImportUrl(item.url || '');
      setVaultImportNotes(item.notes || '');
      const categoryId = item.category || 'login';
      setVaultImportCategory(categoryId);
      const categoryMatch = findCategoryById(categoryId, vaultCustomCategories);
      const fallbackLabel = item.categoryLabel || (categoryId ? categoryId : '');
      setVaultImportCategoryLabel(categoryMatch?.label || fallbackLabel);
      setVaultImportExpiresAt(isoToDateInput(item.expiresAt));
      setVaultImportRotationInterval(
        typeof item.rotationIntervalDays === 'number' ? String(item.rotationIntervalDays) : ''
      );
      const hasRotation = typeof item.rotationIntervalDays === 'number' && item.rotationIntervalDays > 0;
      setExpiryManuallyEdited(!hasRotation && Boolean(item.expiresAt));
      setAutoComputedExpiry(null);
    } else {
      setSelectedVaultItemId(null);
      setVaultImportTitle(fallbackTitle);
      setVaultImportUsername('');
      setVaultImportUrl('');
      setVaultImportNotes('');
      setVaultImportCategory('login');
      setVaultImportCategoryLabel('Login');
      setVaultImportExpiresAt('');
      setVaultImportRotationInterval('');
      setExpiryManuallyEdited(false);
      setAutoComputedExpiry(null);
    }
  }

  function handleVaultImportTitleChange(value: string) {
    setVaultImportTitle(value);
    const match = availableVaultItems.find(item => item.title === value);
    if (match) {
      populateVaultFormFromItem(match);
    } else {
      setSelectedVaultItemId(null);
    }
  }

  function handleSelectVaultItem(item: VaultItemSummary) {
    populateVaultFormFromItem(item);
  }

  function handleCreateNewVaultEntry() {
    populateVaultFormFromItem(null, vaultImportDefaultTitle || '');
  }

  function handleVaultImportExpiresAtChange(value: string) {
    setVaultImportExpiresAt(value);
    setExpiryManuallyEdited(true);
  }

  function handleVaultImportRotationIntervalChange(value: string) {
    setVaultImportRotationInterval(value);
    const normalized = normalizeRotationInterval(value);
    if (typeof normalized === 'number' && normalized > 0) {
      setExpiryManuallyEdited(false);
    } else if (vaultImportExpiresAt) {
      setExpiryManuallyEdited(true);
    } else {
      setExpiryManuallyEdited(false);
    }
  }

  function handleVaultCategoryInputChange(value: string) {
    setVaultImportCategoryLabel(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setVaultImportCategory('');
      return;
    }

    const existing = findCategoryByLabel(trimmed, vaultCustomCategories);
    if (existing) {
      setVaultImportCategory(existing.id);
      if (existing.label !== value) {
        setVaultImportCategoryLabel(existing.label);
      }
      return;
    }

    const slug = slugifyCategory(trimmed);
    setVaultImportCategory(slug);
  }

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
        generationStyle,
        numBlocks,
        crypticLevel,
        replaceChars,
        separator,
        caseMode,
        includeUppercase,
        includeLowercase,
        includeNumbers,
        includeSymbols,
        excludeChars,
        settingsMode,
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
    generationStyle,
    numBlocks,
    crypticLevel,
    replaceChars,
    separator,
    caseMode,
    includeUppercase,
    includeLowercase,
    includeNumbers,
    includeSymbols,
    excludeChars,
    settingsMode,
    encryptionKey,
  ]);

  useEffect(() => {
    if (showVaultImportModal && encryptionKey) {
      void loadVaultItems();
    }
  }, [showVaultImportModal, encryptionKey]);

  useEffect(() => {
    if (!isVaultImportFormActive) {
      setAutoComputedExpiry(null);
      return;
    }

    const intervalInput = normalizeRotationInterval(vaultImportRotationInterval);
    const selectedItem =
      selectedVaultItemId !== null
        ? availableVaultItems.find(item => item.id === selectedVaultItemId) ?? null
        : null;
    const intervalCandidate = (() => {
      if (typeof intervalInput === 'number' && intervalInput > 0) return intervalInput;
      if (
        selectedItem &&
        typeof selectedItem.rotationIntervalDays === 'number' &&
        selectedItem.rotationIntervalDays > 0
      ) {
        return selectedItem.rotationIntervalDays;
      }
      return undefined;
    })();

    if (!intervalCandidate) {
      setAutoComputedExpiry(null);
      return;
    }

    const referenceIso = (() => {
      if (selectedItem?.updatedAt) return selectedItem.updatedAt;
      if (selectedItem?.createdAt) return selectedItem.createdAt;
      return new Date().toISOString();
    })();

    const computedIso = computeNextExpiration(undefined, intervalCandidate, referenceIso);
    if (!computedIso) {
      setAutoComputedExpiry(null);
      return;
    }

    const computedDate = isoToDateInput(computedIso);
    const computedValue = computedDate || null;
    setAutoComputedExpiry(computedValue);

    if (!expiryManuallyEdited && computedValue && computedValue !== vaultImportExpiresAt) {
      setVaultImportExpiresAt(computedDate);
    }
  }, [
    isVaultImportFormActive,
    vaultImportRotationInterval,
    availableVaultItems,
    selectedVaultItemId,
    expiryManuallyEdited,
    vaultImportExpiresAt,
  ]);

  useEffect(() => {
    if (mode !== 'personal') return;
    if (settingsMode !== 'automatic') return;

    const config = getAutomaticSettingsForLevel(crypticLevel);

    if (replaceChars !== config.replaceChars) {
      setReplaceChars(config.replaceChars);
    }
    if (includeSymbols !== config.includeSymbols) {
      setIncludeSymbols(config.includeSymbols);
    }
    if (separator !== config.separator) {
      setSeparator(config.separator);
    }
    if (caseMode !== config.caseMode) {
      setCaseMode(config.caseMode);
    }
  }, [mode, settingsMode, crypticLevel, replaceChars, includeSymbols, separator, caseMode]);

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

  function getAutomaticSettingsForLevel(level: number) {
    switch (level) {
      case 1:
        return {
          replaceChars: false,
          includeSymbols: false,
          separator: 'none' as const,
          caseMode: 'original' as const,
        };
      case 2:
        return {
          replaceChars: true,
          includeSymbols: false,
          separator: 'none' as const,
          caseMode: 'alternate' as const,
        };
      case 3:
        return {
          replaceChars: true,
          includeSymbols: true,
          separator: 'dash' as const,
          caseMode: 'alternate' as const,
        };
      case 4:
        return {
          replaceChars: true,
          includeSymbols: true,
          separator: 'random' as const,
          caseMode: 'alternate' as const,
        };
      case 5:
      default:
        return {
          replaceChars: true,
          includeSymbols: true,
          separator: 'random' as const,
          caseMode: 'upper' as const,
        };
    }
  }

  function extractByLevel(text: string, level: number): string {
    if (!text) return '';

    if (settingsMode === 'manual') {
      return text;
    }

    // Map Level 1-5 auf prozentualen Anteil pro Datenblock (25% → 100%)
    const ratios = [0.25, 0.4, 0.6, 0.8, 1];
    const index = Math.min(Math.max(level, 1), 5) - 1;
    const ratio = ratios[index];
    const targetLength = Math.max(1, Math.round(text.length * ratio));
    return text.substring(0, Math.min(targetLength, text.length));
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

    if (generationStyle === 'blocks') {
      const blockPassword = generatePasswordFromBlocks();
      if (!blockPassword) {
        return;
      }
      setPassword(blockPassword);
      setCopied(false);
      setGenerationCounter(generationCounter + 1);
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
        basePassword = basePassword.replace(/[\s,\/\-]/g, ''); // Punkt bleibt
      } else if (separatorChar === '-') {
        basePassword = basePassword.replace(/[\s,.\/]/g, ''); // Bindestrich bleibt
      } else if (separatorChar === '_') {
        basePassword = basePassword.replace(/[\s,.\-\/]/g, ''); // Unterstrich bleibt
      }
    }

    // Transformiere basierend auf Kryptizität und Variante
    let transformedPassword = transformPassword(basePassword, crypticLevel, generationCounter);

    // Passe auf gewünschte Länge an - ABER NUR IM ZEICHENMODUS, nicht im Blockmodus
    if (generationStyle === 'characters') {
      // Passe auf gewünschte Länge an
      if (transformedPassword.length < length) {
        // Wiederhole oder fülle auf
        while (transformedPassword.length < length) {
          transformedPassword += transformPassword(basePassword, crypticLevel, generationCounter + transformedPassword.length);
        }
      }
      transformedPassword = transformedPassword.substring(0, length);
    }
    // Im Blockmodus: Keine Längenanpassung - die Passwortlänge ergibt sich aus den Blöcken

    // Im Personal-Modus: Keine Zeichen-Typ-Filterung, da Daten aus persönlichen Infos kommen
    // Nur ausgeschlossene Zeichen entfernen und optional Sonderzeichen hinzufügen

    // Entferne ausgeschlossene Zeichen
    if (excludeChars) {
      transformedPassword = removeExcludedChars(transformedPassword, generationStyle);
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

  function ensureAllCharTypes(password: string, seed: number, currentGenerationStyle: 'characters' | 'blocks' = generationStyle): string {
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

    // Kürze auf gewünschte Länge, falls zu lang geworden - ABER NUR IM ZEICHENMODUS
    return currentGenerationStyle === 'characters' ? result.substring(0, length) : result;
  }

  function filterByCharTypes(password: string, currentGenerationStyle: 'characters' | 'blocks' = generationStyle): string {
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

    // Falls das Passwort zu kurz wurde, fülle mit erlaubten Zeichen auf - ABER NUR IM ZEICHENMODUS
    if (currentGenerationStyle === 'characters' && result.length < length) {
      const allowedChars = buildCharset();
      if (allowedChars.length === 0) {
        // Fallback: Wenn keine Zeichen erlaubt sind, verwende Kleinbuchstaben
        return currentGenerationStyle === 'characters' ? 'abcdefghijklmnopqrstuvwxyz'.substring(0, length) : 'abcdefghijklmnopqrstuvwxyz';
      }

      while (result.length < length) {
        // Deterministisch basierend auf aktueller Länge und generationCounter
        const index = Math.abs((result.length + generationCounter) * 9301) % allowedChars.length;
        result += allowedChars[index];
      }
    }

    // Kürze nur im Zeichenmodus auf die gewünschte Länge
    return currentGenerationStyle === 'characters' ? result.substring(0, length) : result;
  }

  function removeExcludedChars(password: string, currentGenerationStyle: 'characters' | 'blocks' = generationStyle): string {
    if (!excludeChars) return password;

    // Entferne alle ausgeschlossenen Zeichen
    let result = password.split('').filter(char => !excludeChars.includes(char)).join('');

    // Falls das Passwort zu kurz wurde, fülle mit erlaubten Zeichen auf - ABER NUR IM ZEICHENMODUS
    if (currentGenerationStyle === 'characters' && result.length < length) {
      const allowedChars = buildCharset();
      while (result.length < length) {
        // Deterministisch basierend auf aktueller Länge
        const index = Math.abs(result.length * 9301) % allowedChars.length;
        result += allowedChars[index];
      }
    }

    // Kürze nur im Zeichenmodus auf die gewünschte Länge
    return currentGenerationStyle === 'characters' ? result.substring(0, length) : result;
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
    const manualFallbackLevel = 3;
    const effectiveLevel = settingsMode === 'manual' ? manualFallbackLevel : level;

    for (let i = 0; i < base.length; i++) {
      let char = base[i];
      const charCode = char.charCodeAt(0);

      // Wenn "Zeichen ersetzen" DEAKTIVIERT ist, nur Groß/Kleinschreibung nach Mode ändern
      if (!replaceChars) {
        result += applyCaseMode(char, i, variation);
        continue;
      }

      // Wenn "Zeichen ersetzen" AKTIVIERT ist: Transformation basierend auf Level
      switch (effectiveLevel) {
        case 1: // Nur Groß/Kleinschreibung nach Mode
          result += applyCaseMode(char, i, variation);
          break;
        case 2: // + einige Zahlen
          if ((i + variation) % 4 === 0 && /[a-zA-Z]/.test(char) && includeNumbers) {
            result += charCode % 10;
          } else {
            result += applyCaseMode(char, i, variation);
          }
          break;
        case 3: // + Leet-Speak
          const leet: any = { 'a': '4', 'e': '3', 'i': '1', 'o': '0', 's': '5', 't': '7' };
          const lowerChar = char.toLowerCase();
          if (leet[lowerChar]) { // Nur ähnliche Buchstaben ersetzen, aber mit caseMode anwenden
            result += leet[lowerChar];
          } else {
            result += applyCaseMode(char, i, variation);
          }
          break;
        case 4: // + mehr Zahlen und Zeichen
          if ((i + variation) % 3 === 0 && includeNumbers) {
            result += charCode % 10;
          } else if ((i + variation) % 5 === 0 && includeSymbols) {
            const symbols = '!@#$%&*';
            result += symbols[charCode % symbols.length];
          } else {
            result += applyCaseMode(char, i, variation);
          }
          break;
        case 5: // Maximale Transformation
          if ((i + variation) % 2 === 0 && includeNumbers) {
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
    pw = ensureAllCharTypes(pw, seed, generationStyle);

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

  async function loadVaultItems() {
    if (!encryptionKey) {
      setAvailableVaultItems([]);
      return;
    }

    setIsLoadingVaultItems(true);
    setVaultItemsError(null);

    try {
      const res = await fetch('/backend/api/v1/vault', {
        cache: 'no-store',
        credentials: 'include',
      });

      if (res.status === 404) {
        setAvailableVaultItems([]);
        setVaultCustomCategories([]);
        return;
      }

      if (!res.ok) {
        throw new Error(`Fehler beim Laden (${res.status})`);
      }

      const vaultRes = await res.json();
      const blobDecoded = atob(vaultRes.blob);
      let parsed: any = {};

      if (blobDecoded.includes(':')) {
        const decryptedJson = await cryptoDecrypt(blobDecoded, encryptionKey);
        parsed = JSON.parse(decryptedJson || '{}');
      } else {
        const binary = atob(vaultRes.blob);
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        const decoder = new TextDecoder();
        const json = decoder.decode(bytes);
        parsed = JSON.parse(json || '{}');
      }

      const parsedCustomCategories = Array.isArray(parsed.customCategories) ? parsed.customCategories : [];
      setVaultCustomCategories(parsedCustomCategories);

      if (Array.isArray(parsed.items)) {
        const summaries: VaultItemSummary[] = parsed.items
          .map(
            ({
              id,
              title,
              username,
              url,
              notes,
              category,
              expiresAt,
              rotationIntervalDays,
              createdAt,
              updatedAt,
            }: any) => {
              const categoryInfo = category ? findCategoryById(category, parsedCustomCategories) : undefined;
              return {
                id,
                title,
                username,
                url,
                notes,
                category,
                categoryLabel: categoryInfo?.label,
                categoryColor: categoryInfo?.color,
                expiresAt,
                rotationIntervalDays,
                createdAt,
                updatedAt,
              };
            },
          )
          .sort((a: VaultItemSummary, b: VaultItemSummary) => a.title.localeCompare(b.title, 'de'));
        setAvailableVaultItems(summaries);
      } else {
        setAvailableVaultItems([]);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Vault-Items:', error);
      setVaultItemsError('Vault-Einträge konnten nicht geladen werden.');
      setAvailableVaultItems([]);
      setVaultCustomCategories([]);
    } finally {
      setIsLoadingVaultItems(false);
    }
  }

  async function savePasswordToVault() {
    if (!password || !vaultImportTitle) {
      setVaultImportStatus({ message: 'Titel ist erforderlich', type: 'error' });
      return;
    }

    try {
      // Lade aktuelle Vault-Daten vom Server
      let currentVaultData: any = { items: [], customCategories: [] };
      const vaultRes = await fetch('/backend/api/v1/vault', {
        cache: 'no-store',
        credentials: 'include',
      });

      if (vaultRes.ok) {
        const vaultJson = await vaultRes.json();
        const blobDecoded = atob(vaultJson.blob);
        
        if (blobDecoded.includes(':')) {
          // Neues verschlüsseltes Format
          if (!encryptionKey) {
            throw new Error('Kein Entschlüsselungs-Key verfügbar');
          }
          const decryptedJson = await cryptoDecrypt(blobDecoded, encryptionKey);
          currentVaultData = JSON.parse(decryptedJson || '{}');
        } else {
          // Altes Base64-Format
          const binary = atob(vaultJson.blob);
          const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
          const decoder = new TextDecoder();
          const json = decoder.decode(bytes);
          currentVaultData = JSON.parse(json || '{}');
        }
      } else if (vaultRes.status !== 404) {
        throw new Error(`Fehler beim Laden des Vaults: ${vaultRes.status}`);
      }

      const nowIso = new Date().toISOString();
      const historyEntry = { value: password, changedAt: nowIso };
      const existingCustomCategories: { id: string; label: string; color: string }[] =
        Array.isArray(currentVaultData.customCategories) ? [...currentVaultData.customCategories] : [];
      const trimmedCategoryLabel = vaultImportCategoryLabel.trim();
      let categoryIdForSave = '';

      if (trimmedCategoryLabel) {
        const existingCategory = findCategoryByLabel(trimmedCategoryLabel, existingCustomCategories);
        if (existingCategory) {
          categoryIdForSave = existingCategory.id;
          if (existingCategory.label !== vaultImportCategoryLabel) {
            setVaultImportCategoryLabel(existingCategory.label);
          }
        } else {
          categoryIdForSave = slugifyCategory(trimmedCategoryLabel);
          const newCategory = {
            id: categoryIdForSave,
            label: trimmedCategoryLabel,
            color: getColorForCategory(trimmedCategoryLabel),
          };
          existingCustomCategories.push(newCategory);
        }
      }

      setVaultImportCategory(categoryIdForSave || '');
      if (trimmedCategoryLabel !== vaultImportCategoryLabel) {
        setVaultImportCategoryLabel(trimmedCategoryLabel);
      }
      currentVaultData.customCategories = existingCustomCategories;
      setVaultCustomCategories(existingCustomCategories);

      const items: any[] = Array.isArray(currentVaultData.items) ? [...currentVaultData.items] : [];
      const existingIndex = items.findIndex(item => item.title === vaultImportTitle);
      let successMessage = 'Passwort erfolgreich zum Vault hinzugefügt!';
      let successType: 'success' | 'info' = 'success';

      if (existingIndex >= 0) {
        const existing = items[existingIndex];
        const history = existing.passwordHistory ? [...existing.passwordHistory] : [];
        if (history.length === 0 && existing.password) {
          history.push({
            value: existing.password,
            changedAt: existing.updatedAt || existing.createdAt || nowIso,
          });
        }

        const intervalInput = normalizeRotationInterval(vaultImportRotationInterval);
        const intervalCandidate = intervalInput ?? existing.rotationIntervalDays;
        const effectiveInterval =
          typeof intervalCandidate === 'number' && intervalCandidate > 0 ? intervalCandidate : undefined;
        const passwordChanged = existing.password !== password;
        const autoReferenceIso =
          passwordChanged ? nowIso : existing.updatedAt || existing.createdAt || nowIso;
        const manualExpiryIso =
          (expiryManuallyEdited || !effectiveInterval) ? dateInputToIso(vaultImportExpiresAt) : undefined;
        const effectiveExpiresAt = computeNextExpiration(
          manualExpiryIso,
          effectiveInterval,
          autoReferenceIso,
        );

        if (passwordChanged) {
          history.push(historyEntry);
        }

        items[existingIndex] = {
          ...existing,
          title: vaultImportTitle,
          username: vaultImportUsername || existing.username,
          password,
          url: vaultImportUrl || existing.url,
          notes: vaultImportNotes || existing.notes,
          category: categoryIdForSave || existing.category,
          expiresAt: effectiveExpiresAt ?? existing.expiresAt,
          rotationIntervalDays: effectiveInterval,
          passwordHistory: history,
          updatedAt: passwordChanged ? nowIso : existing.updatedAt || existing.createdAt || nowIso,
        };
        if (passwordChanged) {
          successMessage = 'Passwort im Vault aktualisiert!';
        } else {
          successMessage = 'Eintrag gespeichert (Passwort unverändert)';
          successType = 'info';
        }
      } else {
        const intervalInput = normalizeRotationInterval(vaultImportRotationInterval);
        const effectiveInterval =
          typeof intervalInput === 'number' && intervalInput > 0 ? intervalInput : undefined;
        const manualExpiryIso =
          (expiryManuallyEdited || !effectiveInterval) ? dateInputToIso(vaultImportExpiresAt) : undefined;
        const effectiveExpiresAt = computeNextExpiration(
          manualExpiryIso,
          effectiveInterval,
          nowIso,
        );

        items.push({
          id: Date.now(),
          title: vaultImportTitle,
          username: vaultImportUsername || undefined,
          password,
          url: vaultImportUrl || undefined,
          notes: vaultImportNotes || undefined,
          category: categoryIdForSave || undefined,
          createdAt: nowIso,
          updatedAt: nowIso,
          expiresAt: effectiveExpiresAt,
          rotationIntervalDays: effectiveInterval,
          passwordHistory: [historyEntry],
        });
      }

      const updatedVaultData = {
        ...currentVaultData,
        items,
      };
      setAvailableVaultItems(
        items
          .map(
            ({
              id,
              title,
              username,
              url,
              notes,
              category,
              expiresAt,
              rotationIntervalDays,
              createdAt,
              updatedAt,
            }: any) => {
              const categoryInfo = category ? findCategoryById(category, existingCustomCategories) : undefined;
              return {
                id,
                title,
                username,
                url,
                notes,
                category,
                categoryLabel: categoryInfo?.label,
                categoryColor: categoryInfo?.color,
                expiresAt,
                rotationIntervalDays,
                createdAt,
                updatedAt,
              };
            },
          )
          .sort((a: VaultItemSummary, b: VaultItemSummary) => a.title.localeCompare(b.title, 'de')),
      );

      // Verschlüssele und speichere die aktualisierten Daten
      const vaultJson = JSON.stringify(updatedVaultData);
      if (!encryptionKey) {
        throw new Error('Kein Verschlüsselungs-Key verfügbar');
      }
      const encrypted = await cryptoEncrypt(vaultJson, encryptionKey);
      const blobB64 = btoa(encrypted);

      const saveRes = await fetch('/backend/api/v1/vault', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ blob: blobB64 }),
      });

      if (!saveRes.ok) {
        throw new Error(`Fehler beim Speichern: ${saveRes.status}`);
      }

      setVaultImportStatus({ message: successMessage, type: successType });
      
      // Setze das Formular nach erfolgreichem Speichern
      setTimeout(() => {
        setShowVaultImportModal(false);
        setVaultImportTitle('');
        setVaultImportUsername('');
      setVaultImportUrl('');
      setVaultImportNotes('');
      setVaultImportCategory('login');
      setVaultImportCategoryLabel('Login');
      setVaultImportExpiresAt('');
      setVaultImportRotationInterval('');
      setVaultImportStatus(null);
      setSelectedVaultItemId(null);
      setVaultImportDefaultTitle('');
        setIsVaultImportFormActive(false);
        setExpiryManuallyEdited(false);
        setAutoComputedExpiry(null);
      }, 1500);
    } catch (error) {
      console.error('Fehler beim Speichern im Vault:', error);
      setVaultImportStatus({ 
        message: `Fehler beim Speichern: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`, 
        type: 'error' 
      });
    }
  }

  function closeVaultImportModal() {
    setShowVaultImportModal(false);
    setIsVaultImportFormActive(false);
    setSelectedVaultItemId(null);
    setVaultImportStatus(null);
    setAutoComputedExpiry(null);
    setExpiryManuallyEdited(false);
    setVaultImportCategoryLabel('Login');
  }

  function openVaultImportModal() {
    if (!password) {
      setVaultImportStatus({ message: 'Erst ein Passwort generieren!', type: 'warning' });
      return;
    }
    
    // Setze den Titel auf den aktuellen Modus als Standardwert
    const defaultTitle = mode === 'personal' ? 'Persönliches Passwort' : 'Zufälliges Passwort';
    
    setVaultImportDefaultTitle(defaultTitle);
    setIsVaultImportFormActive(false);
    setSelectedVaultItemId(null);
    setVaultImportTitle('');
    setVaultImportUsername('');
    setVaultImportUrl('');
    setVaultImportNotes('');
    setVaultImportCategory('login');
    setVaultImportCategoryLabel('Login');
    setVaultImportExpiresAt('');
    setVaultImportRotationInterval('');
    setVaultImportStatus(null);
    setExpiryManuallyEdited(false);
    setAutoComputedExpiry(null);
    setShowVaultImportModal(true);
    void loadVaultItems();
  }

  // Funktion zur Passwort-Generierung aus Blöcken (für Personal-Modus)
  function generatePasswordFromBlocks(): string {
    // Sammle nur ausgefüllte persönliche Daten
    let allData = [
      firstName,
      lastName,
      formatDateForPassword(birthDate), // Datum im Format DDMMYYYY
      birthPlace,
      children, // Diese können kommagetrennt sein
      favoriteAnimal,
      favoriteColor,
      partnerName,
      formatDateForPassword(weddingDay), // Datum im Format DDMMYYYY
      ...customFields.map(f => f.value)
    ];

    // Extrahiere kommagetrennte Werte aus Feldern wie children
    const processedData: string[] = [];
    for (const data of allData) {
      if (data && data.trim() !== "") {
        // Teile kommagetrennte Werte in separate Blöcke
        const values = data.split(",").map(v => v.trim()).filter(v => v !== "");
        processedData.push(...values);
      }
    }

    if (processedData.length === 0) {
      alert("Bitte gib mindestens ein persönliches Datum ein!");
      return "";
    }

    // Mische die Daten zufällig, damit die Blockreihenfolge pro Variante variiert
    let shuffledPool = shuffleArrayRandom(processedData);
    let poolIndex = 0;

    const blocks: string[] = [];
    for (let i = 0; i < numBlocks; i++) {
      if (poolIndex >= shuffledPool.length) {
        shuffledPool = shuffleArrayRandom(processedData);
        poolIndex = 0;
      }

      let baseText = shuffledPool[poolIndex];
      poolIndex++;

      // Extrahiere Text basierend auf Kryptizität
      let block = extractByLevel(baseText, crypticLevel);

      // Falls der Block leer ist, verwende zumindest einen Buchstaben
      if (!block) {
        block = baseText.charAt(0) || "X";
      }

      blocks.push(block);
    }

    // Trennzeichen hinzufügen
    let basePassword = "";
    if (separator === "random") {
      // Zufällige Trennzeichen: Wähle bei jeder Trennung zufällig zwischen -, _, .
      const randomChars = ["-", "_", "."];
      for (let i = 0; i < blocks.length; i++) {
        basePassword += blocks[i];
        if (i < blocks.length - 1) {
          const randomIndex = getRandomInt(randomChars.length);
          basePassword += randomChars[randomIndex];
        }
      }
    } else {
      const separatorChar = getSeparatorChar();
      basePassword = separatorChar === ""
        ? blocks.join("")
        : blocks.join(separatorChar);
    }

    // Entferne Leerzeichen und Sonderzeichen (außer das/die gewählte(n) Trennzeichen)
    if (separator === "random") {
      // Bei zufälligen Trennzeichen: Alle drei Trennzeichen behalten
      basePassword = basePassword.replace(/[\s,\/]/g, "");
    } else if (separator === "none") {
      // Keine Trennzeichen - entferne alle Sonderzeichen
      basePassword = basePassword.replace(/[\s,.\-\/]/g, "");
    } else {
      // Mit festem Trennzeichen - entferne andere Sonderzeichen, aber nicht das gewählte
      const separatorChar = getSeparatorChar();
      if (separatorChar === ".") {
        basePassword = basePassword.replace(/[\s,\/\-]/g, ""); // Punkt bleibt
      } else if (separatorChar === "-") {
        basePassword = basePassword.replace(/[\s,.\/]/g, ""); // Bindestrich bleibt
      } else if (separatorChar === "_") {
        basePassword = basePassword.replace(/[\s,.\-\/]/g, ""); // Unterstrich bleibt
      }
    }

    // Transformiere basierend auf Kryptizität und Variante
    let transformedPassword = transformPassword(basePassword, crypticLevel, generationCounter);

    // Entferne ausgeschlossene Zeichen
    if (excludeChars) {
      transformedPassword = removeExcludedChars(transformedPassword, generationStyle);
    }

    // Füge zufällige Sonderzeichen ein, wenn aktiviert (NACH dem Filtern)
    // Nur wenn replaceChars aktiviert ist UND includeSymbols aktiviert ist
    if (includeSymbols && replaceChars) {
      transformedPassword = insertRandomSymbols(transformedPassword, generationCounter);
    }

    return transformedPassword;
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
    
    // Unterschiedliche Bewertung je nach Modus
    let score = 0;
    if (generationStyle === 'blocks') {
      // Im Blockmodus: Bewertung basierend auf Anzahl der Blöcke
      const blockScore = Math.min(Math.floor(numBlocks / 2), 3); // Max 3 für 6 Blöcke
      const varietyScore = Math.min(charVariety, 2); // Max 2 für alle Zeichentypen
      score = blockScore + varietyScore;
    } else {
      // Im Zeichenmodus: Bewertung wie zuvor basierend auf Länge
      const lengthScore = length >= 16 ? 2 : length >= 12 ? 1 : 0;
      score = charVariety + lengthScore;
    }

    if (score >= 5) return { text: 'Sehr sicher', variant: 'success' as const, color: 'bg-green-500', width: 100 };
    if (score >= 4) return { text: 'Sicher', variant: 'info' as const, color: 'bg-blue-500', width: 75 };
    if (score >= 3) return { text: 'Mittel', variant: 'warning' as const, color: 'bg-orange-500', width: 50 };
    return { text: 'Schwach', variant: 'error' as const, color: 'bg-red-500', width: 25 };
  }

  const selectedVaultItem = useMemo(
    () =>
      selectedVaultItemId !== null
        ? availableVaultItems.find(item => item.id === selectedVaultItemId) ?? null
        : null,
    [availableVaultItems, selectedVaultItemId],
  );

  const selectedVaultStatus = useMemo(
    () => (selectedVaultItem ? getRotationStatus(selectedVaultItem) : null),
    [selectedVaultItem],
  );
  const selectedVaultRecentlyUpdated = useMemo(
    () => (selectedVaultItem ? isRecentlyUpdated(selectedVaultItem) : false),
    [selectedVaultItem],
  );

  const activeRotationInterval =
    normalizeRotationInterval(vaultImportRotationInterval) ??
    (selectedVaultItem?.rotationIntervalDays && selectedVaultItem.rotationIntervalDays > 0
      ? selectedVaultItem.rotationIntervalDays
      : undefined);

  const upcomingExpiryInfo = useMemo(() => {
    if (selectedVaultStatus?.dueDate) {
      return {
        dateIso: selectedVaultStatus.dueDate.toISOString(),
        label: selectedVaultStatus.text,
        variant: selectedVaultStatus.variant,
        source: 'existing' as const,
        daysRemaining: selectedVaultStatus.daysRemaining,
      };
    }

    const manualDateIso =
      expiryManuallyEdited && vaultImportExpiresAt ? dateInputToIso(vaultImportExpiresAt) : undefined;

    const candidateIso = manualDateIso ?? (autoComputedExpiry ? dateInputToIso(autoComputedExpiry) : undefined);
    if (!candidateIso) return null;

    const candidate = new Date(candidateIso);
    if (Number.isNaN(candidate.getTime())) return null;

    const diffDays = Math.floor((candidate.getTime() - Date.now()) / MS_PER_DAY);
    const variant = diffDays < 0 ? ('error' as const)
      : diffDays === 0 ? ('warning' as const)
      : diffDays <= 3 ? ('warning' as const)
      : diffDays >= 7 ? ('success' as const)
      : ('info' as const);

    return {
      dateIso: candidate.toISOString(),
      label: formatDayDifferenceLabel(diffDays),
      variant,
      source: manualDateIso ? ('manual' as const) : ('auto' as const),
      daysRemaining: diffDays,
    };
  }, [
    selectedVaultStatus,
    expiryManuallyEdited,
    vaultImportExpiresAt,
    autoComputedExpiry,
  ]);

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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-100">Einstellungen</h2>
              </div>
              <div className="space-y-4">
                {mode === 'personal' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setGenerationStyle('characters')}
                        className={`px-3 py-2 rounded-lg border ${
                          generationStyle === 'characters'
                            ? 'border-indigo-500 bg-indigo-500/20 text-indigo-100'
                            : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                        } transition-all`}
                      >
                        Zeichen
                      </button>
                      <button
                        onClick={() => setGenerationStyle('blocks')}
                        className={`px-3 py-2 rounded-lg border ${
                          generationStyle === 'blocks'
                            ? 'border-indigo-500 bg-indigo-500/20 text-indigo-100'
                            : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                        } transition-all`}
                      >
                        Blöcke
                      </button>
                    </div>

                    {generationStyle === 'characters' && (
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
                    )}

                    {generationStyle === 'blocks' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Anzahl der Blöcke: {numBlocks}
                        </label>
                        <input
                          type="range"
                          min={2}
                          max={6}
                          value={numBlocks}
                          onChange={e => setNumBlocks(+e.target.value)}
                          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Jeder Block basiert auf einer Eingabe und wird automatisch getrennt.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {mode === 'random' && (
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
                )}

                {mode === 'random' && (
                  <>
                    <Divider />

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
                  </>
                )}

                <Divider />

                <Input
                  label="Zeichen ausschließen"
                  value={excludeChars}
                  onChange={e => setExcludeChars(e.target.value)}
                  placeholder="z.B. O0lI1"
                  helperText="Diese Zeichen werden nicht verwendet"
                />
              </div>
            </Card>

            {mode === 'personal' && (
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="text-sm font-medium text-slate-300">Kryptizität-Steuerung</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSettingsMode('automatic')}
                        className={`px-3 py-2 rounded-lg border ${
                          settingsMode === 'automatic'
                            ? 'border-purple-500 bg-purple-500/20 text-purple-100'
                            : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                        } transition-all`}
                      >
                        Automatisch
                      </button>
                      <button
                        onClick={() => setSettingsMode('manual')}
                        className={`px-3 py-2 rounded-lg border ${
                          settingsMode === 'manual'
                            ? 'border-purple-500 bg-purple-500/20 text-purple-100'
                            : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                        } transition-all`}
                      >
                        Manuell
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    {settingsMode === 'automatic'
                      ? 'System setzt Ersetzungen, Zeichenmix und Trennzeichen anhand des Kryptizitäts-Levels.'
                      : 'Du steuerst Ersetzungen, Trennzeichen und Groß-/Kleinschreibung komplett selbst.'}
                  </p>
                </div>

                {settingsMode === 'automatic' && (
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
                        {crypticLevel === 1 && '📝 Nutzt ca. 25% deiner Angaben (leicht merkbar)'}
                        {crypticLevel === 2 && '📝 Nutzt ca. 40% deiner Angaben'}
                        {crypticLevel === 3 && '📝 Nutzt ca. 60% deiner Angaben'}
                        {crypticLevel === 4 && '📝 Nutzt ca. 80% deiner Angaben'}
                        {crypticLevel === 5 && '📝 Nutzt 100% deiner Angaben für maximale Kryptizität'}
                      </p>
                      <p className="text-slate-500">
                        Das System passt zusätzliche Ersetzungen, Sonderzeichen und Trennzeichen automatisch an.
                      </p>
                    </div>
                  </div>
                )}

                {settingsMode === 'manual' && (
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
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeSymbols}
                          onChange={e => setIncludeSymbols(e.target.checked)}
                          className="w-5 h-5 rounded border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-700"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-slate-200">Zufällige Sonderzeichen</span>
                          <p className="text-xs text-slate-400 mt-1">(!@#$%...)</p>
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
                )}
              </div>
            )}
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
                      {mode === 'personal' && generationStyle === 'blocks' && (
                        <p className="text-xs text-slate-500 mt-2 text-center">
                          Basierend auf {numBlocks} Block{numBlocks > 1 ? 's' : ''} aus deinen Daten
                        </p>
                      )}
                    </div>
                  )}
                  {upcomingExpiryInfo && (
                    <div className="mt-4 bg-slate-800/70 border border-slate-700 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <Badge variant={upcomingExpiryInfo.variant}>{upcomingExpiryInfo.label}</Badge>
                        <span className="text-sm text-slate-200 font-medium">
                          Nächstes Ablaufdatum:{' '}
                          <span className="text-slate-100">
                            {formatDateDisplay(upcomingExpiryInfo.dateIso)}
                          </span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {upcomingExpiryInfo.source === 'existing'
                          ? 'Basierend auf dem gespeicherten Vault-Eintrag.'
                          : upcomingExpiryInfo.source === 'auto'
                            ? 'Vorläufig berechnet aus dem Rotationsintervall.'
                            : 'Basierend auf dem eingegebenen Ablaufdatum.'}
                      </p>
                      {upcomingExpiryInfo.daysRemaining < 0 && (
                        <p className="text-xs text-red-300">
                          Bitte ein neues Passwort generieren und anschließend im Vault sichern.
                        </p>
                      )}
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

                <Button
                  onClick={openVaultImportModal}
                  disabled={!password}
                  variant="secondary"
                  className="w-full"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  Zum Vault hinzufügen
                </Button>
              </div>
            </Card>
            
            {/* Settings Summary */}
            <Card className="bg-slate-800/70 border-slate-600">
              <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Aktuelle Einstellungen
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Modus:</span>
                  <span className="text-slate-200 font-medium">
                    {mode === 'personal' ? 'Persönliche Daten' : 'Zufällig'}
                  </span>
                </div>
                
                {mode === 'personal' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Stil:</span>
                      <span className="text-slate-200 font-medium">
                        {generationStyle === 'characters' ? 'Zeichen' : 'Blöcke'}
                      </span>
                    </div>
                    
                    {generationStyle === 'blocks' && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Blöcke:</span>
                        <span className="text-slate-200 font-medium font-semibold">{numBlocks}</span>
                      </div>
                    )}
                    
                    <div className="flex justify-between">
                      <span className="text-slate-400">Einstellungen:</span>
                      <span className="text-slate-200 font-medium">
                        {settingsMode === 'automatic' ? `Automatisch (Level ${crypticLevel})` : 'Manuell'}
                      </span>
                    </div>
                    
                    {settingsMode === 'automatic' && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Kryptizität:</span>
                        <span className="text-slate-200 font-medium">
                          {crypticLevel === 1 ? 'Leicht merkbar' :
                           crypticLevel === 2 ? 'Einfache Transformation' :
                           crypticLevel === 3 ? 'Mittlere Kryptizität' :
                           crypticLevel === 4 ? 'Hohe Kryptizität' : 'Maximale Kryptizität'}
                        </span>
                      </div>
                    )}
                    
                    {settingsMode === 'manual' && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Buchstaben ersetzen:</span>
                        <span className="text-slate-200 font-medium">
                          {replaceChars ? 'Ja' : 'Nein'}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex justify-between">
                      <span className="text-slate-400">Trennzeichen:</span>
                      <span className="text-slate-200 font-medium">
                        {separator === 'none' ? 'Keine' :
                         separator === 'dash' ? 'Bindestrich' :
                         separator === 'underscore' ? 'Unterstrich' :
                         separator === 'dot' ? 'Punkt' : 'Zufällig'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-slate-400">Groß/Kleinschreibung:</span>
                      <span className="text-slate-200 font-medium">
                        {caseMode === 'original' ? 'Original' :
                         caseMode === 'alternate' ? 'Abwechselnd' :
                         caseMode === 'upper' ? 'Groß' :
                         caseMode === 'lower' ? 'Klein' : 'Kapitalisieren'}
                      </span>
                    </div>
                  </>
                )}
                
                <div className="flex justify-between">
                  <span className="text-slate-400">Länge:</span>
                  <span className="text-slate-200 font-medium">{length} Zeichen</span>
                </div>
                
                <div className="pt-2 border-t border-slate-700/50 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Großbuchstaben:</span>
                    <span className="text-slate-200 font-medium">{includeUppercase ? '✓' : '✗'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Kleinbuchstaben:</span>
                    <span className="text-slate-200 font-medium">{includeLowercase ? '✓' : '✗'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Zahlen:</span>
                    <span className="text-slate-200 font-medium">{includeNumbers ? '✓' : '✗'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sonderzeichen:</span>
                    <span className="text-slate-200 font-medium">{includeSymbols ? '✓' : '✗'}</span>
                  </div>
                  {excludeChars && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Ausgeschlossen:</span>
                      <span className="text-slate-200 font-mono">{excludeChars}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {mode === 'personal' && (
              <Alert variant="warning">
                <div>
                  <p className="font-medium mb-1">So merkst du dir dein Passwort</p>
                  <div className="text-sm space-y-2">
                    {settingsMode === 'automatic' ? (
                      <p>
                        <strong>Kryptizität Level {crypticLevel}:</strong>
                        {crypticLevel === 1 && ' Nutzt nur erste Buchstaben (z.B. "Max" → "M")'}
                        {crypticLevel === 2 && ' Nutzt erste 2 Zeichen (z.B. "Max" → "Ma")'}
                        {crypticLevel === 3 && ' Nutzt erste Hälfte (z.B. "Mustermann" → "Must")'}
                        {crypticLevel === 4 && ' Nutzt 3/4 der Angaben'}
                        {crypticLevel === 5 && ' Nutzt vollständige Angaben'}
                      </p>
                    ) : (
                      <p>
                        <strong>Manueller Modus:</strong> Du steuerst Ersetzungen, Trennzeichen und Groß-/Kleinschreibung
                        selbst. Alle Angaben werden vollständig genutzt.
                      </p>
                    )}
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
                    ? generationStyle === 'blocks'
                      ? `Jeder Klick auf "Generieren" kombiniert ${numBlocks} Blöcke aus deinen Daten. Merke dir die Variante!`
                      : 'Jeder Klick auf "Generieren" erzeugt eine neue Variation aus deinen Daten. Merke dir die Variante!'
                    : 'Jedes generierte Passwort ist vollständig einzigartig und zufällig.'}
                </p>
              </div>
            </Alert>
          </div>
        </div>

        {/* Vault Import Modal */}
        {showVaultImportModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="max-w-3xl w-full bg-slate-900 border-slate-600 space-y-4 relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={closeVaultImportModal}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <h3 className="text-xl font-semibold text-slate-100">
                Zum Vault hinzufügen
              </h3>
              
              {vaultImportStatus && (
                <Alert variant={vaultImportStatus.type}>
                  {vaultImportStatus.message}
                </Alert>
              )}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-300 block mb-2">Generiertes Passwort</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm text-slate-300 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700 font-mono truncate">
                      {showGeneratedPassword ? password : '••••••••••••••••'}
                    </code>
                    <button
                      onClick={() => setShowGeneratedPassword(!showGeneratedPassword)}
                      className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors flex-shrink-0"
                      title={showGeneratedPassword ? 'Verbergen' : 'Anzeigen'}
                    >
                      {showGeneratedPassword ? (
                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.2em]">
                      Vorhandene Einträge
                    </h4>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleCreateNewVaultEntry}
                    >
                      Neuen Eintrag anlegen
                    </Button>
                  </div>
                  {isLoadingVaultItems && (
                    <p className="text-xs text-slate-500">Lade vorhandene Vault-Einträge …</p>
                  )}
                  {!isLoadingVaultItems && vaultItemsError && (
                    <p className="text-xs text-red-400">{vaultItemsError}</p>
                  )}
                  {!isLoadingVaultItems && !vaultItemsError && availableVaultItems.length === 0 && (
                    <p className="text-xs text-slate-500">
                      Noch keine Einträge vorhanden. Lege unten einen neuen Eintrag an.
                    </p>
                  )}
                  {!isLoadingVaultItems && !vaultItemsError && availableVaultItems.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {availableVaultItems.map((item: VaultItemSummary) => {
                        const status = getRotationStatus(item);
                        const showNew = isRecentlyUpdated(item);
                        const dueLabel = status?.dueDate ? formatDateDisplay(status.dueDate.toISOString()) : '';
                        const lastChangeIso = item.updatedAt || item.createdAt;
                        const lastChangeLabel = formatDateDisplay(lastChangeIso);
                        const lastChangeRelative = formatRelativeDaysFromNow(lastChangeIso);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelectVaultItem(item)}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                              selectedVaultItemId === item.id
                                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200'
                                : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600 hover:bg-slate-800/60'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <span className="block font-medium truncate">{item.title}</span>
                                {item.username && (
                                  <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                                    {item.username}
                                  </span>
                                )}
                                {item.categoryLabel && (
                                  <span
                                    className={`mt-1 inline-flex px-2 py-0.5 rounded text-[11px] ${
                                      item.categoryColor || 'bg-slate-800/50 text-slate-300 border border-slate-700'
                                    }`}
                                  >
                                    {item.categoryLabel}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {showNew && <Badge variant="success">Neu</Badge>}
                                {status && <Badge variant={status.variant}>{status.text}</Badge>}
                              </div>
                            </div>
                            {item.url && (
                              <p className="text-xs text-slate-500 truncate mt-1">{item.url}</p>
                            )}
                            {dueLabel && (
                              <p className="text-[11px] text-slate-500 mt-1">Ablauf: {dueLabel}</p>
                            )}
                            {lastChangeLabel && (
                              <p className="text-[11px] text-slate-600 mt-0.5">
                                Zuletzt geändert: {lastChangeLabel}
                                {lastChangeRelative && ` (${lastChangeRelative})`}
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {isVaultImportFormActive ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Zugangsdaten */}
                    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-4 md:col-span-2">
                      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.2em]">
                        Zugangsdaten
                      </h4>
                      <Input
                        label="Titel*"
                        value={vaultImportTitle}
                        onChange={e => handleVaultImportTitleChange(e.target.value)}
                        placeholder="z. B. Mail-Account"
                        list="vault-titles"
                        required
                      />
                      <datalist id="vault-titles">
                        {availableVaultItems.map((item: VaultItemSummary) => (
                          <option key={item.id} value={item.title} />
                        ))}
                      </datalist>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          label="Benutzername"
                          value={vaultImportUsername}
                          onChange={e => setVaultImportUsername(e.target.value)}
                          placeholder="Benutzername (optional)"
                        />
                        <Input
                          label="URL"
                          value={vaultImportUrl}
                          onChange={e => setVaultImportUrl(e.target.value)}
                          placeholder="https://beispiel.de (optional)"
                        />
                      </div>
                    </div>

                    {/* Sicherheit & Rotation */}
                    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-4">
                      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.2em]">
                        Sicherheit &amp; Rotation
                      </h4>
                      <div className="space-y-3">
                        <Input
                          label="Ablaufdatum"
                          type="date"
                          value={vaultImportExpiresAt}
                          onChange={e => handleVaultImportExpiresAtChange(e.target.value)}
                          helperText="Optional: Nach diesem Datum sollte ein neues Passwort erstellt werden"
                        />
                        <Input
                          label="Rotationsintervall (Tage)"
                          type="number"
                          min={0}
                          value={vaultImportRotationInterval}
                          onChange={e => handleVaultImportRotationIntervalChange(e.target.value)}
                          helperText="Optional: Automatisch nach X Tagen erneut generieren. 0 deaktiviert."
                        />
                        {autoComputedExpiry && (
                          <div className="text-xs text-indigo-200/90 bg-indigo-500/5 border border-indigo-500/20 rounded-md px-3 py-2 leading-relaxed">
                            <p>
                              Automatisches Ablaufdatum:{' '}
                              <span className="font-semibold text-indigo-200">
                                {formatDateDisplay(autoComputedExpiry)}
                              </span>
                            </p>
                            <p className="text-[11px] text-indigo-200/70 mt-1">
                              {expiryManuallyEdited
                                ? 'Manuell überschrieben – gespeicherter Wert wird verwendet.'
                                : activeRotationInterval
                                  ? `Wird beim Speichern automatisch auf Basis von ${activeRotationInterval} Tag${activeRotationInterval === 1 ? '' : 'en'} aktualisiert.`
                                  : 'Wird beim Speichern anhand des Rotationsintervalls aktualisiert.'}
                            </p>
                          </div>
                        )}
                        {!autoComputedExpiry && selectedVaultItem?.expiresAt && !vaultImportRotationInterval && (
                          <p className="text-xs text-slate-400">
                            Aktuelles Ablaufdatum: {formatDateDisplay(selectedVaultItem.expiresAt)}
                          </p>
                        )}
                        {selectedVaultItem && (
                          <div className="text-xs space-y-2 bg-slate-900/40 border border-slate-700/60 rounded-md px-3 py-3">
                            {selectedVaultStatus ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant={selectedVaultStatus.variant}>{selectedVaultStatus.text}</Badge>
                                  {selectedVaultStatus.dueDate && (
                                    <span className="text-slate-300">
                                      Nächstes Ablaufdatum:{' '}
                                      <span className="font-semibold text-slate-100">
                                        {formatDateDisplay(selectedVaultStatus.dueDate.toISOString())}
                                      </span>
                                    </span>
                                  )}
                                </div>
                                {selectedVaultStatus.daysRemaining < 0 ? (
                                  <p className="text-red-300">
                                    Bitte ein neues Passwort generieren und sichern.
                                  </p>
                                ) : (
                                  <p className="text-slate-400">
                                    Das aktuelle Passwort bleibt bis zu diesem Datum gültig.
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-slate-400">
                                Keine automatische Erinnerung aktiv. Setze optional Ablaufdatum oder Rotationsintervall.
                              </p>
                            )}
                            {selectedVaultItem.updatedAt && (
                              <p className="text-slate-500">
                                Zuletzt geändert:{' '}
                                <span className="text-slate-300">
                                  {formatDateDisplay(selectedVaultItem.updatedAt)} (
                                  {formatRelativeDaysFromNow(selectedVaultItem.updatedAt)})
                                </span>
                              </p>
                            )}
                            {selectedVaultRecentlyUpdated && (
                              <p className="text-emerald-300">
                                Gerade aktualisiert – keine Erinnerung erforderlich.
                              </p>
                            )}
                          </div>
                        )}
                        {upcomingExpiryInfo && (
                          <div className="text-xs bg-slate-800/60 border border-slate-700 rounded-md px-3 py-2 space-y-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-slate-300 font-medium">
                                Nächstes Ablaufdatum:
                              </span>
                              <Badge variant={upcomingExpiryInfo.variant}>{upcomingExpiryInfo.label}</Badge>
                            </div>
                            <p className="text-slate-200">
                              <span className="font-semibold">
                                {formatDateDisplay(upcomingExpiryInfo.dateIso)}
                              </span>
                              {upcomingExpiryInfo.source === 'existing' && ' (gespeicherter Wert)'}
                              {upcomingExpiryInfo.source === 'auto' && ' (berechnet aus Rotationsintervall)'}
                              {upcomingExpiryInfo.source === 'manual' && ' (manuell gesetzt)'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metadaten */}
                    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-4">
                      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.2em]">
                        Metadaten
                      </h4>
                      <div className="space-y-2">
                        <Input
                          label="Kategorie"
                          value={vaultImportCategoryLabel}
                          onChange={e => handleVaultCategoryInputChange(e.target.value)}
                          placeholder="z. B. Login, Banking, Social Media"
                          list="generator-category-options"
                        />
                        <datalist id="generator-category-options">
                          {getAllCategories(vaultCustomCategories).map(category => (
                            <option key={category.id} value={category.label} />
                          ))}
                        </datalist>
                      </div>
                      <Input
                        label="Notizen"
                        value={vaultImportNotes}
                        onChange={e => setVaultImportNotes(e.target.value)}
                        placeholder="Zusätzliche Informationen (optional)"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-800/40 border border-dashed border-slate-700/60 rounded-lg p-6 text-center text-sm text-slate-300">
                    <p>Wähle einen bestehenden Eintrag aus der Liste oben, um ihn zu aktualisieren.</p>
                    <p className="mt-2 text-slate-500">
                      Oder klicke auf <span className="text-slate-300">„Neuen Eintrag anlegen“</span>, um einen neuen Datensatz zu erstellen.
                    </p>
                  </div>
                )}
              </div>

              <Divider />

              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={closeVaultImportModal}
                >
                  {isVaultImportFormActive ? 'Abbrechen' : 'Schließen'}
                </Button>
                {isVaultImportFormActive && (
                  <Button
                    variant="primary"
                    onClick={savePasswordToVault}
                  >
                    Zum Vault hinzufügen
                  </Button>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
function slugifyCategory(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'custom';
}

function getColorForCategory(label: string) {
  const normalized = slugifyCategory(label);
  const hash = Array.from(normalized).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return CATEGORY_COLOR_POOL[hash % CATEGORY_COLOR_POOL.length];
}

function getAllCategories(customCategories: { id: string; label: string; color: string }[] = []) {
  return [...CATEGORIES, ...customCategories];
}

function findCategoryByLabel(
  label: string,
  customCategories: { id: string; label: string; color: string }[] = [],
) {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return undefined;
  return getAllCategories(customCategories).find(
    category => category.label.trim().toLowerCase() === normalized,
  );
}

function findCategoryById(
  id: string,
  customCategories: { id: string; label: string; color: string }[] = [],
) {
  return getAllCategories(customCategories).find(category => category.id === id);
}
