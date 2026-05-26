import { randomBytes } from 'node:crypto';

/** Short, URL-friendly id. 8 chars of base32-ish → 40 bits of entropy. */
export function shortId(len = 8): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** Opaque session token. 32 bytes of hex = 64 chars. */
export function sessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** Stable player id, ~20 chars. */
export function playerId(): string {
  return 'p_' + randomBytes(9).toString('base64url');
}

/** Room id used in URLs. */
export function roomId(): string {
  return shortId(6);
}
