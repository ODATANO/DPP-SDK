/**
 * Golden-vector pins: byte-for-byte behavior captured from the LIVE NIGHTPASS
 * and DAYPASS code before extraction (2026-08-20). A failure here means a hash
 * or wire-format REGRESSION against on-chain anchored data.
 *
 * NEVER update test/fixtures/golden-vectors.json to make this pass without an
 * explicit maintainer decision: existing anchors depend on these bytes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalize, hashPayload, blake2b256Bytes } from '../../src/hash';
import { payloadFromDb } from '../../src/payload';
import { granteeIdForDid } from '../../src/grantee';
import { fieldKeyHex, scaleValue, fromHex32, u64be, PROVABLE_FIELDS } from '../../src/fields';
import { buildTree, verifyProof, LEAF_COUNT } from '../../src/merkle';
import { decryptPayload, encryptPayload, masterKeyFromHex } from '../../src/cipher';

const vectors = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/golden-vectors.json'), 'utf8'));

describe('payload v2 golden vectors', () => {
    for (const name of ['full', 'noAttributes', 'minimal'] as const) {
        it(`reproduces the '${name}' canonical payload and hash byte-for-byte`, () => {
            const v = vectors.payloadV2[name];
            const { canonicalPayload, payloadHash } = hashPayload(payloadFromDb(v.inputs));
            assert.equal(canonicalPayload, v.canonicalPayload);
            assert.equal(payloadHash, v.payloadHash);
        });
    }
});

describe('grantee golden vectors', () => {
    it('reproduces every recorded DID binding', () => {
        for (const v of vectors.grantee) {
            assert.equal(granteeIdForDid(v.did), v.id);
        }
    });
});

describe('field-key and scaling golden vectors', () => {
    it('reproduces all 13 field keys', () => {
        for (const [field, key] of Object.entries(vectors.fieldKeys)) {
            assert.equal(fieldKeyHex(field), key);
        }
    });
    it('reproduces the scaleValue edge cases', () => {
        for (const v of vectors.scaleValue) {
            assert.equal(scaleValue(v.raw), v.scaled);
        }
    });
});

describe('cipher wire-format golden vector', () => {
    it('decrypts the recorded iv||tag||ct blob under the recorded key', () => {
        const v = vectors.cipher;
        const key = masterKeyFromHex(v.masterKeyHex);
        const blob = Buffer.from(v.blobBase64, 'base64');
        assert.equal(decryptPayload(blob, v.passportId, key), v.plaintext);
        // and a fresh encrypt roundtrips under the same derivation
        const fresh = encryptPayload(v.plaintext, v.passportId, key);
        assert.equal(decryptPayload(fresh, v.passportId, key), v.plaintext);
    });
});

describe('DAYPASS content-root golden vector (generic tree walk)', () => {
    // DAYPASS's chain-specific leaf/node hashers, inlined for the pin only.
    const DOMAIN_LEAF = new TextEncoder().encode('daypass/leaf/v1');
    const DOMAIN_NODE = new TextEncoder().encode('daypass/node/v1');
    const concat = (...parts: Uint8Array[]) => {
        const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let o = 0;
        for (const p of parts) { out.set(p, o); o += p.length; }
        return out;
    };
    const leafHash = (fieldKey: Uint8Array, value: bigint) => blake2b256Bytes(concat(DOMAIN_LEAF, fieldKey, u64be(value)));
    const nodeHash = (l: Uint8Array, r: Uint8Array) => blake2b256Bytes(concat(DOMAIN_NODE, l, r));

    it('reproduces the recorded root and verifies the recorded proof', () => {
        const v = vectors.daypassContentRoot;
        const empty = leafHash(fromHex32(fieldKeyHex('daypass/content-root/empty-leaf/v1')), 0n);
        const leaves: Uint8Array[] = [];
        for (let i = 0; i < LEAF_COUNT; i++) {
            const fieldName = PROVABLE_FIELDS[i];
            const raw = fieldName != null ? v.values[fieldName] : undefined;
            leaves.push(raw != null
                ? leafHash(fromHex32(fieldKeyHex(fieldName)), BigInt(scaleValue(raw)))
                : empty);
        }
        const tree = buildTree(leaves, nodeHash);
        assert.equal(tree.rootHex, v.contentRoot);

        const proof = v.proofCapacityKwh;
        const leaf = leafHash(fromHex32(proof.fieldKey), BigInt(proof.value));
        assert.equal(verifyProof(leaf, { siblings: proof.siblings, dirs: proof.dirs }, v.contentRoot, nodeHash), true);
    });
});

describe('DAYPASS payload v1 golden vector (canonicalize only)', () => {
    // The v1 projection itself stays app-side (and is being retired); this pin
    // proves the SDK canonicalizer reproduces the recorded v1 hash over the
    // recorded payload object.
    it('re-hashes the recorded v1 payload object to the recorded hash', () => {
        const v = vectors.daypassPayloadV1;
        assert.equal(canonicalize(v.payload), v.canonicalPayload);
        assert.equal(hashPayload(v.payload).payloadHash, v.payloadHash);
    });
});
