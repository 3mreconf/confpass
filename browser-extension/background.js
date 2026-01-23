const HTTP_SERVER = 'http://127.0.0.1:1421';

async function checkServerConnection() {
  try {
    const response = await fetch(`${HTTP_SERVER}/ping`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function sendPasskeyToServer(passkeyData) {
  try {
    console.log('[ConfPass Background] Sending passkey to server:', passkeyData);
    const response = await fetch(`${HTTP_SERVER}/passkey_detected`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(passkeyData)
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[ConfPass Background] Server response:', data);
      return data;
    }
    console.error('[ConfPass Background] Server error:', response.status);
    return { success: false };
  } catch (error) {
    console.error('[ConfPass Background] Error sending passkey:', error);
    return { success: false };
  }
}

async function requestPasswordFromServer(url) {
  try {
    const response = await fetch(`${HTTP_SERVER}/get_password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url })
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    }
    return { success: false };
  } catch (error) {
    console.error('Error requesting password:', error);
    return { success: false };
  }
}

async function savePasswordToServer(passwordData) {
  try {
    const response = await fetch(`${HTTP_SERVER}/save_password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(passwordData)
    });
    
    return response.ok;
  } catch (error) {
    console.error('Error saving password:', error);
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'request_password') {
    (async () => {
      const result = await requestPasswordFromServer(message.url);
      sendResponse(result);
    })();
    return true;
  }

  if (message.type === 'save_password') {
    (async () => {
      const success = await savePasswordToServer(message.data);
      sendResponse({ success });
    })();
    return true;
  }

  if (message.type === 'ping') {
    (async () => {
      const connected = await checkServerConnection();
      sendResponse({ connected });
    })();
    return true;
  }

  if (message.type === 'passkey_detected') {
    (async () => {
      console.log('[ConfPass Background] Passkey detected:', message.data);
      const result = await sendPasskeyToServer(message.data);
      sendResponse(result);
    })();
    return true;
  }

  if (message.type === 'open_app') {
    (async () => {
      try {
        await fetch(`${HTTP_SERVER}/focus_window`, { method: 'POST' });
      } catch (error) {
        console.log('[ConfPass Background] App not running, trying to launch...');
      }
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.type === 'get_passwords_for_site') {
    (async () => {
      try {
        const response = await fetch(`${HTTP_SERVER}/get_passwords_for_site`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: message.url })
        });
        if (response.ok) {
          const data = await response.json();
          sendResponse(data);
        } else {
          sendResponse({ success: false, passwords: [] });
        }
      } catch (error) {
        sendResponse({ success: false, passwords: [] });
      }
    })();
    return true;
  }

  // Passkey operations - routed through background to bypass Brave Shields
  if (message.type === 'get_passkeys_for_site') {
    (async () => {
      try {
        const response = await fetch(`${HTTP_SERVER}/get_passkeys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rpId: message.rpId })
        });
        if (response.ok) {
          const data = await response.json();
          sendResponse(data);
        } else {
          sendResponse({ success: false, passkeys: [] });
        }
      } catch (error) {
        sendResponse({ success: false, passkeys: [] });
      }
    })();
    return true;
  }

  if (message.type === 'save_passkey_to_server') {
    (async () => {
      try {
        const response = await fetch(`${HTTP_SERVER}/save_passkey`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.passkey)
        });
        if (response.ok) {
          const data = await response.json();
          sendResponse(data);
        } else {
          sendResponse({ success: false });
        }
      } catch (error) {
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  if (message.type === 'update_passkey_counter') {
    (async () => {
      try {
        const response = await fetch(`${HTTP_SERVER}/update_passkey_counter`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credentialId: message.credentialId,
            counter: message.counter
          })
        });
        sendResponse({ success: response.ok });
      } catch (error) {
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  if (message.type === 'get_totp_code') {
    (async () => {
      try {
        const response = await fetch(`${HTTP_SERVER}/get_totp_code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: message.domain })
        });
        if (response.ok) {
          const data = await response.json();
          sendResponse(data);
        } else {
          sendResponse({ success: false });
        }
      } catch (error) {
        console.error('[ConfPass Background] TOTP error:', error);
        sendResponse({ success: false });
      }
    })();
    return true;
  }
});
