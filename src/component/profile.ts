/**
 * Component passport profile for safety-related engineered parts (pressure
 * boundary and structural components of nuclear or other regulated plants).
 * Material certificates, qualification tests and the custody trail stay off
 * chain; provable claims cover material properties and composition. The panel
 * order is frozen shared vocabulary: leaf index = position.
 */
import { defineProfile, type ProductProfile, type ProvableFieldSpec } from '../profile';

/** Provable scalar fields read from the (first) material certificate. */
export const COMPONENT_NUMERIC_FIELDS = [
    'yieldStrengthMpa', 'tensileStrengthMpa', 'hardnessHb', 'cobaltContentPpm', 'wallThicknessMm',
] as const;

/** Provable string fields; leaves carry the blake2b-256 of the EXACT string. */
export const COMPONENT_STRING_FIELDS = ['materialGrade', 'supplierId', 'testMethod'] as const;

/** The full ordered panel. Strings sit AFTER all numeric fields. */
export const COMPONENT_PANEL = [...COMPONENT_NUMERIC_FIELDS, ...COMPONENT_STRING_FIELDS] as const;

const fields: ProvableFieldSpec[] = [
    ...COMPONENT_NUMERIC_FIELDS.map((name) => ({
        name, kind: 'numeric' as const, source: { child: 'materialCertificates', column: name },
    })),
    { name: 'materialGrade', kind: 'string', source: { child: 'materialCertificates', column: 'materialGrade' } },
    { name: 'supplierId', kind: 'string', source: { child: 'materialCertificates', column: 'supplierId' } },
    { name: 'testMethod', kind: 'string', source: { child: 'qualificationTests', column: 'testMethod' } },
];

export const COMPONENT_PROFILE: ProductProfile = defineProfile({
    id: 'component',
    payloadVersion: 1,
    children: {
        materialCertificates: {
            columns: {
                heatNumber: 'string', materialGrade: 'string', supplierId: 'string', supplierName: 'string',
                yieldStrengthMpa: 'number', tensileStrengthMpa: 'number', hardnessHb: 'number',
                cobaltContentPpm: 'number', wallThicknessMm: 'number', certificateSha256: 'string',
            },
            sortBy: ['heatNumber'],
            authorityColumns: ['supplierId', 'supplierName'],
        },
        qualificationTests: {
            columns: {
                standard: 'string', testMethod: 'string', result: 'string', reportSha256: 'string', inspectorId: 'string',
            },
            sortBy: ['standard', 'testMethod'],
            authorityColumns: ['inspectorId'],
        },
        // Every handover of the part; the chain of custody is evidence, not public data.
        custodyRecords: {
            columns: { step: 'number', fromParty: 'string', toParty: 'string', transferredOn: 'string', recordSha256: 'string' },
            sortBy: ['step'],
            minLevel: 'authority',
        },
    },
    provableFields: fields,
});
