/**
 * AES-256-GCM payload cipher, per-context keys via HKDF-SHA256 from an
 * injected master secret (this module never reads process.env).
 * Wire format (frozen): iv(12) || authTag(16) || ciphertext.
 * Server-only: uses node:crypto.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/** Fail-closed master-key guard: refuses a missing, malformed or all-zero key. */
export function assertEncryptionKey(key: Uint8Array | null | undefined): asserts key is Uint8Array {
    if (!key || key.length !== 32) {
        throw new Error(
            'encryption master key must be 32 bytes; refusing to encrypt passport payloads '
            + 'with a default key. Generate one with: openssl rand -hex 32');
    }
    if (key.every((b) => b === 0)) {
        throw new Error('encryption master key is all zeroes; refusing to encrypt with a publicly known key');
    }
}

/** Parse a 64-hex master key string (e.g. the ENCRYPTION_KEY env value), fail closed. */
export function masterKeyFromHex(hex: string | null | undefined): Buffer {
    const clean = String(hex ?? '').trim();
    if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
        throw new Error(
            'encryption master key must be 32 bytes of hex (64 characters); refusing to encrypt passport '
            + 'payloads with a default key. Generate one with: openssl rand -hex 32');
    }
    const key = Buffer.from(clean, 'hex');
    assertEncryptionKey(key);
    return key;
}

/** HKDF-SHA256 context key: derive a 32-byte subkey from the master secret. */
export function hkdfContextKey(masterKey: Uint8Array, salt: string, info: string): Buffer {
    return Buffer.from(
        hkdfSync('sha256', Buffer.from(masterKey), Buffer.from(salt, 'utf8'), Buffer.from(info, 'utf8'), 32)
    );
}

const PAYLOAD_INFO = 'passport-payload';

/** AES-256-GCM encrypt under a per-passport HKDF key (salt = passportId). Output: iv(12) || tag(16) || ct. */
export function encryptPayload(plaintext: string, passportId: string, masterKey: Uint8Array): Buffer {
    assertEncryptionKey(masterKey);
    const key = hkdfContextKey(masterKey, passportId, PAYLOAD_INFO);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]);
}

/** Inverse of encryptPayload; throws on a wrong key or tampered bytes (AES-GCM authenticates). */
export function decryptPayload(cipher: Buffer | Uint8Array, passportId: string, masterKey: Uint8Array): string {
    const buf = Buffer.isBuffer(cipher) ? cipher : Buffer.from(cipher);
    if (buf.length < 12 + 16 + 1) throw new Error('payload cipher is too short to be iv || tag || ciphertext');
    assertEncryptionKey(masterKey);
    const key = hkdfContextKey(masterKey, passportId, PAYLOAD_INFO);
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Secret-at-rest helper, base64(iv || tag || ct), with a caller-chosen HKDF info string. */
export function encryptSecret(plaintext: string, context: string, masterKey: Uint8Array, info: string): string {
    assertEncryptionKey(masterKey);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', hkdfContextKey(masterKey, context, info), iv);
    const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decryptSecret(encoded: string, context: string, masterKey: Uint8Array, info: string): string {
    const buf = Buffer.from(encoded, 'base64');
    assertEncryptionKey(masterKey);
    const decipher = createDecipheriv('aes-256-gcm', hkdfContextKey(masterKey, context, info), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
