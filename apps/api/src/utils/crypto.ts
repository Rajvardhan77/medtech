import crypto from 'crypto';
import { config } from '../config';

// Derive a fixed 32-byte key from APP_ENCRYPTION_KEY using SHA-256
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(config.APP_ENCRYPTION_KEY || 'default-secret-key-32-chars-long!!')
  .digest();

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

/**
 * Encrypts a text string using AES-256-GCM.
 * Output format: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptField(plainText?: string | null): string | null {
  if (plainText === null || plainText === undefined || plainText === '') {
    return null;
  }

  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * Gracefully returns original text if unencrypted or legacy.
 */
export function decryptField(cipherText?: string | null): string | null {
  if (!cipherText) {
    return null;
  }

  // If not prefixed, treat as unencrypted legacy plaintext
  if (!cipherText.startsWith(PREFIX)) {
    return cipherText;
  }

  try {
    const raw = cipherText.slice(PREFIX.length);
    const parts = raw.split(':');
    if (parts.length !== 3) {
      return cipherText;
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.warn('[Field Decryption Warning] Failed to decrypt field; returning raw value:', error);
    return cipherText;
  }
}
