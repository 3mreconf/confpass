document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const loadingState = document.getElementById('loadingState');
  const lockedState = document.getElementById('lockedState');
  const disconnectedState = document.getElementById('disconnectedState');
  const mainContent = document.getElementById('mainContent');
  const currentSiteEl = document.getElementById('currentSite');
  const passwordList = document.getElementById('passwordList');
  const passwordsSection = document.getElementById('passwordsSection');

  let currentDomain = '';
  let currentTabId = null;

  // Get current tab info
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentTabId = tabs[0].id;
      try {
        const url = new URL(tabs[0].url);
        currentDomain = url.hostname;
        currentSiteEl.textContent = currentDomain;
      } catch (e) {
        currentDomain = '';
        currentSiteEl.textContent = 'Gecersiz URL';
      }
    }
    checkConnection();
  });

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
        lockedState.style.display = 'block';
        break;
      case 'disconnected':
        disconnectedState.style.display = 'block';
        break;
      case 'connected':
        mainContent.style.display = 'block';
        break;
    }
  }

  function updateStatus(connected, locked = false) {
    if (connected) {
      statusDot.classList.add('connected');
      statusText.classList.add('connected');
      statusText.textContent = locked ? 'Kasa Kilitli' : 'Bagli';
    } else {
      statusDot.classList.remove('connected');
      statusText.classList.remove('connected');
      statusText.textContent = 'Baglanti Yok';
    }
  }

  async function checkConnection() {
    showState('loading');

    chrome.runtime.sendMessage({ type: 'ping' }, async (response) => {
      if (chrome.runtime.lastError || !response || !response.connected) {
        updateStatus(false);
        showState('disconnected');
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
            showState('locked');
            return;
          }

          if (passResponse && passResponse.error === 'Vault is locked') {
            updateStatus(true, true);
            showState('locked');
            return;
          }

          updateStatus(true, false);
          showState('connected');

          if (passResponse && passResponse.success && passResponse.passwords) {
            renderPasswords(passResponse.passwords);
          } else {
            renderPasswords([]);
          }
        });
      } else {
        updateStatus(true, false);
        showState('connected');
        renderPasswords([]);
      }
    });
  }

  function renderPasswords(passwords) {
    if (!passwords || passwords.length === 0) {
      passwordList.innerHTML = `
        <div class="no-passwords">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>Bu site icin kayitli hesap yok</div>
        </div>
      `;
      return;
    }

    passwordList.innerHTML = passwords.map((pw, index) => `
      <div class="password-item" data-index="${index}">
        <div class="password-item-icon">${(pw.title || pw.username || '?')[0].toUpperCase()}</div>
        <div class="password-item-info">
          <div class="password-item-title">${escapeHtml(pw.title || pw.url || 'Hesap')}</div>
          <div class="password-item-username">${escapeHtml(pw.username)}</div>
        </div>
        <button class="password-item-fill" data-username="${escapeHtml(pw.username)}" data-password="${escapeHtml(pw.password)}">
          Doldur
        </button>
      </div>
    `).join('');

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
    passwordList.querySelectorAll('.password-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('password-item-fill')) return;
        const btn = item.querySelector('.password-item-fill');
        if (btn) {
          const username = btn.dataset.username;
          const password = btn.dataset.password;
          fillCredentials(username, password);
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

  // Refresh connection every 5 seconds
  setInterval(checkConnection, 5000);
});
