(function() {
  'use strict';

  const CONFPASS_MESSAGE_TYPE = 'CONFPASS_WEBAUTHN';

  let cachedPasswords = null;
  let activeDropdown = null;
  let observerActive = false;

  console.log('[ConfPass Content] Content script loaded');

  // ========== Inject Styles - Amber Gold Theme ==========
  const styles = `
    .confpass-icon-btn {
      position: absolute !important;
      right: 8px !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      width: 24px !important;
      height: 24px !important;
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%) !important;
      border: none !important;
      border-radius: 6px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 2147483646 !important;
      padding: 0 !important;
      margin: 0 !important;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35) !important;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
      opacity: 0.95 !important;
    }

    .confpass-icon-btn:hover {
      transform: translateY(-50%) scale(1.1) !important;
      opacity: 1 !important;
      box-shadow: 0 4px 16px rgba(245, 158, 11, 0.5) !important;
    }

    .confpass-icon-btn svg {
      width: 14px !important;
      height: 14px !important;
      color: white !important;
      stroke: white !important;
      fill: none !important;
    }

    .confpass-dropdown {
      position: absolute !important;
      top: calc(100% + 4px) !important;
      right: 0 !important;
      width: 280px !important;
      max-height: 300px !important;
      background: #0a0a0c !important;
      border: 1px solid rgba(255, 255, 255, 0.06) !important;
      border-radius: 12px !important;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(245, 158, 11, 0.1) !important;
      z-index: 2147483647 !important;
      overflow: hidden !important;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    }

    .confpass-dropdown::before {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 1px !important;
      background: linear-gradient(90deg, transparent, rgba(245, 158, 11, 0.4), transparent) !important;
    }

    .confpass-dropdown-header {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 12px 14px !important;
      background: linear-gradient(180deg, #111114 0%, #0a0a0c 100%) !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
    }

    .confpass-dropdown-logo {
      width: 26px !important;
      height: 26px !important;
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%) !important;
      border-radius: 7px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3) !important;
    }

    .confpass-dropdown-logo svg {
      width: 14px !important;
      height: 14px !important;
      stroke: white !important;
      fill: none !important;
    }

    .confpass-dropdown-title {
      font-size: 13px !important;
      font-weight: 700 !important;
      color: #fafafa !important;
      margin: 0 !important;
      padding: 0 !important;
      letter-spacing: -0.01em !important;
    }

    .confpass-dropdown-list {
      max-height: 220px !important;
      overflow-y: auto !important;
      padding: 8px !important;
    }

    .confpass-dropdown-item {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 10px !important;
      border-radius: 8px !important;
      cursor: pointer !important;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
      margin-bottom: 4px !important;
      background: transparent !important;
      border: 1px solid transparent !important;
      width: 100% !important;
      text-align: left !important;
    }

    .confpass-dropdown-item:hover {
      background: rgba(245, 158, 11, 0.08) !important;
      border-color: rgba(245, 158, 11, 0.2) !important;
    }

    .confpass-dropdown-item:last-child {
      margin-bottom: 0 !important;
    }

    .confpass-dropdown-item-icon {
      width: 32px !important;
      height: 32px !important;
      min-width: 32px !important;
      background: rgba(245, 158, 11, 0.15) !important;
      border-radius: 8px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 13px !important;
      font-weight: 700 !important;
      color: #fbbf24 !important;
    }

    .confpass-dropdown-item-info {
      flex: 1 !important;
      min-width: 0 !important;
    }

    .confpass-dropdown-item-title {
      font-size: 13px !important;
      font-weight: 600 !important;
      color: #fafafa !important;
      margin: 0 0 2px 0 !important;
      padding: 0 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    .confpass-dropdown-item-username {
      font-size: 11px !important;
      color: #71717a !important;
      margin: 0 !important;
      padding: 0 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    .confpass-dropdown-empty {
      padding: 24px 16px !important;
      text-align: center !important;
      color: #52525b !important;
      font-size: 12px !important;
    }

    .confpass-dropdown-empty svg {
      width: 28px !important;
      height: 28px !important;
      margin-bottom: 8px !important;
      opacity: 0.4 !important;
      stroke: #52525b !important;
    }

    .confpass-dropdown-locked {
      padding: 24px 16px !important;
      text-align: center !important;
    }

    .confpass-dropdown-locked svg {
      width: 28px !important;
      height: 28px !important;
      margin-bottom: 8px !important;
      stroke: #52525b !important;
      opacity: 0.5 !important;
    }

    .confpass-dropdown-locked-text {
      color: #71717a !important;
      font-size: 12px !important;
      margin-bottom: 12px !important;
    }

    .confpass-dropdown-btn {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 8px 14px !important;
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%) !important;
      border: none !important;
      border-radius: 6px !important;
      color: white !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25) !important;
    }

    .confpass-dropdown-btn:hover {
      transform: translateY(-1px) !important;
      box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4) !important;
    }

    .confpass-dropdown-list::-webkit-scrollbar {
      width: 5px !important;
    }

    .confpass-dropdown-list::-webkit-scrollbar-track {
      background: transparent !important;
    }

    .confpass-dropdown-list::-webkit-scrollbar-thumb {
      background: #333 !important;
      border-radius: 3px !important;
    }

    .confpass-dropdown-list::-webkit-scrollbar-thumb:hover {
      background: #444 !important;
    }
  `;

  function injectStyles() {
    if (document.getElementById('confpass-styles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'confpass-styles';
    styleEl.textContent = styles;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  // ========== Field Detection ==========
  const USERNAME_SELECTORS = [
    'input[type="text"][name*="user" i]',
    'input[type="text"][name*="login" i]',
    'input[type="text"][name*="email" i]',
    'input[type="text"][id*="user" i]',
    'input[type="text"][id*="login" i]',
    'input[type="text"][id*="email" i]',
    'input[type="email"]',
    'input[autocomplete="username"]',
    'input[autocomplete="email"]',
    'input[name="identifier"]',
    'input[name="login"]',
    'input[name="email"]',
    'input[name="username"]'
  ];

  const PASSWORD_SELECTORS = [
    'input[type="password"]',
    'input[autocomplete="current-password"]',
    'input[autocomplete="new-password"]'
  ];

  function findLoginFields() {
    const fields = { username: [], password: [] };

    // Find password fields first
    for (const selector of PASSWORD_SELECTORS) {
      try {
        document.querySelectorAll(selector).forEach(field => {
          if (isFieldVisible(field) && !fields.password.includes(field)) {
            fields.password.push(field);
          }
        });
      } catch (e) {}
    }

    // Find username fields
    for (const selector of USERNAME_SELECTORS) {
      try {
        document.querySelectorAll(selector).forEach(field => {
          if (isFieldVisible(field) && !fields.username.includes(field)) {
            fields.username.push(field);
          }
        });
      } catch (e) {}
    }

    // If we found password fields but no username, look for nearby text inputs
    if (fields.password.length > 0 && fields.username.length === 0) {
      fields.password.forEach(pwField => {
        const form = pwField.closest('form');
        if (form) {
          const textInputs = form.querySelectorAll('input[type="text"], input:not([type])');
          textInputs.forEach(input => {
            if (isFieldVisible(input) && !fields.username.includes(input)) {
              fields.username.push(input);
            }
          });
        }
      });
    }

    return fields;
  }

  function isFieldVisible(field) {
    if (!field) return false;
    if (field.disabled || field.readOnly) return false;
    if (field.type === 'hidden') return false;

    const rect = field.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const style = window.getComputedStyle(field);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

    return true;
  }

  // ========== Icon and Dropdown ==========
  function addIconToField(field) {
    if (field.dataset.confpassIcon) return;
    field.dataset.confpassIcon = 'true';

    // Make parent relative if needed
    const parent = field.parentElement;
    if (parent) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.position === 'static') {
        parent.style.position = 'relative';
      }
    }

    // Add padding to field for icon
    const currentPaddingRight = parseInt(window.getComputedStyle(field).paddingRight) || 0;
    field.style.paddingRight = Math.max(currentPaddingRight, 36) + 'px';

    // Create icon button
    const iconBtn = document.createElement('button');
    iconBtn.className = 'confpass-icon-btn';
    iconBtn.type = 'button';
    iconBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    `;

    iconBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDropdown(field, iconBtn);
    });

    // Insert icon after field in parent
    if (parent) {
      parent.style.position = 'relative';
      parent.appendChild(iconBtn);
    }
  }

  function toggleDropdown(field, iconBtn) {
    // Close existing dropdown
    if (activeDropdown) {
      activeDropdown.remove();
      activeDropdown = null;
    }

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'confpass-dropdown';
    activeDropdown = dropdown;

    // Header
    dropdown.innerHTML = `
      <div class="confpass-dropdown-header">
        <div class="confpass-dropdown-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <span class="confpass-dropdown-title">ConfPass</span>
      </div>
      <div class="confpass-dropdown-list">
        <div class="confpass-dropdown-empty">Yukleniyor...</div>
      </div>
    `;

    // Position dropdown
    const parent = iconBtn.parentElement;
    parent.appendChild(dropdown);

    // Load passwords
    loadPasswordsForDropdown(dropdown, field);

    // Close on outside click
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== iconBtn) {
        dropdown.remove();
        activeDropdown = null;
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  }

  function loadPasswordsForDropdown(dropdown, targetField) {
    const listEl = dropdown.querySelector('.confpass-dropdown-list');
    const domain = window.location.hostname;

    chrome.runtime.sendMessage({
      type: 'get_passwords_for_site',
      url: domain
    }, (response) => {
      if (chrome.runtime.lastError) {
        showDropdownLocked(listEl);
        return;
      }

      if (response && response.error === 'Vault is locked') {
        showDropdownLocked(listEl);
        return;
      }

      if (response && response.success && response.passwords && response.passwords.length > 0) {
        cachedPasswords = response.passwords;
        renderDropdownItems(listEl, response.passwords, targetField);
      } else {
        showDropdownEmpty(listEl);
      }
    });
  }

  function showDropdownLocked(listEl) {
    listEl.innerHTML = `
      <div class="confpass-dropdown-locked">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <div class="confpass-dropdown-locked-text">Kasa kilitli</div>
        <button class="confpass-dropdown-btn" id="confpass-open-app">
          Uygulamayi Ac
        </button>
      </div>
    `;

    listEl.querySelector('#confpass-open-app')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'open_app' });
    });
  }

  function showDropdownEmpty(listEl) {
    listEl.innerHTML = `
      <div class="confpass-dropdown-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div>Bu site icin kayitli hesap yok</div>
      </div>
    `;
  }

  function renderDropdownItems(listEl, passwords, targetField) {
    listEl.innerHTML = passwords.map((pw, i) => `
      <button class="confpass-dropdown-item" data-index="${i}">
        <div class="confpass-dropdown-item-icon">${(pw.title || pw.username || '?')[0].toUpperCase()}</div>
        <div class="confpass-dropdown-item-info">
          <div class="confpass-dropdown-item-title">${escapeHtml(pw.title || 'Hesap')}</div>
          <div class="confpass-dropdown-item-username">${escapeHtml(pw.username)}</div>
        </div>
      </button>
    `).join('');

    listEl.querySelectorAll('.confpass-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        const pw = passwords[index];
        if (pw) {
          fillForm(pw.username, pw.password);
          if (activeDropdown) {
            activeDropdown.remove();
            activeDropdown = null;
          }
        }
      });
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ========== Form Filling ==========
  function fillForm(username, password) {
    const fields = findLoginFields();

    // Fill username
    fields.username.forEach(field => {
      if (username) {
        field.value = username;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Fill password
    fields.password.forEach(field => {
      if (password) {
        field.value = password;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  // ========== Initialization ==========
  function scanAndAttachIcons() {
    const fields = findLoginFields();

    fields.username.forEach(field => addIconToField(field));
    fields.password.forEach(field => addIconToField(field));
  }

  function init() {
    injectStyles();

    // Initial scan
    setTimeout(scanAndAttachIcons, 500);
    setTimeout(scanAndAttachIcons, 1500);
    setTimeout(scanAndAttachIcons, 3000);

    // Observe DOM changes
    if (!observerActive) {
      observerActive = true;
      const observer = new MutationObserver((mutations) => {
        let shouldScan = false;
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            shouldScan = true;
            break;
          }
        }
        if (shouldScan) {
          setTimeout(scanAndAttachIcons, 100);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    // Focus event listener
    document.addEventListener('focusin', (e) => {
      if (e.target.tagName === 'INPUT') {
        const type = e.target.type?.toLowerCase();
        if (type === 'text' || type === 'email' || type === 'password' || !type) {
          setTimeout(() => addIconToField(e.target), 50);
        }
      }
    }, true);
  }

  // ========== Message Listener ==========
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'fill_credentials' && message.data) {
      fillForm(message.data.username, message.data.password);
      sendResponse({ success: true });
    }
    return true;
  });

  // ========== WebAuthn Handler (Passkey) ==========
  window.addEventListener('message', async function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== CONFPASS_MESSAGE_TYPE) return;

    const data = event.data;
    console.log('[ConfPass Content] Received WebAuthn message:', data.action);

    let response = { type: 'CONFPASS_WEBAUTHN_RESPONSE', messageId: data.messageId };

    try {
      switch (data.action) {
        case 'create_request': {
          const result = await showPasskeyCreateDialog(data);
          response = { ...response, ...result };
          break;
        }

        case 'get_request': {
          const passkeys = await getPasskeysForSite(data.rpId);
          const result = await showPasskeyGetDialog(data, passkeys);
          response = { ...response, ...result };
          break;
        }

        case 'save_passkey': {
          const success = await savePasskey(data.passkey);
          response.success = success;
          if (!success) response.error = 'Failed to save passkey';
          break;
        }

        case 'update_counter': {
          const success = await updatePasskeyCounter(data.credentialId, data.counter);
          response.success = success;
          break;
        }

        default:
          response.error = 'Unknown action';
      }
    } catch (error) {
      console.error('[ConfPass Content] Error handling message:', error);
      response.error = error.message;
    }

    window.postMessage(response, '*');
  }, false);

  // Route all HTTP requests through background script to bypass Brave Shields
  async function getPasskeysForSite(rpId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'get_passkeys_for_site',
        rpId: rpId
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[ConfPass Content] Error getting passkeys:', chrome.runtime.lastError);
          resolve([]);
          return;
        }
        resolve(response?.passkeys || []);
      });
    });
  }

  async function savePasskey(passkey) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'save_passkey_to_server',
        passkey: passkey
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[ConfPass Content] Error saving passkey:', chrome.runtime.lastError);
          resolve(false);
          return;
        }
        resolve(response?.success || false);
      });
    });
  }

  async function updatePasskeyCounter(credentialId, counter) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'update_passkey_counter',
        credentialId: credentialId,
        counter: counter
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[ConfPass Content] Error updating counter:', chrome.runtime.lastError);
          resolve(false);
          return;
        }
        resolve(response?.success || false);
      });
    });
  }

  // Passkey dialog styles - Amber Gold theme
  const passkeyDialogStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');
    .confpass-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(5, 5, 7, 0.85);
      backdrop-filter: blur(8px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .confpass-passkey-dialog {
      background: #0a0a0c;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      padding: 24px;
      max-width: 380px;
      width: 90%;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.7), 0 0 60px rgba(245, 158, 11, 0.1);
      color: #fafafa;
      position: relative;
      overflow: hidden;
    }
    .confpass-passkey-dialog::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(245, 158, 11, 0.4), transparent);
    }
    .confpass-passkey-dialog h2 {
      margin: 0 0 6px 0;
      font-family: 'Sora', sans-serif;
      font-size: 16px;
      font-weight: 700;
      color: #fafafa;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .confpass-passkey-dialog .subtitle {
      color: #71717a;
      font-size: 12px;
      margin-bottom: 18px;
    }
    .confpass-passkey-dialog .site-info {
      background: #111114;
      padding: 12px 14px;
      border-radius: 10px;
      margin-bottom: 18px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .confpass-passkey-dialog .site-info div {
      margin: 3px 0;
      font-size: 12px;
      color: #a1a1aa;
    }
    .confpass-passkey-dialog .site-info strong {
      color: #fafafa;
    }
    .confpass-passkey-dialog .buttons {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .confpass-passkey-dialog button {
      padding: 12px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: none;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
    .confpass-passkey-dialog .primary-btn {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%);
      color: white;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);
    }
    .confpass-passkey-dialog .primary-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
    }
    .confpass-passkey-dialog .secondary-btn {
      background: #18181c;
      color: #a1a1aa;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .confpass-passkey-dialog .secondary-btn:hover {
      background: #1f1f24;
      color: #fafafa;
      border-color: rgba(245, 158, 11, 0.3);
    }
    .confpass-passkey-dialog .cancel-btn {
      background: transparent;
      color: #71717a;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .confpass-passkey-dialog .cancel-btn:hover {
      background: rgba(255, 255, 255, 0.03);
      color: #a1a1aa;
    }
    .confpass-passkey-dialog .passkey-list {
      max-height: 180px;
      overflow-y: auto;
      margin-bottom: 12px;
    }
    .confpass-passkey-dialog .passkey-list::-webkit-scrollbar {
      width: 5px;
    }
    .confpass-passkey-dialog .passkey-list::-webkit-scrollbar-track {
      background: transparent;
    }
    .confpass-passkey-dialog .passkey-list::-webkit-scrollbar-thumb {
      background: #333;
      border-radius: 3px;
    }
    .confpass-passkey-dialog .passkey-item {
      padding: 10px 12px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      margin-bottom: 6px;
      cursor: pointer;
      transition: all 0.2s;
      background: #111114;
    }
    .confpass-passkey-dialog .passkey-item:hover {
      border-color: rgba(245, 158, 11, 0.3);
      background: rgba(245, 158, 11, 0.05);
    }
    .confpass-passkey-dialog .passkey-item.selected {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, 0.1);
    }
    .confpass-passkey-dialog .passkey-item .username {
      font-weight: 600;
      color: #fafafa;
      font-size: 13px;
    }
    .confpass-passkey-dialog .passkey-item .domain {
      font-size: 11px;
      color: #71717a;
      margin-top: 2px;
    }
    .confpass-pk-logo {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
    }
  `;

  function injectPasskeyStyles() {
    if (document.getElementById('confpass-passkey-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'confpass-passkey-styles';
    styleEl.textContent = passkeyDialogStyles;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function showPasskeyCreateDialog(data) {
    injectPasskeyStyles();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'confpass-overlay';
      overlay.innerHTML = `
        <div class="confpass-passkey-dialog">
          <h2>
            <div class="confpass-pk-logo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
            </div>
            Geçiş Anahtarı Oluştur
          </h2>
          <p class="subtitle">${data.rpName || data.rpId} için yeni bir geçiş anahtarı oluşturuluyor</p>
          <div class="site-info">
            <div><strong>Site:</strong> ${data.rpId}</div>
            <div><strong>Kullanıcı:</strong> ${data.userName}</div>
            ${data.userDisplayName ? `<div><strong>Ad:</strong> ${data.userDisplayName}</div>` : ''}
          </div>
          <div class="buttons">
            <button class="primary-btn" id="confpass-pk-use">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              ConfPass ile Kaydet
            </button>
            <button class="secondary-btn" id="confpass-pk-system">
              Sistem Doğrulayıcısını Kullan
            </button>
            <button class="cancel-btn" id="confpass-pk-cancel">İptal</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      document.getElementById('confpass-pk-use').onclick = () => {
        overlay.remove();
        resolve({ useConfPass: true });
      };

      document.getElementById('confpass-pk-system').onclick = () => {
        overlay.remove();
        resolve({ useSystem: true });
      };

      document.getElementById('confpass-pk-cancel').onclick = () => {
        overlay.remove();
        resolve({ cancelled: true });
      };

      overlay.onclick = (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve({ cancelled: true });
        }
      };
    });
  }

  function showPasskeyGetDialog(data, passkeys) {
    injectPasskeyStyles();
    return new Promise((resolve) => {
      const hasPasskeys = passkeys && passkeys.length > 0;

      const overlay = document.createElement('div');
      overlay.className = 'confpass-overlay';

      let passkeyListHTML = '';
      if (hasPasskeys) {
        passkeyListHTML = `
          <div class="passkey-list">
            ${passkeys.map((pk, i) => `
              <div class="passkey-item ${i === 0 ? 'selected' : ''}" data-index="${i}">
                <div class="username">${pk.userName || pk.userDisplayName || 'Kullanıcı'}</div>
                <div class="domain">${pk.rpId}</div>
              </div>
            `).join('')}
          </div>
        `;
      }

      overlay.innerHTML = `
        <div class="confpass-passkey-dialog">
          <h2>
            <div class="confpass-pk-logo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
            </div>
            Geçiş Anahtarı ile Giriş
          </h2>
          <p class="subtitle">${data.rpId} sitesine giriş yapılıyor</p>
          ${hasPasskeys ? passkeyListHTML : '<p style="color: #71717a; text-align: center; padding: 16px; font-size: 12px;">Bu site için kayıtlı geçiş anahtarı bulunamadı.</p>'}
          <div class="buttons">
            ${hasPasskeys ? `
              <button class="primary-btn" id="confpass-pk-use">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Giriş Yap
              </button>
            ` : ''}
            <button class="secondary-btn" id="confpass-pk-system">
              Sistem Doğrulayıcısını Kullan
            </button>
            <button class="cancel-btn" id="confpass-pk-cancel">İptal</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      let selectedIndex = 0;

      overlay.querySelectorAll('.passkey-item').forEach((item, i) => {
        item.onclick = () => {
          overlay.querySelectorAll('.passkey-item').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          selectedIndex = i;
        };
      });

      if (hasPasskeys) {
        document.getElementById('confpass-pk-use').onclick = () => {
          overlay.remove();
          resolve({ useConfPass: true, passkey: passkeys[selectedIndex] });
        };
      }

      document.getElementById('confpass-pk-system').onclick = () => {
        overlay.remove();
        resolve({ useSystem: true });
      };

      document.getElementById('confpass-pk-cancel').onclick = () => {
        overlay.remove();
        resolve({ cancelled: true });
      };

      overlay.onclick = (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve({ cancelled: true });
        }
      };
    });
  }

  // ========== TOTP Auto-Fill ==========
  const TOTP_SELECTORS = [
    'input[autocomplete="one-time-code"]',
    'input[name*="totp" i]',
    'input[name*="otp" i]',
    'input[name*="code" i]',
    'input[name*="token" i]',
    'input[name*="2fa" i]',
    'input[name*="mfa" i]',
    'input[id*="totp" i]',
    'input[id*="otp" i]',
    'input[id*="code" i]',
    'input[id*="2fa" i]',
    'input[id*="mfa" i]',
    'input[placeholder*="6" i]',
    'input[maxlength="6"][type="text"]',
    'input[maxlength="6"][type="tel"]',
    'input[maxlength="6"][type="number"]',
    'input[pattern*="[0-9]"][maxlength="6"]'
  ];

  function findTotpFields() {
    const fields = [];
    
    for (const selector of TOTP_SELECTORS) {
      try {
        document.querySelectorAll(selector).forEach(field => {
          if (isFieldVisible(field) && !fields.includes(field) && !field.dataset.confpassTotp) {
            const placeholder = (field.placeholder || '').toLowerCase();
            const label = field.labels?.[0]?.textContent?.toLowerCase() || '';
            const nearby = field.parentElement?.textContent?.toLowerCase() || '';
            
            const isTotpLikely = 
              placeholder.includes('kod') || placeholder.includes('code') ||
              placeholder.includes('doğrulama') || placeholder.includes('verification') ||
              placeholder.includes('6') || placeholder.includes('otp') ||
              label.includes('kod') || label.includes('code') ||
              label.includes('doğrulama') || label.includes('2fa') ||
              nearby.includes('kimlik doğrulama') || nearby.includes('authenticator') ||
              nearby.includes('two-factor') || nearby.includes('iki aşamalı');
            
            if (isTotpLikely || field.maxLength === 6) {
              fields.push(field);
            }
          }
        });
      } catch (e) {}
    }
    
    return fields;
  }

  function addTotpIconToField(field) {
    if (field.dataset.confpassTotp) return;
    field.dataset.confpassTotp = 'true';

    const parent = field.parentElement;
    if (parent) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.position === 'static') {
        parent.style.position = 'relative';
      }
    }

    const currentPaddingRight = parseInt(window.getComputedStyle(field).paddingRight) || 0;
    field.style.paddingRight = Math.max(currentPaddingRight, 36) + 'px';

    const iconBtn = document.createElement('button');
    iconBtn.className = 'confpass-icon-btn confpass-totp-btn';
    iconBtn.type = 'button';
    iconBtn.title = 'ConfPass TOTP';
    iconBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    `;

    iconBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await fillTotpCode(field);
    });

    if (parent) {
      parent.appendChild(iconBtn);
    }
  }

  async function fillTotpCode(field) {
    const domain = window.location.hostname;
    
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'get_totp_code',
          domain: domain
        }, resolve);
      });

      if (response && response.success && response.data && response.data.code) {
        field.value = response.data.code;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        
        showTotpNotification(`${response.data.issuer} kodu girildi`, 'success');
      } else {
        showTotpNotification('Bu site için kayıtlı authenticator yok', 'error');
      }
    } catch (error) {
      console.error('[ConfPass] TOTP error:', error);
      showTotpNotification('TOTP kodu alınamadı', 'error');
    }
  }

  function showTotpNotification(message, type) {
    const existing = document.querySelector('.confpass-totp-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'confpass-totp-notification';
    notification.style.cssText = `
      position: fixed !important;
      bottom: 20px !important;
      right: 20px !important;
      padding: 12px 20px !important;
      background: ${type === 'success' ? 'linear-gradient(135deg, #00d9ff, #00a8cc)' : '#ff4444'} !important;
      color: white !important;
      border-radius: 8px !important;
      font-family: -apple-system, sans-serif !important;
      font-size: 14px !important;
      z-index: 2147483647 !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
      animation: confpass-slide-in 0.3s ease !important;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 3000);
  }

  const totpNotificationStyle = document.createElement('style');
  totpNotificationStyle.textContent = `
    @keyframes confpass-slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  if (document.head) {
    document.head.appendChild(totpNotificationStyle);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.head.appendChild(totpNotificationStyle);
    });
  }

  function scanForTotpFields() {
    const totpFields = findTotpFields();
    totpFields.forEach(field => addTotpIconToField(field));
  }

  // ========== Start ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  setTimeout(scanForTotpFields, 500);
  setTimeout(scanForTotpFields, 1500);
  setTimeout(scanForTotpFields, 3000);

  const totpObserver = new MutationObserver(() => {
    setTimeout(scanForTotpFields, 100);
  });
  
  if (document.body) {
    totpObserver.observe(document.body, { childList: true, subtree: true });
  }

  console.log('[ConfPass Content] Initialized with TOTP support');
})();
