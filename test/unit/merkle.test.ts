import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildTree, proofFor, verifyProof, MERKLE_DEPTH, LEAF_COUNT,
    DEFAULT_SLOT_WIDTH, VAULT_SLOT_WIDTHS, depthForWidth, widthForDepth, padToWidth
} from '../../src/merkle';
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

const emptyLeaf = () => leafHash(fromHex32(fieldKeyHex('daypass/content-root/empty-leaf/v1')), 0n);

function leavesFor(values: Record<string, number>, width: number = LEAF_COUNT): Uint8Array[] {
    const real = PROVABLE_FIELDS.map((fieldName) => {
        const raw = values[fieldName];
        return raw != null
            ? leafHash(fromHex32(fieldKeyHex(fieldName)), BigInt(scaleValue(raw)))
            : emptyLeaf();
    });
    return padToWidth(real, width, emptyLeaf);
}

const sixteenLeaves = (values: Record<string, number>) => leavesFor(values);

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

describe('slot width parameterization', () => {
    const values = { carbonFootprintKgCO2: 3412.75, capacityKwh: 75, cycleLife: 1800 };

    it('depth and width convert both ways; the default stays 16/4', () => {
        assert.equal(DEFAULT_SLOT_WIDTH, LEAF_COUNT);
        assert.equal(depthForWidth(LEAF_COUNT), MERKLE_DEPTH);
        assert.equal(depthForWidth(32), 5);
        assert.equal(widthForDepth(5), 32);
        for (const w of VAULT_SLOT_WIDTHS) assert.equal(widthForDepth(depthForWidth(w)), w);
    });

    it('rejects widths that are not powers of two, and out-of-range depths', () => {
        for (const bad of [0, 1, 3, 17, 24, -16, 2048, 1.5]) {
            assert.throws(() => depthForWidth(bad), /power of two/);
        }
        assert.throws(() => widthForDepth(0), /1\.\.10/);
        assert.throws(() => widthForDepth(11), /1\.\.10/);
    });

    it('padToWidth fills with the index-aware filler and refuses overflow', () => {
        const padded = padToWidth(['a', 'b'], 8, (i) => `pad${i}`);
        assert.equal(padded.length, 8);
        assert.deepEqual(padded.slice(0, 2), ['a', 'b']);
        assert.deepEqual(padded.slice(2), ['pad2', 'pad3', 'pad4', 'pad5', 'pad6', 'pad7']);
        assert.deepEqual(padToWidth(['a'], 2, () => 'p'), ['a', 'p']);
        assert.throws(() => padToWidth(['a', 'b', 'c'], 2, () => 'p'), /do not fit/);
        assert.throws(() => padToWidth(['a'], 6, () => 'p'), /power of two/);
    });

    it('builds a depth-5 tree over 32 slots with depth-5 inclusion paths', () => {
        const tree32 = buildTree(leavesFor(values, 32), nodeHash);
        assert.equal(tree32.levels.length, 6);
        assert.equal(tree32.levels[0].length, 32);
        const idx = PROVABLE_FIELDS.indexOf('capacityKwh');
        const path = proofFor(tree32.levels, idx);
        assert.equal(path.siblings.length, 5);
        assert.equal(path.dirs.length, 5);
        const leaf = leafHash(fromHex32(fieldKeyHex('capacityKwh')), BigInt(scaleValue(75)));
        assert.equal(verifyProof(leaf, path, tree32.rootHex, nodeHash), true);
    });

    it('the same values under a different width are a DIFFERENT root (width is part of the identity)', () => {
        const root16 = buildTree(leavesFor(values, 16), nodeHash).rootHex;
        const root32 = buildTree(leavesFor(values, 32), nodeHash).rootHex;
        assert.notEqual(root16, root32);
        const path16 = proofFor(buildTree(leavesFor(values, 16), nodeHash).levels, 1);
        const leaf = leafHash(fromHex32(fieldKeyHex('capacityKwh')), BigInt(scaleValue(75)));
        assert.equal(verifyProof(leaf, path16, root32, nodeHash), false);
    });
});
