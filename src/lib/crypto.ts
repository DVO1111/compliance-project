import { logger } from './logger';
/**
 * Lightweight encryption utility using the Web Crypto API (AES-GCM).
 * This protects data stored in IndexedDB and localStorage from simple extraction.
 */

const KEY_ALGO = { name: 'AES-GCM', length: 256 };
const KEY_NAME = 'compliance_master_key';

async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = localStorage.getItem(KEY_NAME);
  if (existing) {
    const raw = Uint8Array.from(atob(existing), c => c.charCodeAt(0));
    return await crypto.subtle.importKey('raw', raw, KEY_ALGO, true, ['encrypt', 'decrypt']);
  }

  const key = await crypto.subtle.generateKey(KEY_ALGO, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  localStorage.setItem(KEY_NAME, base64);
  return key;
}

export async function encryptData(data: any): Promise<string> {
  try {
    const key = await getOrCreateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } catch (err) {
    logger.error('[Crypto] Encryption failed:', err);
    return JSON.stringify(data); // Fallback to plain text on failure to prevent data loss
  }
}

export async function decryptData<T>(encryptedBase64: string): Promise<T | null> {
  try {
    // Check if it's actually encrypted (not a plain JSON string)
    if (encryptedBase64.startsWith('{') || encryptedBase64.startsWith('[')) {
      return JSON.parse(encryptedBase64);
    }

    const key = await getOrCreateKey();
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (err) {
    logger.warn('[Crypto] Decryption failed (may be legacy plain text):', err);
    try {
      return JSON.parse(encryptedBase64);
    } catch {
      return null;
    }
  }
}
