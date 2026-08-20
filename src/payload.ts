/**
 * Canonical payload projection v2 (frozen hashing contract): fixed column
 * projection per child, all numerics coerced via Number() so sqlite numbers
 * and pg decimal strings hash identically, null/undefined omitted, arrays
 * sorted by a stable business key, attributes via hashableAttributes. The
 * payloadVersion: 2 marker keeps v2 hashes disjoint from legacy v1 hashes.
 * Browser-safe: no node builtins, no environment reads.
 */
import { hashableAttributes, type GuideAttributeRow } from './battery/guide-defaults';

export const PAYLOAD_VERSION = 2;

export interface PayloadInputs {
    batteries: Record<string, unknown>[];
    recycledMaterials: Record<string, unknown>[];
    diligenceDocs: Record<string, unknown>[];
    attributes: GuideAttributeRow[];
}

/** Numeric columns are coerced so sqlite (number) and pg (string) agree. */
function num(v: unknown): number | undefined {
    if (v == null) return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
    if (v == null) return undefined;
    const s = String(v);
    return s === '' ? undefined : s;
}

/** Object literal with all undefined-valued keys dropped. */
function compact(o: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

const bySortKey = (key: (r: Record<string, unknown>) => string) =>
    (a: Record<string, unknown>, b: Record<string, unknown>) => key(a).localeCompare(key(b));

/** Build the canonical v2 payload object from row-shaped inputs. */
export function payloadFromDb(inputs: PayloadInputs): Record<string, unknown> {
    const batteries = inputs.batteries
        .map((b) => compact({
            serialNumber: str(b.serialNumber),
            cellChemistry: str(b.cellChemistry),
            capacityKwh: num(b.capacityKwh),
            carbonFootprintKgCO2: num(b.carbonFootprintKgCO2),
            supplierName: str(b.supplierName),
            recycledContentPct: num(b.recycledContentPct),
            cycleLife: num(b.cycleLife),
            roundTripEfficiencyPct: num(b.roundTripEfficiencyPct),
            leadContentPpm: num(b.leadContentPpm),
        }))
        .sort(bySortKey((b) => String(b.serialNumber ?? '')));

    const recycledMaterials = inputs.recycledMaterials
        .map((m) => compact({
            material: str(m.material),
            recycledPercentage: num(m.recycledPercentage),
            sourceSupplierName: str(m.sourceSupplierName),
        }))
        .sort(bySortKey((m) => String(m.material ?? '')));

    // Uploaded evidence is bound in by its sha256; docType-only placeholder rows stay hashable.
    const diligenceDocs = inputs.diligenceDocs
        .map((d) => compact({
            docType: str(d.docType),
            fileName: str(d.fileName),
            sha256: str(d.sha256),
        }))
        .sort(bySortKey((d) => `${d.docType ?? ''}\0${d.fileName ?? ''}\0${d.sha256 ?? ''}`));

    return {
        payloadVersion: PAYLOAD_VERSION,
        batteries,
        recycledMaterials,
        diligenceDocs,
        attributes: hashableAttributes(inputs.attributes),
    };
}
