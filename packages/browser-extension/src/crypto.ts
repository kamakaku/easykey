const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function generateDeterministicSalt(password: string): Promise<Uint8Array> {
  const passwordBuffer = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', passwordBuffer);
  return new Uint8Array(hashBuffer.slice(0, 16));
}

export async function generateKeyFromPassword(password: string): Promise<CryptoKey> {
  const salt = await generateDeterministicSalt(password);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

export async function importKey(raw: ArrayLike<number>): Promise<CryptoKey> {
  const bytes = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
  return crypto.subtle.importKey(
    'raw',
    bytes.buffer.slice(0) as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function decryptFromStorage(serialized: string, key: CryptoKey): Promise<string> {
  const parts = serialized.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivB64, cipherB64] = parts;
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const cipher = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
  const ivBuffer = iv.buffer.slice(0) as ArrayBuffer;
  const cipherBuffer = cipher.buffer.slice(0) as ArrayBuffer;

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    cipherBuffer
  );

  return decoder.decode(plainBuffer);
}

export function decodeLegacyBlob(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(b => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export async function encryptForStorage(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  const ivB64 = arrayBufferToBase64(iv.buffer);
  const cipherB64 = arrayBufferToBase64(cipherBuffer);
  return `${ivB64}:${cipherB64}`;
}
