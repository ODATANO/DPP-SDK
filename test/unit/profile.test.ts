import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    defineProfile, projectPayload, redactRow, redactChildRow, collectFieldValues,
    panelOf, fieldKindOf, type ProductProfile,
} from '../../src/profile';
import { hashPayload } from '../../src/hash';
import { BATTERY_PROFILE, BATTERY_PANEL } from '../../src/battery/profile';

/**
 * The engine must work for a product family the SDK has never seen. A toy
 * textile profile (ESPR delegated-act style) drives every generic function.
 */
const TEXTILE: ProductProfile = defineProfile({
    id: 'textile',
    payloadVersion: 1,
    children: {
        components: {
            columns: { name: 'string', fibre: 'string', sharePct: 'number', originCountry: 'string' },
            sortBy: ['name'],
            authorityColumns: ['originCountry'],
        },
        careLabels: {
            columns: { code: 'string' },
            sortBy: ['code'],
            minLevel: 'public',
        },
        audits: {
            columns: { auditor: 'string', sha256: 'string' },
            sortBy: ['sha256'],
            minLevel: 'authority',
        },
    },
    provableFields: [
        { name: 'recycledFibrePct', kind: 'numeric', source: { child: 'components', column: 'sharePct', match: { column: 'fibre', value: 'rPET' } } },
        { name: 'waterUseLitres', kind: 'numeric' },
        { name: 'mainFibre', kind: 'string', source: { child: 'components', column: 'fibre' } },
    ],
    authorityFields: ['supplierContract'],
});

const garment = () => ({
    passportId: 'TX-1', supplierContract: 'C-77',
    components: [
        { name: 'shell', fibre: 'rPET', sharePct: '62.5', originCountry: 'PT' },
        { name: 'lining', fibre: 'cotton', sharePct: 37.5, originCountry: null },
    ],
    careLabels: [{ code: 'wash30' }],
    audits: [{ auditor: 'Audit AG', sha256: 'f'.repeat(64) }],
    attributes: [
        { section: 'Care', attribute: 'Ironing', valueJson: '"low"', accessClass: 'public' as const },
        { section: 'Supply', attribute: 'Mill', valueJson: '"M-9"', accessClass: 'legitimateInterest' as const },
    ],
});

describe('defineProfile', () => {
    it('rejects the reserved attributes key, duplicate fields and unknown child sources', () => {
        assert.throws(() => defineProfile({ ...TEXTILE, children: { ...TEXTILE.children, attributes: TEXTILE.children.careLabels } }), /reserved/);
        assert.throws(() => defineProfile({ ...TEXTILE, provableFields: [...TEXTILE.provableFields, TEXTILE.provableFields[0]] }), /duplicate/);
        assert.throws(() => defineProfile({
            ...TEXTILE, provableFields: [{ name: 'x', kind: 'numeric', source: { child: 'nope', column: 'y' } }],
        }), /unknown child/);
    });
});

describe('projectPayload on a non-battery profile', () => {
    it('projects, coerces numbers, drops empties, sorts and hashes deterministically', () => {
        const a = projectPayload(TEXTILE, garment());
        assert.equal(a.payloadVersion, 1);
        const components = a.components as Record<string, unknown>[];
        assert.deepEqual(components.map((c) => c.name), ['lining', 'shell']);
        assert.equal(components[1].sharePct, 62.5);
        assert.equal('originCountry' in components[0], false);
        assert.equal('supplierContract' in a, false, 'head columns never enter the payload');
        const reversed = garment();
        reversed.components.reverse();
        assert.equal(hashPayload(a).payloadHash, hashPayload(projectPayload(TEXTILE, reversed)).payloadHash);
    });

    it('missing children project as empty arrays', () => {
        const p = projectPayload(TEXTILE, { attributes: [] });
        assert.deepEqual(p.components, []);
        assert.deepEqual(p.audits, []);
        assert.deepEqual(p.attributes, []);
    });
});

describe('redactRow on a non-battery profile', () => {
    it('public keeps public-level children only, loses classified attributes', () => {
        const r = garment();
        redactRow(TEXTILE, r, 'public', ['payloadHash']);
        assert.equal('supplierContract' in r, false);
        assert.deepEqual(r.components, []);
        assert.deepEqual(r.careLabels, [{ code: 'wash30' }]);
        assert.deepEqual(r.audits, []);
        assert.deepEqual(r.attributes.map((a) => a.attribute), ['Ironing']);
    });

    it('legitimateInterest sees components minus authority columns, no audits', () => {
        const r = garment();
        redactRow(TEXTILE, r, 'legitimateInterest');
        assert.equal(r.components.length, 2);
        assert.equal('originCountry' in r.components[0], false);
        assert.equal(r.components[0].fibre, 'rPET');
        assert.deepEqual(r.audits, []);
        assert.equal(r.attributes.length, 2);
    });

    it('authority sees everything', () => {
        const r = garment();
        redactRow(TEXTILE, r, 'authority');
        assert.equal(r.supplierContract, 'C-77');
        assert.equal(r.components[0].originCountry, 'PT');
        assert.equal(r.audits.length, 1);
    });

    it('redactChildRow empties rows below the child minLevel', () => {
        const c: Record<string, unknown> = { name: 'shell', originCountry: 'PT' };
        redactChildRow(TEXTILE.children.components, c, 'public');
        assert.deepEqual(c, {});
        const c2: Record<string, unknown> = { name: 'shell', originCountry: 'PT' };
        redactChildRow(TEXTILE.children.components, c2, 'legitimateInterest');
        assert.deepEqual(c2, { name: 'shell' });
    });
});

describe('collectFieldValues', () => {
    it('reads matched rows, first rows and extras; drops empties', () => {
        const v = collectFieldValues(TEXTILE, garment(), { waterUseLitres: 1200, ignored: 5 });
        assert.deepEqual(v, { recycledFibrePct: '62.5', waterUseLitres: 1200, mainFibre: 'rPET' });
        const none = collectFieldValues(TEXTILE, { components: [] }, { waterUseLitres: '' });
        assert.deepEqual(none, {});
    });

    it('panelOf and fieldKindOf expose the ordered registry', () => {
        assert.deepEqual(panelOf(TEXTILE), ['recycledFibrePct', 'waterUseLitres', 'mainFibre']);
        assert.equal(fieldKindOf(TEXTILE, 'mainFibre'), 'string');
        assert.equal(fieldKindOf(TEXTILE, 'nope'), null);
    });
});

describe('battery profile through the same engine', () => {
    it('keeps the anchored 13-slot order: battery, recycled, dynamic, string', () => {
        assert.deepEqual(panelOf(BATTERY_PROFILE), [...BATTERY_PANEL]);
        assert.equal(BATTERY_PANEL.length, 13);
        assert.equal(BATTERY_PANEL[0], 'carbonFootprintKgCO2');
        assert.equal(BATTERY_PANEL[12], 'cellChemistry');
        assert.equal(fieldKindOf(BATTERY_PROFILE, 'CapacityFade'), 'numeric');
        assert.equal(fieldKindOf(BATTERY_PROFILE, 'cellChemistry'), 'string');
    });

    const passport = {
        batteries: [{
            carbonFootprintKgCO2: 3412.75, capacityKwh: 75, recycledContentPct: 12.5,
            cycleLife: 1800, roundTripEfficiencyPct: 96, leadContentPpm: null,
            cellChemistry: 'NMC-811', serialNumber: 'SN-1',
        }],
        recycledMaterials: [
            { material: 'Co', recycledPercentage: 16.5 },
            { material: 'Xx', recycledPercentage: 1 },
            { material: 'Li', recycledPercentage: null },
        ],
    };

    it('collects battery scalars, string fields and recycled percentages', () => {
        const values = collectFieldValues(BATTERY_PROFILE, passport);
        assert.equal(values.capacityKwh, 75);
        assert.equal(values.cellChemistry, 'NMC-811');
        assert.equal(values.recycledCoPct, 16.5);
        assert.equal('leadContentPpm' in values, false);
        assert.equal('recycledXxPct' in values, false);
        assert.equal('recycledLiPct' in values, false);
        assert.equal('serialNumber' in values, false);
    });

    it('merges dynamic measurements and drops empties', () => {
        const values = collectFieldValues(BATTERY_PROFILE, passport, { CapacityFade: 4.8, RemainingCapacity: '', NumberOfFullChargingAndDischargingCycles: null });
        assert.equal(values.CapacityFade, 4.8);
        assert.equal('RemainingCapacity' in values, false);
        assert.equal('NumberOfFullChargingAndDischargingCycles' in values, false);
    });

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
        ] as any[],
    });

    it('public sees Point 1 only: lineage stripped, children emptied', () => {
        const r = row();
        redactRow(BATTERY_PROFILE, r, 'public', AUTHORITY_FIELDS);
        for (const f of AUTHORITY_FIELDS) assert.equal(f in r, false, f);
        assert.deepEqual(r.batteries, []);
        assert.deepEqual(r.recycledMaterials, []);
        assert.deepEqual(r.diligenceDocs, []);
        assert.deepEqual(r.attributes.map((a) => a.attribute), ['A']);
        assert.equal(r.model, 'PowerCell EV-75');
    });

    it('legitimateInterest sees children without supplier identities, no docs', () => {
        const r = row();
        redactRow(BATTERY_PROFILE, r, 'legitimateInterest', AUTHORITY_FIELDS);
        assert.equal('payloadHash' in r, false);
        assert.equal(r.batteries[0].cellChemistry, 'NMC-811');
        assert.equal('carbonFootprintKgCO2' in r.batteries[0], false);
        assert.equal('supplierName' in r.batteries[0], false);
        assert.equal('sourceSupplierName' in r.recycledMaterials[0], false);
        assert.deepEqual(r.diligenceDocs, []);
        assert.deepEqual(r.attributes.map((a) => a.attribute), ['A', 'B']);
    });

    it('authority sees everything', () => {
        const r = row();
        redactRow(BATTERY_PROFILE, r, 'authority', AUTHORITY_FIELDS);
        assert.equal(r.payloadHash, 'ph');
        assert.equal(r.batteries[0].supplierName, 'CathodeWorks');
        assert.equal(r.recycledMaterials[0].sourceSupplierName, 'ReCobalt');
        assert.equal(r.diligenceDocs.length, 1);
        assert.equal(r.attributes.length, 4);
    });
});
