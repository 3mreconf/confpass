const NATIVE_HOST = 'com.emreconf.confpass';

async function callNativeHost(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[ConfPass Background] Native messaging error:', chrome.runtime.lastError);
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'request_password') {
    callNativeHost({ type: 'get_password', url: message.url }).then(sendResponse);
    return true;
  }

  if (message.type === 'save_password') {
    callNativeHost({ type: 'save_password', data: message.data }).then(sendResponse);
    return true;
  }

  if (message.type === 'ping') {
    callNativeHost({ type: 'ping' }).then(response => {
      sendResponse({ connected: response && response.type === 'pong' });
    });
    return true;
  }

  if (message.type === 'passkey_detected') {
    callNativeHost({ type: 'passkey_detected', data: message.data }).then(sendResponse);
    return true;
  }

  if (message.type === 'open_app') {
    callNativeHost({ type: 'open_app' }).then(sendResponse);
    return true;
  }

  if (message.type === 'get_passwords_for_site') {
    callNativeHost({ type: 'get_passwords_for_site', url: message.url }).then(sendResponse);
    return true;
  }

  if (message.type === 'get_passkeys_for_site') {
    callNativeHost({ type: 'get_passkeys', rpId: message.rpId }).then(sendResponse);
    return true;
  }

  if (message.type === 'save_passkey_to_server') {
    callNativeHost({ type: 'save_passkey', passkey: message.passkey }).then(sendResponse);
    return true;
  }

  if (message.type === 'update_passkey_counter') {
    callNativeHost({
      type: 'update_passkey_counter',
      credentialId: message.credentialId,
      counter: message.counter
    }).then(sendResponse);
    return true;
  }

  if (message.type === 'get_totp_code') {
    callNativeHost({ type: 'get_totp_code', domain: message.domain }).then(sendResponse);
    return true;
  }
});