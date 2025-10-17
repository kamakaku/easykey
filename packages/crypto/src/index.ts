// packages/crypto/src/index.ts
import _sodium from 'libsodium-wrappers-sumo';

// Init once – normalize default/namespace export across bundlers
export async function ready() {
  const sodium: any = (_sodium as any).default ?? _sodium;
  if (sodium.ready) {
    await sodium.ready;
  }
  return sodium;
}

// Derive a 32-byte key from password+salt using Argon2id
export async function deriveMasterKey(password: string, salt: Uint8Array) {
  const s = await ready();
  if (!(salt instanceof Uint8Array) || salt.length !== s.crypto_pwhash_SALTBYTES) {
    throw new Error(`salt must be Uint8Array of length ${s.crypto_pwhash_SALTBYTES}`);
  }
  return s.crypto_pwhash(
    32,
    password,
    salt,
    s.crypto_pwhash_OPSLIMIT_MODERATE,
    s.crypto_pwhash_MEMLIMIT_MODERATE,
    s.crypto_pwhash_ALG_ARGON2ID13
  );
}

// Symmetric encryption (XChaCha20-Poly1305, AEAD)
export async function encryptBlob(plain: Uint8Array, key: Uint8Array) {
  const s = await ready();
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const cipher = s.crypto_aead_xchacha20poly1305_ietf_encrypt(plain, null, null, nonce, key);
  return { nonce, cipher };
}

// Decrypt symmetric blob
export async function decryptBlob(nonce: Uint8Array, cipher: Uint8Array, key: Uint8Array) {
  const s = await ready();
  return s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cipher, null, nonce, key);
}