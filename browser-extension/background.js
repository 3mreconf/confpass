const API_BASE = 'http://127.0.0.1:1421';

async function callAPI(endpoint, data = null) {
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
});
