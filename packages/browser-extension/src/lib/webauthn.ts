/**
 * WebAuthn Client Utilities for Browser Extension
 */

const AUTH_API_BASE = 'http://127.0.0.1:8080';

/**
 * Base64URL encoding/decoding utilities
 */
function bufferToBase64URL(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Check if WebAuthn is supported
 */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential === 'function'
  );
}

/**
 * Check if platform authenticator (biometric) is available
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) {
    return false;
  }

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (error) {
    console.error('[EasyKey] Error checking platform authenticator:', error);
    return false;
  }
}

/**
 * Authenticate with biometric (WebAuthn login)
 */
export async function authenticateWithBiometric(): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!isWebAuthnSupported()) {
    return { success: false, error: 'WebAuthn nicht unterstützt' };
  }

  try {
    // Create authentication challenge
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const publicKeyOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId: 'localhost', // For extension, use localhost
      timeout: 60000,
      userVerification: 'required',
    };

    // Get credential
    const credential = (await navigator.credentials.get({
      publicKey: publicKeyOptions,
    })) as PublicKeyCredential | null;

    if (!credential) {
      return { success: false, error: 'Keine Credentials ausgewählt' };
    }

    const response = credential.response as AuthenticatorAssertionResponse;

    // Prepare authentication data for backend
    const credentialId = bufferToBase64URL(credential.rawId);
    const authenticatorData = bufferToBase64URL(response.authenticatorData);
    const clientDataJSON = bufferToBase64URL(response.clientDataJSON);
    const signature = bufferToBase64URL(response.signature);

    // Send to backend for verification
    const res = await fetch(`${AUTH_API_BASE}/api/v1/webauthn/authenticate`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        credentialId,
        authenticatorData,
        clientDataJSON,
        signature,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text || 'Authentifizierung fehlgeschlagen' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[EasyKey] Biometric authentication error:', error);

    // Handle specific WebAuthn errors
    if (error.name === 'NotAllowedError') {
      return { success: false, error: 'Vorgang abgebrochen' };
    } else if (error.name === 'InvalidStateError') {
      return { success: false, error: 'Authenticator nicht verfügbar' };
    }

    return { success: false, error: error.message || 'Unbekannter Fehler' };
  }
}

/**
 * Register a new WebAuthn credential (biometric)
 */
export async function registerBiometric(
  userId: string,
  email: string
): Promise<{ success: boolean; credentialId?: string; error?: string }> {
  if (!isWebAuthnSupported()) {
    return { success: false, error: 'WebAuthn nicht unterstützt' };
  }

  try {
    // Create credential options
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const publicKeyOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: 'EasyKey',
        id: 'localhost',
      },
      user: {
        id: new TextEncoder().encode(userId),
        name: email,
        displayName: email,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        requireResidentKey: false,
        userVerification: 'required',
      },
      timeout: 60000,
      attestation: 'none',
    };

    // Create credential
    const credential = (await navigator.credentials.create({
      publicKey: publicKeyOptions,
    })) as PublicKeyCredential | null;

    if (!credential) {
      return { success: false, error: 'Credential-Erstellung fehlgeschlagen' };
    }

    const response = credential.response as AuthenticatorAttestationResponse;

    // Extract credential data
    const credentialId = bufferToBase64URL(credential.rawId);
    const publicKey = bufferToBase64URL(response.getPublicKey()!);

    // Extract AAGUID (simplified)
    let aaguid = '';
    try {
      const attestationObject = new Uint8Array(response.attestationObject);
      if (attestationObject.length > 52) {
        const aaguidBytes = attestationObject.slice(37, 53);
        aaguid = bufferToBase64URL(aaguidBytes.buffer);
      }
    } catch (e) {
      console.warn('[EasyKey] Could not extract AAGUID:', e);
    }

    // Register with backend
    const res = await fetch(`${AUTH_API_BASE}/api/v1/webauthn/register`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        credentialId,
        publicKey,
        aaguid,
        authenticatorName: `${getPlatformName()} Biometric (Extension)`,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text || 'Registrierung fehlgeschlagen' };
    }

    const data = await res.json();
    return { success: true, credentialId: data.id };
  } catch (error: any) {
    console.error('[EasyKey] Biometric registration error:', error);

    if (error.name === 'NotAllowedError') {
      return { success: false, error: 'Vorgang abgebrochen' };
    } else if (error.name === 'InvalidStateError') {
      return { success: false, error: 'Authenticator bereits registriert' };
    }

    return { success: false, error: error.message || 'Unbekannter Fehler' };
  }
}

/**
 * Get platform name for display
 */
function getPlatformName(): string {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('mac')) return 'Mac';
  if (userAgent.includes('windows')) return 'Windows';
  if (userAgent.includes('linux')) return 'Linux';

  return 'Device';
}
