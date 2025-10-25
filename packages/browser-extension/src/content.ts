/// <reference types="chrome" />

console.log('[EasyKey Content] Script loaded on', window.location.href);

type Credentials = {
  username?: string;
  password?: string;
};

// Check for pending login from previous page (after fast redirect)
async function checkPendingLogin() {
  try {
    console.log('[EasyKey Content] Checking for pending login via background script...');

    const response = await chrome.runtime.sendMessage({ type: 'easykey:get-pending-login' });

    console.log('[EasyKey Content] Get-pending-login response:', response);

    if (!response?.ok || !response.pendingLogin) {
      console.log('[EasyKey Content] No pending login found');
      return;
    }

    const { credentials, url, timestamp } = response.pendingLogin;

    // Check if we're on a different page now (successful login redirect)
    const loginPageChanged = url !== window.location.href;

    // Check if this was recent (within last 10 seconds)
    const isRecent = Date.now() - timestamp < 10000;

    console.log('[EasyKey Content] Pending login check:', {
      loginPageChanged,
      isRecent,
      oldUrl: url,
      newUrl: window.location.href
    });

    if (loginPageChanged && isRecent) {
      console.log('[EasyKey Content] Detected successful login redirect from', url, 'to', window.location.href);
      console.log('[EasyKey Content] Processing pending login credentials...');

      // Clear the pending login
      await chrome.runtime.sendMessage({ type: 'easykey:clear-pending-login' });

      // Check for success indicators (no error messages, new page loaded)
      checkLoginSuccess(credentials);
    } else if (!isRecent) {
      // Clean up old pending login
      console.log('[EasyKey Content] Cleaning up old pending login (>10s)');
      await chrome.runtime.sendMessage({ type: 'easykey:clear-pending-login' });
    }
  } catch (error) {
    console.warn('[EasyKey Content] checkPendingLogin failed', error);
  }
}

// Run pending login check when script loads
void checkPendingLogin();

function extractCredentials(): Credentials | null {
  const passwordField = document.querySelector<HTMLInputElement>('input[type="password"]');
  if (!passwordField) return null;

  const form = passwordField.form;
  if (!form) return { password: passwordField.value };

  const usernameField =
    form.querySelector<HTMLInputElement>('input[type="email"], input[name*="user"], input[name*="login"], input[type="text"]');

  return {
    username: usernameField?.value,
    password: passwordField.value,
  };
}

// Enhanced field detection - more comprehensive selectors
function findPasswordField(): HTMLInputElement | null {
  const selectors = [
    'input[type="password"]',
    'input[autocomplete="current-password"]',
    'input[autocomplete="new-password"]',
    'input[name*="pass" i]',
    'input[id*="pass" i]',
    'input[placeholder*="password" i]',
    'input[placeholder*="passwort" i]',
    'input[aria-label*="password" i]'
  ];

  for (const selector of selectors) {
    const field = document.querySelector<HTMLInputElement>(selector);
    if (field && !field.disabled && field.offsetParent !== null) {
      return field;
    }
  }
  return null;
}

function findUsernameField(): HTMLInputElement | null {
  const selectors = [
    'input[type="email"]',
    'input[autocomplete="email"]',
    'input[autocomplete="username"]',
    'input[name*="email" i]',
    'input[name*="user" i]',
    'input[name*="login" i]',
    'input[id*="email" i]',
    'input[id*="user" i]',
    'input[id*="login" i]',
    'input[placeholder*="email" i]',
    'input[placeholder*="username" i]',
    'input[placeholder*="benutzername" i]',
    'input[aria-label*="email" i]',
    'input[aria-label*="username" i]',
    'input[type="text"]' // Fallback - should be last
  ];

  for (const selector of selectors) {
    const field = document.querySelector<HTMLInputElement>(selector);
    if (field && !field.disabled && field.offsetParent !== null) {
      // Skip if it looks like a search or other non-login field
      const fieldName = (field.name + field.id + field.placeholder).toLowerCase();
      if (fieldName.includes('search') || fieldName.includes('suche')) {
        continue;
      }
      return field;
    }
  }
  return null;
}

function receiveFill(credentials: Credentials, autoSubmit: boolean = true): boolean {
  console.log('[EasyKey Content] receiveFill called with:', { hasUsername: !!credentials.username, hasPassword: !!credentials.password, autoSubmit });

  let passwordFilled = false;
  let usernameFilled = false;

  // Try to fill password field
  const passwordField = findPasswordField();
  if (passwordField && credentials.password) {
    passwordField.value = credentials.password;
    passwordField.dispatchEvent(new Event('input', { bubbles: true }));
    passwordField.dispatchEvent(new Event('change', { bubbles: true }));
    passwordField.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    passwordFilled = true;
    console.log('[EasyKey Content] Password field filled');
  } else {
    console.log('[EasyKey Content] Password field not found or no password to fill');
  }

  // Try to fill username field
  const usernameField = findUsernameField();
  if (usernameField && credentials.username) {
    usernameField.value = credentials.username;
    usernameField.dispatchEvent(new Event('input', { bubbles: true }));
    usernameField.dispatchEvent(new Event('change', { bubbles: true }));
    usernameField.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    usernameFilled = true;
    console.log('[EasyKey Content] Username field filled');
  } else if (credentials.username) {
    console.log('[EasyKey Content] Username field not found');
  }

  // Multi-Step Login Support: If only username field exists (no password field),
  // store credentials in sessionStorage for the next page
  if (usernameFilled && !passwordField && credentials.password) {
    console.log('[EasyKey Content] Multi-step login detected (username only), storing credentials for next step');
    try {
      sessionStorage.setItem('easykey_pending_password', credentials.password);
      sessionStorage.setItem('easykey_pending_username', credentials.username || '');
      sessionStorage.setItem('easykey_pending_timestamp', Date.now().toString());
    } catch (error) {
      console.warn('[EasyKey Content] Failed to store pending credentials in sessionStorage:', error);
    }
  }

  // Check if we're on a password-only page and have pending credentials
  if (passwordField && !usernameFilled && !usernameField) {
    console.log('[EasyKey Content] Password-only page detected, checking for pending credentials...');
    try {
      const pendingPassword = sessionStorage.getItem('easykey_pending_password');
      const pendingUsername = sessionStorage.getItem('easykey_pending_username');
      const pendingTimestamp = sessionStorage.getItem('easykey_pending_timestamp');

      // Check if pending credentials are recent (within last 60 seconds)
      if (pendingPassword && pendingTimestamp) {
        const age = Date.now() - parseInt(pendingTimestamp, 10);
        if (age < 60000) { // 60 seconds
          console.log('[EasyKey Content] Found recent pending password from multi-step login');

          // Fill password from pending data if we didn't already fill it
          if (!passwordFilled && pendingPassword) {
            passwordField.value = pendingPassword;
            passwordField.dispatchEvent(new Event('input', { bubbles: true }));
            passwordField.dispatchEvent(new Event('change', { bubbles: true }));
            passwordField.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            passwordFilled = true;
            console.log('[EasyKey Content] Filled password from pending multi-step login');
          }

          // Clear pending credentials after use
          sessionStorage.removeItem('easykey_pending_password');
          sessionStorage.removeItem('easykey_pending_username');
          sessionStorage.removeItem('easykey_pending_timestamp');
        } else {
          console.log('[EasyKey Content] Pending credentials too old (> 60s), ignoring');
        }
      }
    } catch (error) {
      console.warn('[EasyKey Content] Failed to retrieve pending credentials from sessionStorage:', error);
    }
  }

  // Auto-submit only if password was filled and autoSubmit is enabled
  if (passwordFilled && autoSubmit) {
    console.log('[EasyKey Content] Auto-submit enabled, attempting to submit form...');

    // Try to find and submit the form
    const form = passwordField?.form;
    if (form) {
      console.log('[EasyKey Content] Form found, submitting via form.submit()');

      // First try to find and click the submit button (better for JavaScript validation)
      const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"], input[type="submit"]');
      if (submitButton) {
        console.log('[EasyKey Content] Submit button found, clicking it');
        setTimeout(() => {
          submitButton.click();
        }, 100); // Small delay to ensure fields are properly set
      } else {
        // Fallback: trigger form submit event
        console.log('[EasyKey Content] No submit button found, dispatching submit event');
        setTimeout(() => {
          form.requestSubmit();
        }, 100);
      }
    } else if (passwordField) {
      // Fallback: simulate Enter key press on password field
      console.log('[EasyKey Content] No form found, simulating Enter key press on password field');
      setTimeout(() => {
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });
        passwordField.dispatchEvent(enterEvent);

        // Also dispatch keyup for completeness
        const enterUpEvent = new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });
        passwordField.dispatchEvent(enterUpEvent);
      }, 100);
    }
  }

  // Return true only if password field was filled (that's what matters for login)
  return passwordFilled;
}

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  switch (message.type) {
    case 'easykey:request-page-credentials': {
      const credentials = extractCredentials();
      _sendResponse({ ok: true, credentials });
      return true;
    }
    case 'easykey:fill-credentials': {
      const autoSubmit = message.autoSubmit !== undefined ? message.autoSubmit : true;
      receiveFill(message.credentials ?? {}, autoSubmit);
      _sendResponse({ ok: true });
      return true;
    }
    default:
      break;
  }
  return false;
});

async function requestAutofill() {
  console.log('[EasyKey Content] Requesting autofill for:', window.location.href);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'easykey:get-autofill',
      url: window.location.href,
    });

    console.log('[EasyKey Content] Autofill response:', response);

    if (response?.ok && response.credentials) {
      console.log('[EasyKey Content] Credentials found for this site');

      // Check if login form is present on the page
      const hasLoginForm = findPasswordField() !== null;

      if (hasLoginForm) {
        console.log('[EasyKey Content] Login form detected, showing QuickLogin notification');
        showQuickLoginNotification(response.credentials);
      } else {
        console.log('[EasyKey Content] No login form detected, will retry later');
        // Retry after a delay for dynamic pages that load fields later
        setTimeout(() => {
          const passwordField = findPasswordField();
          if (passwordField) {
            console.log('[EasyKey Content] Login form detected on retry, showing QuickLogin notification');
            showQuickLoginNotification(response.credentials);
          }
        }, 1000);
      }
    } else if (response?.ok === false && response.reason === 'locked') {
      console.log('[EasyKey Content] Vault is locked, cannot show QuickLogin');
    } else {
      console.log('[EasyKey Content] No credentials found for this URL');
    }
  } catch (error) {
    console.warn('[EasyKey] Autofill request failed', error);
  }
}

let lastSubmittedCredentials: { username?: string; password: string; timestamp: number } | null = null;
let lastAutofilledCredentials: { username?: string; password: string; timestamp: number } | null = null;

function handleFormSubmit(event: Event) {
  console.log('[EasyKey Content] Form submit detected', event);

  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    console.log('[EasyKey Content] Not a form element, ignoring');
    return;
  }

  const passwordInput = form.querySelector<HTMLInputElement>('input[type="password"]');
  if (!passwordInput || !passwordInput.value) {
    console.log('[EasyKey Content] No password input found or empty, ignoring');
    return;
  }

  const usernameInput = form.querySelector<HTMLInputElement>('input[type="email"], input[name*="user"], input[name*="login"], input[type="text"]');
  const credentials = {
    username: usernameInput?.value || undefined,
    password: passwordInput.value,
  };

  console.log('[EasyKey Content] Credentials extracted:', {
    username: credentials.username,
    hasPassword: !!credentials.password,
    url: window.location.href
  });

  // Store for potential save after successful navigation
  lastSubmittedCredentials = {
    ...credentials,
    timestamp: Date.now(),
  };

  // Wait a bit to detect if login was successful (no error message, page changed, etc.)
  console.log('[EasyKey Content] Waiting 1.5s to check login success...');
  setTimeout(() => {
    checkLoginSuccess(credentials);
  }, 1500);
}

let lastCheckedCredentials: { username?: string; password: string; timestamp: number } | null = null;

function checkLoginSuccess(credentials: { username?: string; password: string }) {
  console.log('[EasyKey Content] Checking login success...');

  // Prevent duplicate checks for the same credentials within 3 seconds
  const now = Date.now();
  if (lastCheckedCredentials &&
      lastCheckedCredentials.username === credentials.username &&
      lastCheckedCredentials.password === credentials.password &&
      now - lastCheckedCredentials.timestamp < 3000) {
    console.log('[EasyKey Content] Duplicate check prevented (same credentials within 3s)');
    return;
  }

  // Check if these credentials were autofilled - if so, don't suggest saving
  if (lastAutofilledCredentials &&
      lastAutofilledCredentials.username === credentials.username &&
      lastAutofilledCredentials.password === credentials.password &&
      now - lastAutofilledCredentials.timestamp < 10000) { // Within 10 seconds
    console.log('[EasyKey Content] These credentials were autofilled from vault, not suggesting save');
    return;
  }

  lastCheckedCredentials = { ...credentials, timestamp: now };

  // Check if we're still on the same page and no error messages appeared
  // Only consider VISIBLE error indicators
  const errorIndicators = Array.from(
    document.querySelectorAll('[class*="error" i], [class*="fehler" i], [id*="error" i], [role="alert"]')
  ).filter((el): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false;

    // Check if element is visible
    const style = window.getComputedStyle(el);
    const isVisible = style.display !== 'none' &&
                     style.visibility !== 'hidden' &&
                     style.opacity !== '0' &&
                     el.offsetParent !== null;

    // Check if it has actual error text content
    const hasContent = (el.textContent?.trim().length || 0) > 0;

    return isVisible && hasContent;
  });

  console.log('[EasyKey Content] Visible error indicators found:', errorIndicators.length);

  // If there are visible error indicators with login-related text, don't suggest saving
  for (const errorEl of errorIndicators) {
    const errorText = errorEl.textContent?.toLowerCase() || '';
    console.log('[EasyKey Content] Checking error text:', errorText.substring(0, 100));

    // Look for specific login failure keywords
    if (errorText.includes('incorrect') || errorText.includes('falsch') ||
        errorText.includes('invalid') || errorText.includes('ungültig') ||
        errorText.includes('wrong password') || errorText.includes('falsches passwort') ||
        errorText.includes('authentication failed') || errorText.includes('anmeldung fehlgeschlagen') ||
        errorText.includes('login failed') || errorText.includes('could not log in')) {
      console.info('[EasyKey Content] Login appears to have failed, not suggesting save');
      lastSubmittedCredentials = null;
      return;
    }
  }

  if (errorIndicators.length > 0) {
    console.log('[EasyKey Content] Errors found but not login-failure related, continuing...');
  }

  // If page URL changed significantly or we detect success indicators, suggest save
  const payload = {
    type: 'easykey:suggest-save',
    url: window.location.href,
    username: credentials.username,
    password: credentials.password,
    title: document.title || extractHostname(window.location.href),
  };

  console.log('[EasyKey Content] Sending suggest-save message:', payload);

  chrome.runtime.sendMessage(payload)
    .then((response) => {
      console.log('[EasyKey Content] Suggest-save response:', response);

      // Only show notification if credentials are NOT already in vault
      if (response?.alreadyExists) {
        console.log('[EasyKey Content] Credentials already exist in vault, not showing notification');
        lastSubmittedCredentials = null;
        return;
      }

      showInlineNotification();
    })
    .catch((error) => {
      console.error('[EasyKey Content] Failed to send suggest-save:', error);
    });
}

function showQuickLoginNotification(credentials: Credentials) {
  // Remove any existing QuickLogin notification
  const existing = document.getElementById('easykey-quicklogin-notification');
  if (existing) {
    existing.remove();
  }

  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'easykey-quicklogin-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #4F46E5 0%, #6366F1 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
    z-index: 999999;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    max-width: 320px;
    animation: easykeySlideIn 0.3s ease-out;
  `;

  const displayUsername = credentials.username || 'Gespeicherte Anmeldedaten';

  notification.innerHTML = `
    <style>
      @keyframes easykeySlideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes easykeySlideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
      #easykey-quicklogin-notification.closing {
        animation: easykeySlideOut 0.3s ease-out forwards;
      }
      #easykey-quicklogin-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(255, 255, 255, 0.3);
      }
      #easykey-quicklogin-btn:active {
        transform: translateY(0);
      }
    </style>
    <div style="display: flex; align-items: start; gap: 12px;">
      <div style="flex-shrink: 0; width: 32px; height: 32px; background: rgba(255, 255, 255, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px;">
        🔐
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 4px;">
          EasyKey QuickLogin
        </div>
        <div style="font-size: 13px; opacity: 0.9; margin-bottom: 8px;">
          ${displayUsername}
        </div>
        <div style="display: flex; gap: 8px; margin-top: 12px;">
          <button id="easykey-quicklogin-btn" style="
            background: white;
            color: #4F46E5;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          ">
            Mit QuickLogin anmelden
          </button>
          <button id="easykey-quicklogin-close" style="
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.1s;
          ">
            ×
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(notification);

  // Add button event listeners
  const quickLoginButton = notification.querySelector('#easykey-quicklogin-btn');
  const closeButton = notification.querySelector('#easykey-quicklogin-close');

  quickLoginButton?.addEventListener('click', () => {
    console.log('[EasyKey Content] QuickLogin button clicked, performing autofill + submit...');

    // Perform autofill with auto-submit enabled
    const filled = receiveFill(credentials, true);

    if (filled) {
      console.log('[EasyKey Content] QuickLogin successful');
      // Store autofilled credentials to prevent re-suggesting them
      lastAutofilledCredentials = {
        username: credentials.username,
        password: credentials.password || '',
        timestamp: Date.now()
      };

      // Show success notification
      removeInlineNotification(notification);
      showAutofillNotification(credentials.username);
    } else {
      console.warn('[EasyKey Content] QuickLogin failed - no password fields found');
      // Keep notification open if autofill failed
    }
  });

  closeButton?.addEventListener('click', () => {
    removeInlineNotification(notification);
  });

  // Auto-remove after 15 seconds
  setTimeout(() => {
    if (document.body.contains(notification)) {
      removeInlineNotification(notification);
    }
  }, 15000);
}

function showAutofillNotification(username?: string) {
  // Remove any existing autofill notification
  const existing = document.getElementById('easykey-autofill-notification');
  if (existing) {
    existing.remove();
  }

  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'easykey-autofill-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
    color: white;
    padding: 14px 18px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
    z-index: 999999;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    max-width: 320px;
    animation: easykeySlideIn 0.3s ease-out;
  `;

  const displayUsername = username ? ` (${username})` : '';

  notification.innerHTML = `
    <style>
      @keyframes easykeySlideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes easykeySlideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
      #easykey-autofill-notification.closing {
        animation: easykeySlideOut 0.3s ease-out forwards;
      }
    </style>
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="flex-shrink: 0; width: 24px; height: 24px; background: rgba(255, 255, 255, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px;">
        ✓
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 13px;">
          Anmeldedaten ausgefüllt${displayUsername}
        </div>
      </div>
      <button id="easykey-autofill-close" style="
        background: transparent;
        color: white;
        border: none;
        padding: 4px;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        opacity: 0.7;
        transition: opacity 0.2s;
      " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
        ×
      </button>
    </div>
  `;

  document.body.appendChild(notification);

  // Add close button event listener
  const closeButton = notification.querySelector('#easykey-autofill-close');
  closeButton?.addEventListener('click', () => {
    removeInlineNotification(notification);
  });

  // Auto-remove after 4 seconds (shorter for autofill notification)
  setTimeout(() => {
    if (document.body.contains(notification)) {
      removeInlineNotification(notification);
    }
  }, 4000);
}

function showInlineNotification() {
  // Remove any existing notification
  const existing = document.getElementById('easykey-inline-notification');
  if (existing) {
    existing.remove();
  }

  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'easykey-inline-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #4F46E5 0%, #6366F1 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
    z-index: 999999;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    max-width: 320px;
    animation: easykeySlideIn 0.3s ease-out;
  `;

  notification.innerHTML = `
    <style>
      @keyframes easykeySlideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes easykeySlideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
      #easykey-inline-notification.closing {
        animation: easykeySlideOut 0.3s ease-out forwards;
      }
    </style>
    <div style="display: flex; align-items: start; gap: 12px;">
      <div style="flex-shrink: 0; width: 32px; height: 32px; background: rgba(255, 255, 255, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px;">
        🔐
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 4px;">
          EasyKey - Anmeldedaten erkannt
        </div>
        <div style="font-size: 13px; opacity: 0.9; margin-bottom: 8px;">
          Möchtest du diese Anmeldedaten speichern?
        </div>
        <div style="display: flex; gap: 8px; margin-top: 12px;">
          <button id="easykey-notification-open" style="
            background: white;
            color: #4F46E5;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.1s;
          ">
            Popup öffnen
          </button>
          <button id="easykey-notification-close" style="
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.1s;
          ">
            Später
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(notification);

  // Add button event listeners
  const openButton = notification.querySelector('#easykey-notification-open');
  const closeButton = notification.querySelector('#easykey-notification-close');

  openButton?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'easykey:open-popup' }).catch(() => {});
    removeInlineNotification(notification);
  });

  closeButton?.addEventListener('click', () => {
    removeInlineNotification(notification);
  });

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (document.body.contains(notification)) {
      removeInlineNotification(notification);
    }
  }, 10000);
}

function removeInlineNotification(notification: HTMLElement) {
  notification.classList.add('closing');
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 300);
}

function extractHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    void requestAutofill();
  }, { once: true });
} else {
  void requestAutofill();
}

console.log('[EasyKey Content] Registering submit listener');
document.addEventListener('submit', handleFormSubmit, true);

console.log('[EasyKey Content] Registering click listener for buttons');

// Track password field interactions to detect login attempts
let lastPasswordValue: string | null = null;

// Also handle button clicks for JavaScript-based logins (without form submit)
function handleButtonClick(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  // Check if this is a button or link that might submit a login
  const isButton = target.tagName === 'BUTTON' ||
                   target.tagName === 'A' ||
                   target.getAttribute('role') === 'button' ||
                   target.type === 'submit';

  if (!isButton) return;

  console.log('[EasyKey Content] Button clicked:', target.tagName, target.type, target.textContent?.substring(0, 20));

  // Check if there's a password field on the page with a value
  const passwordInput = document.querySelector<HTMLInputElement>('input[type="password"]');
  if (!passwordInput || !passwordInput.value) {
    console.log('[EasyKey Content] No password field or empty password, ignoring button click');
    return;
  }

  // Check if the button is likely a login/submit button
  const buttonText = (target.textContent || target.getAttribute('value') || '').toLowerCase();
  const isLoginButton = buttonText.includes('anmeld') ||
                        buttonText.includes('login') ||
                        buttonText.includes('sign in') ||
                        buttonText.includes('einloggen') ||
                        target.type === 'submit';

  // Check if the button is near the password field (in the same form or container)
  const isNearPasswordField = target.closest('form') === passwordInput.closest('form') ||
                              (passwordInput.closest('form') && target.closest('form'));

  if (!isLoginButton && !isNearPasswordField) {
    console.log('[EasyKey Content] Button not a login button and not near password field, ignoring');
    return;
  }

  console.log('[EasyKey Content] Login button click detected near password field', {
    buttonText: buttonText.substring(0, 30),
    isLoginButton,
    isNearPasswordField
  });

  // Extract credentials
  const usernameInput = document.querySelector<HTMLInputElement>(
    'input[type="email"], input[name*="user"], input[name*="email"], input[name*="login"], input[id*="username"], input[type="text"]'
  );

  const credentials = {
    username: usernameInput?.value || undefined,
    password: passwordInput.value,
  };

  console.log('[EasyKey Content] Credentials extracted from button click:', {
    username: credentials.username,
    hasPassword: !!credentials.password,
    url: window.location.href
  });

  // Store the password to track if it changes (cleared after submit)
  lastPasswordValue = credentials.password;

  // Store for potential save after successful navigation
  lastSubmittedCredentials = {
    ...credentials,
    timestamp: Date.now(),
  };

  // For fast-redirecting sites: Store credentials via background script for post-navigation check
  console.log('[EasyKey Content] Storing credentials via background script (for fast redirect)...');

  chrome.runtime.sendMessage({
    type: 'easykey:store-pending-login',
    credentials,
    url: window.location.href,
    timestamp: Date.now()
  }).then((response) => {
    console.log('[EasyKey Content] Store-pending-login response:', response);
  }).catch((error) => {
    console.error('[EasyKey Content] Failed to store pending login:', error);
  });

  // Also check after delay if we're still on the same page
  console.log('[EasyKey Content] Also waiting 1.5s to check login success (in case no redirect)...');
  setTimeout(() => {
    // Only check if we're still on the same page (no navigation happened)
    if (lastSubmittedCredentials && lastSubmittedCredentials.timestamp === lastSubmittedCredentials.timestamp) {
      checkLoginSuccess(credentials);
    }
  }, 1500);
}

document.addEventListener('click', handleButtonClick, true);
