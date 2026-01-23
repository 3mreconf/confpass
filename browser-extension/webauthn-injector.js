// ConfPass WebAuthn Virtual Authenticator
// Acts as a passkey provider - intercepts WebAuthn and handles passkeys ourselves

(function() {
  'use strict';

  const CONFPASS_MESSAGE_TYPE = 'CONFPASS_WEBAUTHN';

  console.log('[ConfPass Authenticator] Initializing virtual authenticator...');

  // Store original methods
  const originalCreate = navigator.credentials?.create?.bind(navigator.credentials);
  const originalGet = navigator.credentials?.get?.bind(navigator.credentials);

  if (!originalCreate || !originalGet) {
    console.log('[ConfPass Authenticator] WebAuthn API not available');
    return;
  }

  // Helper: Convert ArrayBuffer to Base64URL
  function bufferToBase64URL(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  // Helper: Convert Base64URL to ArrayBuffer
  function base64URLToBuffer(base64url) {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - base64.length % 4) % 4);
    const binary = atob(base64 + padding);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Helper: Generate random bytes
  function generateRandomBytes(length) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return array;
  }

  // Helper: Create authenticator data
  function createAuthenticatorData(rpIdHash, flags, counter, attestedCredentialData = null) {
    const flagsByte = flags;
    const counterBytes = new Uint8Array(4);
    new DataView(counterBytes.buffer).setUint32(0, counter, false);

    let authData;
    if (attestedCredentialData) {
      authData = new Uint8Array(37 + attestedCredentialData.length);
      authData.set(new Uint8Array(rpIdHash), 0);
      authData[32] = flagsByte;
      authData.set(counterBytes, 33);
      authData.set(attestedCredentialData, 37);
    } else {
      authData = new Uint8Array(37);
      authData.set(new Uint8Array(rpIdHash), 0);
      authData[32] = flagsByte;
      authData.set(counterBytes, 33);
    }
    return authData;
  }

  // Helper: Hash data with SHA-256
  async function sha256(data) {
    const encoder = new TextEncoder();
    const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
    return await crypto.subtle.digest('SHA-256', dataBuffer);
  }

  // Helper: Create COSE public key from CryptoKey
  async function createCOSEPublicKey(publicKey) {
    const exported = await crypto.subtle.exportKey('jwk', publicKey);

    // COSE key for ES256 (P-256)
    // This is a simplified CBOR encoding
    const x = base64URLToBuffer(exported.x);
    const y = base64URLToBuffer(exported.y);

    // CBOR map: {1: 2, 3: -7, -1: 1, -2: x, -3: y}
    // 1 (kty) = 2 (EC)
    // 3 (alg) = -7 (ES256)
    // -1 (crv) = 1 (P-256)
    // -2 (x) = x coordinate
    // -3 (y) = y coordinate

    const coseKey = new Uint8Array([
      0xa5, // map of 5 items
      0x01, 0x02, // kty: EC (2)
      0x03, 0x26, // alg: ES256 (-7)
      0x20, 0x01, // crv: P-256 (1)
      0x21, 0x58, 0x20, ...new Uint8Array(x), // x coordinate (32 bytes)
      0x22, 0x58, 0x20, ...new Uint8Array(y), // y coordinate (32 bytes)
    ]);

    return coseKey;
  }

  // Send message to content script and wait for response
  function sendToContentScript(message) {
    return new Promise((resolve) => {
      const messageId = Math.random().toString(36).substring(7);
      message.messageId = messageId;

      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data && event.data.type === 'CONFPASS_WEBAUTHN_RESPONSE' && event.data.messageId === messageId) {
          window.removeEventListener('message', handler);
          resolve(event.data);
        }
      };

      window.addEventListener('message', handler);
      window.postMessage(message, '*');

      // Timeout after 60 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({ success: false, error: 'Timeout' });
      }, 60000);
    });
  }

  // Show ConfPass dialog for passkey creation
  async function showConfPassCreateDialog(options) {
    const publicKeyOptions = options.publicKey;

    return sendToContentScript({
      type: CONFPASS_MESSAGE_TYPE,
      action: 'create_request',
      rpId: publicKeyOptions.rp?.id || window.location.hostname,
      rpName: publicKeyOptions.rp?.name || '',
      userName: publicKeyOptions.user?.name || '',
      userDisplayName: publicKeyOptions.user?.displayName || '',
      userId: publicKeyOptions.user?.id ? bufferToBase64URL(publicKeyOptions.user.id) : '',
      challenge: bufferToBase64URL(publicKeyOptions.challenge),
      origin: window.location.origin,
      url: window.location.href
    });
  }

  // Show ConfPass dialog for passkey authentication
  async function showConfPassGetDialog(options) {
    const publicKeyOptions = options.publicKey;

    return sendToContentScript({
      type: CONFPASS_MESSAGE_TYPE,
      action: 'get_request',
      rpId: publicKeyOptions.rpId || window.location.hostname,
      challenge: bufferToBase64URL(publicKeyOptions.challenge),
      allowCredentials: (publicKeyOptions.allowCredentials || []).map(c => ({
        id: bufferToBase64URL(c.id),
        type: c.type
      })),
      origin: window.location.origin,
      url: window.location.href
    });
  }

  // Create a new passkey credential
  async function createPasskeyCredential(options, passkeyData) {
    const publicKeyOptions = options.publicKey;
    const rpId = publicKeyOptions.rp?.id || window.location.hostname;

    // Generate credential ID
    const credentialId = generateRandomBytes(32);

    // Generate key pair using WebCrypto
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true, // extractable
      ['sign', 'verify']
    );

    // Export private key for storage
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    // Create COSE public key
    const cosePublicKey = await createCOSEPublicKey(keyPair.publicKey);

    // Create attested credential data
    // AAGUID (16 bytes) + credentialIdLength (2 bytes) + credentialId + COSE public key
    const aaguid = new Uint8Array(16); // All zeros for software authenticator
    const credIdLength = new Uint8Array(2);
    new DataView(credIdLength.buffer).setUint16(0, credentialId.length, false);

    const attestedCredentialData = new Uint8Array(16 + 2 + credentialId.length + cosePublicKey.length);
    attestedCredentialData.set(aaguid, 0);
    attestedCredentialData.set(credIdLength, 16);
    attestedCredentialData.set(credentialId, 18);
    attestedCredentialData.set(cosePublicKey, 18 + credentialId.length);

    // Create authenticator data
    const rpIdHash = await sha256(rpId);
    const flags = 0x45; // UP (1) + UV (4) + AT (64) = 0x45
    const authData = createAuthenticatorData(rpIdHash, flags, 0, attestedCredentialData);

    // Create client data JSON
    const clientDataJSON = JSON.stringify({
      type: 'webauthn.create',
      challenge: bufferToBase64URL(publicKeyOptions.challenge),
      origin: window.location.origin,
      crossOrigin: false
    });

    // For "none" attestation, we create a simple attestation object
    const attestationObject = createAttestationObject(authData);

    // Save passkey to ConfPass
    const saveResult = await sendToContentScript({
      type: CONFPASS_MESSAGE_TYPE,
      action: 'save_passkey',
      passkey: {
        credentialId: bufferToBase64URL(credentialId),
        privateKey: JSON.stringify(privateKeyJwk),
        rpId: rpId,
        rpName: publicKeyOptions.rp?.name || rpId,
        userId: publicKeyOptions.user?.id ? bufferToBase64URL(publicKeyOptions.user.id) : '',
        userName: publicKeyOptions.user?.name || '',
        userDisplayName: publicKeyOptions.user?.displayName || '',
        counter: 0,
        createdAt: Date.now()
      }
    });

    if (!saveResult.success) {
      throw new Error('Failed to save passkey: ' + (saveResult.error || 'Unknown error'));
    }

    console.log('[ConfPass Authenticator] Passkey created and saved');

    // Create PublicKeyCredential response
    const credential = {
      id: bufferToBase64URL(credentialId),
      rawId: credentialId.buffer,
      type: 'public-key',
      response: {
        clientDataJSON: new TextEncoder().encode(clientDataJSON).buffer,
        attestationObject: attestationObject.buffer,
        getTransports: () => ['internal'],
        getPublicKey: () => null,
        getPublicKeyAlgorithm: () => -7,
        getAuthenticatorData: () => authData.buffer
      },
      authenticatorAttachment: 'platform',
      getClientExtensionResults: () => ({ credProps: { rk: true } })
    };

    // Make it look like a real PublicKeyCredential
    Object.setPrototypeOf(credential.response, AuthenticatorAttestationResponse.prototype);
    Object.setPrototypeOf(credential, PublicKeyCredential.prototype);

    return credential;
  }

  // Create attestation object (CBOR encoded)
  function createAttestationObject(authData) {
    // Simple "none" attestation
    // {"fmt": "none", "attStmt": {}, "authData": authData}

    const fmtBytes = new TextEncoder().encode('none');

    // Simple CBOR encoding
    const result = new Uint8Array([
      0xa3, // map of 3 items
      0x63, // text string of 3 chars
      0x66, 0x6d, 0x74, // "fmt"
      0x64, // text string of 4 chars
      0x6e, 0x6f, 0x6e, 0x65, // "none"
      0x67, // text string of 7 chars
      0x61, 0x74, 0x74, 0x53, 0x74, 0x6d, 0x74, // "attStmt"
      0xa0, // empty map
      0x68, // text string of 8 chars
      0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61, // "authData"
      0x58, authData.length > 255 ? 0x59 : authData.length, // byte string
      ...authData
    ]);

    // Fix the byte string length encoding for authData
    if (authData.length > 255) {
      const lenBytes = new Uint8Array(2);
      new DataView(lenBytes.buffer).setUint16(0, authData.length, false);
      const fixedResult = new Uint8Array(result.length + 1);
      fixedResult.set(result.slice(0, result.length - authData.length - 1), 0);
      fixedResult[result.length - authData.length - 1] = 0x59; // 2-byte length
      fixedResult.set(lenBytes, result.length - authData.length);
      fixedResult.set(authData, result.length - authData.length + 2);
      return fixedResult;
    }

    return result;
  }

  // Use existing passkey for authentication
  async function usePasskeyCredential(options, passkey) {
    const publicKeyOptions = options.publicKey;
    const rpId = publicKeyOptions.rpId || window.location.hostname;

    // Import private key
    const privateKeyJwk = JSON.parse(passkey.privateKey);
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      privateKeyJwk,
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      false,
      ['sign']
    );

    // Increment counter
    const newCounter = (passkey.counter || 0) + 1;

    // Update counter in storage
    await sendToContentScript({
      type: CONFPASS_MESSAGE_TYPE,
      action: 'update_counter',
      credentialId: passkey.credentialId,
      counter: newCounter
    });

    // Create authenticator data
    const rpIdHash = await sha256(rpId);
    const flags = 0x05; // UP (1) + UV (4) = 0x05
    const authData = createAuthenticatorData(rpIdHash, flags, newCounter);

    // Create client data JSON
    const clientDataJSON = JSON.stringify({
      type: 'webauthn.get',
      challenge: bufferToBase64URL(publicKeyOptions.challenge),
      origin: window.location.origin,
      crossOrigin: false
    });

    const clientDataHash = await sha256(new TextEncoder().encode(clientDataJSON));

    // Create signature
    const signatureBase = new Uint8Array(authData.length + clientDataHash.byteLength);
    signatureBase.set(authData, 0);
    signatureBase.set(new Uint8Array(clientDataHash), authData.length);

    const signature = await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: 'SHA-256'
      },
      privateKey,
      signatureBase
    );

    // Convert signature to DER format
    const derSignature = convertToDER(new Uint8Array(signature));

    const credentialId = base64URLToBuffer(passkey.credentialId);
    const userHandle = passkey.userId ? base64URLToBuffer(passkey.userId) : null;

    // Create PublicKeyCredential response
    const credential = {
      id: passkey.credentialId,
      rawId: credentialId,
      type: 'public-key',
      response: {
        clientDataJSON: new TextEncoder().encode(clientDataJSON).buffer,
        authenticatorData: authData.buffer,
        signature: derSignature.buffer,
        userHandle: userHandle
      },
      authenticatorAttachment: 'platform',
      getClientExtensionResults: () => ({})
    };

    // Make it look like a real PublicKeyCredential
    Object.setPrototypeOf(credential.response, AuthenticatorAssertionResponse.prototype);
    Object.setPrototypeOf(credential, PublicKeyCredential.prototype);

    console.log('[ConfPass Authenticator] Passkey used for authentication');

    return credential;
  }

  // Convert ECDSA signature to DER format
  function convertToDER(signature) {
    const r = signature.slice(0, 32);
    const s = signature.slice(32, 64);

    function encodeInteger(bytes) {
      let i = 0;
      while (i < bytes.length && bytes[i] === 0) i++;
      if (i === bytes.length) return new Uint8Array([0x02, 0x01, 0x00]);

      const needsPadding = bytes[i] >= 0x80;
      const length = bytes.length - i + (needsPadding ? 1 : 0);
      const result = new Uint8Array(2 + length);
      result[0] = 0x02;
      result[1] = length;
      if (needsPadding) {
        result[2] = 0x00;
        result.set(bytes.slice(i), 3);
      } else {
        result.set(bytes.slice(i), 2);
      }
      return result;
    }

    const encodedR = encodeInteger(r);
    const encodedS = encodeInteger(s);

    const der = new Uint8Array(2 + encodedR.length + encodedS.length);
    der[0] = 0x30;
    der[1] = encodedR.length + encodedS.length;
    der.set(encodedR, 2);
    der.set(encodedS, 2 + encodedR.length);

    return der;
  }

  // Override navigator.credentials.create()
  navigator.credentials.create = async function(options) {
    console.log('[ConfPass Authenticator] credentials.create() intercepted', options);

    // Only handle WebAuthn requests
    if (!options?.publicKey) {
      return originalCreate(options);
    }

    try {
      // Ask user if they want to use ConfPass
      const response = await showConfPassCreateDialog(options);

      if (response.useConfPass) {
        console.log('[ConfPass Authenticator] User chose ConfPass, creating passkey...');
        return await createPasskeyCredential(options, response);
      } else if (response.useSystem) {
        console.log('[ConfPass Authenticator] User chose system authenticator');
        return await originalCreate(options);
      } else {
        // User cancelled
        throw new DOMException('The operation was cancelled.', 'NotAllowedError');
      }
    } catch (error) {
      console.error('[ConfPass Authenticator] Create error:', error);
      throw error;
    }
  };

  // Override navigator.credentials.get()
  navigator.credentials.get = async function(options) {
    console.log('[ConfPass Authenticator] credentials.get() intercepted', options);

    // Only handle WebAuthn requests
    if (!options?.publicKey) {
      return originalGet(options);
    }

    try {
      // Check if we have passkeys for this site
      const response = await showConfPassGetDialog(options);

      if (response.useConfPass && response.passkey) {
        console.log('[ConfPass Authenticator] Using ConfPass passkey...');
        return await usePasskeyCredential(options, response.passkey);
      } else if (response.useSystem) {
        console.log('[ConfPass Authenticator] User chose system authenticator');
        return await originalGet(options);
      } else {
        // No passkeys or user cancelled
        throw new DOMException('The operation was cancelled.', 'NotAllowedError');
      }
    } catch (error) {
      console.error('[ConfPass Authenticator] Get error:', error);
      throw error;
    }
  };

  console.log('[ConfPass Authenticator] Virtual authenticator installed successfully');
})();
