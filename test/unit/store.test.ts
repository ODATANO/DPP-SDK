import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DocumentStore, filterDocument, mergePatch, splitElementPath, getElement, patchElement,
    productIdOf, dppIdOf, statusOf, touchLastUpdate, roleLevel, type DocumentProfile,
} from '../../src/store';
import { BATTERY_DOCUMENT } from '../../src/battery/document';

/**
 * Versioned store semantics (new active version per update, archived/deleted
 * invisible to normal reads), RFC 7396 merge patch, element paths and
 * access-class document filtering, driven by two document profiles: the
 * wrapped battery guide document and a flat non-battery one.
 */

const DOC = {
    Battery_Passport: {
        IdentifiersAndProductData: {
            UniqueBatteryIdentifierUniqueProductIdentifier: 'urn:x:prod-1',
            BatteryModelIdentifier: 'Model X',
            BatteryStatus: { batteryStatusValues: 'original' },
        },
        PerformanceAndDurability: {
            RatedCapacity: { amperehourMiliamperehourValue: 200 },
            StateOfChargeSoC: { percentageValue: 64 },
        },
        SymbolsLabelsAndDocumentationOfConformity: {
            EUDeclarationOfConformity: 'urn:x:doc',
            ResultsOfTestReportsProvingCompliance: 'urn:x:secret',
        },
    },
};

const TEXTILE_DOC: DocumentProfile = {
    identifiersSection: 'Identification',
    dppIdAttribute: 'dppId',
    productIdAttribute: 'gtin',
    statusAttribute: 'Status',
    statusValueKey: 'value',
    lastUpdateAttribute: 'updatedAt',
    access: { MillContract: 'legitimateInterest', CustomsFile: 'authority' },
    idPrefix: 'urn:textile:',
};

const TDOC = {
    Identification: { dppId: 'urn:textile:1', gtin: '0400000000001', Status: { value: 'Draft' } },
    Supply: { MillContract: 'M-9', CustomsFile: 'CF-1', Country: 'PT' },
};

describe('document filtering', () => {
    it('public sees only public attributes of the battery guide document', () => {
        const f = filterDocument(BATTERY_DOCUMENT, DOC, 'public') as any;
        const bp = f.Battery_Passport;
        assert.equal(bp.IdentifiersAndProductData.BatteryModelIdentifier, 'Model X');
        assert.equal(bp.IdentifiersAndProductData.BatteryStatus, undefined);
        assert.equal(bp.PerformanceAndDurability.StateOfChargeSoC, undefined);
        assert.equal(bp.PerformanceAndDurability.RatedCapacity.amperehourMiliamperehourValue, 200);
        assert.equal(bp.SymbolsLabelsAndDocumentationOfConformity.ResultsOfTestReportsProvingCompliance, undefined);
    });
    it('legitimateInterest sees LI but not authority-only', () => {
        const f = filterDocument(BATTERY_DOCUMENT, DOC, 'legitimateInterest') as any;
        assert.ok(f.Battery_Passport.IdentifiersAndProductData.BatteryStatus);
        assert.equal(f.Battery_Passport.SymbolsLabelsAndDocumentationOfConformity.ResultsOfTestReportsProvingCompliance, undefined);
    });
    it('roles map onto levels: authority and commission see everything', () => {
        assert.equal(roleLevel('public'), 'public');
        assert.equal(roleLevel('legitimate_interest'), 'legitimateInterest');
        for (const role of ['authority', 'commission'] as const) {
            const f = filterDocument(BATTERY_DOCUMENT, DOC, roleLevel(role)) as any;
            assert.equal(f.Battery_Passport.SymbolsLabelsAndDocumentationOfConformity.ResultsOfTestReportsProvingCompliance, 'urn:x:secret');
        }
    });
    it('works on a flat non-battery document', () => {
        const pub = filterDocument(TEXTILE_DOC, TDOC, 'public') as any;
        assert.deepEqual(pub.Supply, { Country: 'PT' });
        const li = filterDocument(TEXTILE_DOC, TDOC, 'legitimateInterest') as any;
        assert.deepEqual(li.Supply, { MillContract: 'M-9', Country: 'PT' });
    });
});

describe('merge patch (RFC 7396)', () => {
    it('merges nested objects, null deletes, scalars replace', () => {
        const out = mergePatch({ a: { b: 1, c: 2 }, d: 3 }, { a: { b: 9, c: null }, e: 4 }) as any;
        assert.deepEqual(out, { a: { b: 9 }, d: 3, e: 4 });
    });
    it('replaces arrays and non-objects wholesale', () => {
        assert.deepEqual(mergePatch({ a: [1, 2] }, { a: [3] }), { a: [3] });
        assert.equal(mergePatch({ x: 1 }, 5), 5);
    });
});

describe('element paths', () => {
    it('splits on /, . and : and tolerates the wrapper segment', () => {
        assert.deepEqual(splitElementPath('Battery_Passport/PerformanceAndDurability/RatedCapacity'),
            ['Battery_Passport', 'PerformanceAndDurability', 'RatedCapacity']);
        const viaDots = getElement(BATTERY_DOCUMENT, DOC, splitElementPath('PerformanceAndDurability.RatedCapacity'));
        const viaWrapper = getElement(BATTERY_DOCUMENT, DOC, splitElementPath('Battery_Passport/PerformanceAndDurability/RatedCapacity'));
        assert.deepEqual(viaDots, viaWrapper);
        assert.equal(getElement(TEXTILE_DOC, TDOC, ['Supply', 'Country']), 'PT');
    });
    it('patchElement creates a new document and can delete via null', () => {
        const patched = patchElement(BATTERY_DOCUMENT, DOC, ['PerformanceAndDurability', 'RatedCapacity'], { amperehourMiliamperehourValue: 180 }) as any;
        assert.equal(patched.Battery_Passport.PerformanceAndDurability.RatedCapacity.amperehourMiliamperehourValue, 180);
        assert.equal((DOC as any).Battery_Passport.PerformanceAndDurability.RatedCapacity.amperehourMiliamperehourValue, 200);
        const deleted = patchElement(BATTERY_DOCUMENT, DOC, ['PerformanceAndDurability'], { StateOfChargeSoC: null }) as any;
        assert.equal(deleted.Battery_Passport.PerformanceAndDurability.StateOfChargeSoC, undefined);
        const flat = patchElement(TEXTILE_DOC, TDOC, ['Supply', 'Country'], 'DE') as any;
        assert.equal(flat.Supply.Country, 'DE');
        assert.equal(TDOC.Supply.Country, 'PT');
    });
    it('identifier readers follow the profile', () => {
        assert.equal(productIdOf(BATTERY_DOCUMENT, DOC), 'urn:x:prod-1');
        assert.equal(dppIdOf(TEXTILE_DOC, TDOC), 'urn:textile:1');
        assert.equal(productIdOf(TEXTILE_DOC, TDOC), '0400000000001');
        assert.equal(statusOf(TEXTILE_DOC, TDOC), 'draft');
        const touched = touchLastUpdate(TEXTILE_DOC, TDOC, '2026-09-08T10:00:00.123Z') as any;
        assert.equal(touched.Identification.updatedAt, '2026-09-08T10:00:00Z');
    });
});

describe('DocumentStore versioning', () => {
    it('update supersedes with a new active version; history stays readable by date', () => {
        const s = new DocumentStore(BATTERY_DOCUMENT);
        const v1 = s.insert({ dppId: 'dpp-1', productId: 'p-1', document: { a: 1 }, at: '2026-01-01T00:00:00Z' });
        assert.equal(v1.version, 1);
        const v2 = s.update('dpp-1', { a: 2 }, '2026-06-01T00:00:00Z');
        assert.equal(v2?.version, 2);
        assert.deepEqual(s.current('dpp-1')?.document, { a: 2 });
        assert.deepEqual(s.byProductAndDate('p-1', '2026-03-01T00:00:00Z')?.document, { a: 1 });
        assert.deepEqual(s.byProductAndDate('p-1', '2026-07-01T00:00:00Z')?.document, { a: 2 });
    });
    it('archived and deleted DPPs are invisible to normal reads', () => {
        const s = new DocumentStore(BATTERY_DOCUMENT);
        s.insert({ dppId: 'dpp-a', productId: 'p-a', status: 'archived', document: {} });
        assert.equal(s.current('dpp-a'), undefined);
        s.insert({ dppId: 'dpp-d', productId: 'p-d', document: {} });
        assert.equal(s.delete('dpp-d')?.status, 'deleted');
        assert.equal(s.current('dpp-d'), undefined);
        assert.equal(s.activeByProduct('p-d'), undefined);
        assert.equal(s.update('dpp-d', { x: 1 }), undefined);
    });
    it('activateByProduct activates a draft by product id', () => {
        const s = new DocumentStore(BATTERY_DOCUMENT);
        s.insert({ dppId: 'dpp-m', productId: 'p-m', status: 'draft', document: { ok: true } });
        assert.equal(s.activeByProduct('p-m'), undefined);
        const row = s.activateByProduct('p-m');
        assert.equal(row?.status, 'active');
        assert.deepEqual(s.activeByProduct('p-m')?.document, { ok: true });
    });
    it('insert derives ids and status from the document per profile', () => {
        const s = new DocumentStore(BATTERY_DOCUMENT);
        const row = s.insert({ document: DOC });
        assert.equal(row.productId, 'urn:x:prod-1');
        assert.ok(row.dppId.startsWith('urn:odatano:dpp:'));
        const t = new DocumentStore(TEXTILE_DOC);
        const trow = t.insert({ document: TDOC });
        assert.equal(trow.dppId, 'urn:textile:1');
        assert.equal(trow.productId, '0400000000001');
        assert.equal(trow.status, 'draft');
        const anon = t.insert({ document: { Identification: {} } });
        assert.ok(anon.dppId.startsWith('urn:textile:'));
    });
});
