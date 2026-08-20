import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTree, proofFor, verifyProof, MERKLE_DEPTH, LEAF_COUNT } from '../../src/merkle';
import { blake2b256Bytes } from '../../src/hash';
import { fieldKeyHex, fromHex32, scaleValue, u64be, PROVABLE_FIELDS } from '../../src/fields';

// DAYPASS's chain-specific hashers, inlined HERE ONLY to pin the generic tree
// walk against DAYPASS's historical golden root (see golden-vectors.test.ts).
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

function sixteenLeaves(values: Record<string, number>): Uint8Array[] {
    const empty = leafHash(fromHex32(fieldKeyHex('daypass/content-root/empty-leaf/v1')), 0n);
    const leaves: Uint8Array[] = [];
    for (let i = 0; i < LEAF_COUNT; i++) {
        const fieldName = PROVABLE_FIELDS[i];
        const raw = fieldName != null ? values[fieldName] : undefined;
        leaves.push(raw != null
            ? leafHash(fromHex32(fieldKeyHex(fieldName)), BigInt(scaleValue(raw)))
            : empty);
    }
    return leaves;
}

describe('buildTree + proofFor + verifyProof', () => {
    const values = { carbonFootprintKgCO2: 3412.75, capacityKwh: 75, cycleLife: 1800 };
    const tree = buildTree(sixteenLeaves(values), nodeHash);

    it('builds depth-4 levels over 16 leaves', () => {
        assert.equal(tree.levels.length, MERKLE_DEPTH + 1);
        assert.equal(tree.levels[0].length, LEAF_COUNT);
        assert.equal(tree.levels[MERKLE_DEPTH].length, 1);
        assert.match(tree.rootHex, /^[0-9a-f]{64}$/);
    });

    it('every present leaf verifies against the root; siblings/dirs have depth entries', () => {
        for (const [field, raw] of Object.entries(values)) {
            const idx = PROVABLE_FIELDS.indexOf(field as typeof PROVABLE_FIELDS[number]);
            const path = proofFor(tree.levels, idx);
            assert.equal(path.siblings.length, MERKLE_DEPTH);
            assert.equal(path.dirs.length, MERKLE_DEPTH);
            const leaf = leafHash(fromHex32(fieldKeyHex(field)), BigInt(scaleValue(raw)));
            assert.equal(verifyProof(leaf, path, tree.rootHex, nodeHash), true);
        }
    });

    it('rejects a wrong value, wrong root and truncated path', () => {
        const idx = PROVABLE_FIELDS.indexOf('capacityKwh');
        const path = proofFor(tree.levels, idx);
        const wrongLeaf = leafHash(fromHex32(fieldKeyHex('capacityKwh')), BigInt(scaleValue(76)));
        assert.equal(verifyProof(wrongLeaf, path, tree.rootHex, nodeHash), false);
        const rightLeaf = leafHash(fromHex32(fieldKeyHex('capacityKwh')), BigInt(scaleValue(75)));
        assert.equal(verifyProof(rightLeaf, path, 'ff'.repeat(32), nodeHash), false);
        assert.equal(verifyProof(rightLeaf, { siblings: path.siblings.slice(1), dirs: path.dirs }, tree.rootHex, nodeHash), false);
    });

    it('accepts a 0x-prefixed, mixed-case root', () => {
        const idx = PROVABLE_FIELDS.indexOf('cycleLife');
        const path = proofFor(tree.levels, idx);
        const leaf = leafHash(fromHex32(fieldKeyHex('cycleLife')), BigInt(scaleValue(1800)));
        assert.equal(verifyProof(leaf, path, '0x' + tree.rootHex.toUpperCase(), nodeHash), true);
    });

    it('refuses non-power-of-two leaf layers and out-of-range indices', () => {
        assert.throws(() => buildTree(sixteenLeaves(values).slice(0, 3), nodeHash), /power of two/);
        assert.throws(() => proofFor(tree.levels, 16), /out of range/);
    });
});
