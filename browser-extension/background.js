const NATIVE_HOST_NAME = 'com.confpass.password';
const API_BASE = 'http://127.0.0.1:1421';
const USE_NATIVE_MESSAGING = true;

// ========== Phishing Protection ==========
// These patterns detect typosquatting attempts (e.g., paypa1.com, g00gle.com)
// Legitimate domains are checked FIRST in checkPhishing(), so these only catch fakes
const PHISHING_BRAND_PATTERNS = [
  { pattern: /paypa[l1i]|paypa\./, brand: 'PayPal' },
  { pattern: /g[o0]{2}g[l1i]e|go+gle|googl\./, brand: 'Google' },
  { pattern: /faceb[o0]{2}k|facebo+k|facebok/, brand: 'Facebook' },
  { pattern: /amaz[o0]n|amazo+n|anazon/, brand: 'Amazon' },
  { pattern: /app[l1i]e\.|aple\./, brand: 'Apple' },
  { pattern: /micr[o0]s[o0]ft|microsof\./, brand: 'Microsoft' },
  { pattern: /netf[l1i]ix|netfli\./, brand: 'Netflix' },
  { pattern: /[l1i]inkedin|linkedn\./, brand: 'LinkedIn' },
  { pattern: /tw[i1]tter|twiter/, brand: 'Twitter' },
  { pattern: /inst[a@]gr[a@]m|instagra\./, brand: 'Instagram' },
  { pattern: /wh[a@]ts[a@]pp|whatsap\./, brand: 'WhatsApp' },
  { pattern: /t[e3]l[e3]gr[a@]m|telegra\./, brand: 'Telegram' },
  { pattern: /dr[o0]pb[o0]x|dropbo\./, brand: 'Dropbox' },
  { pattern: /[s5]p[o0]t[i1]fy|spotif\./, brand: 'Spotify' },
  { pattern: /y[o0]utub[e3]|yutube/, brand: 'YouTube' },
  { pattern: /githu[b8]|gihub/, brand: 'GitHub' },
];

const LEGITIMATE_DOMAINS = [
  // Google
  'google.com', 'google.com.tr', 'gmail.com', 'youtube.com', 'googleapis.com',
  // Meta
  'facebook.com', 'instagram.com', 'whatsapp.com', 'messenger.com', 'fb.com', 'meta.com',
  // Microsoft
  'microsoft.com', 'outlook.com', 'office.com', 'live.com', 'hotmail.com', 'bing.com', 'azure.com', 'github.com', 'linkedin.com',
  // Apple
  'apple.com', 'icloud.com', 'me.com',
  // Amazon
  'amazon.com', 'amazon.com.tr', 'aws.amazon.com', 'amazonaws.com',
  // Other tech
  'twitter.com', 'x.com', 'telegram.org', 'discord.com', 'discord.gg', 'slack.com',
  'dropbox.com', 'spotify.com', 'netflix.com', 'twitch.tv', 'reddit.com',
  'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'npmjs.com',
  // Payment
  'paypal.com', 'stripe.com', 'wise.com',
  // Banks (TR)
  'yapikredi.com.tr', 'garanti.com.tr', 'akbank.com', 'isbank.com.tr', 'ziraatbank.com.tr',
  'enpara.com', 'papara.com', 'tosla.com',
  // Banks (US)
  'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citibank.com',
  // Other
  'yahoo.com', 'wikipedia.org', 'cloudflare.com', 'vercel.com', 'netlify.com'
];

// Suspicious activity tracking
let suspiciousActivityLog = [];

function checkPhishing(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const result = {
      isPhishing: false,
      isSuspicious: false,
      reasons: [],
      riskLevel: 'low'
    };

    // FIRST: Check if this is a legitimate domain (exact match or subdomain)
    for (const legit of LEGITIMATE_DOMAINS) {
      if (hostname === legit || hostname.endsWith('.' + legit)) {
        // This is a legitimate site, no need to check further
        return result;
      }
    }

    // Check against known phishing patterns (only for non-legitimate domains)
    // At this point we know it's NOT a legitimate domain, so any brand match is suspicious
    for (const { pattern, brand } of PHISHING_BRAND_PATTERNS) {
      if (pattern.test(hostname)) {
        result.isPhishing = true;
        result.reasons.push(`${brand} sitesini taklit ediyor olabilir`);
        result.riskLevel = 'critical';
        break;
      }
    }

    // Check for typosquatting (similar to legitimate domains)
    for (const legit of LEGITIMATE_DOMAINS) {
      const similarity = calculateSimilarity(hostname.replace(/\..+$/, ''), legit.replace(/\..+$/, ''));
      if (similarity > 0.7 && similarity < 1 && !hostname.includes(legit)) {
        result.isSuspicious = true;
        result.reasons.push(`"${legit}" sitesine benzer görünüyor`);
        result.riskLevel = result.riskLevel === 'critical' ? 'critical' : 'high';
      }
    }

    // Check for suspicious TLDs
    const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.work', '.click'];
    if (suspiciousTLDs.some(tld => hostname.endsWith(tld))) {
      result.isSuspicious = true;
      result.reasons.push('Şüpheli alan adı uzantısı');
      result.riskLevel = result.riskLevel === 'low' ? 'medium' : result.riskLevel;
    }

    // Check for IP address URLs
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      result.isSuspicious = true;
      result.reasons.push('IP adresi kullanılıyor');
      result.riskLevel = 'high';
    }

    // Check for excessive subdomains
    const subdomainCount = hostname.split('.').length - 2;
    if (subdomainCount > 3) {
      result.isSuspicious = true;
      result.reasons.push('Çok fazla alt alan adı');
      result.riskLevel = result.riskLevel === 'low' ? 'medium' : result.riskLevel;
    }

    // Check for HTTP (not HTTPS)
    if (urlObj.protocol === 'http:') {
      result.isSuspicious = true;
      result.reasons.push('Güvenli bağlantı (HTTPS) kullanılmıyor');
      result.riskLevel = result.riskLevel === 'low' ? 'medium' : result.riskLevel;
    }

    // Check for suspicious keywords in URL
    const suspiciousKeywords = ['login', 'signin', 'verify', 'secure', 'account', 'update', 'confirm', 'banking'];
    const pathLower = (urlObj.pathname + urlObj.search).toLowerCase();
    const keywordsFound = suspiciousKeywords.filter(kw => pathLower.includes(kw));
    if (keywordsFound.length >= 2 && result.isSuspicious) {
      result.reasons.push('URL\'de şüpheli anahtar kelimeler var');
    }

    return result;
  } catch (e) {
    return { isPhishing: false, isSuspicious: false, reasons: [], riskLevel: 'low' };
  }
}

function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2[i - 1] === str1[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

function logSuspiciousActivity(activity) {
  const entry = {
    timestamp: Date.now(),
    ...activity
  };
  suspiciousActivityLog.push(entry);

  // Keep only last 100 entries
  if (suspiciousActivityLog.length > 100) {
    suspiciousActivityLog = suspiciousActivityLog.slice(-100);
  }

  // Store in chrome.storage
  chrome.storage.local.set({ suspiciousActivityLog });

  // Show notification for high-risk activities
  if (activity.riskLevel === 'critical' || activity.riskLevel === 'high') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'ConfPass Güvenlik Uyarısı',
      message: activity.message || 'Şüpheli aktivite tespit edildi!',
      priority: 2
    });
  }
}

// ========== Context Menu (Right-Click Menu) ==========
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu items
  chrome.contextMenus.create({
    id: 'confpass-fill',
    title: 'ConfPass ile Doldur',
    contexts: ['editable']
  });

  chrome.contextMenus.create({
    id: 'confpass-generate',
    title: 'Şifre Üret',
    contexts: ['editable']
  });

  chrome.contextMenus.create({
    id: 'confpass-separator',
    type: 'separator',
    contexts: ['editable']
  });

  chrome.contextMenus.create({
    id: 'confpass-copy-username',
    title: 'Kullanıcı Adını Kopyala',
    contexts: ['editable']
  });

  chrome.contextMenus.create({
    id: 'confpass-copy-password',
    title: 'Şifreyi Kopyala',
    contexts: ['editable']
  });

  chrome.contextMenus.create({
    id: 'confpass-copy-totp',
    title: 'TOTP Kodunu Kopyala',
    contexts: ['editable']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.url) return;

  const domain = new URL(tab.url).hostname;

  switch (info.menuItemId) {
    case 'confpass-fill':
      // Send message to content script to fill
      chrome.tabs.sendMessage(tab.id, { type: 'context_menu_fill' });
      break;

    case 'confpass-generate':
      // Generate password and fill
      const password = generateSecurePassword(16, true, true, true, true);
      chrome.tabs.sendMessage(tab.id, {
        type: 'fill_generated_password',
        password
      });
      break;

    case 'confpass-copy-username':
      callAPI('/get_passwords_for_site', { url: domain }).then(response => {
        if (response.success && response.passwords && response.passwords.length > 0) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'copy_to_clipboard',
            text: response.passwords[0].username,
            message: 'Kullanıcı adı kopyalandı'
          });
        }
      });
      break;

    case 'confpass-copy-password':
      callAPI('/get_passwords_for_site', { url: domain }).then(response => {
        if (response.success && response.passwords && response.passwords.length > 0) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'copy_to_clipboard',
            text: response.passwords[0].password,
            message: 'Şifre kopyalandı'
          });
        }
      });
      break;

    case 'confpass-copy-totp':
      callAPI('/get_totp_code', { domain }).then(response => {
        if (response.success && response.code) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'copy_to_clipboard',
            text: response.code,
            message: 'TOTP kodu kopyalandı'
          });
        }
      });
      break;
  }
});

// Password generator function
function generateSecurePassword(length = 16, uppercase = true, lowercase = true, numbers = true, symbols = true) {
  let chars = '';
  let password = '';

  const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowerChars = 'abcdefghijklmnopqrstuvwxyz';
  const numberChars = '0123456789';
  const symbolChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (uppercase) chars += upperChars;
  if (lowercase) chars += lowerChars;
  if (numbers) chars += numberChars;
  if (symbols) chars += symbolChars;

  if (chars.length === 0) chars = lowerChars + numberChars;

  // Ensure at least one character from each selected type
  const required = [];
  if (uppercase) required.push(upperChars[Math.floor(Math.random() * upperChars.length)]);
  if (lowercase) required.push(lowerChars[Math.floor(Math.random() * lowerChars.length)]);
  if (numbers) required.push(numberChars[Math.floor(Math.random() * numberChars.length)]);
  if (symbols) required.push(symbolChars[Math.floor(Math.random() * symbolChars.length)]);

  // Fill the rest randomly
  const remaining = length - required.length;
  for (let i = 0; i < remaining; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }

  // Add required characters at random positions
  for (const char of required) {
    const pos = Math.floor(Math.random() * (password.length + 1));
    password = password.slice(0, pos) + char + password.slice(pos);
  }

  return password;
}

async function callAPI(endpoint, data = null) {
  if (USE_NATIVE_MESSAGING) {
    return new Promise((resolve) => {
      // Endpoint'teki slash'i kaldır (örn: /get_password -> get_password)
      const messageType = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;

      const message = {
        type: messageType,
        ...data
      };

      // Native host ile iletişim
      console.log('[ConfPass Background] Sending to native host:', message);

      try {
        chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, message, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[ConfPass Background] Native Host Error:', chrome.runtime.lastError.message);
            resolve({
              success: false,
              error: 'Bağlantı hatası: Native Host bulunamadı veya yapılandırılmadı. Lütfen uygulamayı yeniden yükleyin.'
            });
            return;
          }

          if (!response) {
            resolve({ success: false, error: 'Empty response from native host' });
            return;
          }

          console.log('[ConfPass Background] Native Host Response:', response);
          resolve(response);
        });
      } catch (e) {
        console.error('[ConfPass Background] Exception:', e);
        resolve({ success: false, error: e.message });
      }
    });
  } else {
    // Legacy generic HTTP fetch (Not secure for Auth guarded endpoints)
    try {
      const options = {
        method: data ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (data) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(`${API_BASE}${endpoint}`, options);

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('[ConfPass Background] API error:', error);
      return { success: false, error: error.message };
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'request_password') {
    callAPI('/get_password', { url: message.url }).then(sendResponse);
    return true;
  }

  if (message.type === 'save_password') {
    callAPI('/save_password', message.data).then(sendResponse);
    return true;
  }

  if (message.type === 'ping') {
    callAPI('/ping').then(response => {
      sendResponse({ connected: response && response.status === 'ok' });
    });
    return true;
  }

  if (message.type === 'passkey_detected') {
    callAPI('/passkey_detected', message.data).then(sendResponse);
    return true;
  }

  if (message.type === 'open_app') {
    callAPI('/focus_window', {}).then(sendResponse);
    return true;
  }

  if (message.type === 'get_passwords_for_site') {
    callAPI('/get_passwords_for_site', { url: message.url }).then(sendResponse);
    return true;
  }

  if (message.type === 'get_passkeys_for_site') {
    callAPI('/get_passkeys', { rpId: message.rpId }).then(sendResponse);
    return true;
  }

  if (message.type === 'save_passkey_to_server') {
    // Backend expects passkey fields directly, not nested
    callAPI('/save_passkey', message.passkey).then(sendResponse);
    return true;
  }

  if (message.type === 'update_passkey_counter') {
    callAPI('/update_passkey_counter', {
      credentialId: message.credentialId,
      counter: message.counter
    }).then(sendResponse);
    return true;
  }

  if (message.type === 'get_totp_code') {
    callAPI('/get_totp_code', { domain: message.domain }).then(sendResponse);
    return true;
  }

  if (message.type === 'get_cards') {
    callAPI('/get_cards', {}).then(sendResponse);
    return true;
  }

  if (message.type === 'get_addresses') {
    callAPI('/get_addresses', {}).then(sendResponse);
    return true;
  }

  // Auto-save: Check for duplicate entries
  if (message.type === 'check_duplicate') {
    callAPI('/check_duplicate', message.data).then(sendResponse);
    return true;
  }

  // Auto-save: Save credential (accounts, cards, addresses)
  if (message.type === 'save_credential') {
    const { type: category, ...data } = message.data;

    if (category === 'accounts') {
      // For accounts, use existing save_password endpoint
      callAPI('/save_password', {
        title: data.title,
        username: data.username,
        password: data.password,
        url: data.url
      }).then(sendResponse);
    } else {
      // For cards and addresses, use save_entry with JSON notes
      const entryData = {
        title: data.title,
        username: category === 'bank_cards' ? data.cardNumber : (data.street || ''),
        password: category === 'bank_cards' ? (data.cvv || '') : '',
        url: data.url || '',
        category: category,
        notes: JSON.stringify(data)
      };
      callAPI('/save_entry', entryData).then(sendResponse);
    }
    return true;
  }

  // ========== New Features ==========

  // Phishing check
  if (message.type === 'check_phishing') {
    const result = checkPhishing(message.url);
    if (result.isPhishing || result.isSuspicious) {
      logSuspiciousActivity({
        type: 'phishing_detected',
        url: message.url,
        riskLevel: result.riskLevel,
        reasons: result.reasons,
        message: `Şüpheli site tespit edildi: ${message.url}`
      });
    }
    sendResponse(result);
    return true;
  }

  // Generate password
  if (message.type === 'generate_password') {
    const password = generateSecurePassword(
      message.length || 16,
      message.uppercase !== false,
      message.lowercase !== false,
      message.numbers !== false,
      message.symbols !== false
    );
    sendResponse({ success: true, password });
    return true;
  }

  // Get suspicious activity log
  if (message.type === 'get_suspicious_activity') {
    chrome.storage.local.get(['suspiciousActivityLog'], (result) => {
      sendResponse({ success: true, log: result.suspiciousActivityLog || [] });
    });
    return true;
  }

  // Log suspicious activity from content script
  if (message.type === 'log_suspicious_activity') {
    logSuspiciousActivity(message.activity);
    sendResponse({ success: true });
    return true;
  }

  // Clear suspicious activity log
  if (message.type === 'clear_suspicious_activity') {
    suspiciousActivityLog = [];
    chrome.storage.local.remove(['suspiciousActivityLog']);
    sendResponse({ success: true });
    return true;
  }
});

// Check tabs for phishing when they update
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const result = checkPhishing(tab.url);
    if (result.isPhishing || result.riskLevel === 'high' || result.riskLevel === 'critical') {
      // Send warning to content script
      chrome.tabs.sendMessage(tabId, {
        type: 'phishing_warning',
        result
      }).catch(() => {});

      logSuspiciousActivity({
        type: 'phishing_page_visited',
        url: tab.url,
        riskLevel: result.riskLevel,
        reasons: result.reasons,
        message: result.isPhishing
          ? `Phishing sitesi tespit edildi: ${tab.url}`
          : `Şüpheli site ziyaret edildi: ${tab.url}`
      });
    }
  }
});
