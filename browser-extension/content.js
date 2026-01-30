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
      z-index: 2147483647 !important;
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
      width: 280px !important;
      max-height: 350px !important;
      background: #0a0a0c !important;
      border: 1px solid rgba(255, 255, 255, 0.06) !important;
      border-radius: 12px !important;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(245, 158, 11, 0.1), 0 0 100px rgba(0, 0, 0, 0.5) !important;
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
      max-height: 280px !important;
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

    .confpass-totp-section {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      margin-top: 6px !important;
      padding: 6px 8px !important;
      background: rgba(16, 185, 129, 0.1) !important;
      border-radius: 6px !important;
      border: 1px solid rgba(16, 185, 129, 0.2) !important;
    }

    .confpass-totp-code {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #10b981 !important;
      letter-spacing: 2px !important;
    }

    .confpass-totp-copy {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 24px !important;
      height: 24px !important;
      background: rgba(16, 185, 129, 0.15) !important;
      border: none !important;
      border-radius: 4px !important;
      cursor: pointer !important;
      transition: all 0.2s !important;
      padding: 0 !important;
      margin-left: auto !important;
    }

    .confpass-totp-copy:hover {
      background: rgba(16, 185, 129, 0.3) !important;
    }

    .confpass-totp-copy svg {
      width: 12px !important;
      height: 12px !important;
      stroke: #10b981 !important;
    }

    .confpass-totp-label {
      font-size: 9px !important;
      color: #6b7280 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
    }

    .confpass-section-header {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 8px 10px 4px !important;
      font-size: 10px !important;
      font-weight: 600 !important;
      color: #71717a !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
    }

    .confpass-section-header svg {
      stroke: #71717a !important;
    }

    .confpass-auth-item {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 10px !important;
      margin: 4px 8px !important;
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.04) 100%) !important;
      border: 1px solid rgba(16, 185, 129, 0.2) !important;
      border-radius: 8px !important;
      transition: all 0.2s !important;
    }

    .confpass-auth-item:hover {
      background: rgba(16, 185, 129, 0.12) !important;
      border-color: rgba(16, 185, 129, 0.3) !important;
    }

    .confpass-auth-icon {
      width: 32px !important;
      height: 32px !important;
      min-width: 32px !important;
      background: rgba(16, 185, 129, 0.15) !important;
      border-radius: 8px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    .confpass-auth-icon svg {
      width: 16px !important;
      height: 16px !important;
      stroke: #10b981 !important;
    }

    .confpass-auth-info {
      flex: 1 !important;
      min-width: 0 !important;
    }

    .confpass-auth-issuer {
      font-size: 12px !important;
      font-weight: 600 !important;
      color: #fafafa !important;
      margin-bottom: 1px !important;
    }

    .confpass-auth-account {
      font-size: 10px !important;
      color: #71717a !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    .confpass-auth-code {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace !important;
      font-size: 16px !important;
      font-weight: 700 !important;
      color: #10b981 !important;
      letter-spacing: 2px !important;
      cursor: pointer !important;
      padding: 4px 8px !important;
      background: rgba(16, 185, 129, 0.1) !important;
      border-radius: 6px !important;
      transition: all 0.2s !important;
    }

    .confpass-auth-code:hover {
      background: rgba(16, 185, 129, 0.2) !important;
    }

    .confpass-auth-copy {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 28px !important;
      height: 28px !important;
      background: rgba(16, 185, 129, 0.1) !important;
      border: none !important;
      border-radius: 6px !important;
      cursor: pointer !important;
      transition: all 0.2s !important;
      padding: 0 !important;
    }

    .confpass-auth-copy:hover {
      background: rgba(16, 185, 129, 0.25) !important;
    }

    .confpass-auth-copy svg {
      width: 14px !important;
      height: 14px !important;
      stroke: #10b981 !important;
    }

    /* ========== Auto-Save Modal Styles ========== */
    .confpass-save-overlay {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background: rgba(5, 5, 7, 0.85) !important;
      backdrop-filter: blur(8px) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
      animation: confpass-fade-in 0.2s ease !important;
    }

    @keyframes confpass-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes confpass-scale-in {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .confpass-save-dialog {
      background: #0a0a0c !important;
      border: 1px solid rgba(255, 255, 255, 0.06) !important;
      border-radius: 16px !important;
      padding: 24px !important;
      max-width: 400px !important;
      width: 90% !important;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.7), 0 0 60px rgba(245, 158, 11, 0.1) !important;
      color: #fafafa !important;
      position: relative !important;
      overflow: hidden !important;
      animation: confpass-scale-in 0.3s ease !important;
    }

    .confpass-save-dialog::before {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 1px !important;
      background: linear-gradient(90deg, transparent, rgba(245, 158, 11, 0.4), transparent) !important;
    }

    .confpass-save-header {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      margin-bottom: 16px !important;
    }

    .confpass-save-icon {
      width: 40px !important;
      height: 40px !important;
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%) !important;
      border-radius: 10px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3) !important;
    }

    .confpass-save-icon svg {
      width: 20px !important;
      height: 20px !important;
      stroke: white !important;
      fill: none !important;
    }

    .confpass-save-title {
      font-size: 16px !important;
      font-weight: 700 !important;
      color: #fafafa !important;
      margin: 0 !important;
    }

    .confpass-save-subtitle {
      font-size: 12px !important;
      color: #71717a !important;
      margin: 0 !important;
    }

    .confpass-save-info {
      background: #111114 !important;
      padding: 14px !important;
      border-radius: 10px !important;
      margin-bottom: 18px !important;
      border: 1px solid rgba(255, 255, 255, 0.06) !important;
    }

    .confpass-save-info-row {
      display: flex !important;
      justify-content: space-between !important;
      padding: 6px 0 !important;
      font-size: 13px !important;
    }

    .confpass-save-info-row:first-child {
      padding-top: 0 !important;
    }

    .confpass-save-info-row:last-child {
      padding-bottom: 0 !important;
    }

    .confpass-save-info-label {
      color: #71717a !important;
    }

    .confpass-save-info-value {
      color: #fafafa !important;
      font-weight: 500 !important;
      max-width: 200px !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }

    .confpass-save-buttons {
      display: flex !important;
      gap: 10px !important;
    }

    .confpass-save-btn {
      flex: 1 !important;
      padding: 12px 18px !important;
      border-radius: 8px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
      border: none !important;
      font-family: inherit !important;
    }

    .confpass-save-btn-primary {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%) !important;
      color: white !important;
      box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25) !important;
    }

    .confpass-save-btn-primary:hover {
      transform: translateY(-1px) !important;
      box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4) !important;
    }

    .confpass-save-btn-secondary {
      background: #18181c !important;
      color: #a1a1aa !important;
      border: 1px solid rgba(255, 255, 255, 0.06) !important;
    }

    .confpass-save-btn-secondary:hover {
      background: #1f1f24 !important;
      color: #fafafa !important;
    }

    .confpass-save-notification {
      position: fixed !important;
      bottom: 20px !important;
      right: 20px !important;
      padding: 12px 20px !important;
      border-radius: 8px !important;
      font-family: -apple-system, sans-serif !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      z-index: 2147483647 !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
      animation: confpass-slide-in 0.3s ease !important;
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

  // Card field selectors - comprehensive
  const CARD_SELECTORS = [
    'input[name*="card" i][name*="number" i]',
    'input[name*="cardnumber" i]',
    'input[name*="cc-number" i]',
    'input[name*="ccnumber" i]',
    'input[name*="creditcard" i]',
    'input[name*="credit-card" i]',
    'input[name*="debitcard" i]',
    'input[name*="pan" i]',
    'input[id*="card" i][id*="number" i]',
    'input[id*="cardnumber" i]',
    'input[id*="creditcard" i]',
    'input[id*="ccnum" i]',
    'input[autocomplete="cc-number"]',
    'input[autocomplete="cc-name"]',
    'input[autocomplete="cc-exp"]',
    'input[autocomplete="cc-exp-month"]',
    'input[autocomplete="cc-exp-year"]',
    'input[autocomplete="cc-csc"]',
    'input[data-card]',
    'input[placeholder*="kart" i][placeholder*="numa" i]',
    'input[placeholder*="card" i][placeholder*="number" i]',
    'input[placeholder*="1234" i]',
    'input[placeholder*="•••• ••••" i]',
    'input[aria-label*="kart numa" i]',
    'input[aria-label*="card number" i]',
    'input[aria-label*="kredi kart" i]',
    'input[aria-label*="credit card" i]',
    'input[name*="cvv" i]',
    'input[name*="cvc" i]',
    'input[name*="security" i][name*="code" i]',
    'input[name*="expir" i]',
    'input[name*="exp" i][name*="date" i]',
    'input[name*="cardholder" i]',
    'input[name*="card" i][name*="holder" i]',
    'input[name*="card" i][name*="name" i]',
    'input[placeholder*="MM" i][placeholder*="YY" i]',
    'input[placeholder*="CVV" i]',
    'input[placeholder*="CVC" i]',
    'input[maxlength="16"]',
    'input[maxlength="19"]'
  ];

  // CVV specific selectors
  const CVV_SELECTORS = [
    'input[name*="cvv" i]',
    'input[name*="cvc" i]',
    'input[name*="cvn" i]',
    'input[name*="security" i][name*="code" i]',
    'input[autocomplete="cc-csc"]',
    'input[placeholder*="CVV" i]',
    'input[placeholder*="CVC" i]',
    'input[placeholder*="güvenlik" i]',
    'input[maxlength="3"]',
    'input[maxlength="4"]'
  ];

  // Expiry selectors
  const EXPIRY_SELECTORS = [
    'input[name*="expir" i]',
    'input[name*="exp" i]',
    'input[autocomplete="cc-exp"]',
    'input[autocomplete="cc-exp-month"]',
    'input[autocomplete="cc-exp-year"]',
    'input[placeholder*="MM" i]',
    'input[placeholder*="AA" i]',
    'input[placeholder*="YY" i]'
  ];

  // Address field selectors - comprehensive (Turkish e-commerce focused)
  const ADDRESS_SELECTORS = [
    // Generic address
    'input[name*="address" i]:not([name*="email" i]):not([name*="mail" i])',
    'input[name*="adres" i]:not([name*="email" i]):not([name*="mail" i])',
    'textarea[name*="address" i]', 'textarea[name*="adres" i]',
    'textarea[id*="address" i]', 'textarea[id*="adres" i]',
    // Street
    'input[name*="street" i]', 'input[name*="sokak" i]', 'input[name*="cadde" i]',
    'input[id*="street" i]', 'input[id*="sokak" i]', 'input[id*="cadde" i]',
    // Neighborhood
    'input[name*="mahalle" i]', 'input[name*="mah" i]', 'input[name*="semt" i]',
    'input[id*="mahalle" i]', 'input[id*="neighborhood" i]',
    // Building/Apartment
    'input[name*="apartman" i]', 'input[name*="bina" i]', 'input[name*="building" i]',
    'input[name*="daire" i]', 'input[name*="flat" i]', 'input[name*="kat" i]',
    'input[id*="apartman" i]', 'input[id*="bina" i]', 'input[id*="daire" i]',
    // District (İlçe)
    'input[name*="ilce" i]', 'input[name*="ilçe" i]', 'input[name*="district" i]',
    'input[id*="ilce" i]', 'input[id*="ilçe" i]', 'input[id*="district" i]',
    'select[name*="ilce" i]', 'select[name*="ilçe" i]', 'select[id*="ilce" i]',
    // City (İl)
    'input[name*="city" i]', 'input[name*="sehir" i]', 'input[name*="şehir" i]',
    'input[name="il" i]', 'input[name*="_il" i]', 'input[name*="il_" i]',
    'input[id*="city" i]', 'input[id*="sehir" i]', 'input[id*="il" i]',
    'select[name*="city" i]', 'select[name*="il" i]', 'select[name*="sehir" i]',
    'select[id*="city" i]', 'select[id*="il" i]',
    // Postal code
    'input[name*="postal" i]', 'input[name*="zip" i]', 'input[name*="posta" i]',
    'input[name*="pk" i]', 'input[name*="postcode" i]',
    'input[id*="postal" i]', 'input[id*="zip" i]', 'input[id*="posta" i]',
    // Country
    'input[name*="country" i]', 'input[name*="ulke" i]', 'input[name*="ülke" i]',
    'select[name*="country" i]', 'select[name*="ulke" i]',
    // Location
    'input[name*="konum" i]', 'input[name*="location" i]',
    'input[id*="konum" i]', 'input[id*="location" i]',
    // Autocomplete attributes
    'input[autocomplete="street-address"]',
    'input[autocomplete="address-line1"]', 'input[autocomplete="address-line2"]',
    'input[autocomplete="address-level1"]', 'input[autocomplete="address-level2"]',
    'input[autocomplete="postal-code"]',
    'input[autocomplete="country"]', 'input[autocomplete="country-name"]',
    // Placeholders
    'input[placeholder*="adres" i]:not([placeholder*="mail" i])',
    'input[placeholder*="address" i]:not([placeholder*="email" i])',
    'input[placeholder*="sokak" i]', 'input[placeholder*="cadde" i]',
    'input[placeholder*="mahalle" i]', 'input[placeholder*="şehir" i]',
    'input[placeholder*="ilçe" i]', 'input[placeholder*="posta" i]',
    // Aria labels
    'input[aria-label*="adres" i]', 'input[aria-label*="address" i]',
    'input[aria-label*="konum" i]', 'input[aria-label*="teslimat" i]',
    'input[aria-label*="delivery" i]', 'input[aria-label*="shipping" i]',
    // Common Turkish e-commerce patterns
    'input[data-testid*="address" i]', 'input[data-testid*="adres" i]',
    'input[class*="address" i]', 'input[class*="adres" i]'
  ];

  // Site-specific configurations for popular Turkish sites
  const SITE_SPECIFIC_CONFIG = {
    'yemeksepeti.com': {
      addressFormSelector: '[class*="address"], [class*="AddressForm"], form[class*="delivery"]',
      useDelayedFill: true,
      fillDelay: 200
    },
    'trendyol.com': {
      addressFormSelector: '[class*="address"], [class*="checkout"]',
      useDelayedFill: true,
      fillDelay: 150
    },
    'hepsiburada.com': {
      addressFormSelector: '[class*="address"], [class*="delivery"]',
      useDelayedFill: true,
      fillDelay: 150
    },
    'n11.com': {
      addressFormSelector: '[class*="address"], [class*="delivery"]',
      useDelayedFill: true,
      fillDelay: 100
    },
    'getir.com': {
      addressFormSelector: '[class*="address"], [class*="location"]',
      useDelayedFill: true,
      fillDelay: 200
    }
  };

  // Get site-specific config if available
  function getSiteConfig() {
    const hostname = window.location.hostname.replace('www.', '');
    for (const [site, config] of Object.entries(SITE_SPECIFIC_CONFIG)) {
      if (hostname.includes(site.replace('www.', ''))) {
        return config;
      }
    }
    return null;
  }

  function findLoginFields() {
    const fields = { username: [], password: [], card: [], address: [] };

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

    // Find card fields
    for (const selector of CARD_SELECTORS) {
      try {
        document.querySelectorAll(selector).forEach(field => {
          if (isFieldVisible(field) && !fields.card.includes(field)) {
            fields.card.push(field);
          }
        });
      } catch (e) {}
    }

    // Find address fields
    for (const selector of ADDRESS_SELECTORS) {
      try {
        document.querySelectorAll(selector).forEach(field => {
          if (isFieldVisible(field) && !fields.address.includes(field)) {
            fields.address.push(field);
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

  function getFieldType(field) {
    // Get field attributes for analysis
    const name = (field.name || '').toLowerCase();
    const id = (field.id || '').toLowerCase();
    const placeholder = (field.placeholder || '').toLowerCase();
    const ariaLabel = (field.getAttribute('aria-label') || '').toLowerCase();
    const autocomplete = (field.getAttribute('autocomplete') || '').toLowerCase();
    const type = (field.type || '').toLowerCase();
    const maxLength = field.maxLength;
    const className = (field.className || '').toLowerCase();

    // Check surrounding context (labels, parent elements)
    const label = field.labels?.[0]?.textContent?.toLowerCase() || '';
    const parentText = field.parentElement?.textContent?.toLowerCase() || '';

    // Card-related keywords
    const cardKeywords = ['card', 'kart', 'kredi', 'credit', 'debit', 'banka', 'pan', 'payment', 'ödeme'];
    const cvvKeywords = ['cvv', 'cvc', 'cvn', 'güvenlik kodu', 'security code', 'guvenlik'];
    const expiryKeywords = ['expir', 'son kullanma', 'tarih', 'mm/yy', 'aa/yy', 'valid', 'geçerlilik'];
    const cardHolderKeywords = ['cardholder', 'kart sahibi', 'holder', 'card name'];

    // Address-related keywords
    const addressKeywords = ['address', 'adres', 'street', 'sokak', 'cadde', 'mahalle', 'konum',
                             'teslimat', 'delivery', 'shipping', 'billing', 'fatura'];
    const cityKeywords = ['city', 'şehir', 'sehir', 'il', 'ilce', 'ilçe', 'town'];
    const postalKeywords = ['postal', 'zip', 'posta', 'postcode'];
    const countryKeywords = ['country', 'ülke', 'ulke'];

    // Email-related keywords (to exclude from address detection)
    const emailKeywords = ['email', 'e-posta', 'eposta', 'mail'];

    // Helper function to check if any keyword exists
    const hasKeyword = (keywords) => {
      const allText = `${name} ${id} ${placeholder} ${ariaLabel} ${label} ${className}`;
      return keywords.some(kw => allText.includes(kw));
    };

    // Check if this is an email field first - should be treated as password/login
    if (type === 'email' || hasKeyword(emailKeywords)) {
      return 'password';
    }

    // Check autocomplete attribute first (most reliable)
    if (autocomplete.startsWith('cc-')) return 'card';
    if (autocomplete === 'email' || autocomplete === 'username') return 'password';
    if (autocomplete.includes('address') || autocomplete.includes('street') ||
        autocomplete.includes('postal') || autocomplete.includes('country')) return 'address';

    // Check for CVV (maxLength 3-4 is a strong indicator)
    if ((maxLength === 3 || maxLength === 4) && hasKeyword(cvvKeywords)) return 'card';

    // Check for card number (maxLength 16-19)
    if ((maxLength === 16 || maxLength === 19) && hasKeyword(cardKeywords)) return 'card';

    // Check for expiry
    if (hasKeyword(expiryKeywords) && (placeholder.includes('mm') || placeholder.includes('aa'))) return 'card';

    // Check selector matches
    for (const selector of CVV_SELECTORS) {
      try { if (field.matches(selector)) return 'card'; } catch (e) {}
    }
    for (const selector of EXPIRY_SELECTORS) {
      try { if (field.matches(selector)) return 'card'; } catch (e) {}
    }
    for (const selector of CARD_SELECTORS) {
      try { if (field.matches(selector)) return 'card'; } catch (e) {}
    }

    // Check for address by keywords
    if (hasKeyword(addressKeywords) || hasKeyword(cityKeywords) ||
        hasKeyword(postalKeywords) || hasKeyword(countryKeywords)) {
      // Make sure it's not a card field or email field misidentified
      if (!hasKeyword(cardKeywords) && !hasKeyword(emailKeywords)) return 'address';
    }

    for (const selector of ADDRESS_SELECTORS) {
      try { if (field.matches(selector)) return 'address'; } catch (e) {}
    }

    // Check for password field
    if (type === 'password') return 'password';
    for (const selector of PASSWORD_SELECTORS) {
      try { if (field.matches(selector)) return 'password'; } catch (e) {}
    }

    // Check for username/email
    for (const selector of USERNAME_SELECTORS) {
      try { if (field.matches(selector)) return 'password'; } catch (e) {}
    }

    return 'password'; // default for login fields
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
  function addIconToField(field, fieldType = null) {
    if (field.dataset.confpassIcon) return;
    field.dataset.confpassIcon = 'true';

    const type = fieldType || getFieldType(field);
    field.dataset.confpassFieldType = type;

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
      toggleDropdown(field, iconBtn, type);
    });

    // Insert icon after field in parent
    if (parent) {
      parent.style.position = 'relative';
      parent.appendChild(iconBtn);
    }
  }

  function toggleDropdown(field, iconBtn, fieldType = 'password') {
    // Close existing dropdown
    if (activeDropdown) {
      activeDropdown.remove();
      activeDropdown = null;
    }

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'confpass-dropdown';
    activeDropdown = dropdown;

    // Header with appropriate icon
    const headerIcon = fieldType === 'card'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>'
      : fieldType === 'address'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

    dropdown.innerHTML = `
      <div class="confpass-dropdown-header">
        <div class="confpass-dropdown-logo">
          ${headerIcon}
        </div>
        <span class="confpass-dropdown-title">ConfPass</span>
      </div>
      <div class="confpass-dropdown-list">
        <div class="confpass-dropdown-empty">Yukleniyor...</div>
      </div>
    `;

    // Position dropdown - append to body for highest z-index
    document.body.appendChild(dropdown);

    // Position dropdown near the icon button
    const positionDropdown = () => {
      const iconRect = iconBtn.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const dropdownHeight = 350; // max height
      const dropdownWidth = 280;

      let top = iconRect.bottom + 4 + window.scrollY;
      let left = iconRect.right - dropdownWidth + window.scrollX;

      // Check if dropdown should open upward
      const spaceBelow = viewportHeight - iconRect.bottom;
      const spaceAbove = iconRect.top;

      if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
        top = iconRect.top - dropdownHeight - 4 + window.scrollY;
        dropdown.classList.add('confpass-dropdown-upward');
      }

      // Keep dropdown in viewport horizontally
      if (left < 10) {
        left = 10;
      }
      if (left + dropdownWidth > viewportWidth - 10) {
        left = viewportWidth - dropdownWidth - 10;
      }

      dropdown.style.position = 'absolute';
      dropdown.style.top = `${top}px`;
      dropdown.style.left = `${left}px`;
    };

    positionDropdown();

    // Load appropriate data based on field type
    if (fieldType === 'card') {
      loadCardsForDropdown(dropdown, field);
    } else if (fieldType === 'address') {
      loadAddressesForDropdown(dropdown, field);
    } else {
      loadPasswordsForDropdown(dropdown, field);
    }

    // Close on outside click or outside scroll
    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== iconBtn) {
        dropdown.remove();
        activeDropdown = null;
        document.removeEventListener('click', closeHandler);
        window.removeEventListener('scroll', scrollHandler, true);
      }
    };

    const scrollHandler = (e) => {
      // Don't close if scrolling inside the dropdown
      if (dropdown.contains(e.target)) {
        return;
      }
      dropdown.remove();
      activeDropdown = null;
      document.removeEventListener('click', closeHandler);
      window.removeEventListener('scroll', scrollHandler, true);
    };

    setTimeout(() => {
      document.addEventListener('click', closeHandler);
      window.addEventListener('scroll', scrollHandler, true);
    }, 0);
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

      const hasPasswords = response && response.success && response.passwords && response.passwords.length > 0;
      const hasAuthenticators = response && response.success && response.authenticators && response.authenticators.length > 0;

      if (hasPasswords || hasAuthenticators) {
        cachedPasswords = response.passwords || [];
        renderDropdownWithAuth(listEl, response.passwords || [], response.authenticators || [], targetField);
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

  function showDropdownEmpty(listEl, type = 'password') {
    const messages = {
      password: 'Bu site için kayıtlı hesap yok',
      card: 'Kayıtlı kart yok',
      address: 'Kayıtlı adres yok'
    };
    listEl.innerHTML = `
      <div class="confpass-dropdown-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div>${messages[type] || messages.password}</div>
      </div>
    `;
  }

  function loadCardsForDropdown(dropdown, targetField) {
    const listEl = dropdown.querySelector('.confpass-dropdown-list');

    chrome.runtime.sendMessage({ type: 'get_cards' }, (response) => {
      if (chrome.runtime.lastError) {
        showDropdownLocked(listEl);
        return;
      }

      if (response && response.error === 'Vault is locked') {
        showDropdownLocked(listEl);
        return;
      }

      if (response && response.success && response.cards && response.cards.length > 0) {
        renderCardsDropdown(listEl, response.cards, targetField);
      } else {
        showDropdownEmpty(listEl, 'card');
      }
    });
  }

  function loadAddressesForDropdown(dropdown, targetField) {
    const listEl = dropdown.querySelector('.confpass-dropdown-list');

    chrome.runtime.sendMessage({ type: 'get_addresses' }, (response) => {
      if (chrome.runtime.lastError) {
        showDropdownLocked(listEl);
        return;
      }

      if (response && response.error === 'Vault is locked') {
        showDropdownLocked(listEl);
        return;
      }

      if (response && response.success && response.addresses && response.addresses.length > 0) {
        renderAddressesDropdown(listEl, response.addresses, targetField);
      } else {
        showDropdownEmpty(listEl, 'address');
      }
    });
  }

  function renderCardsDropdown(listEl, cards, targetField) {
    listEl.innerHTML = cards.map((card, i) => {
      const lastFour = card.cardNumber ? card.cardNumber.slice(-4) : '****';
      const cardType = card.cardType || 'Kart';
      return `
        <button class="confpass-dropdown-item" data-index="${i}">
          <div class="confpass-dropdown-item-icon" style="background: rgba(59, 130, 246, 0.15) !important; color: #3b82f6 !important;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
              <line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
          </div>
          <div class="confpass-dropdown-item-info">
            <div class="confpass-dropdown-item-title">${escapeHtml(card.title || cardType)}</div>
            <div class="confpass-dropdown-item-username">•••• •••• •••• ${escapeHtml(lastFour)}</div>
          </div>
        </button>
      `;
    }).join('');

    listEl.querySelectorAll('.confpass-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        const card = cards[index];
        if (card && card.cardNumber) {
          fillCardFields(card, targetField);
          if (activeDropdown) {
            activeDropdown.remove();
            activeDropdown = null;
          }
        }
      });
    });
  }

  function renderAddressesDropdown(listEl, addresses, targetField) {
    listEl.innerHTML = addresses.map((addr, i) => {
      const displayAddr = [addr.street, addr.city, addr.country].filter(Boolean).join(', ') || addr.title;
      return `
        <button class="confpass-dropdown-item" data-index="${i}">
          <div class="confpass-dropdown-item-icon" style="background: rgba(16, 185, 129, 0.15) !important; color: #10b981 !important;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div class="confpass-dropdown-item-info">
            <div class="confpass-dropdown-item-title">${escapeHtml(addr.title || 'Adres')}</div>
            <div class="confpass-dropdown-item-username">${escapeHtml(displayAddr)}</div>
          </div>
        </button>
      `;
    }).join('');

    listEl.querySelectorAll('.confpass-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        const addr = addresses[index];
        if (addr) {
          fillAddressFields(addr, targetField);
          if (activeDropdown) {
            activeDropdown.remove();
            activeDropdown = null;
          }
        }
      });
    });
  }

  function fillCardFields(card) {
    // Fill card number
    const cardNumberFields = document.querySelectorAll(CARD_SELECTORS.join(','));
    cardNumberFields.forEach(field => {
      if (isFieldVisible(field) && card.cardNumber) {
        field.value = card.cardNumber;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Fill expiry
    const expirySelectors = [
      'input[name*="expir" i]', 'input[name*="exp" i]', 'input[autocomplete="cc-exp"]',
      'input[placeholder*="MM" i]', 'input[placeholder*="AA" i]'
    ];
    if (card.expiry) {
      document.querySelectorAll(expirySelectors.join(',')).forEach(field => {
        if (isFieldVisible(field)) {
          field.value = card.expiry;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    // Fill CVV
    const cvvSelectors = [
      'input[name*="cvv" i]', 'input[name*="cvc" i]', 'input[name*="security" i]',
      'input[autocomplete="cc-csc"]', 'input[placeholder*="CVV" i]', 'input[placeholder*="CVC" i]'
    ];
    if (card.cvv) {
      document.querySelectorAll(cvvSelectors.join(',')).forEach(field => {
        if (isFieldVisible(field)) {
          field.value = card.cvv;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }

    // Fill cardholder name
    const nameSelectors = [
      'input[name*="holder" i]', 'input[name*="cardholder" i]', 'input[autocomplete="cc-name"]',
      'input[placeholder*="ad" i][placeholder*="kart" i]'
    ];
    if (card.cardholderName) {
      document.querySelectorAll(nameSelectors.join(',')).forEach(field => {
        if (isFieldVisible(field)) {
          field.value = card.cardholderName;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }
  }

  function fillAddressFields(addr, targetField) {
    // Parse address data - handle both flat and nested structures
    const addressData = parseAddressData(addr);
    console.log('[ConfPass] Filling address:', addressData);

    // Get site-specific config
    const siteConfig = getSiteConfig();
    const baseDelay = siteConfig?.fillDelay || 50;
    console.log('[ConfPass] Site config:', siteConfig ? 'found' : 'default', 'delay:', baseDelay);

    // Helper to fill a field and dispatch events (with retry for React/Angular)
    const fillField = (field, value, retryCount = 0) => {
      if (!field || !value) return false;

      try {
        if (field.tagName === 'SELECT') {
          // For select elements, try multiple matching strategies
          const normalizedValue = value.toLowerCase().trim();
          const option = Array.from(field.options).find(o => {
            const optText = o.text.toLowerCase().trim();
            const optValue = o.value.toLowerCase().trim();
            return optText === normalizedValue ||
                   optValue === normalizedValue ||
                   optText.includes(normalizedValue) ||
                   normalizedValue.includes(optText) ||
                   optValue.includes(normalizedValue);
          });

          if (option) {
            field.value = option.value;
          } else {
            console.log('[ConfPass] No matching option found for:', value);
            return false;
          }
        } else {
          // For input fields, use native setter for React compatibility
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          )?.set;
          const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
          )?.set;

          if (field.tagName === 'TEXTAREA' && nativeTextareaValueSetter) {
            nativeTextareaValueSetter.call(field, value);
          } else if (nativeInputValueSetter) {
            nativeInputValueSetter.call(field, value);
          } else {
            field.value = value;
          }
        }

        // Dispatch multiple events for framework compatibility
        field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
        field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
        field.dispatchEvent(new Event('blur', { bubbles: true }));

        // Focus and blur to trigger validation
        field.focus();
        setTimeout(() => field.blur(), 50);

        return true;
      } catch (e) {
        console.error('[ConfPass] Fill error:', e);
        return false;
      }
    };

    // Turkish address field type detection (more comprehensive)
    const getFieldAddressType = (field) => {
      const name = (field.name || '').toLowerCase();
      const id = (field.id || '').toLowerCase();
      const placeholder = (field.placeholder || '').toLowerCase();
      const autocomplete = (field.getAttribute('autocomplete') || '').toLowerCase();
      const label = field.labels?.[0]?.textContent?.toLowerCase() || '';
      const ariaLabel = (field.getAttribute('aria-label') || '').toLowerCase();
      const className = (field.className || '').toLowerCase();

      const allText = `${name} ${id} ${placeholder} ${autocomplete} ${label} ${ariaLabel} ${className}`;

      // Turkish specific - Apartment/Building
      if (allText.match(/apartman|apt|bina|building/)) return 'building';
      if (allText.match(/daire|flat|unit|kat.*no|floor.*no/)) return 'apartment';
      if (allText.match(/kat\b|floor\b/) && !allText.includes('no')) return 'floor';

      // District (ilçe)
      if (allText.match(/ilce|ilçe|district|semt/)) return 'district';

      // Neighborhood (mahalle)
      if (allText.match(/mahalle|neighborhood|semt|mah\b/)) return 'neighborhood';

      // Street
      if (autocomplete.includes('street') || autocomplete.includes('address-line') ||
          allText.match(/street|sokak|cadde|sok\b|cad\b|bulvar|blv/)) {
        return 'street';
      }

      // Full address field
      if (allText.match(/adres|address/) && !allText.match(/mail|email|e-posta/)) {
        return 'fullAddress';
      }

      // City (il/şehir)
      if (autocomplete === 'address-level2' ||
          allText.match(/city|şehir|sehir|\bil\b|province/)) {
        return 'city';
      }

      // State
      if (autocomplete === 'address-level1' || allText.match(/state|eyalet|region|bölge/)) {
        return 'state';
      }

      // Postal code
      if (autocomplete === 'postal-code' || allText.match(/postal|zip|posta|pk\b/)) {
        return 'postal';
      }

      // Country
      if (autocomplete.includes('country') || allText.match(/country|ülke|ulke/)) {
        return 'country';
      }

      // Phone
      if (allText.match(/phone|telefon|tel\b|gsm|cep/)) return 'phone';

      // Name on address
      if (allText.match(/name|isim|ad\b|soyad|recipient|alıcı/)) return 'name';

      return 'fullAddress'; // default to full address
    };

    // Parse stored address data into components
    function parseAddressData(addr) {
      // If notes field contains JSON, parse it
      let parsed = { ...addr };

      if (addr.notes) {
        try {
          const notesData = JSON.parse(addr.notes);
          parsed = { ...parsed, ...notesData };
        } catch (e) {
          // Notes is not JSON, might be plain text address
        }
      }

      // Build full address string
      const parts = [
        parsed.street || parsed.address || parsed.sokak || parsed.cadde,
        parsed.neighborhood || parsed.mahalle,
        parsed.district || parsed.ilce || parsed.ilçe,
        parsed.city || parsed.sehir || parsed.şehir || parsed.il,
        parsed.state || parsed.eyalet,
        parsed.postalCode || parsed.postal || parsed.postaKodu || parsed.pk,
        parsed.country || parsed.ulke || parsed.ülke
      ].filter(Boolean);

      parsed.fullAddress = parts.join(', ');

      return parsed;
    }

    // Get value for a specific field type
    const getValueForFieldType = (fieldType) => {
      switch (fieldType) {
        case 'street':
          return addressData.street || addressData.sokak || addressData.cadde || '';
        case 'neighborhood':
          return addressData.neighborhood || addressData.mahalle || '';
        case 'district':
          return addressData.district || addressData.ilce || addressData.ilçe || '';
        case 'city':
          return addressData.city || addressData.sehir || addressData.şehir || addressData.il || '';
        case 'state':
          return addressData.state || addressData.eyalet || '';
        case 'postal':
          return addressData.postalCode || addressData.postal || addressData.postaKodu || addressData.pk || '';
        case 'country':
          return addressData.country || addressData.ulke || addressData.ülke || 'Türkiye';
        case 'building':
          return addressData.building || addressData.bina || addressData.apartman || '';
        case 'apartment':
          return addressData.apartment || addressData.daire || addressData.flat || '';
        case 'floor':
          return addressData.floor || addressData.kat || '';
        case 'phone':
          return addressData.phone || addressData.telefon || addressData.tel || '';
        case 'name':
          return addressData.name || addressData.fullName || addressData.recipientName || '';
        case 'fullAddress':
        default:
          return addressData.fullAddress || '';
      }
    };

    // First, fill the target field that was clicked
    if (targetField && isFieldVisible(targetField)) {
      const fieldType = getFieldAddressType(targetField);
      const valueToFill = getValueForFieldType(fieldType);
      console.log('[ConfPass] Target field type:', fieldType, '-> value:', valueToFill);
      if (valueToFill) {
        fillField(targetField, valueToFill);
      }
    }

    // Comprehensive field selectors for Turkish sites
    const fieldMappings = [
      // Street/Address
      {
        type: 'street',
        selectors: [
          'input[name*="street" i]', 'input[name*="sokak" i]', 'input[name*="cadde" i]',
          'input[id*="street" i]', 'input[id*="sokak" i]', 'input[id*="cadde" i]',
          'input[autocomplete="street-address"]', 'input[autocomplete="address-line1"]',
          'input[placeholder*="sokak" i]', 'input[placeholder*="cadde" i]',
          'input[aria-label*="sokak" i]', 'input[aria-label*="cadde" i]'
        ]
      },
      // Full address
      {
        type: 'fullAddress',
        selectors: [
          'input[name*="address" i]:not([name*="email" i])', 'input[name*="adres" i]:not([name*="mail" i])',
          'textarea[name*="address" i]', 'textarea[name*="adres" i]',
          'input[id*="address" i]:not([id*="email" i])', 'input[id*="adres" i]:not([id*="mail" i])',
          'textarea[id*="address" i]', 'textarea[id*="adres" i]',
          'input[placeholder*="adres" i]:not([placeholder*="mail" i])',
          'textarea[placeholder*="adres" i]'
        ]
      },
      // Neighborhood (Mahalle)
      {
        type: 'neighborhood',
        selectors: [
          'input[name*="mahalle" i]', 'input[name*="neighborhood" i]', 'input[name*="mah" i]',
          'input[id*="mahalle" i]', 'input[id*="neighborhood" i]',
          'input[placeholder*="mahalle" i]',
          'select[name*="mahalle" i]', 'select[id*="mahalle" i]'
        ]
      },
      // District (İlçe)
      {
        type: 'district',
        selectors: [
          'input[name*="ilce" i]', 'input[name*="ilçe" i]', 'input[name*="district" i]',
          'input[name*="semt" i]',
          'input[id*="ilce" i]', 'input[id*="ilçe" i]', 'input[id*="district" i]',
          'input[placeholder*="ilçe" i]', 'input[placeholder*="ilce" i]',
          'select[name*="ilce" i]', 'select[name*="ilçe" i]', 'select[name*="district" i]',
          'select[id*="ilce" i]', 'select[id*="ilçe" i]'
        ]
      },
      // City (İl/Şehir)
      {
        type: 'city',
        selectors: [
          'input[name*="city" i]', 'input[name*="sehir" i]', 'input[name*="şehir" i]',
          'input[name="il" i]', 'input[name*="_il" i]', 'input[name*="il_" i]',
          'input[id*="city" i]', 'input[id*="sehir" i]', 'input[id*="şehir" i]',
          'input[autocomplete="address-level2"]',
          'input[placeholder*="şehir" i]', 'input[placeholder*="city" i]', 'input[placeholder*="il" i]',
          'select[name*="city" i]', 'select[name*="il" i]', 'select[name*="sehir" i]',
          'select[id*="city" i]', 'select[id*="il" i]', 'select[id*="sehir" i]'
        ]
      },
      // Postal code
      {
        type: 'postal',
        selectors: [
          'input[name*="postal" i]', 'input[name*="zip" i]', 'input[name*="posta" i]',
          'input[name*="postcode" i]', 'input[name*="pk" i]',
          'input[id*="postal" i]', 'input[id*="zip" i]', 'input[id*="posta" i]',
          'input[autocomplete="postal-code"]',
          'input[placeholder*="posta" i]', 'input[placeholder*="zip" i]'
        ]
      },
      // Country
      {
        type: 'country',
        selectors: [
          'input[name*="country" i]', 'input[name*="ulke" i]', 'input[name*="ülke" i]',
          'input[id*="country" i]', 'input[id*="ulke" i]',
          'input[autocomplete="country-name"]', 'input[autocomplete="country"]',
          'select[name*="country" i]', 'select[name*="ulke" i]', 'select[name*="ülke" i]',
          'select[id*="country" i]', 'select[autocomplete="country"]'
        ]
      },
      // Building/Apartment
      {
        type: 'building',
        selectors: [
          'input[name*="bina" i]', 'input[name*="building" i]', 'input[name*="apartman" i]',
          'input[id*="bina" i]', 'input[id*="building" i]', 'input[id*="apartman" i]',
          'input[placeholder*="bina" i]', 'input[placeholder*="apartman" i]'
        ]
      },
      // Apartment/Flat number
      {
        type: 'apartment',
        selectors: [
          'input[name*="daire" i]', 'input[name*="flat" i]', 'input[name*="unit" i]',
          'input[id*="daire" i]', 'input[id*="flat" i]',
          'input[placeholder*="daire" i]'
        ]
      },
      // Floor
      {
        type: 'floor',
        selectors: [
          'input[name*="kat" i]:not([name*="katman" i])', 'input[name*="floor" i]',
          'input[id*="kat" i]:not([id*="katman" i])', 'input[id*="floor" i]',
          'input[placeholder*="kat" i]', 'select[name*="kat" i]'
        ]
      },
      // Phone
      {
        type: 'phone',
        selectors: [
          'input[name*="phone" i]', 'input[name*="telefon" i]', 'input[name*="tel" i]',
          'input[name*="gsm" i]', 'input[name*="cep" i]', 'input[name*="mobile" i]',
          'input[id*="phone" i]', 'input[id*="telefon" i]',
          'input[type="tel"]', 'input[autocomplete="tel"]'
        ]
      }
    ];

    // Fill all matching fields with delay for React/Angular sites
    let delay = 0;
    const filledFields = new Set();
    filledFields.add(targetField);

    fieldMappings.forEach(({ type, selectors }) => {
      const value = getValueForFieldType(type);
      if (!value) return;

      try {
        const selector = selectors.join(',');
        document.querySelectorAll(selector).forEach(field => {
          if (isFieldVisible(field) && !filledFields.has(field) && !field.value) {
            filledFields.add(field);
            setTimeout(() => {
              console.log('[ConfPass] Filling', type, 'field:', field.name || field.id, '->', value);
              fillField(field, value);
            }, delay);
            delay += baseDelay; // Stagger fills for dynamic sites
          }
        });
      } catch (e) {
        console.error('[ConfPass] Selector error:', e);
      }
    });

    // For sites with custom dropdowns, try to trigger their change handlers
    if (siteConfig?.useDelayedFill) {
      setTimeout(() => {
        // Re-dispatch events on all filled fields to ensure frameworks pick up changes
        filledFields.forEach(field => {
          if (field && field !== targetField) {
            try {
              field.dispatchEvent(new Event('input', { bubbles: true }));
              field.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e) {}
          }
        });
      }, delay + 500);
    }
  }

  function renderDropdownItems(listEl, passwords, targetField) {
    renderDropdownWithAuth(listEl, passwords, [], targetField);
  }

  function renderDropdownWithAuth(listEl, passwords, authenticators, targetField) {
    let html = '';

    // Render authenticators section first (if any)
    if (authenticators.length > 0) {
      html += `
        <div class="confpass-section-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>Doğrulama Kodları</span>
        </div>
      `;
      html += authenticators.map((auth, i) => `
        <div class="confpass-auth-item" data-auth-index="${i}">
          <div class="confpass-auth-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div class="confpass-auth-info">
            <div class="confpass-auth-issuer">${escapeHtml(auth.issuer)}</div>
            <div class="confpass-auth-account">${escapeHtml(auth.account)}</div>
          </div>
          <div class="confpass-auth-code" data-auth-code="${escapeHtml(auth.code)}">
            <span>${auth.code.slice(0, 3)}</span>
            <span style="opacity: 0.5;"> </span>
            <span>${auth.code.slice(3)}</span>
          </div>
          <button class="confpass-auth-copy" data-auth-code="${escapeHtml(auth.code)}" title="Kodu Kopyala">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
      `).join('');
    }

    // Render passwords section
    if (passwords.length > 0) {
      if (authenticators.length > 0) {
        html += `
          <div class="confpass-section-header" style="margin-top: 8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>Hesaplar</span>
          </div>
        `;
      }
      html += passwords.map((pw, i) => `
        <button class="confpass-dropdown-item" data-index="${i}">
          <div class="confpass-dropdown-item-icon">${(pw.title || pw.username || '?')[0].toUpperCase()}</div>
          <div class="confpass-dropdown-item-info">
            <div class="confpass-dropdown-item-title">${escapeHtml(pw.title || 'Hesap')}</div>
            <div class="confpass-dropdown-item-username">${escapeHtml(pw.username)}</div>
          </div>
        </button>
      `).join('');
    }

    // If only authenticators, no passwords
    if (passwords.length === 0 && authenticators.length > 0) {
      html += `
        <div class="confpass-dropdown-empty" style="padding: 12px;">
          <div style="font-size: 11px; color: #71717a;">Bu site için kayıtlı hesap yok</div>
        </div>
      `;
    }

    listEl.innerHTML = html;

    // Password click handlers
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

    // Auth code click to copy
    listEl.querySelectorAll('.confpass-auth-code').forEach(codeEl => {
      codeEl.addEventListener('click', () => {
        const code = codeEl.dataset.authCode;
        if (code) {
          navigator.clipboard.writeText(code).then(() => {
            const original = codeEl.innerHTML;
            codeEl.innerHTML = '<span style="color: #10b981;">Kopyalandı!</span>';
            setTimeout(() => { codeEl.innerHTML = original; }, 1500);
          });
        }
      });
    });

    // Auth copy button handlers
    listEl.querySelectorAll('.confpass-auth-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = btn.dataset.authCode;
        if (code) {
          navigator.clipboard.writeText(code).then(() => {
            btn.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            `;
            setTimeout(() => {
              btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              `;
            }, 1500);
          });
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

    fields.username.forEach(field => addIconToField(field, 'password'));
    fields.password.forEach(field => addIconToField(field, 'password'));
    fields.card.forEach(field => addIconToField(field, 'card'));
    fields.address.forEach(field => addIconToField(field, 'address'));
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

    // Context menu: Fill from context menu
    if (message.type === 'context_menu_fill') {
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        // Trigger dropdown on the active element
        if (activeElement.confpassButton) {
          activeElement.confpassButton.click();
        } else {
          // Create and show dropdown
          showDropdownForField(activeElement);
        }
      }
      sendResponse({ success: true });
    }

    // Context menu: Fill generated password
    if (message.type === 'fill_generated_password') {
      const activeElement = document.activeElement;
      if (activeElement && activeElement.tagName === 'INPUT') {
        activeElement.value = message.password;
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        activeElement.dispatchEvent(new Event('change', { bubbles: true }));
        showNotification('Şifre üretildi ve dolduruldu');
      }
      sendResponse({ success: true });
    }

    // Context menu: Copy to clipboard
    if (message.type === 'copy_to_clipboard') {
      navigator.clipboard.writeText(message.text).then(() => {
        showNotification(message.message || 'Kopyalandı');
      });
      sendResponse({ success: true });
    }

    // Phishing warning from background
    if (message.type === 'phishing_warning') {
      showPhishingWarning(message.result);
      sendResponse({ success: true });
    }

    return true;
  });

  // ========== Phishing Warning Banner ==========
  function showPhishingWarning(result) {
    // Don't show if already exists
    if (document.getElementById('confpass-phishing-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'confpass-phishing-banner';
    banner.innerHTML = `
      <style>
        #confpass-phishing-banner {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          z-index: 2147483647 !important;
          background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%) !important;
          color: white !important;
          padding: 16px 20px !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3) !important;
          animation: confpass-slide-down 0.3s ease !important;
        }
        @keyframes confpass-slide-down {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
        #confpass-phishing-banner .banner-content {
          max-width: 1200px !important;
          margin: 0 auto !important;
          display: flex !important;
          align-items: center !important;
          gap: 16px !important;
        }
        #confpass-phishing-banner .banner-icon {
          width: 32px !important;
          height: 32px !important;
          flex-shrink: 0 !important;
        }
        #confpass-phishing-banner .banner-text {
          flex: 1 !important;
        }
        #confpass-phishing-banner .banner-title {
          font-size: 16px !important;
          font-weight: 700 !important;
          margin: 0 0 4px 0 !important;
        }
        #confpass-phishing-banner .banner-subtitle {
          font-size: 13px !important;
          opacity: 0.9 !important;
          margin: 0 !important;
        }
        #confpass-phishing-banner .banner-close {
          background: rgba(255,255,255,0.2) !important;
          border: none !important;
          color: white !important;
          padding: 8px 16px !important;
          border-radius: 6px !important;
          cursor: pointer !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          transition: background 0.2s !important;
        }
        #confpass-phishing-banner .banner-close:hover {
          background: rgba(255,255,255,0.3) !important;
        }
      </style>
      <div class="banner-content">
        <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div class="banner-text">
          <p class="banner-title">⚠️ ConfPass Güvenlik Uyarısı</p>
          <p class="banner-subtitle">${result.isPhishing ? 'Bu site bir phishing (oltalama) sitesi olabilir!' : 'Bu site şüpheli görünüyor. Kişisel bilgilerinizi girmeden önce dikkatli olun.'}</p>
        </div>
        <button class="banner-close" onclick="this.parentElement.parentElement.remove()">Anladım</button>
      </div>
    `;
    document.body.prepend(banner);
  }

  // ========== Notification Helper ==========
  function showNotification(message) {
    // Remove existing notification
    const existing = document.getElementById('confpass-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'confpass-notification';
    notification.innerHTML = `
      <style>
        #confpass-notification {
          position: fixed !important;
          bottom: 20px !important;
          right: 20px !important;
          z-index: 2147483647 !important;
          background: #0a0a0c !important;
          color: #fafafa !important;
          padding: 12px 20px !important;
          border-radius: 10px !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(245, 158, 11, 0.2) !important;
          animation: confpass-fade-in 0.3s ease !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
        }
        @keyframes confpass-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        #confpass-notification svg {
          width: 18px !important;
          height: 18px !important;
          color: #10b981 !important;
        }
      </style>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      ${message}
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'confpass-fade-in 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 2500);
  }

  // Helper function to show dropdown for a field (for context menu)
  function showDropdownForField(field) {
    const fieldType = getFieldType(field);
    if (fieldType === 'password') {
      fetchAndShowDropdown(field);
    }
  }

  async function fetchAndShowDropdown(field) {
    const domain = window.location.hostname;
    chrome.runtime.sendMessage({
      type: 'get_passwords_for_site',
      url: domain
    }, (response) => {
      if (response && response.success && response.passwords && response.passwords.length > 0) {
        // Create a temporary button to trigger the dropdown logic
        const rect = field.getBoundingClientRect();
        const dropdown = createDropdown(response.passwords, (username, password) => {
          fillForm(username, password);
          dropdown.remove();
        });

        dropdown.style.top = `${rect.bottom + window.scrollY + 8}px`;
        dropdown.style.left = `${rect.left + window.scrollX}px`;
        document.body.appendChild(dropdown);

        // Close on click outside
        setTimeout(() => {
          document.addEventListener('click', function closeDropdown(e) {
            if (!dropdown.contains(e.target)) {
              dropdown.remove();
              document.removeEventListener('click', closeDropdown);
            }
          });
        }, 100);
      }
    });
  }

  function createDropdown(passwords, onSelect) {
    const dropdown = document.createElement('div');
    dropdown.className = 'confpass-dropdown';
    dropdown.innerHTML = `
      <div class="confpass-dropdown-header">
        <div class="confpass-dropdown-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <span class="confpass-dropdown-title">ConfPass</span>
      </div>
      <div class="confpass-dropdown-list">
        ${passwords.map(pw => `
          <button class="confpass-dropdown-item" data-username="${escapeAttr(pw.username)}" data-password="${escapeAttr(pw.password)}">
            <div class="confpass-dropdown-item-icon">${(pw.title || pw.username || '?')[0].toUpperCase()}</div>
            <div class="confpass-dropdown-item-info">
              <div class="confpass-dropdown-item-title">${escapeHtml(pw.title || 'Hesap')}</div>
              <div class="confpass-dropdown-item-username">${escapeHtml(pw.username)}</div>
            </div>
          </button>
        `).join('')}
      </div>
    `;

    dropdown.querySelectorAll('.confpass-dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        onSelect(item.dataset.username, item.dataset.password);
      });
    });

    return dropdown;
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

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

  // ========== Auto-Save Form Detection ==========
  const processedForms = new WeakSet();
  const processedButtons = new WeakSet();
  const processedPasswordFields = new WeakSet();
  let pendingCredentials = null;
  let lastSavePromptTime = 0;
  let lastCapturedCredentials = null;
  const SAVE_PROMPT_DEBOUNCE = 2000; // 2 seconds debounce

  function setupFormSubmissionDetection() {
    // Attach to forms
    document.querySelectorAll('form').forEach(attachFormListener);

    // SPA Support: Attach to ALL buttons that might submit (Instagram, Facebook, etc.)
    attachToAllButtons();

    // SPA Support: Watch password fields for Enter key and capture values
    attachToPasswordFields();

    // SPA Support: Watch for URL changes (navigation without page reload)
    setupNavigationDetection();
  }

  function attachFormListener(form) {
    if (processedForms.has(form)) return;
    processedForms.add(form);

    // Listen for form submit
    form.addEventListener('submit', handleFormSubmit, true);

    // Also capture click on submit buttons within form
    form.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])').forEach(btn => {
      attachButtonListener(btn);
    });

    console.log('[ConfPass] Attached listener to form');
  }

  function attachToAllButtons() {
    // Find buttons that look like login/signup buttons (even outside forms)
    const buttonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:not([type])',
      '[role="button"]',
      'div[tabindex="0"]',
      // Common login button patterns
      'button[name*="login" i]',
      'button[name*="signin" i]',
      'button[name*="signup" i]',
      'button[name*="register" i]',
      'button[name*="giris" i]',
      'button[name*="kayit" i]',
      '[data-testid*="login" i]',
      '[data-testid*="signin" i]',
      '[data-testid*="signup" i]',
      '[aria-label*="login" i]',
      '[aria-label*="sign in" i]',
      '[aria-label*="giriş" i]'
    ];

    document.querySelectorAll(buttonSelectors.join(',')).forEach(btn => {
      attachButtonListener(btn);
    });
  }

  function attachButtonListener(btn) {
    if (processedButtons.has(btn)) return;
    processedButtons.add(btn);

    btn.addEventListener('click', (e) => {
      // Capture credentials before click action
      captureCurrentCredentials();

      // After click, check if we should prompt
      setTimeout(() => {
        if (lastCapturedCredentials) {
          handleCredentialCapture(lastCapturedCredentials);
        }
      }, 300);
    }, true);
  }

  function attachToPasswordFields() {
    document.querySelectorAll('input[type="password"]').forEach(field => {
      if (processedPasswordFields.has(field)) return;
      processedPasswordFields.add(field);

      // Capture on Enter key
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          captureCurrentCredentials();
          setTimeout(() => {
            if (lastCapturedCredentials) {
              handleCredentialCapture(lastCapturedCredentials);
            }
          }, 300);
        }
      }, true);

      // Also capture when leaving password field (backup)
      field.addEventListener('blur', () => {
        if (field.value && field.value.length >= 4) {
          captureCurrentCredentials();
        }
      }, true);
    });
  }

  function captureCurrentCredentials() {
    const fields = findLoginFields();

    // Find filled password fields
    const filledPasswords = fields.password.filter(f => f.value && f.value.length >= 4);
    if (filledPasswords.length === 0) return;

    // Find associated username
    let username = '';
    for (const field of fields.username) {
      if (field.value) {
        username = field.value.trim();
        break;
      }
    }

    // If no username found in username fields, check all visible text/email inputs
    if (!username) {
      const allInputs = document.querySelectorAll('input[type="text"], input[type="email"], input:not([type])');
      for (const input of allInputs) {
        if (!isFieldVisible(input) || !input.value) continue;

        const inputName = (input.name || '').toLowerCase();
        const inputId = (input.id || '').toLowerCase();
        const inputPlaceholder = (input.placeholder || '').toLowerCase();
        const inputAutocomplete = (input.autocomplete || '').toLowerCase();

        // Skip search fields and other non-username fields
        if (inputName.includes('search') || inputId.includes('search')) continue;
        if (inputName.includes('card') || inputId.includes('card')) continue;
        if (inputName.includes('phone') || inputId.includes('phone')) continue;
        if (inputName.includes('address') || inputId.includes('address')) continue;

        // Check if it looks like a username/email field
        const isLikelyUsername =
          input.type === 'email' ||
          input.value.includes('@') ||
          inputAutocomplete.includes('email') ||
          inputAutocomplete.includes('username') ||
          inputName.includes('user') ||
          inputName.includes('email') ||
          inputName.includes('login') ||
          inputId.includes('user') ||
          inputId.includes('email') ||
          inputId.includes('login') ||
          inputPlaceholder.includes('email') ||
          inputPlaceholder.includes('kullanıcı') ||
          inputPlaceholder.includes('e-posta');

        if (isLikelyUsername && input.value.length >= 3) {
          username = input.value.trim();
          break;
        }
      }
    }

    if (username && filledPasswords[0].value) {
      lastCapturedCredentials = {
        type: 'accounts',
        username,
        password: filledPasswords[0].value,
        url: window.location.href,
        title: extractSiteTitle()
      };
      console.log('[ConfPass] Credentials captured:', username);
    }
  }

  function setupNavigationDetection() {
    // Watch for URL changes (SPA navigation)
    let lastUrl = window.location.href;

    const checkUrlChange = () => {
      if (window.location.href !== lastUrl) {
        const hadCredentials = lastCapturedCredentials;
        lastUrl = window.location.href;

        // If we had captured credentials and URL changed, might be successful login
        if (hadCredentials) {
          console.log('[ConfPass] URL changed after credential capture');
          setTimeout(() => {
            handleCredentialCapture(hadCredentials);
            lastCapturedCredentials = null;
          }, 500);
        }
      }
    };

    // Check periodically
    setInterval(checkUrlChange, 500);

    // Also watch for history changes
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      checkUrlChange();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      checkUrlChange();
    };

    window.addEventListener('popstate', checkUrlChange);
  }

  function handleCredentialCapture(credentials) {
    if (!credentials || !credentials.type) return;

    // Debounce
    const now = Date.now();
    if (now - lastSavePromptTime < SAVE_PROMPT_DEBOUNCE) {
      return;
    }

    console.log('[ConfPass] Handling credential capture:', credentials.type);
    lastSavePromptTime = now;
    setTimeout(() => checkAndPromptSave(credentials), 150);
  }

  function handleFormSubmit(event) {
    // Debounce to prevent multiple prompts
    const now = Date.now();
    if (now - lastSavePromptTime < SAVE_PROMPT_DEBOUNCE) {
      return;
    }

    const form = event.target.closest ? event.target.closest('form') : event.target;
    const formData = extractFormData(form);

    if (formData && formData.type) {
      console.log('[ConfPass] Form data extracted:', formData.type);
      pendingCredentials = formData;
      lastSavePromptTime = now;
      // Delay to allow form to process, but quick enough to catch the data
      setTimeout(() => checkAndPromptSave(formData), 150);
    }
  }

  function extractFormData(form) {
    const fields = findLoginFields();

    // Check which fields are in this form
    const formPasswordFields = fields.password.filter(f => !form || form.contains(f));
    const formUsernameFields = fields.username.filter(f => !form || form.contains(f));
    const formCardFields = fields.card.filter(f => !form || form.contains(f));
    const formAddressFields = fields.address.filter(f => !form || form.contains(f));

    // Priority: Password > Card > Address
    if (formPasswordFields.length > 0) {
      return extractPasswordData(form, { username: formUsernameFields, password: formPasswordFields });
    }
    if (formCardFields.length > 0) {
      return extractCardData(form);
    }
    if (formAddressFields.length > 0) {
      return extractAddressData(form);
    }

    return null;
  }

  function extractPasswordData(form, fields) {
    let username = '';
    let password = '';

    // Get username
    for (const field of fields.username) {
      if (field.value && !username) {
        username = field.value.trim();
        break;
      }
    }

    // Get password
    for (const field of fields.password) {
      if (field.value && !password) {
        password = field.value;
        break;
      }
    }

    // Need both username and password
    if (username && password && password.length >= 4) {
      return {
        type: 'accounts',
        username,
        password,
        url: window.location.href,
        title: extractSiteTitle()
      };
    }
    return null;
  }

  function extractCardData(form) {
    const cardNumber = extractFieldValue(form, CARD_SELECTORS);
    const expiry = extractFieldValue(form, EXPIRY_SELECTORS);
    const cvv = extractFieldValue(form, CVV_SELECTORS);
    const cardholderName = extractFieldValue(form, [
      'input[name*="holder" i]',
      'input[name*="cardholder" i]',
      'input[name*="card" i][name*="name" i]',
      'input[autocomplete="cc-name"]',
      'input[placeholder*="isim" i]',
      'input[placeholder*="name" i]'
    ]);

    // Clean card number
    const cleanCard = cardNumber.replace(/\s/g, '').replace(/-/g, '');

    if (cleanCard && cleanCard.length >= 13 && cleanCard.length <= 19) {
      return {
        type: 'bank_cards',
        cardNumber: cleanCard,
        expiry: expiry || '',
        cvv: cvv || '',
        cardholderName: cardholderName || '',
        cardType: detectCardType(cleanCard),
        title: `${detectCardType(cleanCard)} •••• ${cleanCard.slice(-4)}`,
        url: window.location.href
      };
    }
    return null;
  }

  function extractAddressData(form) {
    const street = extractFieldValue(form, [
      'input[name*="street" i]',
      'input[name*="address" i]',
      'input[name*="adres" i]',
      'input[name*="sokak" i]',
      'input[name*="cadde" i]',
      'input[name*="mahalle" i]',
      'textarea[name*="address" i]',
      'textarea[name*="adres" i]',
      'input[autocomplete="street-address"]',
      'input[autocomplete="address-line1"]'
    ]);

    const city = extractFieldValue(form, [
      'input[name*="city" i]',
      'input[name*="sehir" i]',
      'input[name*="şehir" i]',
      'input[name*="il" i]',
      'input[autocomplete="address-level2"]',
      'select[name*="city" i]',
      'select[name*="il" i]'
    ]);

    const state = extractFieldValue(form, [
      'input[name*="state" i]',
      'input[name*="province" i]',
      'input[name*="ilce" i]',
      'input[name*="ilçe" i]',
      'input[autocomplete="address-level1"]',
      'select[name*="state" i]'
    ]);

    const postalCode = extractFieldValue(form, [
      'input[name*="postal" i]',
      'input[name*="zip" i]',
      'input[name*="posta" i]',
      'input[name*="postcode" i]',
      'input[autocomplete="postal-code"]'
    ]);

    const country = extractFieldValue(form, [
      'input[name*="country" i]',
      'input[name*="ulke" i]',
      'input[name*="ülke" i]',
      'select[name*="country" i]',
      'select[name*="ulke" i]',
      'input[autocomplete="country-name"]'
    ]);

    if (street || (city && postalCode)) {
      return {
        type: 'addresses',
        street: street || '',
        city: city || '',
        state: state || '',
        postalCode: postalCode || '',
        country: country || '',
        title: city ? `${city} Adresi` : 'Kayıtlı Adres',
        url: window.location.href
      };
    }
    return null;
  }

  function extractFieldValue(form, selectors) {
    for (const selector of selectors) {
      try {
        const fields = form ? form.querySelectorAll(selector) : document.querySelectorAll(selector);
        for (const field of fields) {
          if (isFieldVisible(field) && field.value) {
            // For select elements, get the selected option text or value
            if (field.tagName === 'SELECT') {
              const selectedOption = field.options[field.selectedIndex];
              return selectedOption ? (selectedOption.text || selectedOption.value) : '';
            }
            return field.value.trim();
          }
        }
      } catch (e) {}
    }
    return '';
  }

  function detectCardType(number) {
    const cleaned = number.replace(/\D/g, '');
    if (/^4/.test(cleaned)) return 'Visa';
    if (/^5[1-5]/.test(cleaned)) return 'Mastercard';
    if (/^3[47]/.test(cleaned)) return 'Amex';
    if (/^6(?:011|5)/.test(cleaned)) return 'Discover';
    if (/^9792/.test(cleaned)) return 'Troy';
    if (/^62/.test(cleaned)) return 'UnionPay';
    return 'Kart';
  }

  function extractSiteTitle() {
    // Try to get a clean site name
    const hostname = window.location.hostname.replace('www.', '');
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      // Capitalize first letter of main domain
      const name = parts[parts.length - 2];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return document.title || hostname;
  }

  // ========== Auto-Save Modal ==========
  function showSaveCredentialModal(data) {
    injectStyles();

    return new Promise((resolve) => {
      // Remove any existing modal
      const existingOverlay = document.querySelector('.confpass-save-overlay');
      if (existingOverlay) existingOverlay.remove();

      const overlay = document.createElement('div');
      overlay.className = 'confpass-save-overlay';

      const iconSvg = getIconForType(data.type);
      const titleText = getTitleForType(data.type);
      const infoRows = getInfoRowsForType(data);

      overlay.innerHTML = `
        <div class="confpass-save-dialog">
          <div class="confpass-save-header">
            <div class="confpass-save-icon">
              ${iconSvg}
            </div>
            <div>
              <h2 class="confpass-save-title">${titleText}</h2>
              <p class="confpass-save-subtitle">${escapeHtml(window.location.hostname)}</p>
            </div>
          </div>
          <div class="confpass-save-info">
            ${infoRows}
          </div>
          <div class="confpass-save-buttons">
            <button class="confpass-save-btn confpass-save-btn-secondary" id="confpass-save-cancel">
              Kaydetme
            </button>
            <button class="confpass-save-btn confpass-save-btn-primary" id="confpass-save-confirm">
              Kaydet
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const cleanup = () => {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      };

      document.getElementById('confpass-save-confirm').onclick = () => {
        cleanup();
        resolve({ save: true });
      };

      document.getElementById('confpass-save-cancel').onclick = () => {
        cleanup();
        resolve({ save: false });
      };

      // Close on overlay click
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve({ save: false });
        }
      };

      // Close on Escape key
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve({ save: false });
        }
      };
      document.addEventListener('keydown', escHandler);
    });
  }

  function getIconForType(type) {
    const icons = {
      accounts: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>`,
      bank_cards: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>`,
      addresses: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>`
    };
    return icons[type] || icons.accounts;
  }

  function getTitleForType(type) {
    const titles = {
      accounts: 'Şifre Kaydedilsin mi?',
      bank_cards: 'Kart Kaydedilsin mi?',
      addresses: 'Adres Kaydedilsin mi?'
    };
    return titles[type] || 'Kaydedilsin mi?';
  }

  function getInfoRowsForType(data) {
    let rows = '';

    switch (data.type) {
      case 'accounts':
        rows = `
          <div class="confpass-save-info-row">
            <span class="confpass-save-info-label">Kullanıcı:</span>
            <span class="confpass-save-info-value">${escapeHtml(data.username)}</span>
          </div>
          <div class="confpass-save-info-row">
            <span class="confpass-save-info-label">Şifre:</span>
            <span class="confpass-save-info-value">••••••••</span>
          </div>
        `;
        break;
      case 'bank_cards':
        rows = `
          <div class="confpass-save-info-row">
            <span class="confpass-save-info-label">Kart:</span>
            <span class="confpass-save-info-value">•••• •••• •••• ${escapeHtml(data.cardNumber.slice(-4))}</span>
          </div>
        `;
        if (data.cardholderName) {
          rows += `
            <div class="confpass-save-info-row">
              <span class="confpass-save-info-label">Kart Sahibi:</span>
              <span class="confpass-save-info-value">${escapeHtml(data.cardholderName)}</span>
            </div>
          `;
        }
        if (data.expiry) {
          rows += `
            <div class="confpass-save-info-row">
              <span class="confpass-save-info-label">Son Kullanma:</span>
              <span class="confpass-save-info-value">${escapeHtml(data.expiry)}</span>
            </div>
          `;
        }
        break;
      case 'addresses':
        if (data.street) {
          rows += `
            <div class="confpass-save-info-row">
              <span class="confpass-save-info-label">Adres:</span>
              <span class="confpass-save-info-value">${escapeHtml(data.street)}</span>
            </div>
          `;
        }
        if (data.city) {
          rows += `
            <div class="confpass-save-info-row">
              <span class="confpass-save-info-label">Şehir:</span>
              <span class="confpass-save-info-value">${escapeHtml(data.city)}</span>
            </div>
          `;
        }
        if (data.postalCode) {
          rows += `
            <div class="confpass-save-info-row">
              <span class="confpass-save-info-label">Posta Kodu:</span>
              <span class="confpass-save-info-value">${escapeHtml(data.postalCode)}</span>
            </div>
          `;
        }
        break;
    }

    return rows;
  }

  function showSaveNotification(message, type) {
    const existing = document.querySelector('.confpass-save-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'confpass-save-notification';
    notification.style.cssText = `
      position: fixed !important;
      bottom: 20px !important;
      right: 20px !important;
      padding: 12px 20px !important;
      background: ${type === 'success' ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : '#ef4444'} !important;
      color: white !important;
      border-radius: 8px !important;
      font-family: -apple-system, sans-serif !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      z-index: 2147483647 !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
      animation: confpass-slide-in 0.3s ease !important;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 3000);
  }

  // ========== Auto-Save Orchestrator ==========
  async function checkAndPromptSave(formData) {
    if (!formData || !formData.type) return;

    console.log('[ConfPass] Checking for duplicate:', formData.type);

    try {
      // First check for duplicates (also checks if vault is locked)
      const duplicateCheck = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'check_duplicate',
          data: formData
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[ConfPass] Duplicate check error:', chrome.runtime.lastError);
            resolve({ success: false, error: 'connection_error' });
            return;
          }
          resolve(response);
        });
      });

      // Check if vault is locked
      if (duplicateCheck?.error === 'Vault is locked') {
        console.log('[ConfPass] Vault is locked, showing notification');
        showSaveNotification('Kasa kilitli - Kaydetmek için uygulamayı açın', 'error');
        // Try to open the app
        chrome.runtime.sendMessage({ type: 'open_app' });
        return;
      }

      // Check if app is not running (only for actual connection errors)
      if (duplicateCheck?.error === 'connection_error') {
        console.log('[ConfPass] App not running or connection error');
        showSaveNotification('ConfPass uygulaması çalışmıyor', 'error');
        return;
      }

      // If duplicate check endpoint doesn't exist or returns unexpected format, continue anyway
      // The save will still work, just without duplicate detection
      if (!duplicateCheck || duplicateCheck.error) {
        console.log('[ConfPass] Duplicate check unavailable, continuing without it');
      }

      // Only skip if we successfully checked and found a duplicate
      if (duplicateCheck?.success && duplicateCheck?.data?.exists) {
        console.log('[ConfPass] Credential already exists, skipping save prompt');
        return;
      }

      // Show save modal
      const result = await showSaveCredentialModal(formData);

      if (result.save) {
        console.log('[ConfPass] User chose to save');

        // Save the credential
        const saveResult = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'save_credential',
            data: formData
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('[ConfPass] Save error:', chrome.runtime.lastError);
              resolve({ success: false, error: chrome.runtime.lastError.message });
              return;
            }
            resolve(response);
          });
        });

        if (saveResult?.success) {
          // Show category-specific success message
          const successMessages = {
            'accounts': 'Şifre kaydedildi!',
            'bank_cards': 'Kart kaydedildi!',
            'addresses': 'Adres kaydedildi!'
          };
          showSaveNotification(successMessages[formData.type] || 'Kaydedildi!', 'success');
        } else {
          // Handle specific errors
          const errorMsg = saveResult?.error || 'Kaydetme hatası';
          if (errorMsg.includes('kilitli') || errorMsg.includes('locked')) {
            showSaveNotification('Kasa kilitli - Uygulamayı açın', 'error');
            chrome.runtime.sendMessage({ type: 'open_app' });
          } else {
            showSaveNotification(errorMsg, 'error');
          }
        }
      } else {
        console.log('[ConfPass] User cancelled save');
      }
    } catch (error) {
      console.error('[ConfPass] Auto-save error:', error);
      showSaveNotification('Bir hata oluştu', 'error');
    }
  }

  // ========== Start ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Initialize form detection
  setTimeout(setupFormSubmissionDetection, 500);
  setTimeout(setupFormSubmissionDetection, 1500);
  setTimeout(setupFormSubmissionDetection, 3000);

  setTimeout(scanForTotpFields, 500);
  setTimeout(scanForTotpFields, 1500);
  setTimeout(scanForTotpFields, 3000);

  // Watch for new forms, buttons, and password fields being added to the page
  const formObserver = new MutationObserver((mutations) => {
    let shouldRescan = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            // Check for forms
            if (node.tagName === 'FORM') {
              attachFormListener(node);
            }
            if (node.querySelectorAll) {
              node.querySelectorAll('form').forEach(attachFormListener);

              // Check for password fields (SPA support)
              node.querySelectorAll('input[type="password"]').forEach(field => {
                if (!processedPasswordFields.has(field)) {
                  shouldRescan = true;
                }
              });

              // Check for buttons (SPA support)
              node.querySelectorAll('button, [role="button"], input[type="submit"]').forEach(btn => {
                if (!processedButtons.has(btn)) {
                  shouldRescan = true;
                }
              });
            }
          }
        });
      }
    }

    // Rescan for SPA elements
    if (shouldRescan) {
      setTimeout(() => {
        attachToAllButtons();
        attachToPasswordFields();
      }, 100);
    }
  });

  const totpObserver = new MutationObserver(() => {
    setTimeout(scanForTotpFields, 100);
  });

  if (document.body) {
    formObserver.observe(document.body, { childList: true, subtree: true });
    totpObserver.observe(document.body, { childList: true, subtree: true });
  }

  console.log('[ConfPass Content] Initialized with TOTP and Auto-Save support (SPA enabled)');
})();
