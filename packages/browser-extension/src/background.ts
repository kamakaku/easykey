/// <reference types="chrome" />

import { decodeLegacyBlob, decryptFromStorage, encryptForStorage, importKey } from './crypto';

type VaultBlob = {
  blob: string;
};

type PasswordHistoryEntry = { value: string; changedAt: string };

type VaultItem = {
  id: number;
  title: string;
  username?: string;
  password: string;
  url?: string;
  notes?: string;
  category?: string;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
  rotationIntervalDays?: number;
  passwordHistory?: PasswordHistoryEntry[];
};

type VaultData = {
  items: VaultItem[];
  customCategories?: { id: string; label: string; color: string }[];
};

type CachedVault = {
  updatedAt: number;
  plaintext: string | null;
  parsed: VaultData | null;
};

type CredentialSuggestion = {
  id: string;
  url: string;
  origin: string;
  hostname: string;
  title: string;
  username?: string;
  password: string;
  createdAt: number;
};

const cache: CachedVault = {
  updatedAt: 0,
  plaintext: null,
  parsed: null,
};

let masterKey: CryptoKey | null = null;
let backendBaseUrl = '';
let csrfToken: string | null = null;
let pendingSuggestions: CredentialSuggestion[] = [];

async function restoreSuggestions() {
  try {
    const storage = chrome.storage?.session;
    if (!storage) return;
    const { easykeySuggestions } = await storage.get('easykeySuggestions');
    if (Array.isArray(easykeySuggestions)) {
      pendingSuggestions = easykeySuggestions as CredentialSuggestion[];
      updateBadge();
      notifySuggestionsChanged();
    }
  } catch (error) {
    console.warn('[EasyKey] restoreSuggestions failed', error);
  }
}

async function persistSuggestions() {
  try {
    const storage = chrome.storage?.session;
    if (!storage) return;
    await storage.set({ easykeySuggestions: pendingSuggestions });
  } catch (error) {
    console.warn('[EasyKey] persistSuggestions failed', error);
  }
}

function getApiUrl(path: string) {
  const base = backendBaseUrl || 'http://localhost:3000';
  return new URL(path, base).toString();
}

function updateBadge() {
  const text = pendingSuggestions.length > 0 ? '!' : '';
  void chrome.action.setBadgeText({ text }).catch(() => {});
  const color = pendingSuggestions.length > 0 ? '#dc2626' : '#4338ca';
  void chrome.action.setBadgeBackgroundColor({ color }).catch(() => {});
}

function notifySuggestionsChanged() {
  chrome.runtime.sendMessage({ type: 'easykey:suggestions-updated' }).catch(() => {});
}

function notifyVaultUpdated() {
  chrome.runtime.sendMessage({ type: 'easykey:vault-updated' }).catch(() => {});
}

async function fetchVaultBlob(): Promise<VaultBlob | null> {
  try {
    const response = await fetch(getApiUrl('/backend/api/v1/vault'), {
      credentials: 'include',
      cache: 'no-store',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Vault fetch failed: ${response.status}`);
    }

    return (await response.json()) as VaultBlob;
  } catch (error) {
    console.warn('[EasyKey] Vault fetch error', error);
    return null;
  }
}

async function ensureKeyReady() {
  if (!masterKey) {
    throw new Error('Master key not set. Bitte im Popup entsperren.');
  }
  return masterKey;
}

function cloneVault(data: VaultData | null): VaultData {
  if (!data) {
    return { items: [], customCategories: [] };
  }
  return JSON.parse(JSON.stringify(data)) as VaultData;
}

async function loadAndDecryptVault(forceRemote = false): Promise<VaultData> {
  const key = await ensureKeyReady();
  const now = Date.now();
  const isFresh = !forceRemote && cache.parsed && now - cache.updatedAt < 60_000;
  if (isFresh && cache.parsed && cache.plaintext) {
    return cloneVault(cache.parsed);
  }

  const blob = await fetchVaultBlob();
  if (!blob?.blob) {
    const empty: VaultData = { items: [], customCategories: [] };
    cache.plaintext = JSON.stringify(empty);
    cache.parsed = cloneVault(empty);
    cache.updatedAt = Date.now();
    return cloneVault(cache.parsed);
  }

  const encoded = blob.blob;
  const decoded = atob(encoded);
  let plaintext: string;

  if (decoded.includes(':')) {
    plaintext = await decryptFromStorage(decoded, key);
  } else {
    plaintext = decodeLegacyBlob(encoded);
  }

  cache.plaintext = plaintext;
  try {
    cache.parsed = JSON.parse(plaintext) as VaultData;
  } catch {
    cache.parsed = { items: [], customCategories: [] };
  }
  cache.updatedAt = Date.now();

  return cloneVault(cache.parsed);
}

async function saveVaultData(data: VaultData) {
  const key = await ensureKeyReady();
  const plaintext = JSON.stringify(data);
  const encrypted = await encryptForStorage(plaintext, key);
  const blobB64 = btoa(encrypted);
  const response = await fetch(getApiUrl('/backend/api/v1/vault'), {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    },
    body: JSON.stringify({ blob: blobB64 }),
  });
  if (!response.ok) {
    throw new Error(`Vault save failed: ${response.status}`);
  }
  cache.plaintext = plaintext;
  cache.parsed = cloneVault(data);
  cache.updatedAt = Date.now();
  notifyVaultUpdated();
}

function normalizeOrigin(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function extractHostname(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function findMatchingItem(data: VaultData, suggestion: CredentialSuggestion): VaultItem | undefined {
  const origin = suggestion.origin;
  if (!origin) return undefined;
  return data.items.find(item => {
    if (!item.url) return false;
    try {
      return new URL(item.url).origin === origin;
    } catch {
      return false;
    }
  });
}

function addSuggestion(suggestion: CredentialSuggestion) {
  console.log('[EasyKey Background] addSuggestion called with:', suggestion);

  const duplicate = pendingSuggestions.some(
    existing =>
      existing.origin === suggestion.origin &&
      existing.username === suggestion.username &&
      existing.password === suggestion.password
  );

  if (duplicate) {
    console.log('[EasyKey Background] Duplicate suggestion, ignoring');
    return;
  }

  pendingSuggestions.push(suggestion);
  console.log('[EasyKey Background] Suggestion added. Total suggestions:', pendingSuggestions.length);
  console.log('[EasyKey Background] All suggestions:', pendingSuggestions.map(s => ({ id: s.id, hostname: s.hostname })));

  updateBadge();
  notifySuggestionsChanged();
  void persistSuggestions();

  // Show browser notification - TEMPORARILY DISABLED due to icon issues
  // console.log('[EasyKey Background] Showing notification for suggestion:', suggestion.hostname);
  // void showSaveNotification(suggestion);
  console.log('[EasyKey Background] Browser notification temporarily disabled. Use popup or inline notification.');
}

async function showSaveNotification(suggestion: CredentialSuggestion) {
  try {
    const notificationId = `easykey-save-${suggestion.id}`;

    // Note: Using a data URL for the icon since Chrome notifications don't support SVG
    // A simple 128x128 purple/indigo icon as base64 PNG
    const iconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAACXBIWXMAAAsTAAALEwEAmpwYAAADGklEQVR4nO3dMW7bQBCF4ZkCLqxCReDCZ3DlO/kOPoMr38GFCwMq3Lgw4EJFgBQpVBgIEMCiuNzd+T7AhQvDIv/5Z0iR1BIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMCm7ff7T+Z+DdNsNpvvIcTj/yfG+Gme53me5+/mfk2YwRjzMcb4IyV1nudvMcZv5n5tmME8z99DCL9ijB/N/VomqCmG8OTvEMJXcw/AnLbb7RsR+WfuVzKZUxE5Xl5e/mvu1wAAgKmZ+wUAU2OHBuToAAAAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAC55Qgh/Hzd4+n0Yp7n77XWR3O/NkygphjCk79DCF/NPQBz2G63b0Tkn7lfCWZUU4zx5PLy8l9zvwaM6PT4F5F/5n4NGFFNMYRQa62P5n4NGNGV43/u1wAAAAAAwBzM/QKAqbFDA3KEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwDr+A+YsfxML+LzdAAAAAElFTkSuQmCC';

    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: iconDataUrl,
      title: 'EasyKey - Anmeldedaten speichern?',
      message: `Möchtest du die Anmeldedaten für ${suggestion.hostname || suggestion.title} speichern?`,
      buttons: [
        { title: 'Speichern' },
        { title: 'Ignorieren' }
      ],
      priority: 2,
      requireInteraction: true
    });
    console.log('[EasyKey Background] Notification created successfully');
  } catch (error) {
    console.error('[EasyKey Background] Notification creation failed', error);
  }
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (!notificationId.startsWith('easykey-save-')) return;

  const suggestionId = notificationId.replace('easykey-save-', '');
  const suggestion = pendingSuggestions.find(s => s.id === suggestionId);

  if (!suggestion) {
    void chrome.notifications.clear(notificationId);
    return;
  }

  if (buttonIndex === 0) {
    // "Speichern" clicked
    try {
      if (!masterKey) {
        // Open popup to unlock
        void chrome.notifications.clear(notificationId);
        const iconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAACXBIWXMAAAsTAAALEwEAmpwYAAADGklEQVR4nO3dMW7bQBCF4ZkCLqxCReDCZ3DlO/kOPoMr38GFCwMq3Lgw4EJFgBQpVBgIEMCiuNzd+T7AhQvDIv/5Z0iR1BIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMCm7ff7T+Z+DdNsNpvvIcTj/yfG+Gme53me5+/mfk2YwRjzMcb4IyV1nudvMcZv5n5tmME8z99DCL9ijB/N/VomqCmG8OTvEMJXcw/AnLbb7RsR+WfuVzKZUxE5Xl5e/mvu1wAAgKmZ+wUAU2OHBuToAAAAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAC55Qgh/Hzd4+n0Yp7n77XWR3O/NkygphjCk79DCF/NPQBz2G63b0Tkn7lfCWZUU4zx5PLy8l9zvwaM6PT4F5F/5n4NGFFNMYRQa62P5n4NGNGV43/u1wAAAAAAwBzM/QKAqbFDA3KEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwDr+A+YsfxML+LzdAAAAAElFTkSuQmCC';
        void chrome.notifications.create('easykey-unlock-required', {
          type: 'basic',
          iconUrl: iconDataUrl,
          title: 'EasyKey - Entsperren erforderlich',
          message: 'Bitte entsperre EasyKey im Popup, um die Anmeldedaten zu speichern.',
          priority: 1
        });
        return;
      }

      const vault = await loadAndDecryptVault(true);
      const nowIso = new Date().toISOString();

      const existing = findMatchingItem(vault, suggestion);
      if (existing) {
        existing.username = suggestion.username || existing.username;
        if (existing.password !== suggestion.password) {
          if (!existing.passwordHistory) {
            existing.passwordHistory = [];
          }
          existing.passwordHistory.push({
            value: suggestion.password,
            changedAt: nowIso,
          });
          existing.password = suggestion.password;
        }
        existing.url = existing.url || suggestion.url;
        existing.updatedAt = nowIso;
      } else {
        const newItem: VaultItem = {
          id: Date.now(),
          title: suggestion.title,
          username: suggestion.username || undefined,
          password: suggestion.password,
          url: suggestion.url || suggestion.origin,
          category: 'login',
          notes: undefined,
          createdAt: nowIso,
          updatedAt: nowIso,
          passwordHistory: [
            {
              value: suggestion.password,
              changedAt: nowIso,
            },
          ],
        };
        vault.items.push(newItem);
      }

      await saveVaultData(vault);
      removeSuggestion(suggestion.id);

      void chrome.notifications.clear(notificationId);
      const iconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAACXBIWXMAAAsTAAALEwEAmpwYAAADGklEQVR4nO3dMW7bQBCF4ZkCLqxCReDCZ3DlO/kOPoMr38GFCwMq3Lgw4EJFgBQpVBgIEMCiuNzd+T7AhQvDIv/5Z0iR1BIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMCm7ff7T+Z+DdNsNpvvIcTj/yfG+Gme53me5+/mfk2YwRjzMcb4IyV1nudvMcZv5n5tmME8z99DCL9ijB/N/VomqCmG8OTvEMJXcw/AnLbb7RsR+WfuVzKZUxE5Xl5e/mvu1wAAgKmZ+wUAU2OHBuToAAAAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAC55Qgh/Hzd4+n0Yp7n77XWR3O/NkygphjCk79DCF/NPQBz2G63b0Tkn7lfCWZUU4zx5PLy8l9zvwaM6PT4F5F/5n4NGFFNMYRQa62P5n4NGNGV43/u1wAAAAAAwBzM/QKAqbFDA3KEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwDr+A+YsfxML+LzdAAAAAElFTkSuQmCC';
      void chrome.notifications.create('easykey-saved-success', {
        type: 'basic',
        iconUrl: iconDataUrl,
        title: 'EasyKey - Gespeichert',
        message: `Anmeldedaten für ${suggestion.hostname || suggestion.title} wurden gespeichert.`,
        priority: 0
      });
    } catch (error) {
      console.error('[EasyKey] Save from notification failed', error);
      const iconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAACXBIWXMAAAsTAAALEwEAmpwYAAADGklEQVR4nO3dMW7bQBCF4ZkCLqxCReDCZ3DlO/kOPoMr38GFCwMq3Lgw4EJFgBQpVBgIEMCiuNzd+T7AhQvDIv/5Z0iR1BIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMCm7ff7T+Z+DdNsNpvvIcTj/yfG+Gme53me5+/mfk2YwRjzMcb4IyV1nudvMcZv5n5tmME8z99DCL9ijB/N/VomqCmG8OTvEMJXcw/AnLbb7RsR+WfuVzKZUxE5Xl5e/mvu1wAAgKmZ+wUAU2OHBuToAAAAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAA5QgCQIwQAOUIAkCMEADlCAJAjBAC55Qgh/Hzd4+n0Yp7n77XWR3O/NkygphjCk79DCF/NPQBz2G63b0Tkn7lfCWZUU4zx5PLy8l9zvwaM6PT4F5F/5n4NGFFNMYRQa62P5n4NGNGV43/u1wAAAAAAwBzM/QKAqbFDA3KEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAByhAAgRwgAcoQAIEcIAHKEACBHCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwDr+A+YsfxML+LzdAAAAAElFTkSuQmCC';
      void chrome.notifications.create('easykey-save-error', {
        type: 'basic',
        iconUrl: iconDataUrl,
        title: 'EasyKey - Fehler',
        message: 'Speichern fehlgeschlagen. Bitte versuche es über das Popup.',
        priority: 1
      });
    }
  } else if (buttonIndex === 1) {
    // "Ignorieren" clicked
    removeSuggestion(suggestionId);
    void chrome.notifications.clear(notificationId);
  }
});

// Clear notification after timeout
chrome.notifications.onClosed.addListener((notificationId) => {
  if (notificationId.startsWith('easykey-') && !notificationId.startsWith('easykey-save-')) {
    setTimeout(() => {
      void chrome.notifications.clear(notificationId);
    }, 5000);
  }
});

function removeSuggestion(id: string) {
  pendingSuggestions = pendingSuggestions.filter(s => s.id !== id);
  updateBadge();
  notifySuggestionsChanged();
  void persistSuggestions();
}

chrome.runtime.onInstalled.addListener(() => {
  console.info('[EasyKey] Extension installed');
});

void restoreSuggestions();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'easykey:configure': {
        backendBaseUrl = message.baseUrl || backendBaseUrl;
        csrfToken = message.csrfToken ?? csrfToken;
        cache.plaintext = null;
        cache.parsed = null;
        cache.updatedAt = 0;
        sendResponse({ ok: true, baseUrl: backendBaseUrl });
        break;
      }

      case 'easykey:set-master-key': {
        if (message.key && Array.isArray(message.key)) {
          masterKey = await importKey(message.key);
          cache.plaintext = null;
          cache.parsed = null;
          cache.updatedAt = 0;
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'invalid-key' });
        }
        break;
      }

      case 'easykey:get-vault': {
        try {
          await loadAndDecryptVault(false);
          sendResponse({ ok: true, vault: cache.plaintext });
        } catch (error) {
          console.warn('[EasyKey] Failed to read vault', error);
          sendResponse({ ok: false, error: (error as Error).message });
        }
        break;
      }

      case 'easykey:clear-cache': {
        cache.plaintext = null;
        cache.parsed = null;
        cache.updatedAt = 0;
        sendResponse({ ok: true });
        break;
      }

      case 'easykey:suggest-save': {
        console.log('[EasyKey Background] Received suggest-save message:', message);
        try {
          const { url, username, password, title } = message;
          if (!password) {
            console.warn('[EasyKey Background] Missing password in suggestion');
            sendResponse({ ok: false, error: 'missing-password' });
            break;
          }
          const origin = normalizeOrigin(url || sender?.url || '');
          const hostname = extractHostname(url || sender?.url || '');

          console.log('[EasyKey Background] Creating suggestion:', { origin, hostname, title, username: username || 'none' });

          // Check if credentials already exist in vault (if unlocked)
          if (masterKey) {
            console.log('[EasyKey Background] Master key present, checking vault for duplicates...');
            try {
              const vault = await loadAndDecryptVault(false);
              const alreadyExists = vault.items.some(item => {
                if (!item.url) return false;
                try {
                  const itemOrigin = new URL(item.url).origin;
                  const sameOrigin = itemOrigin === origin;
                  const sameUsername = item.username === username;
                  const samePassword = item.password === password;
                  return sameOrigin && sameUsername && samePassword;
                } catch {
                  return false;
                }
              });

              if (alreadyExists) {
                console.log('[EasyKey Background] Credentials already exist in vault, not creating suggestion');
                sendResponse({ ok: true, alreadyExists: true });
                break;
              }
              console.log('[EasyKey Background] Credentials not in vault, creating suggestion');
            } catch (error) {
              console.warn('[EasyKey Background] Could not check vault, creating suggestion anyway:', error);
            }
          } else {
            console.log('[EasyKey Background] Master key not set, cannot check vault for duplicates');
          }

          const suggestion: CredentialSuggestion = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
            url: url || origin,
            origin,
            hostname,
            title: title || hostname || 'Unbenannt',
            username,
            password,
            createdAt: Date.now(),
          };

          console.log('[EasyKey Background] Adding suggestion with ID:', suggestion.id);
          addSuggestion(suggestion);
          console.log('[EasyKey Background] Current suggestions count:', pendingSuggestions.length);

          sendResponse({ ok: true });
        } catch (error) {
          console.error('[EasyKey Background] Suggest save failed', error);
          sendResponse({ ok: false, error: (error as Error).message });
        }
        break;
      }

      case 'easykey:get-suggestions': {
        sendResponse({ ok: true, suggestions: pendingSuggestions });
        break;
      }

      case 'easykey:discard-suggestion': {
        removeSuggestion(message.id);
        sendResponse({ ok: true });
        break;
      }

      case 'easykey:apply-suggestion': {
        try {
          const suggestion = pendingSuggestions.find(s => s.id === message.id);
          if (!suggestion) {
            sendResponse({ ok: false, error: 'not-found' });
            break;
          }

          const vault = await loadAndDecryptVault(true);
          const nowIso = new Date().toISOString();

          const existing = findMatchingItem(vault, suggestion);
          if (existing) {
            existing.username = suggestion.username || existing.username;
            if (existing.password !== suggestion.password) {
              if (!existing.passwordHistory) {
                existing.passwordHistory = [];
              }
              existing.passwordHistory.push({
                value: suggestion.password,
                changedAt: nowIso,
              });
              existing.password = suggestion.password;
            }
            existing.url = existing.url || suggestion.url;
            existing.updatedAt = nowIso;
          } else {
            const newItem: VaultItem = {
              id: Date.now(),
              title: suggestion.title,
              username: suggestion.username || undefined,
              password: suggestion.password,
              url: suggestion.url || suggestion.origin,
              category: 'login',
              notes: undefined,
              createdAt: nowIso,
              updatedAt: nowIso,
              passwordHistory: [
                {
                  value: suggestion.password,
                  changedAt: nowIso,
                },
              ],
            };
            vault.items.push(newItem);
          }

          await saveVaultData(vault);
          removeSuggestion(suggestion.id);
          sendResponse({ ok: true });
        } catch (error) {
          console.error('[EasyKey] Apply suggestion failed', error);
          sendResponse({ ok: false, error: (error as Error).message });
        }
        break;
      }

      case 'easykey:get-autofill': {
        try {
          if (!masterKey) {
            sendResponse({ ok: false, reason: 'locked' });
            break;
          }
          const origin = normalizeOrigin(message.url);
          if (!origin) {
            sendResponse({ ok: true, credentials: null });
            break;
          }
          const vault = await loadAndDecryptVault(false);
          const match = vault.items.find(item => {
            if (!item.url) return false;
            try {
              return new URL(item.url).origin === origin;
            } catch {
              return false;
            }
          });
          if (match) {
            sendResponse({
              ok: true,
              credentials: { username: match.username, password: match.password },
            });
          } else {
            sendResponse({ ok: true, credentials: null });
          }
        } catch (error) {
          console.error('[EasyKey] Autofill lookup failed', error);
          sendResponse({ ok: false, error: (error as Error).message });
        }
        break;
      }

      case 'easykey:open-popup': {
        // Open extension popup (note: this can only be triggered by user action)
        try {
          void chrome.action.openPopup();
          sendResponse({ ok: true });
        } catch (error) {
          console.warn('[EasyKey] Could not open popup', error);
          sendResponse({ ok: false, error: 'popup-open-failed' });
        }
        break;
      }

      case 'easykey:store-pending-login': {
        try {
          console.log('[EasyKey Background] Storing pending login:', message);
          await chrome.storage.session.set({
            easykeyPendingLogin: {
              credentials: message.credentials,
              url: message.url,
              timestamp: message.timestamp
            }
          });
          sendResponse({ ok: true });
        } catch (error) {
          console.error('[EasyKey Background] Failed to store pending login:', error);
          sendResponse({ ok: false, error: (error as Error).message });
        }
        break;
      }

      case 'easykey:get-pending-login': {
        try {
          const { easykeyPendingLogin } = await chrome.storage.session.get('easykeyPendingLogin');
          console.log('[EasyKey Background] Get pending login:', easykeyPendingLogin);
          if (easykeyPendingLogin) {
            sendResponse({ ok: true, pendingLogin: easykeyPendingLogin });
          } else {
            sendResponse({ ok: true, pendingLogin: null });
          }
        } catch (error) {
          console.error('[EasyKey Background] Failed to get pending login:', error);
          sendResponse({ ok: false, error: (error as Error).message });
        }
        break;
      }

      case 'easykey:clear-pending-login': {
        try {
          console.log('[EasyKey Background] Clearing pending login');
          await chrome.storage.session.remove('easykeyPendingLogin');
          sendResponse({ ok: true });
        } catch (error) {
          console.error('[EasyKey Background] Failed to clear pending login:', error);
          sendResponse({ ok: false, error: (error as Error).message });
        }
        break;
      }

      default:
        sendResponse({ ok: false, error: 'unknown-message' });
        break;
    }
  })();

  return true;
});
