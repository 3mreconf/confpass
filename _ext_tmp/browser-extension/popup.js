document.addEventListener('DOMContentLoaded', () => {
  const statusBar = document.getElementById('statusBar');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const loadingState = document.getElementById('loadingState');
  const lockedState = document.getElementById('lockedState');
  const disconnectedState = document.getElementById('disconnectedState');
  const mainContent = document.getElementById('mainContent');
  const currentSiteEl = document.getElementById('currentSite');
  const passwordList = document.getElementById('passwordList');
  const passwordsSection = document.getElementById('passwordsSection');
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');
  const passwordCount = document.getElementById('passwordCount');
  const toast = document.getElementById('toast');
  const toastTitle = document.getElementById('toastTitle');
  const toastSubtitle = document.getElementById('toastSubtitle');
  const toastProgress = document.getElementById('toastProgress');

  // New elements
  const phishingWarning = document.getElementById('phishingWarning');
  const phishingReasons = document.getElementById('phishingReasons');
  const totpSection = document.getElementById('totpSection');
  const totpCode = document.getElementById('totpCode');
  const totpCopyBtn = document.getElementById('totpCopyBtn');
  const totpTimerProgress = document.getElementById('totpTimerProgress');
  const totpTimerText = document.getElementById('totpTimerText');
  const generatorToggle = document.getElementById('generatorToggle');
  const generatorPanel = document.getElementById('generatorPanel');
  const generatorPassword = document.getElementById('generatorPassword');
  const generatorCopyBtn = document.getElementById('generatorCopyBtn');
  const generatorGenerateBtn = document.getElementById('generatorGenerateBtn');
  const generatorLength = document.getElementById('generatorLength');
  const generatorLengthValue = document.getElementById('generatorLengthValue');
  const generatorOptions = document.querySelectorAll('.generator-option');
  const activityToggle = document.getElementById('activityToggle');
  const activityList = document.getElementById('activityList');
  const activityCount = document.getElementById('activityCount');
  const screenshotProtection = document.getElementById('screenshotProtection');

  let currentDomain = '';
  let currentTabId = null;
  let currentUrl = '';
  let allPasswords = [];
  let filteredPasswords = [];
  let selectedIndex = -1;
  let clipboardTimeout = null;
  let totpInterval = null;
  let currentTotpCode = '';
  let isFirstLoad = true;

  // Get current tab info
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentTabId = tabs[0].id;
      currentUrl = tabs[0].url;
      try {
        const url = new URL(tabs[0].url);
        currentDomain = url.hostname;
        currentSiteEl.textContent = currentDomain;

        // Check for phishing
        checkPhishing(tabs[0].url);
      } catch (e) {
        currentDomain = '';
        currentSiteEl.textContent = 'Geçersiz URL';
      }
    }
    checkConnection();
    loadActivityLog();
  });

  // ========== Phishing Detection ==========
  function checkPhishing(url) {
    chrome.runtime.sendMessage({ type: 'check_phishing', url }, (response) => {
      if (chrome.runtime.lastError) return;

      if (response && (response.isPhishing || response.isSuspicious)) {
        phishingWarning.classList.add('show');
        phishingReasons.innerHTML = response.reasons
          .map(r => `<li>${escapeHtml(r)}</li>`)
          .join('');
      }
    });
  }

  // ========== TOTP Functionality ==========
  function loadTOTP() {
    if (!currentDomain) return;

    chrome.runtime.sendMessage({
      type: 'get_totp_code',
      domain: currentDomain
    }, (response) => {
      if (chrome.runtime.lastError) return;

      if (response && response.success && response.code) {
        totpSection.style.display = 'block';
        currentTotpCode = response.code;
        displayTotpCode(response.code);
        startTotpTimer(response.remaining || 30);
      } else {
        totpSection.style.display = 'none';
      }
    });
  }

  function displayTotpCode(code) {
    // Format code with space in middle (e.g., "123 456")
    const formatted = code.length === 6
      ? `${code.slice(0, 3)} ${code.slice(3)}`
      : code;
    totpCode.textContent = formatted;
  }

  function startTotpTimer(remaining) {
    // Clear existing interval
    if (totpInterval) {
      clearInterval(totpInterval);
    }

    let timeLeft = remaining;
    updateTotpTimer(timeLeft);

    totpInterval = setInterval(() => {
      timeLeft--;

      if (timeLeft <= 0) {
        // Refresh TOTP code
        loadTOTP();
        return;
      }

      updateTotpTimer(timeLeft);
    }, 1000);
  }

  function updateTotpTimer(seconds) {
    totpTimerText.textContent = `${seconds}s`;

    // Update circular progress
    const dashOffset = 44 - (seconds / 30) * 44;
    totpTimerProgress.style.strokeDashoffset = dashOffset;

    // Update color based on time remaining
    totpTimerProgress.classList.remove('warning', 'critical');
    if (seconds <= 5) {
      totpTimerProgress.classList.add('critical');
    } else if (seconds <= 10) {
      totpTimerProgress.classList.add('warning');
    }
  }

  totpCopyBtn.addEventListener('click', () => {
    if (currentTotpCode) {
      copyToClipboard(currentTotpCode, 'TOTP kodu kopyalandı', false);
    }
  });

  // ========== Password Generator ==========
  generatorToggle.addEventListener('click', () => {
    generatorToggle.classList.toggle('open');
    generatorPanel.classList.toggle('open');
  });

  generatorLength.addEventListener('input', () => {
    generatorLengthValue.textContent = generatorLength.value;
  });

  generatorOptions.forEach(option => {
    option.addEventListener('click', () => {
      option.classList.toggle('active');
      option.querySelector('input').checked = option.classList.contains('active');
    });
  });

  function getGeneratorOptions() {
    return {
      length: parseInt(generatorLength.value),
      uppercase: document.querySelector('[data-option="uppercase"]').classList.contains('active'),
      lowercase: document.querySelector('[data-option="lowercase"]').classList.contains('active'),
      numbers: document.querySelector('[data-option="numbers"]').classList.contains('active'),
      symbols: document.querySelector('[data-option="symbols"]').classList.contains('active')
    };
  }

  function generatePassword() {
    const options = getGeneratorOptions();

    chrome.runtime.sendMessage({
      type: 'generate_password',
      ...options
    }, (response) => {
      if (response && response.success) {
        generatorPassword.textContent = response.password;
      }
    });
  }

  generatorGenerateBtn.addEventListener('click', generatePassword);

  generatorCopyBtn.addEventListener('click', () => {
    const password = generatorPassword.textContent;
    if (password && password !== 'Tıkla üret...') {
      copyToClipboard(password, 'Şifre kopyalandı');
    }
  });

  // Generate initial password
  generatePassword();

  // ========== Activity Log ==========
  function loadActivityLog() {
    chrome.runtime.sendMessage({ type: 'get_suspicious_activity' }, (response) => {
      if (chrome.runtime.lastError) return;

      if (response && response.success && response.log) {
        const log = response.log;
        activityCount.textContent = `(${log.length})`;

        if (log.length === 0) {
          activityList.innerHTML = '<div class="activity-item"><span class="activity-item-message">Şüpheli aktivite yok</span></div>';
        } else {
          activityList.innerHTML = log.slice(-10).reverse().map(item => {
            const time = new Date(item.timestamp).toLocaleTimeString('tr-TR');
            const iconClass = item.riskLevel === 'critical' || item.riskLevel === 'high' ? 'danger' : 'warning';
            return `
              <div class="activity-item">
                <svg class="activity-item-icon ${iconClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div class="activity-item-content">
                  <div class="activity-item-message">${escapeHtml(item.message || item.type)}</div>
                  <div class="activity-item-time">${time}</div>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    });
  }

  activityToggle.addEventListener('click', () => {
    activityList.classList.toggle('open');
  });

  // ========== Screenshot Protection ==========
  function enableScreenshotProtection() {
    screenshotProtection.classList.add('active');
    setTimeout(() => {
      screenshotProtection.classList.remove('active');
    }, 100);
  }

  // Detect PrintScreen key
  document.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen') {
      enableScreenshotProtection();
      // Log the attempt
      chrome.runtime.sendMessage({
        type: 'log_suspicious_activity',
        activity: {
          type: 'screenshot_attempt',
          riskLevel: 'medium',
          message: 'Ekran görüntüsü alma girişimi algılandı'
        }
      });
    }
  });

  // Blur sensitive content when window loses focus
  let wasVisible = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && wasVisible) {
      // Window became hidden - potentially screenshot
      wasVisible = false;
    } else if (!document.hidden) {
      wasVisible = true;
    }
  });

  // Search functionality
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    searchClear.classList.toggle('visible', query.length > 0);

    if (query === '') {
      filteredPasswords = [...allPasswords];
    } else {
      filteredPasswords = allPasswords.filter(pw => {
        const title = (pw.title || '').toLowerCase();
        const username = (pw.username || '').toLowerCase();
        const url = (pw.url || '').toLowerCase();
        return title.includes(query) || username.includes(query) || url.includes(query);
      });
    }

    selectedIndex = -1;
    renderPasswords(filteredPasswords);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.remove('visible');
    filteredPasswords = [...allPasswords];
    selectedIndex = -1;
    renderPasswords(filteredPasswords);
    searchInput.focus();
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    const items = passwordList.querySelectorAll('.password-item');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, -1);
      updateSelection(items);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[selectedIndex];
      if (selectedItem) {
        const btn = selectedItem.querySelector('.password-item-fill');
        if (btn) {
          fillCredentials(btn.dataset.username, btn.dataset.password);
        }
      }
    } else if (e.key === 'Escape') {
      searchInput.value = '';
      searchClear.classList.remove('visible');
      filteredPasswords = [...allPasswords];
      selectedIndex = -1;
      renderPasswords(filteredPasswords);
    }
  });

  function updateSelection(items) {
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === selectedIndex);
    });

    // Scroll selected item into view
    if (selectedIndex >= 0 && items[selectedIndex]) {
      items[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function showState(state) {
    loadingState.style.display = 'none';
    lockedState.style.display = 'none';
    disconnectedState.style.display = 'none';
    mainContent.style.display = 'none';

    switch (state) {
      case 'loading':
        loadingState.style.display = 'flex';
        break;
      case 'locked':
        lockedState.style.display = 'flex';
        break;
      case 'disconnected':
        disconnectedState.style.display = 'flex';
        break;
      case 'connected':
        mainContent.style.display = 'block';
        // Focus search input when connected
        setTimeout(() => searchInput.focus(), 100);
        break;
    }
  }

  function updateStatus(connected, locked = false) {
    if (connected) {
      statusBar.classList.add('connected');
      statusDot.classList.add('connected');
      statusText.classList.add('connected');
      statusText.textContent = locked ? 'Kasa Kilitli' : 'Bağlı';
    } else {
      statusBar.classList.remove('connected');
      statusDot.classList.remove('connected');
      statusText.classList.remove('connected');
      statusText.textContent = 'Bağlantı Yok';
    }
  }

  async function checkConnection() {
    // Only show loading on first load, not on refreshes
    if (isFirstLoad) {
      showState('loading');
    }

    chrome.runtime.sendMessage({ type: 'ping' }, async (response) => {
      if (chrome.runtime.lastError || !response || !response.connected) {
        updateStatus(false);
        if (isFirstLoad) {
          showState('disconnected');
          isFirstLoad = false;
        }
        return;
      }

      // Connected - now check if vault is locked by trying to get passwords
      if (currentDomain) {
        chrome.runtime.sendMessage({
          type: 'get_passwords_for_site',
          url: currentDomain
        }, (passResponse) => {
          if (chrome.runtime.lastError) {
            updateStatus(true, true);
            if (isFirstLoad) {
              showState('locked');
              isFirstLoad = false;
            }
            return;
          }

          if (passResponse && passResponse.error === 'Vault is locked') {
            updateStatus(true, true);
            if (isFirstLoad) {
              showState('locked');
              isFirstLoad = false;
            }
            return;
          }

          updateStatus(true, false);

          if (isFirstLoad) {
            showState('connected');
            isFirstLoad = false;
          }

          if (passResponse && passResponse.success && passResponse.passwords) {
            allPasswords = passResponse.passwords;
            filteredPasswords = [...allPasswords];
            renderPasswords(filteredPasswords);
          } else {
            allPasswords = [];
            filteredPasswords = [];
            renderPasswords([]);
          }

          // Load TOTP codes
          loadTOTP();
        });
      } else {
        updateStatus(true, false);

        if (isFirstLoad) {
          showState('connected');
          isFirstLoad = false;
        }

        allPasswords = [];
        filteredPasswords = [];
        renderPasswords([]);
        loadTOTP();
      }
    });
  }

  function getFaviconUrl(url) {
    try {
      let domain = url;
      if (url.includes('://')) {
        domain = new URL(url).hostname;
      } else if (url.includes('/')) {
        domain = url.split('/')[0];
      }
      // Use Google's favicon service
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch (e) {
      return null;
    }
  }

  function renderPasswords(passwords) {
    passwordCount.textContent = passwords.length;

    if (!passwords || passwords.length === 0) {
      passwordList.innerHTML = `
        <div class="no-passwords">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>${searchInput.value ? 'Arama sonucu bulunamadı' : 'Bu site için kayıtlı hesap yok'}</p>
        </div>
      `;
      return;
    }

    passwordList.innerHTML = passwords.map((pw, index) => {
      const faviconUrl = getFaviconUrl(pw.url || currentDomain);
      const initial = (pw.title || pw.username || '?')[0].toUpperCase();

      return `
        <div class="password-item ${index === selectedIndex ? 'selected' : ''}" data-index="${index}">
          <div class="password-item-favicon ${faviconUrl ? '' : 'fallback'}" data-initial="${initial}">
            ${faviconUrl ? `<img src="${faviconUrl}" onerror="this.parentElement.classList.add('fallback'); this.parentElement.textContent='${initial}'; this.remove();">` : initial}
          </div>
          <div class="password-item-info">
            <div class="password-item-title">${escapeHtml(pw.title || pw.url || 'Hesap')}</div>
            <div class="password-item-username">${escapeHtml(pw.username)}</div>
          </div>
          <button class="password-item-fill" data-username="${escapeHtml(pw.username)}" data-password="${escapeHtml(pw.password)}">
            Doldur
          </button>
        </div>
      `;
    }).join('');

    // Add click handlers for fill buttons
    passwordList.querySelectorAll('.password-item-fill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const username = btn.dataset.username;
        const password = btn.dataset.password;
        fillCredentials(username, password);
      });
    });

    // Add click handlers for password items (fill on click)
    passwordList.querySelectorAll('.password-item').forEach((item, index) => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('password-item-fill')) return;
        const btn = item.querySelector('.password-item-fill');
        if (btn) {
          const username = btn.dataset.username;
          const password = btn.dataset.password;
          fillCredentials(username, password);
        }
      });

      // Right-click to copy password
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const btn = item.querySelector('.password-item-fill');
        if (btn) {
          copyToClipboard(btn.dataset.password, 'Şifre kopyalandı');
        }
      });
    });
  }

  function fillCredentials(username, password) {
    if (!currentTabId) return;

    chrome.tabs.sendMessage(currentTabId, {
      type: 'fill_credentials',
      data: { username, password }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Fill error:', chrome.runtime.lastError);
      }
      // Close popup after filling
      window.close();
    });
  }

  // Copy to clipboard with auto-clear
  function copyToClipboard(text, title = 'Kopyalandı', autoClear = true) {
    // Brief screenshot protection
    enableScreenshotProtection();

    navigator.clipboard.writeText(text).then(() => {
      if (autoClear) {
        showToast(title, 30);

        // Auto-clear clipboard after 30 seconds
        if (clipboardTimeout) {
          clearTimeout(clipboardTimeout);
        }

        clipboardTimeout = setTimeout(() => {
          navigator.clipboard.writeText('').then(() => {
            // Show cleared notification briefly
            showToast('Pano temizlendi', 0);
          });
        }, 30000);
      } else {
        showToast(title, 0);
      }
    });
  }

  // Toast notification with progress bar
  function showToast(title, clearSeconds = 0) {
    toastTitle.textContent = title;

    if (clearSeconds > 0) {
      toastSubtitle.textContent = `${clearSeconds} saniye sonra pano temizlenecek`;
      toastSubtitle.style.display = 'block';
      toastProgress.parentElement.style.display = 'block';

      // Animate progress bar
      toastProgress.style.width = '100%';
      let remaining = clearSeconds;

      const progressInterval = setInterval(() => {
        remaining -= 0.1;
        const percent = (remaining / clearSeconds) * 100;
        toastProgress.style.width = `${Math.max(0, percent)}%`;

        if (remaining <= 0) {
          clearInterval(progressInterval);
        }
      }, 100);
    } else {
      toastSubtitle.style.display = 'none';
      toastProgress.parentElement.style.display = 'none';
    }

    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, clearSeconds > 0 ? 3000 : 2000);
  }

  function openApp() {
    chrome.runtime.sendMessage({ type: 'open_app' });
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Event listeners for all "Open App" buttons
  document.getElementById('openAppBtn')?.addEventListener('click', openApp);
  document.getElementById('openAppBtnLocked')?.addEventListener('click', openApp);
  document.getElementById('openAppBtnDisconnected')?.addEventListener('click', openApp);

  // Refresh connection every 30 seconds (silent refresh, no loading indicator)
  setInterval(checkConnection, 30000);
});
