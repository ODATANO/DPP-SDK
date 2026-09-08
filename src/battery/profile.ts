/**
 * EU Battery Regulation (2023/1542, Annex XIII) product profile. The child
 * columns and payloadVersion 2 are the frozen hash contract pinned by the
 * golden vectors. The 13-slot panel order is frozen shared vocabulary: leaf
 * index = position. Extend it in ONE batch with a re-anchor round.
 */
import { defineProfile, type ProductProfile, type ProvableFieldSpec } from '../profile';

/** Provable scalar fields read from the (first) battery row. */
export const BATTERY_PROVABLE_FIELDS = [
    'carbonFootprintKgCO2', 'capacityKwh', 'recycledContentPct',
    'cycleLife', 'roundTripEfficiencyPct', 'leadContentPpm',
] as const;

/** Per-material recycled content, key convention `recycled<Material>Pct` (Co|Li|Ni). */
export const RECYCLED_MATERIAL_FIELDS = ['recycledCoPct', 'recycledLiPct', 'recycledNiPct'] as const;

/** Measured (BMS) fields named like the guide attributes; only changed/unchanged is ever proven. */
export const DYNAMIC_PROVABLE_FIELDS = [
    'CapacityFade', 'RemainingCapacity', 'NumberOfFullChargingAndDischargingCycles',
] as const;

/** Provable string fields; leaves carry the blake2b-256 of the EXACT string. */
export const BATTERY_STRING_FIELDS = ['cellChemistry'] as const;

/** The full ordered panel. Strings sit AFTER all numeric fields. */
export const BATTERY_PANEL = [
    ...BATTERY_PROVABLE_FIELDS, ...RECYCLED_MATERIAL_FIELDS, ...DYNAMIC_PROVABLE_FIELDS, ...BATTERY_STRING_FIELDS,
] as const;

const fields: ProvableFieldSpec[] = [
    ...BATTERY_PROVABLE_FIELDS.map((name) => ({ name, kind: 'numeric' as const, source: { child: 'batteries', column: name } })),
    ...RECYCLED_MATERIAL_FIELDS.map((name) => ({
        name, kind: 'numeric' as const,
        source: { child: 'recycledMaterials', column: 'recycledPercentage', match: { column: 'material', value: name.slice(8, 10) } },
    })),
    ...DYNAMIC_PROVABLE_FIELDS.map((name) => ({ name, kind: 'numeric' as const })),
    ...BATTERY_STRING_FIELDS.map((name) => ({ name, kind: 'string' as const, source: { child: 'batteries', column: name } })),
];

export const BATTERY_PROFILE: ProductProfile = defineProfile({
    id: 'battery',
    payloadVersion: 2,
    children: {
        batteries: {
            columns: {
                serialNumber: 'string', cellChemistry: 'string', capacityKwh: 'number',
                carbonFootprintKgCO2: 'number', supplierName: 'string', recycledContentPct: 'number',
                cycleLife: 'number', roundTripEfficiencyPct: 'number', leadContentPpm: 'number',
            },
            sortBy: ['serialNumber'],
            authorityColumns: ['carbonFootprintKgCO2', 'supplierName'],
        },
        recycledMaterials: {
            columns: { material: 'string', recycledPercentage: 'number', sourceSupplierName: 'string' },
            sortBy: ['material'],
            authorityColumns: ['sourceSupplierName'],
        },
        // Evidence is bound in by sha256; docType-only placeholder rows stay hashable.
        diligenceDocs: {
            columns: { docType: 'string', fileName: 'string', sha256: 'string' },
            sortBy: ['docType', 'fileName', 'sha256'],
            minLevel: 'authority',
        },
    },
    provableFields: fields,
});
