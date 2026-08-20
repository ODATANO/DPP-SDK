import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    maxTier, levelToTier, attributeVisible,
    redactPassport, redactBattery, redactRecycled
} from '../../src/tier';

const AUTHORITY_FIELDS = ['payloadHash', 'passportIdHash', 'attestationTxHash', 'owner'] as const;

const row = () => ({
    passportId: 'BAT-1', model: 'PowerCell EV-75',
    payloadHash: 'ph', passportIdHash: 'pih', attestationTxHash: 'tx', owner: 'addr',
    batteries: [{ cellChemistry: 'NMC-811', capacityKwh: 75, carbonFootprintKgCO2: 3412.75, supplierName: 'CathodeWorks' }],
    recycledMaterials: [{ material: 'Co', recycledPercentage: 16.5, sourceSupplierName: 'ReCobalt' }],
    diligenceDocs: [{ docType: 'audit' }],
    attributes: [
        { attribute: 'A', accessClass: 'public' },
        { attribute: 'B', accessClass: 'legitimateInterest' },
        { attribute: 'C', accessClass: 'authority' },
        { attribute: 'D' }, // no class selected: authority-only (fail closed)
    ],
});

describe('tier model', () => {
    it('maxTier and levelToTier', () => {
        assert.equal(maxTier('consumer', 'recycler'), 'recycler');
        assert.equal(maxTier('authority', 'recycler'), 'authority');
        assert.equal(levelToTier(0), 'consumer');
        assert.equal(levelToTier(1), 'recycler');
        assert.equal(levelToTier(2), 'authority');
        assert.equal(levelToTier(7), 'authority');
    });

    it('attributeVisible maps longlist classes to tiers', () => {
        assert.equal(attributeVisible('public', 'consumer'), true);
        assert.equal(attributeVisible('legitimateInterest', 'consumer'), false);
        assert.equal(attributeVisible('legitimateInterest', 'recycler'), true);
        assert.equal(attributeVisible('authority', 'recycler'), false);
        assert.equal(attributeVisible('authority', 'authority'), true);
    });
});

describe('redaction', () => {
    it('consumer sees Point 1 only: lineage stripped, children emptied', () => {
        const r = row();
        redactPassport(r, 'consumer', AUTHORITY_FIELDS);
        for (const f of AUTHORITY_FIELDS) assert.equal(f in r, false, f);
        assert.deepEqual(r.batteries, []);
        assert.deepEqual(r.recycledMaterials, []);
        assert.deepEqual(r.diligenceDocs, []);
        assert.deepEqual((r.attributes as any[]).map((a) => a.attribute), ['A']);
        assert.equal(r.model, 'PowerCell EV-75');
    });

    it('recycler sees legitimate interest, not supplier identities or docs', () => {
        const r = row();
        redactPassport(r, 'recycler', AUTHORITY_FIELDS);
        assert.equal('payloadHash' in r, false);
        assert.equal((r.batteries[0] as any).cellChemistry, 'NMC-811');
        assert.equal('carbonFootprintKgCO2' in (r.batteries[0] as any), false);
        assert.equal('supplierName' in (r.batteries[0] as any), false);
        assert.equal('sourceSupplierName' in (r.recycledMaterials[0] as any), false);
        assert.deepEqual(r.diligenceDocs, []);
        assert.deepEqual((r.attributes as any[]).map((a) => a.attribute), ['A', 'B']);
    });

    it('authority sees everything', () => {
        const r = row();
        redactPassport(r, 'authority', AUTHORITY_FIELDS);
        assert.equal(r.payloadHash, 'ph');
        assert.equal((r.batteries[0] as any).supplierName, 'CathodeWorks');
        assert.equal((r.recycledMaterials[0] as any).sourceSupplierName, 'ReCobalt');
        assert.equal((r.diligenceDocs as any[]).length, 1);
        assert.equal((r.attributes as any[]).length, 4);
    });

    // Direct child reads (GET /Batteries) must not leak Points 2/3 fields to
    // anonymous callers: a consumer gets fully emptied rows.
    it('direct child redaction empties rows for consumers', () => {
        const b: Record<string, unknown> = { cellChemistry: 'NMC-811', capacityKwh: 75 };
        redactBattery(b, 'consumer');
        assert.deepEqual(b, {});
        const m: Record<string, unknown> = { material: 'Co', sourceSupplierName: 'ReCobalt' };
        redactRecycled(m, 'consumer');
        assert.deepEqual(m, {});
        const m2: Record<string, unknown> = { material: 'Co', sourceSupplierName: 'ReCobalt' };
        redactRecycled(m2, 'recycler');
        assert.deepEqual(m2, { material: 'Co' });
    });
});
