import { exportKey, generateKeyFromPassword } from '../crypto';

const statusEl = document.querySelector<HTMLParagraphElement>('#status');
const unlockForm = document.querySelector<HTMLFormElement>('#unlock-form');
const passwordInput = document.querySelector<HTMLInputElement>('#master-password');
const vaultItemsContainer = document.querySelector<HTMLDivElement>('#vault-items');
const vaultEmptyState = document.querySelector<HTMLParagraphElement>('#vault-empty');
const suggestionsSection = document.querySelector<HTMLElement>('#suggestions-section');
const suggestionsList = document.querySelector<HTMLDivElement>('#suggestions-list');
const suggestionsEmpty = document.querySelector<HTMLParagraphElement>('#suggestions-empty');
const suggestionsCountLabel = document.querySelector<HTMLSpanElement>('#suggestions-count');

type VaultItem = {
  id: number;
  title: string;
  username?: string;
  password: string;
  url?: string;
  notes?: string;
  category?: string;
};

type VaultData = {
  items: VaultItem[];
  customCategories?: { id: string; label: string; color: string }[];
};

type Suggestion = {
  id: string;
  url: string;
  origin: string;
  hostname: string;
  title: string;
  username?: string;
  password: string;
  createdAt: number;
};

let currentVault: VaultData | null = null;
let suggestions: Suggestion[] = [];
function setUnlockVisible(visible: boolean) {
  if (unlockForm) {
    unlockForm.style.display = visible ? '' : 'none';
  }
}

function showStatus(text: string, variant: 'info' | 'error' | 'success' = 'info') {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.dataset.variant = variant;
}

function clearVaultList() {
  if (vaultItemsContainer) vaultItemsContainer.innerHTML = '';
  if (vaultEmptyState) {
    vaultEmptyState.textContent = 'Noch keine Daten geladen.';
    vaultEmptyState.style.display = '';
  }
  currentVault = null;
}

function renderSuggestions() {
  console.log('[EasyKey Popup] Rendering suggestions:', suggestions.length);

  if (!suggestionsSection || !suggestionsList || !suggestionsEmpty) {
    console.warn('[EasyKey Popup] Suggestions DOM elements not found');
    return;
  }

  if (suggestions.length === 0) {
    console.log('[EasyKey Popup] No suggestions to render, hiding section');
    suggestionsSection.style.display = 'none';
    suggestionsSection.classList.remove('has-items');
    suggestionsList.innerHTML = '';
    suggestionsEmpty.style.display = '';
    if (suggestionsCountLabel) suggestionsCountLabel.textContent = '';
    return;
  }

  console.log('[EasyKey Popup] Rendering', suggestions.length, 'suggestions');

  // Show suggestions section - MUST use 'block' to override inline style="display:none"
  console.log('[EasyKey Popup] Setting suggestions section display to BLOCK');
  suggestionsSection.style.display = 'block';
  suggestionsSection.classList.add('has-items');
  console.log('[EasyKey Popup] Suggestions section display:', suggestionsSection.style.display);
  console.log('[EasyKey Popup] Suggestions section visible?', suggestionsSection.offsetParent !== null);

  suggestionsList.innerHTML = '';
  suggestionsEmpty.style.display = 'none';
  if (suggestionsCountLabel) {
    suggestionsCountLabel.textContent = `${suggestions.length}`;
  }
  const locked = unlockForm?.style.display !== 'none';
  if (locked) {
    showStatus('Neue Anmeldedaten erkannt – bitte zuerst entsperren.', 'info');
  } else {
    showStatus('Neue Anmeldedaten erkannt – jetzt speichern.', 'info');
  }

  console.log('[EasyKey Popup] Creating suggestion DOM elements...');
  suggestions.forEach((suggestion, index) => {
    console.log(`[EasyKey Popup] Creating suggestion ${index + 1}:`, suggestion.hostname, suggestion.title);
    const wrapper = document.createElement('div');
    wrapper.className = 'vault-item';
    wrapper.dataset.suggestionId = suggestion.id;

    const title = document.createElement('h3');
    title.textContent = suggestion.title || suggestion.hostname || 'Neue Anmeldedaten';
    console.log(`[EasyKey Popup] Suggestion title:`, title.textContent);
    wrapper.appendChild(title);

    if (suggestion.username) {
      const username = document.createElement('p');
      username.textContent = `Benutzername: ${suggestion.username}`;
      wrapper.appendChild(username);
    }

    const host = document.createElement('p');
    host.textContent = `Domain: ${suggestion.hostname || suggestion.origin}`;
    wrapper.appendChild(host);

    const actionRow = document.createElement('div');
    actionRow.className = 'vault-item-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.dataset.action = 'suggest-save';
    saveBtn.dataset.id = suggestion.id;
    saveBtn.textContent = 'Speichern';
    if (locked) {
      saveBtn.disabled = true;
      saveBtn.title = 'Zuerst entsperren, um zu speichern';
    }

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.dataset.action = 'suggest-dismiss';
    dismissBtn.dataset.id = suggestion.id;
    dismissBtn.textContent = 'Ignorieren';

    actionRow.appendChild(saveBtn);
    actionRow.appendChild(dismissBtn);
    wrapper.appendChild(actionRow);

    suggestionsList.appendChild(wrapper);
    console.log(`[EasyKey Popup] Suggestion ${index + 1} added to DOM`);
  });

  console.log('[EasyKey Popup] All suggestions rendered. suggestionsList children:', suggestionsList.children.length);
  console.log('[EasyKey Popup] suggestionsList HTML:', suggestionsList.innerHTML.substring(0, 200));

  setTimeout(() => {
    suggestionsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function resolveCategoryLabel(categoryId?: string) {
  if (!categoryId || !currentVault?.customCategories) return categoryId ?? '';
  const match = currentVault.customCategories.find(c => c.id === categoryId);
  return match?.label ?? categoryId ?? '';
}

async function renderVault(data: VaultData) {
  currentVault = data;
  if (!vaultItemsContainer || !vaultEmptyState) return;

  vaultItemsContainer.innerHTML = '';

  if (!data.items || data.items.length === 0) {
    vaultEmptyState.textContent = 'Keine Einträge im Vault.';
    vaultEmptyState.style.display = '';
    return;
  }

  vaultEmptyState.style.display = 'none';

  // Get current tab URL for matching
  let currentTabOrigin: string | null = null;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && tabs[0].url) {
      const url = new URL(tabs[0].url);
      currentTabOrigin = url.origin;
    }
  } catch (error) {
    console.warn('[EasyKey] Could not get current tab URL:', error);
  }

  // Sort items: matching ones first
  const sortedItems = [...data.items].map((item, originalIndex) => ({
    item,
    originalIndex,
    isMatch: currentTabOrigin && item.url ? (() => {
      try {
        const itemOrigin = new URL(item.url).origin;
        return itemOrigin === currentTabOrigin;
      } catch {
        return false;
      }
    })() : false
  })).sort((a, b) => {
    if (a.isMatch && !b.isMatch) return -1;
    if (!a.isMatch && b.isMatch) return 1;
    return 0;
  });

  sortedItems.forEach(({ item, originalIndex, isMatch }) => {
    const wrapper = document.createElement('div');
    wrapper.className = isMatch ? 'vault-item vault-item-match' : 'vault-item';
    wrapper.dataset.index = String(originalIndex);

    // Header with title and link
    const header = document.createElement('div');
    header.className = 'vault-item-header';

    const title = document.createElement('h3');
    title.className = 'vault-item-title';

    // Add favicon if URL exists
    if (item.url) {
      try {
        const urlObj = new URL(item.url);
        const domain = urlObj.hostname;
        const favicon = document.createElement('img');
        favicon.className = 'vault-item-favicon';
        favicon.src = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
        favicon.alt = '';
        favicon.loading = 'lazy';
        title.appendChild(favicon);
      } catch (error) {
        console.warn('[EasyKey] Invalid URL for favicon:', item.url);
      }
    }

    // Add title text
    const titleText = document.createTextNode(item.title);
    title.appendChild(titleText);

    // Add URL as data attribute for hover tooltip
    if (item.url) {
      title.dataset.url = item.url;
    }

    if (item.category) {
      const badge = document.createElement('span');
      badge.className = 'category';
      badge.textContent = resolveCategoryLabel(item.category);
      title.appendChild(badge);
    }

    // Link to vault item on website
    const link = document.createElement('a');
    link.href = `http://localhost:3000/vault/${item.id}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'vault-item-link';
    link.title = 'Im Vault öffnen';
    link.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

    header.appendChild(title);
    header.appendChild(link);
    wrapper.appendChild(header);

    const actionRow = document.createElement('div');
    actionRow.className = 'vault-item-actions';

    // Copy username button
    if (item.username) {
      const copyUsernameButton = document.createElement('button');
      copyUsernameButton.type = 'button';
      copyUsernameButton.dataset.action = 'copy-username';
      copyUsernameButton.dataset.index = String(originalIndex);
      copyUsernameButton.dataset.tooltip = 'Benutzername kopieren';
      copyUsernameButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
      actionRow.appendChild(copyUsernameButton);
    }

    // Copy password button
    const copyPasswordButton = document.createElement('button');
    copyPasswordButton.type = 'button';
    copyPasswordButton.dataset.action = 'copy-password';
    copyPasswordButton.dataset.index = String(originalIndex);
    copyPasswordButton.dataset.tooltip = 'Passwort kopieren';
    copyPasswordButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    actionRow.appendChild(copyPasswordButton);

    // Autofill button
    const fillButton = document.createElement('button');
    fillButton.type = 'button';
    fillButton.dataset.action = 'fill';
    fillButton.dataset.index = String(originalIndex);
    fillButton.dataset.tooltip = 'Autofill';
    fillButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    actionRow.appendChild(fillButton);

    wrapper.appendChild(actionRow);

    vaultItemsContainer.appendChild(wrapper);
  });
}

async function loadConfig() {
  const baseUrl = 'http://localhost:3000/';
  await chrome.runtime.sendMessage({
    type: 'easykey:configure',
    baseUrl,
    csrfToken: '',
  });
}

async function loadSuggestions() {
  console.log('[EasyKey Popup] Loading suggestions...');
  try {
    const previousCount = suggestions.length;
    const response = await chrome.runtime.sendMessage({ type: 'easykey:get-suggestions' });
    console.log('[EasyKey Popup] Get-suggestions response:', response);

    if (response?.ok) {
      suggestions = Array.isArray(response.suggestions) ? response.suggestions : [];
      console.log('[EasyKey Popup] Loaded suggestions:', suggestions.length, suggestions);
      renderSuggestions();
      if (previousCount === 0 && suggestions.length > 0) {
        showStatus('Neue Anmeldedaten erkannt – jetzt speichern?', 'info');
      }
    }
  } catch (error) {
    console.error('[EasyKey Popup] loadSuggestions Fehler', error);
  }
}

unlockForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const password = passwordInput?.value ?? '';
  if (!password) {
    showStatus('Bitte Master-Passwort eingeben.', 'error');
    return;
  }

  try {
    const key = await generateKeyFromPassword(password);
    const rawKey = await exportKey(key);
    await chrome.runtime.sendMessage({ type: 'easykey:set-master-key', key: Array.from(rawKey) });
    if (chrome.storage?.session) {
      await chrome.storage.session.set({ easykeySession: { key: Array.from(rawKey) } });
    }
    showStatus('Vault wird geladen …', 'info');
    passwordInput!.value = '';
    setUnlockVisible(false);
    await loadSuggestions();
    await loadVault();
  } catch (error) {
    console.error('[EasyKey] Master-Key Fehler', error);
    showStatus('Schlüssel konnte nicht gesetzt werden.', 'error');
    setUnlockVisible(true);
  }
});

async function loadVault() {
  clearVaultList();
  try {
    const response = await chrome.runtime.sendMessage({ type: 'easykey:get-vault' });
    if (response?.ok) {
      if (response.vault) {
        let parsed: VaultData | null = null;
        try {
          parsed = JSON.parse(response.vault) as VaultData;
        } catch (error) {
          console.error('[EasyKey] JSON parse error', error);
        }
        if (parsed) {
          renderVault(parsed);
          showStatus('Vault geladen.', 'success');
        } else {
          showStatus('Vault konnte nicht geparst werden.', 'error');
        }
      } else {
        showStatus('Kein Vault vorhanden oder leer.', 'info');
      }
    } else {
      const errorMessage = response?.error ?? 'unbekannt';
      showStatus(`Fehler: ${errorMessage}`, 'error');
      if (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('master key not set')) {
        if (chrome.storage?.session) {
          await chrome.storage.session.remove('easykeySession');
        }
        setUnlockVisible(true);
      }
    }
  } catch (error) {
    console.error('[EasyKey] Vault Fehler', error);
    showStatus('Fehler beim Laden des Vaults.', 'error');
    setUnlockVisible(true);
  }
}

setUnlockVisible(true);

void loadConfig();

async function initializeSessionKey() {
  if (!chrome.storage?.session) {
    // No session storage available, load suggestions anyway
    await loadSuggestions();
    return;
  }
  const { easykeySession } = await chrome.storage.session.get('easykeySession');
  if (easykeySession?.key) {
    try {
      await chrome.runtime.sendMessage({ type: 'easykey:set-master-key', key: easykeySession.key });
      showStatus('Vault wird geladen …', 'info');
      setUnlockVisible(false);
      await loadVault();
      await loadSuggestions(); // Load suggestions after unlocking
    } catch (error) {
      console.error('[EasyKey] Session-Key Fehler', error);
      showStatus('Session konnte nicht wiederhergestellt werden.', 'error');
      setUnlockVisible(true);
      if (chrome.storage?.session) {
        await chrome.storage.session.remove('easykeySession');
      }
      await loadSuggestions(); // Load suggestions even on error
    }
  } else {
    // No session found, load suggestions anyway
    await loadSuggestions();
  }
}

void initializeSessionKey();

suggestionsList?.addEventListener('click', event => {
  const target = event.target as HTMLElement;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) return;

  switch (action) {
    case 'suggest-save':
      void applySuggestion(id);
      break;
    case 'suggest-dismiss':
      void dismissSuggestion(id);
      break;
    default:
      break;
  }
});

vaultItemsContainer?.addEventListener('click', event => {
  const target = event.target as HTMLElement;
  if (!(target instanceof HTMLElement)) return;

  const action = target.dataset.action;
  const indexStr = target.dataset.index;
  if (!action || indexStr === undefined) return;

  const index = Number(indexStr);
  const item = currentVault?.items?.[index];
  if (!item) return;

  switch (action) {
    case 'fill':
      void fillCredentials(item);
      break;
    case 'copy-username':
      void copyUsername(item);
      break;
    case 'copy-password':
      void copyPassword(item);
      break;
    default:
      break;
  }
});

async function fillCredentials(item: VaultItem) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length || tabs[0].id === undefined) {
      showStatus('Kein aktiver Tab für Autofill.', 'error');
      return;
    }
    await chrome.tabs.sendMessage(tabs[0].id, {
      type: 'easykey:fill-credentials',
      credentials: { username: item.username, password: item.password },
    });
    showStatus(`Autofill für ${item.title} gesendet.`, 'success');
  } catch (error) {
    console.error('[EasyKey] Autofill Fehler', error);
    showStatus('Autofill fehlgeschlagen.', 'error');
  }
}

async function copyUsername(item: VaultItem) {
  try {
    if (!item.username) {
      showStatus('Kein Benutzername vorhanden.', 'error');
      return;
    }
    await navigator.clipboard.writeText(item.username);
    showStatus('Benutzername kopiert.', 'success');
  } catch (error) {
    console.error('[EasyKey] Copy Fehler', error);
    showStatus('Benutzername konnte nicht kopiert werden.', 'error');
  }
}

async function copyPassword(item: VaultItem) {
  try {
    await navigator.clipboard.writeText(item.password);
    showStatus('Passwort kopiert.', 'success');
  } catch (error) {
    console.error('[EasyKey] Copy Fehler', error);
    showStatus('Passwort konnte nicht kopiert werden.', 'error');
  }
}

async function applySuggestion(id: string) {
  console.log('[EasyKey Popup] applySuggestion called with ID:', id);
  showStatus('Speichere Anmeldedaten …', 'info');
  try {
    console.log('[EasyKey Popup] Sending apply-suggestion message...');
    const response = await chrome.runtime.sendMessage({ type: 'easykey:apply-suggestion', id });
    console.log('[EasyKey Popup] Apply-suggestion response:', response);

    if (response?.ok) {
      console.log('[EasyKey Popup] Successfully saved!');
      showStatus('Anmeldedaten gespeichert.', 'success');
      await loadSuggestions();
      await loadVault();
    } else {
      const errorMessage = response?.error ?? 'unbekannt';
      console.error('[EasyKey Popup] Save failed with error:', errorMessage);
      showStatus(`Speichern fehlgeschlagen: ${errorMessage}`, 'error');
      if (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('master key not set')) {
        setUnlockVisible(true);
        passwordInput?.focus();
      }
    }
  } catch (error) {
    console.error('[EasyKey Popup] applySuggestion exception:', error);
    showStatus('Speichern fehlgeschlagen.', 'error');
    setUnlockVisible(true);
    passwordInput?.focus();
  }
}

async function dismissSuggestion(id: string) {
  try {
    await chrome.runtime.sendMessage({ type: 'easykey:discard-suggestion', id });
    await loadSuggestions();
  } catch (error) {
    console.error('[EasyKey] dismissSuggestion Fehler', error);
  }
}

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'easykey:suggestions-updated') {
    void loadSuggestions();
  }
  if (message?.type === 'easykey:vault-updated') {
    void loadVault();
  }
});
