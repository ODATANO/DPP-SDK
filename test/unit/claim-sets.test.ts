import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateClaimSets, claimSetById, claimSetsForField, setLabelFor, MAX_SET_VALUES } from '../../src/claim-sets';
import { BATTERY_CLAIM_SETS, CHEMISTRY_CODES } from '../../src/battery/claim-sets';

const SETS = [
    { id: 'fibre-natural', label: 'Natural fibres', sourceField: 'mainFibre', values: ['cotton', 'wool', 'linen'] },
    { id: 'fibre-recycled', label: 'Recycled fibres', sourceField: 'mainFibre', values: ['rPET', 'rCotton'] },
    { id: 'origin-eu', label: 'EU origin', sourceField: 'originCountry', values: ['DE', 'PT'] },
];

describe('claim-set catalog', () => {
    it('lookups are catalog-scoped', () => {
        assert.equal(claimSetById(SETS, 'origin-eu')?.label, 'EU origin');
        assert.deepEqual(claimSetsForField(SETS, 'mainFibre').map((s) => s.id), ['fibre-natural', 'fibre-recycled']);
        assert.equal(setLabelFor(SETS, 'fibre-natural'), 'Natural fibres');
        assert.equal(setLabelFor(SETS, 'foreign'), 'foreign');
        assert.equal(setLabelFor(SETS, null), 'allowed set');
    });

    it('validateClaimSets rejects duplicate ids, empty or oversized sets', () => {
        validateClaimSets(SETS);
        assert.throws(() => validateClaimSets([...SETS, SETS[0]]), /not unique/);
        assert.throws(() => validateClaimSets([{ ...SETS[0], id: 'e', values: [] }]), /no members/);
        assert.throws(() => validateClaimSets([{ ...SETS[0], id: 'd', values: ['a', 'a'] }]), /duplicate members/);
        const big = Array.from({ length: MAX_SET_VALUES + 1 }, (_, i) => `v${i}`);
        assert.throws(() => validateClaimSets([{ ...SETS[0], id: 'big', values: big }]), /exceeds/);
    });

    it('battery catalog keeps the frozen chemistry spellings', () => {
        assert.deepEqual([...claimSetById(BATTERY_CLAIM_SETS, 'chemistry-known')!.values], [...CHEMISTRY_CODES]);
        assert.ok(claimSetById(BATTERY_CLAIM_SETS, 'chemistry-cobalt-free')!.values.includes('Li-ion LFP'));
    });
});
