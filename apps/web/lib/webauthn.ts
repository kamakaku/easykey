/**
 * WebAuthn Client Utilities
 * Handles biometric authentication for EasyKey
 */

// Use /backend proxy for proper cookie handling in Next.js
const AUTH_API_BASE = '/backend';

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

function base64URLToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Check if WebAuthn is supported by the browser
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
    console.error('Error checking platform authenticator:', error);
    return false;
  }
}

/**
 * Register a new WebAuthn credential (biometric)
 */
export async function registerBiometric(
  userId: string,
  email: string,
  authenticatorName?: string
): Promise<{ success: boolean; credentialId?: string; error?: string }> {
  if (!isWebAuthnSupported()) {
    return { success: false, error: 'WebAuthn not supported in this browser' };
  }

  try {
    // Create credential options
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const publicKeyOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: 'EasyKey',
        id: window.location.hostname,
      },
      user: {
        id: new TextEncoder().encode(userId),
        name: email,
        displayName: email,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256
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
      return { success: false, error: 'Failed to create credential' };
    }

    const response = credential.response as AuthenticatorAttestationResponse;

    // Extract credential data
    const credentialId = bufferToBase64URL(credential.rawId);
    const publicKey = bufferToBase64URL(response.getPublicKey()!);

    // Extract AAGUID from attestation object (optional)
    let aaguid = '';
    try {
      const attestationObject = new Uint8Array(response.attestationObject);
      // AAGUID is at bytes 37-52 in the attestation object for packed format
      // This is a simplified extraction - in production, use proper CBOR parsing
      if (attestationObject.length > 52) {
        const aaguidBytes = attestationObject.slice(37, 53);
        aaguid = bufferToBase64URL(aaguidBytes.buffer);
      }
    } catch (e) {
      console.warn('Could not extract AAGUID:', e);
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
        authenticatorName: authenticatorName || `${getPlatformName()} Biometric`,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text || 'Failed to register credential' };
    }

    const data = await res.json();
    return { success: true, credentialId: data.id };
  } catch (error: any) {
    console.error('Biometric registration error:', error);

    // Handle specific WebAuthn errors
    if (error.name === 'NotAllowedError') {
      return { success: false, error: 'User cancelled or permission denied' };
    } else if (error.name === 'InvalidStateError') {
      return { success: false, error: 'Authenticator already registered' };
    } else if (error.name === 'NotSupportedError') {
      return { success: false, error: 'Operation not supported' };
    }

    return { success: false, error: error.message || 'Unknown error occurred' };
  }
}

/**
 * List registered WebAuthn credentials
 */
export async function listBiometricCredentials(): Promise<{
  success: boolean;
  credentials?: Array<{
    id: string;
    authenticatorName: string;
    createdAt: string;
    lastUsedAt?: string;
  }>;
  error?: string;
}> {
  try {
    const res = await fetch(`${AUTH_API_BASE}/api/v1/webauthn/credentials`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text || 'Failed to list credentials' };
    }

    const data = await res.json();
    return { success: true, credentials: data.credentials || [] };
  } catch (error: any) {
    console.error('List credentials error:', error);
    return { success: false, error: error.message || 'Unknown error occurred' };
  }
}

/**
 * Delete a WebAuthn credential
 */
export async function deleteBiometricCredential(
  credentialId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${AUTH_API_BASE}/api/v1/webauthn/delete?id=${credentialId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: text || 'Failed to delete credential' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Delete credential error:', error);
    return { success: false, error: error.message || 'Unknown error occurred' };
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
    return { success: false, error: 'WebAuthn not supported in this browser' };
  }

  try {
    // Create authentication challenge
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const publicKeyOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId: window.location.hostname,
      timeout: 60000,
      userVerification: 'required',
    };

    // Get credential
    const credential = (await navigator.credentials.get({
      publicKey: publicKeyOptions,
    })) as PublicKeyCredential | null;

    if (!credential) {
      return { success: false, error: 'No credential selected' };
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
      return { success: false, error: text || 'Authentication failed' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Biometric authentication error:', error);

    // Handle specific WebAuthn errors
    if (error.name === 'NotAllowedError') {
      return { success: false, error: 'User cancelled or permission denied' };
    } else if (error.name === 'InvalidStateError') {
      return { success: false, error: 'Authenticator not available' };
    }

    return { success: false, error: error.message || 'Unknown error occurred' };
  }
}

/**
 * Get platform name for display
 */
function getPlatformName(): string {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('mac')) return 'Mac';
  if (userAgent.includes('iphone')) return 'iPhone';
  if (userAgent.includes('ipad')) return 'iPad';
  if (userAgent.includes('android')) return 'Android';
  if (userAgent.includes('windows')) return 'Windows';
  if (userAgent.includes('linux')) return 'Linux';

  return 'Device';
}
