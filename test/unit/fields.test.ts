import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BATTERY_PROVABLE_FIELDS, RECYCLED_MATERIAL_FIELDS, DYNAMIC_PROVABLE_FIELDS,
    STRING_PROVABLE_FIELDS, PROVABLE_FIELDS, provableFieldKind,
    VALUE_SCALE, scaleValue, weightGramsFromKg, fieldKeyHex, fromHex32, toHex, u64be,
    fieldValuesFor
} from '../../src/fields';
import { blake2b256Hex } from '../../src/hash';

describe('provable-field registry', () => {
    it('keeps the anchored slot order: battery, recycled, dynamic, string', () => {
        assert.deepEqual([...PROVABLE_FIELDS], [
            ...BATTERY_PROVABLE_FIELDS, ...RECYCLED_MATERIAL_FIELDS,
            ...DYNAMIC_PROVABLE_FIELDS, ...STRING_PROVABLE_FIELDS,
        ]);
        assert.equal(PROVABLE_FIELDS.length, 13);
        assert.equal(PROVABLE_FIELDS[0], 'carbonFootprintKgCO2');
        assert.equal(PROVABLE_FIELDS[12], 'cellChemistry');
    });

    it('classifies leaf encodings', () => {
        assert.equal(provableFieldKind('capacityKwh'), 'numeric');
        assert.equal(provableFieldKind('CapacityFade'), 'numeric');
        assert.equal(provableFieldKind('cellChemistry'), 'string');
        assert.equal(provableFieldKind('nope'), null);
    });
});

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

    it('hex helpers roundtrip and u64be range-checks', () => {
        const hex = 'ab'.repeat(32);
        assert.equal(toHex(fromHex32(hex)), hex);
        assert.equal(toHex(fromHex32('0x' + hex)), hex);
        assert.deepEqual([...u64be(1n)], [0, 0, 0, 0, 0, 0, 0, 1]);
        assert.throws(() => u64be(-1n), /Uint64/);
        assert.throws(() => u64be(1n << 64n), /Uint64/);
    });
});

describe('fieldValuesFor', () => {
    const passport = {
        batteries: [{
            carbonFootprintKgCO2: 3412.75, capacityKwh: 75, recycledContentPct: 12.5,
            cycleLife: 1800, roundTripEfficiencyPct: 96, leadContentPpm: null,
            cellChemistry: 'NMC-811', serialNumber: 'SN-1',
        }],
        recycledMaterials: [
            { material: 'Co', recycledPercentage: 16.5 },
            { material: 'Xx', recycledPercentage: 1 }, // unknown material code: ignored
            { material: 'Li', recycledPercentage: null }, // null: ignored
        ],
    };

    it('collects battery scalars, string fields and recycled percentages', () => {
        const values = fieldValuesFor(passport);
        assert.equal(values.capacityKwh, 75);
        assert.equal(values.cellChemistry, 'NMC-811');
        assert.equal(values.recycledCoPct, 16.5);
        assert.equal('leadContentPpm' in values, false);
        assert.equal('recycledXxPct' in values, false);
        assert.equal('recycledLiPct' in values, false);
        assert.equal('serialNumber' in values, false);
    });

    it('merges extra values (dynamic measurements) and drops empties', () => {
        const values = fieldValuesFor(passport, { CapacityFade: 4.8, RemainingCapacity: '', NumberOfFullChargingAndDischargingCycles: null });
        assert.equal(values.CapacityFade, 4.8);
        assert.equal('RemainingCapacity' in values, false);
        assert.equal('NumberOfFullChargingAndDischargingCycles' in values, false);
    });
});
