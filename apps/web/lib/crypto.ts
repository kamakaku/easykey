/**
 * Client-seitige Verschlüsselung mit AES-GCM
 * Zero-Knowledge: Server sieht niemals unverschlüsselte Daten
 */

export interface EncryptionResult {
  ciphertext: string; // Base64
  iv: string; // Base64
  salt: string; // Base64
}

/**
 * Leitet einen Encryption Key aus einem Passwort ab
 * Verwendet PBKDF2 mit 100.000 Iterationen
 */
export async function deriveKey(
  password: string,
  salt: ArrayBuffer
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // Import password als Key Material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive AES-GCM Key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable (für Export)
    ['encrypt', 'decrypt']
  );
}

/**
 * Generiert einen deterministischen Salt aus dem Passwort
 * Verwendet SHA-256 um aus dem Passwort einen konsistenten Salt zu erzeugen
 */
async function generateDeterministicSalt(password: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // Hash das Passwort mit SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', passwordBuffer);

  // Verwende die ersten 16 Bytes als Salt
  return new Uint8Array(hashBuffer.slice(0, 16));
}

/**
 * Generiert einen Encryption Key aus Passwort (mit deterministischem Salt)
 * Gibt Key und Salt zurück
 *
 * WICHTIG: Verwendet deterministischen Salt, sodass gleiches Passwort = gleicher Key
 */
export async function generateKeyFromPassword(
  password: string
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const salt = await generateDeterministicSalt(password);
  const saltCopy = new Uint8Array(salt);
  const saltBuffer = saltCopy.buffer as ArrayBuffer;
  const key = await deriveKey(password, saltBuffer);
  return { key, salt };
}

/**
 * Verschlüsselt Daten mit AES-GCM
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<EncryptionResult> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Generiere IV (Initialization Vector)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Verschlüsseln
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    data
  );

  // Konvertiere zu Base64
  const ciphertext = arrayBufferToBase64(ciphertextBuffer);
  const ivCopy = new Uint8Array(iv);
  const ivBase64 = arrayBufferToBase64(ivCopy.buffer as ArrayBuffer);

  // Salt aus Key exportieren (für spätere Key-Rekonstruktion)
  // Da wir den Key aber in der Session behalten, brauchen wir das Salt hier nicht
  // Wir geben ein leeres Salt zurück
  const salt = '';

  return {
    ciphertext,
    iv: ivBase64,
    salt,
  };
}

/**
 * Entschlüsselt Daten mit AES-GCM
 */
export async function decrypt(
  encryptedData: EncryptionResult,
  key: CryptoKey
): Promise<string> {
  const ciphertext = base64ToArrayBuffer(encryptedData.ciphertext);
  const iv = base64ToArrayBuffer(encryptedData.iv);

  // Entschlüsseln
  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    ciphertext
  );

  // Konvertiere zu String
  const decoder = new TextDecoder();
  return decoder.decode(plaintextBuffer);
}

/**
 * Exportiert einen CryptoKey als Base64 String (für sessionStorage)
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(exported);
}

/**
 * Importiert einen CryptoKey aus Base64 String
 */
export async function importKey(keyBase64: string): Promise<CryptoKey> {
  const keyBuffer = base64ToArrayBuffer(keyBase64);
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Helper: ArrayBuffer zu Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

/**
 * Helper: Base64 zu ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Verschlüsselt Daten und gibt ein serialisiertes Format zurück (für Backend)
 */
export async function encryptForStorage(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const encrypted = await encrypt(plaintext, key);
  // Format: iv:ciphertext (beide Base64)
  return `${encrypted.iv}:${encrypted.ciphertext}`;
}

/**
 * Entschlüsselt serialisierte Daten vom Backend
 */
export async function decryptFromStorage(
  serialized: string,
  key: CryptoKey
): Promise<string> {
  const parts = serialized.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format');
  }

  const [iv, ciphertext] = parts;
  return decrypt({ iv, ciphertext, salt: '' }, key);
}
