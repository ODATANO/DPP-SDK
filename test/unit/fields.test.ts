import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VALUE_SCALE, scaleValue, weightGramsFromKg, fieldKeyHex } from '../../src/fields';
import { fromHex32, toHex, u64be, concatBytes } from '../../src/bytes';
import { blake2b256Hex } from '../../src/hash';

describe('scaling + keys', () => {
    it('scales to integer milli-units', () => {
        assert.equal(scaleValue(3.412), Math.round(3.412 * VALUE_SCALE));
        assert.equal(scaleValue('16.5'), 16500);
        assert.equal(weightGramsFromKg('432.5'), 432500);
    });

    it('fieldKeyHex is the blake2b-256 of the field name', () => {
        assert.equal(fieldKeyHex('carbonFootprintKgCO2'), blake2b256Hex('carbonFootprintKgCO2'));
        assert.match(fieldKeyHex('capacityKwh'), /^[0-9a-f]{64}$/);
    });
});

describe('bytes', () => {
    it('hex helpers roundtrip and u64be range-checks', () => {
        const hex = 'ab'.repeat(32);
        assert.equal(toHex(fromHex32(hex)), hex);
        assert.equal(toHex(fromHex32('0x' + hex)), hex);
        assert.deepEqual([...u64be(1n)], [0, 0, 0, 0, 0, 0, 0, 1]);
        assert.throws(() => u64be(-1n), /Uint64/);
        assert.throws(() => u64be(1n << 64n), /Uint64/);
    });

    it('concatBytes joins in order', () => {
        assert.deepEqual([...concatBytes(new Uint8Array([1, 2]), new Uint8Array([]), new Uint8Array([3]))], [1, 2, 3]);
    });
});
