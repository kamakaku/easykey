'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getStash, clearStash, GenStash } from '../../lib/stash';
import AppShell from '../components/AppShell';
import VaultItem from '../components/VaultItem';
import { Card, Button, Input, Alert, Badge, Divider } from '../components/UI';
import { useBeforeLogout } from '../../lib/logout';
import { useAuth } from '../context/AuthContext';
import { encryptForStorage, decryptFromStorage } from '../../lib/crypto';

function encodeToBase64(str: string) {
  if (typeof window === 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
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
      return Buffer.from(b64, 'base64').toString('utf-8');
    }
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

type VaultGetResp = { blob: string };
// Definiere eine erweiterte Vault-Datenstruktur
type PasswordHistoryEntry = {
  value: string;
  changedAt: string;
};

type VaultItemType = {
  id: number;
  title: string;
  username?: string;
  password: string;
  url?: string;
  notes?: string;
  category?: string; // ID der Kategorie
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
  passwordHistory?: PasswordHistoryEntry[];
  rotationIntervalDays?: number;
};

// Erweiterte Vault-Datenstruktur mit Metadaten
type VaultData = {
  items: VaultItemType[];
  customCategories?: {id: string, label: string, color: string}[];
};

// Verfügbare Kategorien mit Farben
const CATEGORIES = [
  { id: 'login', label: 'Login', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { id: 'email', label: 'E-Mail', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  { id: 'bank', label: 'Bank', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  { id: 'card', label: 'Kreditkarte', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  { id: 'social', label: 'Social Media', color: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
  { id: 'work', label: 'Arbeit', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  { id: 'other', label: 'Sonstige', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
] as const;



export default function VaultClient() {
  const { encryptionKey } = useAuth();
  const [pending, setPending] = useState<GenStash | null>(null);
  const [items, setItems] = useState<VaultItemType[]>([]);
  const [vaultCustomCategories, setVaultCustomCategories] = useState<{id: string, label: string, color: string}[]>([]);
  const [pendingSaveAt, setPendingSaveAt] = useState<number | null>(null);
  const [hasPendingSave, setHasPendingSave] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [statusType, setStatusType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewingItem, setViewingItem] = useState<VaultItemType | null>(null);
  const [editingItem, setEditingItem] = useState<VaultItemType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  function formatDateTime(iso?: string) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('de-DE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formCategory, setFormCategory] = useState<string>('');
  const [formExpiresAt, setFormExpiresAt] = useState<string>('');
  const [formRotationInterval, setFormRotationInterval] = useState<string>('');
  const originalPasswordRef = useRef<string>('');

  // Zustand für Kategorien
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [customCategories, setCustomCategories] = useState<{id: string, label: string, color: string}[]>([]);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const expirationInfo = viewingItem ? getExpirationMeta(viewingItem.expiresAt) : null;
  const categoryInfo = viewingItem?.category ? getCategoryInfo(viewingItem.category) : null;

  function isoToDateInput(value?: string) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  }

  function dateInputToIso(value: string) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }

  function getExpirationMeta(expiresAt?: string) {
    if (!expiresAt) return null;
    const expiryDate = new Date(expiresAt);
    if (Number.isNaN(expiryDate.getTime())) return null;
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return {
      expiryDate,
      isExpired: diffMs < 0,
      daysLeft,
    };
  }

  function normalizeInterval(value: string) {
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return undefined;
    }
    return Math.round(parsed);
  }

  function calculateNextExpiration(explicitIso: string | undefined, intervalDays?: number, referenceIso?: string) {
    if (explicitIso) return explicitIso;
    if (!intervalDays) return undefined;
    const referenceDate = referenceIso ? new Date(referenceIso) : new Date();
    if (Number.isNaN(referenceDate.getTime())) return undefined;
    const next = new Date(referenceDate.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    return next.toISOString();
  }

  function derivePasswordFromExisting() {
    const base = formPassword || originalPasswordRef.current;
    const fallbackCharset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';

    const randomChar = (charset: string) => {
      if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
        const array = new Uint32Array(1);
        window.crypto.getRandomValues(array);
        return charset[array[0] % charset.length];
      }
      return charset[Math.floor(Math.random() * charset.length)];
    };

    const mutate = (value: string) => {
      if (!value) {
        let generated = '';
        for (let i = 0; i < 16; i++) {
          generated += randomChar(fallbackCharset);
        }
        return generated;
      }

      const substitutions: Record<string, string> = {
        'a': '4',
        'e': '3',
        'i': '1',
        'o': '0',
        's': '5',
        'g': '9'
      };

      const rotated = value.length > 2 ? value.slice(1) + value[0] : value.split('').reverse().join('');
      const replaced = rotated
        .split('')
        .map((char, index) => {
          const lower = char.toLowerCase();
          if (substitutions[lower] && index % 3 === 0) {
            return substitutions[lower];
          }
          return index % 2 === 0 ? char.toUpperCase() : char.toLowerCase();
        })
        .join('');

      const suffix = `${randomChar('!@#')}${randomChar('0123456789')}`;
      return `${replaced}${suffix}`;
    };

    const newPassword = mutate(base);
    originalPasswordRef.current = newPassword;
    setFormPassword(newPassword);
  }

  const updateStatus = useCallback((msg: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setStatus(msg);
    setStatusType(type);
  }, []);

  const persistVault = useCallback(
    async (origin: 'manual' | 'logout' = 'manual') => {
      try {
        // Prüfe ob Encryption Key vorhanden ist
        if (!encryptionKey) {
          const message = 'Kein Encryption Key vorhanden. Bitte neu einloggen.';
          updateStatus(message, 'error');
          throw new Error(message);
        }

        updateStatus(
          origin === 'manual' ? 'Speichere Vault …' : 'Speichere Vault vor Logout …',
          'info',
        );
        const vaultData = JSON.stringify({ items, customCategories: customCategories });

        // Verschlüssele mit AES-GCM
        const encrypted = await encryptForStorage(vaultData, encryptionKey);
        const blobB64 = btoa(encrypted); // Base64-kodiere das verschlüsselte Format

        const res = await fetch('/backend/api/v1/vault', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ blob: blobB64 }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `Speichern fehlgeschlagen (Status ${res.status})`);
        }
        setHasPendingSave(false);
        setPendingSaveAt(null);
        updateStatus(
          origin === 'manual'
            ? 'Erfolgreich gespeichert'
            : 'Vault gespeichert. Logout wird fortgesetzt.',
          'success',
        );
        return true;
      } catch (e: any) {
        const message = e?.message || 'Speichern fehlgeschlagen';
        updateStatus(`Fehler: ${message}`, 'error');
        setHasPendingSave(true);
        setPendingSaveAt(Date.now());
        if (origin === 'logout') {
          throw new Error(message);
        }
        return false;
      }
    },
    [items, encryptionKey, updateStatus],
  );

  const loadVault = useCallback(async () => {
    // Prüfe ob Encryption Key vorhanden ist
    if (!encryptionKey) {
      updateStatus('Kein Encryption Key vorhanden. Bitte neu einloggen.', 'error');
      return;
    }

    updateStatus('Lade Vault …', 'info');
    const res = await fetch('/backend/api/v1/vault', {
      cache: 'no-store',
      credentials: 'include',
    });
    if (res.status === 404) {
      updateStatus('Kein Vault vorhanden (neu anlegen).', 'info');
      setItems([]);
      // Initialisiere auch leere benutzerdefinierte Kategorien
      setCustomCategories([]);
      setHasPendingSave(false);
      setPendingSaveAt(null);
      return;
    }
    if (!res.ok) {
      updateStatus('Laden fehlgeschlagen', 'error');
      return;
    }
    const j = (await res.json()) as VaultGetResp;
    try {
      const blobDecoded = atob(j.blob);

      // Prüfe ob das neue Format (iv:ciphertext) vorliegt
      if (blobDecoded.includes(':')) {
        // Neues verschlüsseltes Format
        const json = await decryptFromStorage(blobDecoded, encryptionKey);
        const parsed = JSON.parse(json || '{}');
        setItems(Array.isArray(parsed.items) ? parsed.items : []);
        // Lade auch die gespeicherten benutzerdefinierten Kategorien
        if (Array.isArray(parsed.customCategories)) {
          setCustomCategories(parsed.customCategories);
        }
        setHasPendingSave(false);
        setPendingSaveAt(null);
        updateStatus('Erfolgreich geladen', 'success');
      } else {
        // Altes Base64-Format → Migration notwendig
        const json = decodeFromBase64(j.blob);
        const parsed = JSON.parse(json || '{}');
        setItems(Array.isArray(parsed.items) ? parsed.items : []);
        // Versuche auch alte benutzerdefinierte Kategorien zu laden (falls vorhanden)
        if (Array.isArray(parsed.customCategories)) {
          setCustomCategories(parsed.customCategories);
        }
        updateStatus('Alte Daten migriert. Wird beim nächsten Speichern verschlüsselt.', 'warning');
        // Setze hasPendingSave um automatisch neu zu speichern (verschlüsselt)
        setHasPendingSave(true);
        setPendingSaveAt(Date.now());
      }
    } catch (error) {
      console.error('Fehler beim Laden:', error);
      setItems([]);
      // Initialisiere auch leere benutzerdefinierte Kategorien im Fehlerfall
      setCustomCategories([]);
      setHasPendingSave(false);
      setPendingSaveAt(null);
      updateStatus('Vault konnte nicht entschlüsselt werden. Falsches Passwort oder defekte Daten?', 'error');
    }
  }, [encryptionKey, updateStatus]);

  function addPendingItem() {
    if (!pending) return;
    const newItem: VaultItemType = {
      id: Date.now(),
      title: pending.label || 'Unbenannt',
      username: '',
      password: pending.password,
      category: 'login', // Standardkategorie
      createdAt: new Date().toISOString(),
      passwordHistory: [
        {
          value: pending.password,
          changedAt: new Date().toISOString(),
        },
      ],
    };
    setItems([...items, newItem]);
    updateStatus(`Eintrag "${newItem.title}" hinzugefügt. Speichere …`, 'success');
    clearStash();
    setPending(null);
    setHasPendingSave(true);
    setPendingSaveAt(Date.now());
  }

  function openDetailModal(item: VaultItemType) {
    setViewingItem(item);
    setShowPassword(false);
    setCopied(false);
    setCopiedHistoryId(null);
    setHistoryExpanded(false);
    setShowDetailModal(true);
  }

  function openAddModal() {
    setEditingItem(null);
    setFormTitle('');
    setFormUsername('');
    setFormPassword('');
    setFormUrl('');
    setFormNotes('');
    setFormCategory('login'); // Standardkategorie
    setFormExpiresAt('');
    setFormRotationInterval('');
    originalPasswordRef.current = '';
    setShowAddModal(true);
  }

  function openEditModal(item: VaultItemType) {
    setShowDetailModal(false);
    setEditingItem(item);
    setFormTitle(item.title);
    setFormUsername(item.username || '');
    setFormPassword(item.password);
    setFormUrl(item.url || '');
    setFormNotes(item.notes || '');
    setFormCategory(item.category || 'login');
    setFormExpiresAt(isoToDateInput(item.expiresAt));
    setFormRotationInterval(item.rotationIntervalDays ? String(item.rotationIntervalDays) : '');
    originalPasswordRef.current = item.password;
    setShowAddModal(true);
  }

  function copyPassword() {
    if (viewingItem) {
      navigator.clipboard.writeText(viewingItem.password);
      setCopied(true);
      setCopiedHistoryId(null);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function copyUsername() {
    if (viewingItem?.username) {
      navigator.clipboard.writeText(viewingItem.username);
    }
  }

  function copyHistoryPassword(entry: PasswordHistoryEntry) {
    navigator.clipboard.writeText(entry.value);
    setCopied(false);
    setCopiedHistoryId(entry.changedAt);
    setTimeout(() => setCopiedHistoryId(null), 2000);
  }

  function saveItem() {
    if (!formTitle || !formPassword) {
      updateStatus('Titel und Passwort sind erforderlich', 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    const explicitExpiresIso = dateInputToIso(formExpiresAt);
    const intervalDays = normalizeInterval(formRotationInterval);
    const effectiveExpiresAt = calculateNextExpiration(explicitExpiresIso, intervalDays, nowIso);

    if (editingItem) {
      // Edit existing item
      setItems(items.map(item =>
        item.id === editingItem.id
          ? {
              ...item,
              title: formTitle,
              username: formUsername || undefined,
              password: formPassword,
              url: formUrl || undefined,
              notes: formNotes || undefined,
              category: formCategory,
              expiresAt: effectiveExpiresAt,
              rotationIntervalDays: intervalDays,
              passwordHistory: (() => {
                const history = item.passwordHistory ? [...item.passwordHistory] : [];
                if (history.length === 0) {
                  history.push({
                    value: item.password,
                    changedAt: item.updatedAt || item.createdAt,
                  });
                }
                if (formPassword !== item.password) {
                  history.push({
                    value: formPassword,
                    changedAt: nowIso,
                  });
                }
                return history;
              })(),
              updatedAt: nowIso
            }
          : item,
      ));
      updateStatus(`Eintrag "${formTitle}" aktualisiert.`, 'success');
    } else {
      // Add new item
      const newItem: VaultItemType = {
        id: Date.now(),
        title: formTitle,
        username: formUsername || undefined,
        password: formPassword,
        url: formUrl || undefined,
        notes: formNotes || undefined,
        category: formCategory,
        createdAt: nowIso,
        expiresAt: effectiveExpiresAt,
        rotationIntervalDays: intervalDays,
        passwordHistory: [
          {
            value: formPassword,
            changedAt: nowIso,
          },
        ],
      };
      setItems([...items, newItem]);
      updateStatus(`Eintrag "${formTitle}" hinzugefügt.`, 'success');
    }

    setShowAddModal(false);
    setHasPendingSave(true);
    setPendingSaveAt(Date.now());
  }

  function deleteItem(itemId: number) {
    const item = items.find(i => i.id === itemId);
    setItems(items.filter(i => i.id !== itemId));
    updateStatus(`Eintrag "${item?.title || 'Unbekannt'}" gelöscht.`, 'warning');
    setHasPendingSave(true);
    setPendingSaveAt(Date.now());
  }

  const saveVault = useCallback(() => {
    setHasPendingSave(true);
    setPendingSaveAt(Date.now());
    void persistVault('manual');
  }, [persistVault]);

  useEffect(() => {
    setPending(getStash());
    loadVault(); // Automatisches Laden beim Öffnen der Seite
  }, [loadVault]);

  useEffect(() => {
    if (!pending) return;
    addPendingItem();
  }, [pending]);

  const filteredItems = items.filter(item => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (
      item.title.toLowerCase().includes(q) ||
      (item.username && item.username.toLowerCase().includes(q)) ||
      (item.url && item.url.toLowerCase().includes(q))
    );
    
    // Filter by category if not 'all'
    const matchesCategory = selectedCategoryFilter === 'all' || item.category === selectedCategoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  useEffect(() => {
    updateStatus('Änderungen werden automatisch gespeichert.', 'info');
  }, []);

  // Helper function to get category info by ID
  function getCategoryInfo(categoryId: string) {
    const predefinedCategory = CATEGORIES.find(cat => cat.id === categoryId);
    if (predefinedCategory) {
      return predefinedCategory;
    }
    
    const customCategory = customCategories.find(cat => cat.id === categoryId);
    if (customCategory) {
      return customCategory;
    }
    
    // Default category if not found
    return CATEGORIES[CATEGORIES.length - 1]; // 'other' category
  }

  function addCustomCategory() {
    if (!newCategoryName.trim()) return;
    
    // Check if category already exists
    const existingCategory = [...CATEGORIES, ...customCategories].find(
      cat => cat.id === newCategoryName.trim().toLowerCase().replace(/\s+/g, '-')
    );
    
    if (existingCategory) {
      updateStatus(`Kategorie "${existingCategory.label}" existiert bereits.`, 'warning');
      return;
    }
    
    // Create a unique ID for the new category
    const newCategoryId = newCategoryName.trim().toLowerCase().replace(/\s+/g, '-');
    
    // Select a random pre-defined color class for consistency
    const predefinedColors = [
      'bg-rose-500/10 text-rose-400 border-rose-500/20',
      'bg-amber-500/10 text-amber-400 border-amber-500/20',
      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      'bg-violet-500/10 text-violet-400 border-violet-500/20',
      'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
    ];
    
    const randomColor = predefinedColors[Math.floor(Math.random() * predefinedColors.length)];
    
    const newCategory = {
      id: newCategoryId,
      label: newCategoryName.trim(),
      color: randomColor
    };
    
    setCustomCategories([...customCategories, newCategory]);
    setNewCategoryName('');
    setShowAddCategory(false);
    // Markiere als "zu speichern", damit die neuen Kategorien gespeichert werden
    setHasPendingSave(true);
    setPendingSaveAt(Date.now());
    updateStatus(`Kategorie "${newCategory.label}" hinzugefügt.`, 'success');
  }

  const handleBeforeLogout = useCallback(async () => {
    if (hasPendingSave) {
      await persistVault('logout');
    }
  }, [hasPendingSave, persistVault]);

  useBeforeLogout(handleBeforeLogout);

  useEffect(() => {
    if (!hasPendingSave || pendingSaveAt === null) return;
    const timer = setTimeout(() => {
      void persistVault('manual');
    }, 1500);
    return () => clearTimeout(timer);
  }, [hasPendingSave, pendingSaveAt, persistVault]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">Vault</h1>
            <p className="text-slate-400">🔒 Ende-zu-Ende verschlüsselt mit AES-256-GCM</p>
          </div>
          <div className="flex gap-3">
            <Button variant="primary" onClick={saveVault}>
              Speichern
            </Button>
          </div>
        </div>

        {status && (
          <Alert variant={statusType}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{status}</p>
              </div>
              <Badge variant={statusType === 'success' ? 'success' : statusType === 'warning' ? 'warning' : statusType === 'error' ? 'error' : 'info'}>
                Status
              </Badge>
            </div>
          </Alert>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Einträge</h2>
                <p className="text-sm text-slate-400">Verwalte deine Zugangsdaten – Änderungen werden automatisch gespeichert.</p>
              </div>
              <div className="flex gap-2">
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <Input
                    placeholder="Suche nach Titel, Benutzername oder URL"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full sm:w-64 mb-2 sm:mb-0 sm:mr-2"
                  />
                  <div className="flex gap-2">
                    <select
                      value={selectedCategoryFilter}
                      onChange={e => setSelectedCategoryFilter(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="all">Alle Kategorien</option>
                      {([...CATEGORIES, ...customCategories] as {id: string, label: string, color: string}[]).map(category => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    <Button variant="secondary" onClick={openAddModal}>
                      Neuer Eintrag
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Divider className="mb-6" />

            <div className="space-y-4">
              {filteredItems.length === 0 ? (
                <div className="border border-dashed border-slate-700 rounded-xl p-12 text-center bg-slate-800/40">
                  <svg className="w-12 h-12 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <p className="text-slate-400 mb-2">Noch keine Einträge vorhanden.</p>
                  <Button variant="secondary" onClick={openAddModal}>
                    Eintrag hinzufügen
                  </Button>
                </div>
              ) : (
                filteredItems.map(item => (
                  <VaultItem
                    key={item.id}
                    item={item}
                    onClick={openDetailModal}
                  />
                ))
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Kategorien verwalten</h2>
            <div className="space-y-4 text-sm text-slate-300">
              <p>
                Verwalte Kategorien für deine Passwörter, um sie besser organisieren zu können.
              </p>
              
              <Divider />
              
              <div className="space-y-3">
                <h3 className="font-medium text-slate-200">Vordefinierte Kategorien</h3>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(category => (
                    <span 
                      key={category.id} 
                      className={`px-2 py-1 rounded text-xs ${category.color}`}
                    >
                      {category.label}
                    </span>
                  ))}
                </div>
              </div>
              
              <Divider />
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-slate-200">Eigene Kategorien</h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddCategory(true)}>
                    + Neu
                  </Button>
                </div>
                
                {customCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {customCategories.map(category => (
                      <div key={category.id} className="flex items-center gap-1">
                        <span className={`px-2 py-1 rounded text-xs ${category.color}`}>
                          {category.label}
                        </span>
                        <button
                          onClick={() => {
                            setCustomCategories(customCategories.filter(c => c.id !== category.id));
                            // Markiere als "zu speichern", damit die Änderung gespeichert wird
                            setHasPendingSave(true);
                            setPendingSaveAt(Date.now());
                            updateStatus(`Kategorie "${category.label}" entfernt.`, 'warning');
                          }}
                          className="text-slate-500 hover:text-slate-300 p-1"
                          title="Kategorie entfernen"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm italic">Keine eigenen Kategorien erstellt</p>
                )}
              </div>
              
              <Divider />
              
              <div className="space-y-2">
                <Button variant="secondary" onClick={saveVault}>
                  Jetzt speichern
                </Button>
                <Button variant="ghost" onClick={() => { clearStash(); setPending(null); updateStatus('Zwischenspeicher geleert.', 'info'); }}>
                  Generator-Zwischenspeicher löschen
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Detail Modal */}
        {showDetailModal && viewingItem && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="max-w-lg w-full bg-slate-900 border-slate-600 space-y-4 relative">
              <button
                onClick={() => setShowDetailModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Header */}
              <div className="flex items-start gap-3 pr-8">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
                  <span className="text-white text-xl font-bold">
                    {viewingItem.title.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xl font-semibold text-slate-100 truncate">{viewingItem.title}</h3>
                    {categoryInfo && (
                      <span className={`px-2 py-0.5 rounded text-xs ${categoryInfo.color}`}>
                        {categoryInfo.label}
                      </span>
                    )}
                  </div>
                  {viewingItem.url && (
                    <a
                      href={viewingItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300 truncate block"
                    >
                      {viewingItem.url}
                    </a>
                  )}
                </div>
              </div>

              <Divider />

              {/* Details */}
              <div className="space-y-4">
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.2em]">
                    Überblick
                  </h4>
                  <div className="grid grid-cols-1 gap-3 text-sm text-slate-200 md:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Benutzername</span>
                      {viewingItem.username ? (
                        <div className="flex items-center gap-2">
                          <span className="truncate" title={viewingItem.username}>{viewingItem.username}</span>
                          <button
                            onClick={copyUsername}
                            className="p-1.5 hover:bg-slate-700/60 rounded-md transition-colors"
                            title="Benutzername kopieren"
                          >
                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Ablaufdatum</span>
                      {expirationInfo ? (
                        <div className="flex items-center gap-2">
                          <span>{expirationInfo.expiryDate.toLocaleDateString('de-DE', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}</span>
                          <Badge
                            variant={
                              expirationInfo.isExpired
                                ? 'error'
                                : expirationInfo.daysLeft <= 7
                                  ? 'warning'
                                  : 'success'
                            }
                          >
                            {expirationInfo.isExpired
                              ? 'Abgelaufen'
                              : expirationInfo.daysLeft <= 0
                                ? 'Heute'
                                : `${expirationInfo.daysLeft} ${expirationInfo.daysLeft === 1 ? 'Tag' : 'Tage'}`}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-slate-500">Keins gesetzt</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Rotation</span>
                      <span className="text-slate-200">
                        {viewingItem.rotationIntervalDays
                          ? `Alle ${viewingItem.rotationIntervalDays} ${viewingItem.rotationIntervalDays === 1 ? 'Tag' : 'Tage'}`
                          : 'Keine Vorgabe'}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Passwort-Verlauf</span>
                      <span className="text-slate-200">
                        {viewingItem.passwordHistory?.length
                          ? `${viewingItem.passwordHistory.length} Varianten`
                          : 'Keine Historie'}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Erstellt</span>
                      <span className="text-slate-200">{formatDateTime(viewingItem.createdAt)}</span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Aktualisiert</span>
                      <span className="text-slate-200">{formatDateTime(viewingItem.updatedAt)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-2">Passwort</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm text-slate-300 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700 font-mono truncate">
                      {showPassword ? viewingItem.password : '••••••••••••'}
                    </code>
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors flex-shrink-0"
                      title={showPassword ? 'Verbergen' : 'Anzeigen'}
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268-2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={copyPassword}
                      className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors flex-shrink-0"
                      title="Kopieren"
                    >
                      {copied ? (
                        <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Password History */}
                {viewingItem.passwordHistory && viewingItem.passwordHistory.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setHistoryExpanded(prev => !prev)}
                      className="w-full flex items-center justify-between text-xs text-slate-300 bg-slate-800/50 hover:bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 transition-colors"
                    >
                      <span className="font-semibold tracking-[0.2em] uppercase">
                        Passwort-Historie
                      </span>
                      <div className="flex items-center gap-2 text-slate-400">
                        <span>{viewingItem.passwordHistory.length}</span>
                        <Badge variant="default">History</Badge>
                        <svg
                          className={`w-4 h-4 transition-transform ${historyExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {historyExpanded && (
                      <div className="mt-2 space-y-1">
                        {[...viewingItem.passwordHistory]
                          .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
                          .map((entry, index) => {
                            const isLatest = index === 0;
                            return (
                              <div
                                key={`${entry.changedAt}-${index}`}
                                className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md border border-slate-700/70 bg-slate-800/60"
                              >
                                <div className="min-w-0 flex-1">
                                  <code className="text-xs text-slate-200 font-mono truncate block">
                                    {entry.value}
                                  </code>
                                  <p className="text-[10px] text-slate-500 mt-0.5">
                                    {new Date(entry.changedAt).toLocaleString('de-DE', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                {isLatest && <Badge variant="info">Aktuell</Badge>}
                                <button
                                  onClick={() => copyHistoryPassword(entry)}
                                  className="p-1.5 hover:bg-slate-700/60 rounded-md transition-colors"
                                  title="Passwort kopieren"
                                >
                                    {copiedHistoryId === entry.changedAt ? (
                                      <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    ) : (
                                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {viewingItem.notes && (
                  <div>
                    <label className="text-xs text-slate-400 block mb-2">Notizen</label>
                    <div className="text-sm text-slate-300 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                      {viewingItem.notes}
                    </div>
                  </div>
                )}
              </div>

              <Divider />

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => openEditModal(viewingItem)}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Bearbeiten
                </Button>
                <button
                  onClick={() => {
                    if (confirm(`Möchtest du "${viewingItem.title}" wirklich löschen?`)) {
                      deleteItem(viewingItem.id);
                      setShowDetailModal(false);
                    }
                  }}
                  className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20"
                  title="Löschen"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Add/Edit Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="max-w-3xl w-full bg-slate-900 border-slate-600 space-y-4 relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setShowAddModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <h3 className="text-xl font-semibold text-slate-100">
                {editingItem ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Zugangsdaten */}
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-4 md:col-span-2">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.2em]">
                    Zugangsdaten
                  </h4>
                  <Input
                    label="Titel"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="z. B. Mail-Account"
                    required
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      label="Benutzername"
                      value={formUsername}
                      onChange={e => setFormUsername(e.target.value)}
                    />
                    <div className="space-y-2">
                      <Input
                        label="Passwort"
                        value={formPassword}
                        onChange={e => setFormPassword(e.target.value)}
                        required
                      />
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <button
                          type="button"
                          onClick={derivePasswordFromExisting}
                          className="text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          Neues Passwort ableiten
                        </button>
                        <span className="text-slate-600">|</span>
                        <a
                          href="/generator"
                          className="text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          Zum Passwort-Generator
                        </a>
                      </div>
                    </div>
                  </div>
                  <Input
                    label="URL"
                    value={formUrl}
                    onChange={e => setFormUrl(e.target.value)}
                    placeholder="https://"
                  />
                </div>

                {/* Sicherheit & Rotation */}
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-4">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.2em]">
                    Sicherheit &amp; Rotation
                  </h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      label="Ablaufdatum"
                      type="date"
                      value={formExpiresAt}
                      onChange={e => setFormExpiresAt(e.target.value)}
                      helperText="Optional: Nach diesem Datum sollte das Passwort erneuert werden"
                    />
                    <Input
                      label="Rotationsintervall (Tage)"
                      type="number"
                      min={0}
                      value={formRotationInterval}
                      onChange={e => setFormRotationInterval(e.target.value)}
                      helperText="Optional: Automatisch nach X Tagen erinnern. 0 deaktiviert."
                    />
                  </div>
                </div>

                {/* Metadaten */}
                <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-4">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-[0.2em]">
                    Metadaten
                  </h4>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300 block">Kategorie</label>
                    <div className="flex flex-wrap gap-2">
                      {([...CATEGORIES, ...customCategories] as {id: string, label: string, color: string}[]).map(category => (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => setFormCategory(category.id)}
                          className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                            formCategory === category.id
                              ? `${category.color} ring-2 ring-offset-2 ring-offset-slate-900 ring-slate-500`
                              : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-700/50'
                          }`}
                        >
                          {category.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    label="Notizen"
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Zusätzliche Informationen"
                  />
                </div>
              </div>

              <Divider />

              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setShowAddModal(false)}>
                  Abbrechen
                </Button>
                <Button variant="primary" onClick={saveItem}>
                  {editingItem ? 'Aktualisieren' : 'Hinzufügen'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Custom Category Modal */}
        {showAddCategory && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="max-w-md w-full bg-slate-900 border-slate-600 space-y-4 relative">
              <button
                onClick={() => setShowAddCategory(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-100"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <h3 className="text-xl font-semibold text-slate-100">Neue Kategorie</h3>
              
              <div className="space-y-3">
                <Input
                  label="Kategoriename"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="z. B. E-Commerce, Soziale Netzwerke"
                  required
                />
              </div>

              <Divider />

              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setShowAddCategory(false)}>
                  Abbrechen
                </Button>
                <Button variant="primary" onClick={addCustomCategory}>
                  Erstellen
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
