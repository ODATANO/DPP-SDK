import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    assertEncryptionKey, masterKeyFromHex, hkdfContextKey,
    encryptPayload, decryptPayload, encryptSecret, decryptSecret
} from '../../src/cipher';

const KEY = masterKeyFromHex('a'.repeat(64));

describe('assertEncryptionKey / masterKeyFromHex (fail closed)', () => {
    it('accepts a real 32-byte key', () => {
        assert.doesNotThrow(() => assertEncryptionKey(KEY));
    });

    // Fail closed: encrypting confidential Annex XIII payloads under a default
    // key would look completely normal from the outside, which is what makes it
    // dangerous. Refusing is the only safe answer.
    it('refuses missing, short and non-hex keys', () => {
        assert.throws(() => assertEncryptionKey(null), /32 bytes/);
        assert.throws(() => assertEncryptionKey(undefined), /32 bytes/);
        assert.throws(() => assertEncryptionKey(new Uint8Array(16)), /32 bytes/);
        for (const bad of ['', 'not-hex', 'ab', 'z'.repeat(64), 'a'.repeat(63)]) {
            assert.throws(() => masterKeyFromHex(bad), /64 characters/, `accepted bad key '${bad}'`);
        }
    });

    it('refuses the all-zero key (the historical silent fallback)', () => {
        assert.throws(() => assertEncryptionKey(new Uint8Array(32)), /all zeroes/);
        assert.throws(() => masterKeyFromHex('00'.repeat(32)), /all zeroes/);
    });
});

describe('encryptPayload / decryptPayload', () => {
    it('lays out iv(12) || tag(16) || ciphertext and is nonce-randomized', () => {
        const pt = 'hello passport';
        const a = encryptPayload(pt, 'BAT-PREVIEW-0001', KEY);
        const b = encryptPayload(pt, 'BAT-PREVIEW-0001', KEY);
        assert.equal(a.length, 12 + 16 + Buffer.byteLength(pt, 'utf8'));
        assert.notDeepEqual(a.subarray(0, 12), b.subarray(0, 12)); // random iv per call
    });

    it('decrypts what it encrypted, and refuses another passport id', () => {
        const blob = encryptPayload('{"secret":1}', 'BAT-1', KEY);
        assert.equal(decryptPayload(blob, 'BAT-1', KEY), '{"secret":1}');
        assert.throws(() => decryptPayload(blob, 'BAT-2', KEY));
    });

    it('refuses tampered bytes (GCM authenticates)', () => {
        const blob = encryptPayload('x', 'BAT-1', KEY);
        blob[blob.length - 1] ^= 0xff;
        assert.throws(() => decryptPayload(blob, 'BAT-1', KEY));
    });
});

describe('secret helpers (base64 iv || tag || ct with caller-chosen info)', () => {
    it('roundtrips and binds to the context', () => {
        const enc = encryptSecret('seed-words', 'tester-42', KEY, 'demo-secret');
        assert.equal(decryptSecret(enc, 'tester-42', KEY, 'demo-secret'), 'seed-words');
        assert.throws(() => decryptSecret(enc, 'tester-43', KEY, 'demo-secret'));
        assert.throws(() => decryptSecret(enc, 'tester-42', KEY, 'other-info'));
    });
});

describe('hkdfContextKey', () => {
    it('derives deterministic 32-byte subkeys, distinct per salt and info', () => {
        const a = hkdfContextKey(KEY, 'ctx', 'info');
        assert.equal(a.length, 32);
        assert.deepEqual(a, hkdfContextKey(KEY, 'ctx', 'info'));
        assert.notDeepEqual(a, hkdfContextKey(KEY, 'ctx2', 'info'));
        assert.notDeepEqual(a, hkdfContextKey(KEY, 'ctx', 'info2'));
    });
});
