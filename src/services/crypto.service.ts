import crypto from 'node:crypto';
import { ENV } from '../env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = ENV.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY não configurada');
  // Aceita hex (64 chars) ou base64 (44 chars) — sempre resulta em 32 bytes
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY deve ter 32 bytes (hex de 64 chars ou base64 de 44 chars)');
  return buf;
}

/** Encrypts plaintext → "iv:ciphertext:tag" (hex-encoded) */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

/** Decrypts "iv:ciphertext:tag" → plaintext */
export function decrypt(encryptedStr: string): string {
  const key = getKey();
  const [ivHex, encHex, tagHex] = encryptedStr.split(':');
  if (!ivHex || !encHex || !tagHex) throw new Error('Formato de dado criptografado inválido');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}
