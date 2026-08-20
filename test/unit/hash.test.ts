import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sortKeys, canonicalize, blake2b256Hex, blake2b256Bytes, hashPayload } from '../../src/hash';

describe('canonicalize + hashPayload', () => {
    it('sorts object keys recursively and deterministically', () => {
        const a = { b: 1, a: { z: [3, { y: 2, x: 1 }], k: 'v' } };
        const b = { a: { k: 'v', z: [3, { x: 1, y: 2 }] }, b: 1 };
        assert.equal(canonicalize(a), canonicalize(b));
        assert.deepEqual(sortKeys([{ b: 1, a: 2 }]), [{ a: 2, b: 1 }]);
    });

    it('preserves array order (arrays are significant, not sorted)', () => {
        assert.notEqual(canonicalize({ a: [1, 2] }), canonicalize({ a: [2, 1] }));
    });

    it('hashPayload is a stable 64-hex over the canonical form', () => {
        const h1 = hashPayload({ b: 1, a: 2 }).payloadHash;
        const h2 = hashPayload({ a: 2, b: 1 }).payloadHash;
        assert.equal(h1, h2);
        assert.match(h1, /^[0-9a-f]{64}$/);
    });
});

describe('blake2b256Hex', () => {
    it('matches the blake2b-256 empty-string vector', () => {
        assert.equal(
            blake2b256Hex(''),
            '0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8'
        );
    });

    it('hashes UTF-8 text bytes (TextEncoder = Buffer.from utf8)', () => {
        assert.equal(blake2b256Hex('äöü €'), blake2b256Hex(Buffer.from('äöü €', 'utf8').toString('utf8')));
    });

    it('blake2b256Bytes matches the hex variant over the same bytes', () => {
        const viaBytes = Buffer.from(blake2b256Bytes(new TextEncoder().encode('abc'))).toString('hex');
        assert.equal(viaBytes, blake2b256Hex('abc'));
    });
});
