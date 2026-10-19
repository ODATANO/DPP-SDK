import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectPayload, redactRow, collectFieldValues, panelOf, fieldKindOf } from '../../src/profile';
import { hashPayload } from '../../src/hash';
import { claimSetById, claimSetsForField } from '../../src/claim-sets';
import { COMPONENT_PROFILE, COMPONENT_PANEL, COMPONENT_NUMERIC_FIELDS, COMPONENT_STRING_FIELDS } from '../../src/component/profile';
import { COMPONENT_CLAIM_SETS, APPROVED_MATERIAL_GRADES, QUALIFIED_SUPPLIER_IDS } from '../../src/component/claim-sets';
import { COMPONENT_LIFECYCLE, parseComponentStatus, encodeComponentStatus } from '../../src/component/lifecycle';

const part = () => ({
    passportId: 'CMP-0001',
    materialCertificates: [{
        heatNumber: 'H-77412', materialGrade: 'SA-508 Gr.3 Cl.1', supplierId: 'QSL-0031', supplierName: 'Forge Works',
        yieldStrengthMpa: '485', tensileStrengthMpa: 655, hardnessHb: 207, cobaltContentPpm: 120, wallThicknessMm: 42.5,
        certificateSha256: 'a'.repeat(64),
    }],
    qualificationTests: [
        { standard: 'ASME V Art. 4', testMethod: 'UT', result: 'pass', reportSha256: 'b'.repeat(64), inspectorId: 'INS-9' },
        { standard: 'ASME V Art. 2', testMethod: 'RT', result: 'pass', reportSha256: 'c'.repeat(64), inspectorId: 'INS-9' },
    ],
    custodyRecords: [{ step: 1, fromParty: 'Forge Works', toParty: 'Plant Stores', transferredOn: '2026-03-02', recordSha256: 'd'.repeat(64) }],
    attributes: [
        { section: 'Identification', attribute: 'SafetyClass', valueJson: '"2"', accessClass: 'public' as const },
        { section: 'Identification', attribute: 'DrawingNumber', valueJson: '"DWG-4411-C"', accessClass: 'legitimateInterest' as const },
    ],
});

// Pinned at the first anchor of the family: a change here is a breaking
// change of the component payload contract.
const PINNED_HASH = '874f4f0f348d764727e9af019e65ff089e4abc51b1abfce23a8dddb59f47e3bb';

describe('component profile', () => {
    it('keeps the frozen panel order: numeric first, strings last', () => {
        assert.deepEqual(panelOf(COMPONENT_PROFILE), [...COMPONENT_PANEL]);
        assert.deepEqual(COMPONENT_PANEL.slice(0, COMPONENT_NUMERIC_FIELDS.length), [...COMPONENT_NUMERIC_FIELDS]);
        assert.deepEqual(COMPONENT_PANEL.slice(COMPONENT_NUMERIC_FIELDS.length), [...COMPONENT_STRING_FIELDS]);
        assert.equal(fieldKindOf(COMPONENT_PROFILE, 'cobaltContentPpm'), 'numeric');
        assert.equal(fieldKindOf(COMPONENT_PROFILE, 'materialGrade'), 'string');
        assert.ok(COMPONENT_PANEL.length <= 16);
    });

    it('projects a canonical payload with sorted children and coerced numbers', () => {
        const payload = projectPayload(COMPONENT_PROFILE, part()) as Record<string, any>;
        assert.equal(payload.payloadVersion, 1);
        assert.equal(payload.materialCertificates[0].yieldStrengthMpa, 485);
        assert.deepEqual(payload.qualificationTests.map((t: any) => t.testMethod), ['RT', 'UT']);
        assert.equal(payload.custodyRecords[0].step, 1);
        assert.deepEqual(payload.attributes.map((a: any) => a.attribute), ['DrawingNumber', 'SafetyClass']);
    });

    it('hashes the sample part to its pinned value', () => {
        const { payloadHash } = hashPayload(projectPayload(COMPONENT_PROFILE, part()));
        assert.equal(payloadHash, PINNED_HASH);
    });

    it('collects the provable values from the certificate and the first test', () => {
        const values = collectFieldValues(COMPONENT_PROFILE, part());
        assert.equal(values.yieldStrengthMpa, '485');
        assert.equal(values.wallThicknessMm, 42.5);
        assert.equal(values.materialGrade, 'SA-508 Gr.3 Cl.1');
        assert.equal(values.supplierId, 'QSL-0031');
        assert.equal(values.testMethod, 'UT');
    });

    it('redacts supplier identity and custody below authority, hides children from the public', () => {
        const pub = part() as Record<string, any>;
        redactRow(COMPONENT_PROFILE, pub, 'public');
        assert.deepEqual(pub.materialCertificates, []);
        assert.deepEqual(pub.custodyRecords, []);
        assert.deepEqual(pub.attributes.map((a: any) => a.attribute), ['SafetyClass']);

        const li = part() as Record<string, any>;
        redactRow(COMPONENT_PROFILE, li, 'legitimateInterest');
        assert.equal(li.materialCertificates[0].yieldStrengthMpa, '485');
        assert.equal(li.materialCertificates[0].supplierName, undefined);
        assert.equal(li.materialCertificates[0].supplierId, undefined);
        assert.equal(li.qualificationTests[0].inspectorId, undefined);
        assert.deepEqual(li.custodyRecords, []);

        const auth = part() as Record<string, any>;
        redactRow(COMPONENT_PROFILE, auth, 'authority');
        assert.equal(auth.materialCertificates[0].supplierName, 'Forge Works');
        assert.equal(auth.custodyRecords.length, 1);
    });
});

describe('component claim sets', () => {
    it('cover every provable string field with at least one list', () => {
        for (const field of COMPONENT_STRING_FIELDS) {
            assert.ok(claimSetsForField(COMPONENT_CLAIM_SETS, field).length >= 1, field);
        }
    });

    it('keeps the frozen member spellings', () => {
        assert.deepEqual([...claimSetById(COMPONENT_CLAIM_SETS, 'grade-approved')!.values], [...APPROVED_MATERIAL_GRADES]);
        assert.deepEqual([...claimSetById(COMPONENT_CLAIM_SETS, 'supplier-qualified')!.values], [...QUALIFIED_SUPPLIER_IDS]);
        for (const g of claimSetById(COMPONENT_CLAIM_SETS, 'grade-austenitic')!.values) {
            assert.ok((APPROVED_MATERIAL_GRADES as readonly string[]).includes(g), g);
        }
    });
});

describe('component lifecycle', () => {
    it('walks the service life and quarantines from any live state', () => {
        assert.equal(COMPONENT_LIFECYCLE.validateTransition('manufactured', 'qualified').ok, true);
        assert.equal(COMPONENT_LIFECYCLE.validateTransition('installed', 'inService').ok, true);
        assert.equal(COMPONENT_LIFECYCLE.validateTransition('inService', 'quarantined').ok, true);
        assert.equal(COMPONENT_LIFECYCLE.validateTransition('quarantined', 'qualified').ok, true);
        assert.equal(COMPONENT_LIFECYCLE.validateTransition('manufactured', 'inService').ok, false);
        assert.equal(COMPONENT_LIFECYCLE.validateTransition('retired', 'qualified').ok, false);
        assert.ok(COMPONENT_LIFECYCLE.isTerminal('retired'));
    });

    it('round-trips the status attribute value', () => {
        assert.equal(parseComponentStatus(encodeComponentStatus('installed')), 'installed');
        assert.equal(parseComponentStatus('"bogus"'), 'manufactured');
        assert.equal(parseComponentStatus(undefined), 'manufactured');
    });
});
