import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildClaimCart, type ClaimCartOptions, type PlannedCartClaim } from '../../src/claim-cart';
import { BATTERY_CLAIM_SETS } from '../../src/battery/claim-sets';

const OPTS: ClaimCartOptions = {
    provableFields: ['carbonFootprintKgCO2', 'capacityKwh', 'recycledCoPct', 'cellChemistry'],
    claimSets: BATTERY_CLAIM_SETS,
    maxClaims: 3,
    // Cardano-shaped exclusivity: one claim per verifier policy (operator).
    groupOf: (c: PlannedCartClaim) => (c.kind === 'membership' ? 'membership' : c.predicate),
};

describe('buildClaimCart', () => {
    it('normalizes a mixed cart and scales thresholds x1000', () => {
        const plan = buildClaimCart([
            { sourceField: 'carbonFootprintKgCO2', predicate: 'lessOrEqual', threshold: 4000 },
            { sourceField: 'capacityKwh', predicate: 'greaterOrEqual', threshold: '60' },
            { kind: 'membership', sourceField: 'cellChemistry', setId: 'chemistry-known' },
        ], OPTS);
        assert.equal(plan.claims.length, 3);
        assert.equal(plan.dropped.length, 0);
        assert.deepEqual(plan.claims[0], {
            kind: 'threshold', sourceField: 'carbonFootprintKgCO2', predicate: 'lessOrEqual',
            thresholdScaled: '4000000', key: 't|carbonFootprintKgCO2|lessOrEqual|4000000',
        });
        assert.equal((plan.claims[1] as any).thresholdScaled, '60000');
        const membership = plan.claims[2] as any;
        assert.equal(membership.setId, 'chemistry-known');
        assert.ok(membership.setValues.includes('Li-ion NMC'));
    });

    it('drops exact duplicates and reports them', () => {
        const plan = buildClaimCart([
            { sourceField: 'capacityKwh', predicate: 'greaterOrEqual', threshold: 60 },
            { sourceField: 'capacityKwh', predicate: 'greaterOrEqual', threshold: '60' },
        ], OPTS);
        assert.equal(plan.claims.length, 1);
        assert.equal(plan.dropped.length, 1);
    });

    it('rejects two claims needing the same verifier group', () => {
        assert.throws(() => buildClaimCart([
            { sourceField: 'carbonFootprintKgCO2', predicate: 'lessOrEqual', threshold: 4000 },
            { sourceField: 'recycledCoPct', predicate: 'lessOrEqual', threshold: 50 },
        ], OPTS), /both need the lessOrEqual verifier/);
    });

    it('enforces the per-transaction cap AFTER dedupe', () => {
        const claims = [
            { sourceField: 'carbonFootprintKgCO2', predicate: 'lessOrEqual', threshold: 1 },
            { sourceField: 'capacityKwh', predicate: 'greaterOrEqual', threshold: 2 },
            { kind: 'membership', sourceField: 'cellChemistry', setId: 'chemistry-known' },
            { sourceField: 'recycledCoPct', predicate: 'greaterOrEqual', threshold: 3 },
        ] as const;
        assert.throws(() => buildClaimCart(claims as any, { ...OPTS, groupOf: undefined }),
            /too many claims .* 4 distinct, maximum 3/);
        // the same 4 with a duplicate collapses under the cap
        const collapsed = buildClaimCart([claims[0], claims[1], claims[2], claims[2]] as any, OPTS);
        assert.equal(collapsed.claims.length, 3);
    });

    it('rejects unknown fields, unknown sets, mismatched sets and bad thresholds', () => {
        assert.throws(() => buildClaimCart([{ sourceField: 'nope', predicate: 'lessOrEqual', threshold: 1 }], OPTS),
            /not a provable field/);
        assert.throws(() => buildClaimCart([{ kind: 'membership', sourceField: 'cellChemistry', setId: 'nope' }], OPTS),
            /unknown claim set/);
        assert.throws(() => buildClaimCart([{ kind: 'membership', sourceField: 'capacityKwh', setId: 'chemistry-known' }], OPTS),
            /applies to cellChemistry/);
        assert.throws(() => buildClaimCart([{ sourceField: 'capacityKwh', predicate: 'greaterOrEqual', threshold: 'x' }], OPTS),
            /threshold must be a number/);
        assert.throws(() => buildClaimCart([], OPTS), /at least one claim/);
    });
});
